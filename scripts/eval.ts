/**
 * Fixture eval for extract. Runs extract over every input in fixtures/inputs
 * that has an expected file (the main input and its variants), scores the
 * result against fixtures/expected, prints a table and writes it into
 * docs/EVAL.md between markers for the model, so notes below the markers
 * stay. No database: the board comes from the seed file, and the usage
 * counter is not bumped.
 *
 *   pnpm eval                              default extract model (EXTRACT_MODEL, else Opus)
 *   pnpm eval --model claude-sonnet-5-5
 *   pnpm eval --only p02,p11 --no-write    a quick look without touching docs/EVAL.md
 *   pnpm eval --concurrency 2
 *
 * What is scored (see fixtures/README.md for the expected file shape):
 * - field accuracy: category, place_id, valid_from and valid_until, status,
 *   source_type, conditions_include, en_include, per expected fact
 * - PII leaks: every must_not_contain string against every text that
 *   reaches the board or the uploader (titles and bodies in six languages,
 *   excerpt, place text, conditions, note for the uploader); must be 0
 * - invented facts: extracted facts that match no expected fact; must be 0
 * - risk flags: expected flags present, and no flag where none is expected
 * - six languages: title and body non-empty in ja, en, zh, ko, vi, easy_ja
 * - latency per call
 *
 * The fixtures say 本日 14:00 to 16:00, so a card that is already expired
 * in the evening is expected: only the time of day is checked for those.
 *
 *   pnpm eval --reconcile                  merges_with, updates and creates_beside
 *   pnpm eval --reconcile --reconcile-model claude-sonnet-5-5
 *   pnpm eval --reconcile --now 2026-11-03T10:00:00+09:00
 *
 * --now pins the clock that extract and reconcile see (ISO 8601). The p02
 * merge group mixes 本日 (p02, p04) with the written date 11月3日 (s02, t02),
 * so on any other day the model rightly reports a date conflict; the chain
 * is therefore run with the clock set to the fixture day. The run header in
 * docs/EVAL.md says when a clock was pinned.
 *
 * --reconcile runs chains instead: every merge group from the expected files
 * (the transitive closure of merges_with, expected files first) goes through
 * extract and lib/claude/reconcile.ts one input after another, against an
 * in-memory card list built the way lib/db/cards.ts would build it (same
 * category, public, still valid or created in the last 24 hours, same place
 * or no place, at most 20, newest first). No database writes. After the
 * group, inputs with `updates` must come back as update with the expected
 * times, and inputs with `creates_beside` must still come back as create.
 * Exit code 1 on any failed step. The results go into docs/EVAL.md as a
 * second table, under their own marker per reconcile model.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { extract, ExtractError, type ExtractFact, type ExtractInput, type ExtractResult } from "../lib/claude/extract";
import { extractModel } from "../lib/claude/client";
import { reconcile, reconcileModel, type ReconcileCandidate, type ReconcileDecision } from "../lib/claude/reconcile";
import { addHours, DEFAULT_VALID_HOURS } from "../lib/cards/categories";
import { trustRank } from "../lib/cards/trust";
import { localBoardBySlug } from "../lib/db/local";
import { CARD_LANGS } from "../lib/i18n";
import type { Board, CardStatus, Category, SourceType } from "../lib/types";

const ROOT = process.cwd();
const INPUT_DIR = join(ROOT, "fixtures/inputs");
const EXPECTED_DIR = join(ROOT, "fixtures/expected");
const EVAL_DOC = join(ROOT, "docs/EVAL.md");

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const model = flag("--model") ?? extractModel();
const only = flag("--only")?.split(",");
const concurrency = Number(flag("--concurrency") ?? 3);
const write = !argv.includes("--no-write");
const reconcileMode = argv.includes("--reconcile");
const rModel = flag("--reconcile-model") ?? reconcileModel();
const fixedNow = flag("--now");
if (fixedNow !== undefined && Number.isNaN(new Date(fixedNow).getTime())) {
  console.error(`--now needs an ISO 8601 time, got ${fixedNow}`);
  process.exit(2);
}
/** The clock extract and reconcile see: pinned by --now, else the real time. */
const clock = (): Date => (fixedNow ? new Date(fixedNow) : new Date());
/** "2026-11-03 10:00" in Japan time, for the run headers. */
const jstLabel = (d: Date) => new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
const clockNote = fixedNow ? `, clock pinned to ${jstLabel(new Date(fixedNow))} JST (--now)` : "";

// --- expected files -------------------------------------------------------

interface ExpectedFact {
  category?: string | string[];
  place_id?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  status?: string;
  source_type?: string;
  conditions_include?: string[];
  en_include?: string[];
}

interface Expected {
  id: string;
  input: string;
  variants?: string[];
  source_platform?: string;
  facts: ExpectedFact[];
  must_not_contain: string[];
  risk_flags: string[];
  merges_with?: string[];
  updates?: string[];
  creates_beside?: string[];
}

function loadExpected(filter = true): Expected[] {
  return readdirSync(EXPECTED_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ id: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(EXPECTED_DIR, f), "utf8")) }) as Expected)
    .filter((e) => !filter || !only || only.includes(e.id));
}

function toInput(file: string): ExtractInput {
  const path = join(INPUT_DIR, file);
  const ext = extname(file).toLowerCase();
  if (ext === ".txt") return { text: readFileSync(path, "utf8") };
  const mediaType = ext === ".png" ? "image/png" : "image/jpeg";
  return { image: { data: readFileSync(path).toString("base64"), mediaType } };
}

// --- scoring --------------------------------------------------------------

const FIELDS = ["category", "place", "times", "status", "source", "conditions", "en"] as const;
type Field = (typeof FIELDS)[number];
type Tally = Record<Field, { ok: number; of: number }>;

function emptyTally(): Tally {
  return Object.fromEntries(FIELDS.map((f) => [f, { ok: 0, of: 0 }])) as Tally;
}

/** "2026-11-03T14:00" in Japan time, the form the expected substrings use. */
function jstIso(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 16);
}

function categoryOk(e: ExpectedFact, x: ExtractFact): boolean {
  if (e.category === undefined) return true;
  return Array.isArray(e.category) ? e.category.includes(x.category) : e.category === x.category;
}

function placeOk(e: ExpectedFact, x: ExtractFact): boolean {
  return e.place_id === undefined || e.place_id === x.place_id;
}

function timeOk(expected: string | null | undefined, got: string | null): boolean {
  if (expected === undefined) return true;
  const jst = jstIso(got);
  return expected === null ? jst === null : jst !== null && jst.includes(expected);
}

const lower = (s: string) => s.toLowerCase();

/** Field checks for one expected fact against one extracted fact; null means not checked. */
function checks(e: ExpectedFact, x: ExtractFact): Record<Field, boolean[] | null> {
  return {
    category: e.category === undefined ? null : [categoryOk(e, x)],
    place: e.place_id === undefined ? null : [placeOk(e, x)],
    times:
      e.valid_from === undefined && e.valid_until === undefined
        ? null
        : [
            ...(e.valid_from === undefined ? [] : [timeOk(e.valid_from, x.valid_from)]),
            ...(e.valid_until === undefined ? [] : [timeOk(e.valid_until, x.valid_until)]),
          ],
    status: e.status === undefined ? null : [e.status === x.status],
    source: e.source_type === undefined ? null : [e.source_type === x.source_type],
    conditions: e.conditions_include?.length
      ? e.conditions_include.map((want) => x.conditions.some((c) => lower(c).includes(lower(want))))
      : null,
    en: e.en_include?.length
      ? e.en_include.map((want) => lower(`${x.title.en} ${x.body.en}`).includes(lower(want)))
      : null,
  };
}

/** null is a checked "must be null"; undefined is not checked. */
const show = (v: string | null | undefined) => (v === undefined ? "any" : String(v));

function describeMiss(e: ExpectedFact, x: ExtractFact, field: Field): string {
  switch (field) {
    case "category":
      return `category ${x.category}, expected ${JSON.stringify(e.category)}`;
    case "place":
      return `place_id ${x.place_id}, expected ${e.place_id}`;
    case "times":
      return `times ${jstIso(x.valid_from)} to ${jstIso(x.valid_until)}, expected ${show(e.valid_from)} to ${show(e.valid_until)}`;
    case "status":
      return `status ${x.status}, expected ${e.status}`;
    case "source":
      return `source_type ${x.source_type}, expected ${e.source_type}`;
    case "conditions":
      return `conditions ${JSON.stringify(x.conditions)} miss ${JSON.stringify(e.conditions_include)}`;
    case "en":
      return `English text misses ${JSON.stringify(e.en_include)}`;
  }
}

/** Pairs expected and extracted facts: greedy on agreement, category or place must agree. */
function match(expected: ExpectedFact[], got: ExtractFact[]): { pairs: [number, number][]; missed: number[]; extra: number[] } {
  const candidates: { e: number; x: number; score: number }[] = [];
  expected.forEach((e, ei) =>
    got.forEach((x, xi) => {
      const cat = e.category !== undefined && categoryOk(e, x);
      const place = e.place_id !== undefined && placeOk(e, x);
      if (!cat && !place) return;
      const c = checks(e, x);
      const agree = FIELDS.reduce((n, f) => n + (c[f]?.filter(Boolean).length ?? 0), 0);
      candidates.push({ e: ei, x: xi, score: (cat ? 10 : 0) + (place ? 10 : 0) + agree });
    }),
  );
  candidates.sort((a, b) => b.score - a.score);
  const usedE = new Set<number>();
  const usedX = new Set<number>();
  const pairs: [number, number][] = [];
  for (const c of candidates) {
    if (usedE.has(c.e) || usedX.has(c.x)) continue;
    usedE.add(c.e);
    usedX.add(c.x);
    pairs.push([c.e, c.x]);
  }
  return {
    pairs,
    missed: expected.map((_, i) => i).filter((i) => !usedE.has(i)),
    extra: got.map((_, i) => i).filter((i) => !usedX.has(i)),
  };
}

function boardTexts(r: ExtractResult): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  r.facts.forEach((f, i) => {
    for (const l of CARD_LANGS) {
      out.push({ where: `fact ${i} title.${l}`, text: f.title[l] });
      out.push({ where: `fact ${i} body.${l}`, text: f.body[l] });
    }
    out.push({ where: `fact ${i} original_excerpt`, text: f.original_excerpt });
    out.push({ where: `fact ${i} place_text_ja`, text: f.place_text_ja ?? "" });
    f.conditions.forEach((c, j) => out.push({ where: `fact ${i} conditions[${j}]`, text: c }));
  });
  out.push({ where: "note_for_uploader", text: r.note_for_uploader ?? "" });
  return out;
}

interface Row {
  id: string;
  file: string;
  ms: number;
  error?: string;
  factsGot: number;
  factsExpected: number;
  tally: Tally;
  missed: number;
  invented: string[];
  leaks: string[];
  flagsMissing: string[];
  flagsExtra: string[];
  langsComplete: boolean;
  problems: string[];
  usage: { input: number; cacheRead: number; cacheWrite: number; output: number };
}

async function runOne(exp: Expected, file: string): Promise<Row> {
  const board = localBoardBySlug("musashikosugi");
  if (!board) throw new Error("seed board musashikosugi missing");
  const row: Row = {
    id: exp.id,
    file,
    ms: 0,
    factsGot: 0,
    factsExpected: exp.facts.length,
    tally: emptyTally(),
    missed: 0,
    invented: [],
    leaks: [],
    flagsMissing: [],
    flagsExtra: [],
    langsComplete: false,
    problems: [],
    usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
  };
  const started = performance.now();
  let result: ExtractResult;
  try {
    const o = await extract(board, toInput(file), { model, now: clock() });
    row.ms = o.latencyMs;
    row.usage = {
      input: o.usage.inputTokens,
      cacheRead: o.usage.cacheReadTokens,
      cacheWrite: o.usage.cacheWriteTokens,
      output: o.usage.outputTokens,
    };
    result = o.result;
  } catch (e) {
    row.ms = Math.round(performance.now() - started);
    row.error = e instanceof ExtractError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e);
    // A code-side rejection still counts every expected field as missed.
    for (const ef of exp.facts) for (const f of FIELDS) row.tally[f].of += countChecks(ef, f);
    row.missed = exp.facts.length;
    return row;
  }

  row.factsGot = result.facts.length;
  const { pairs, missed, extra } = match(exp.facts, result.facts);
  for (const [ei, xi] of pairs) {
    const c = checks(exp.facts[ei], result.facts[xi]);
    for (const f of FIELDS) {
      const r = c[f];
      if (!r) continue;
      row.tally[f].of += r.length;
      row.tally[f].ok += r.filter(Boolean).length;
      if (r.some((v) => !v)) row.problems.push(`fact ${xi}: ${describeMiss(exp.facts[ei], result.facts[xi], f)}`);
    }
  }
  for (const ei of missed) {
    for (const f of FIELDS) row.tally[f].of += countChecks(exp.facts[ei], f);
    row.problems.push(`missed expected fact ${JSON.stringify(exp.facts[ei])}`);
  }
  row.missed = missed.length;
  row.invented = extra.map((xi) => {
    const f = result.facts[xi];
    return `${f.category} at ${f.place_id ?? "no place"}: ${f.title.en}`;
  });

  for (const { where, text } of boardTexts(result)) {
    for (const s of exp.must_not_contain) {
      if (text && lower(text).includes(lower(s))) row.leaks.push(`"${s}" in ${where}`);
    }
  }

  const flags = new Set<string>(result.facts.flatMap((f) => f.risk_flags));
  row.flagsMissing = exp.risk_flags.filter((f) => !flags.has(f));
  row.flagsExtra = [...flags].filter((f) => !exp.risk_flags.includes(f));
  row.langsComplete = result.facts.every((f) =>
    CARD_LANGS.every((l) => f.title[l]?.trim() && f.body[l]?.trim()),
  );
  if (exp.source_platform && result.source_platform !== exp.source_platform) {
    row.problems.push(`platform ${result.source_platform}, expected ${exp.source_platform} (not scored)`);
  }
  return row;
}

function countChecks(e: ExpectedFact, f: Field): number {
  switch (f) {
    case "category":
      return e.category === undefined ? 0 : 1;
    case "place":
      return e.place_id === undefined ? 0 : 1;
    case "times":
      return (e.valid_from === undefined ? 0 : 1) + (e.valid_until === undefined ? 0 : 1);
    case "status":
      return e.status === undefined ? 0 : 1;
    case "source":
      return e.source_type === undefined ? 0 : 1;
    case "conditions":
      return e.conditions_include?.length ?? 0;
    case "en":
      return e.en_include?.length ?? 0;
  }
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// --- report ---------------------------------------------------------------

const cell = (t: { ok: number; of: number }) => (t.of === 0 ? "-" : `${t.ok}/${t.of}`);
const pct = (ok: number, of: number) => (of === 0 ? "-" : `${((ok / of) * 100).toFixed(1)}%`);

function report(rows: Row[], startedAt: Date): string {
  const lines: string[] = [];
  const jstNow = new Date(startedAt.getTime() + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
  const expectedIds = new Set(rows.map((r) => r.id));
  lines.push(`Run ${jstNow} JST, model \`${model}\`, effort low, ${rows.length} inputs from ${expectedIds.size} expected files, concurrency ${concurrency}${clockNote}.`);
  lines.push("");
  lines.push("| input | ms | facts | category | place | times | status | source | conditions | en | flags | PII leaks | invented | 6 langs |");
  lines.push("|---|---:|---:|---|---|---|---|---|---|---|---|---:|---:|---|");
  for (const r of rows) {
    if (r.error) {
      lines.push(`| ${r.file} | ${r.ms} | error | ${r.error.replace(/\|/g, "/")} | | | | | | | | | | |`);
      continue;
    }
    const flags = r.flagsMissing.length || r.flagsExtra.length
      ? [r.flagsMissing.length ? `missing ${r.flagsMissing.join(" ")}` : "", r.flagsExtra.length ? `extra ${r.flagsExtra.join(" ")}` : ""].filter(Boolean).join(", ")
      : "ok";
    lines.push(
      `| ${r.file} | ${r.ms} | ${r.factsGot}/${r.factsExpected} | ${FIELDS.map((f) => cell(r.tally[f])).join(" | ")} | ${flags} | ${r.leaks.length} | ${r.invented.length} | ${r.langsComplete ? "yes" : "no"} |`,
    );
  }

  const total = emptyTally();
  for (const r of rows) for (const f of FIELDS) {
    total[f].ok += r.tally[f].ok;
    total[f].of += r.tally[f].of;
  }
  const allOk = FIELDS.reduce((n, f) => n + total[f].ok, 0);
  const allOf = FIELDS.reduce((n, f) => n + total[f].of, 0);
  const ok = rows.filter((r) => !r.error);
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  const median = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
  const mean = ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0;
  const leaks = rows.reduce((n, r) => n + r.leaks.length, 0);
  const invented = rows.reduce((n, r) => n + r.invented.length, 0);
  const missed = rows.reduce((n, r) => n + r.missed, 0);
  const expectedFacts = rows.reduce((n, r) => n + r.factsExpected, 0);
  const flagRows = rows.filter((r) => !r.error && (r.flagsMissing.length || r.flagsExtra.length)).length;
  const langRows = ok.filter((r) => r.langsComplete).length;
  const usage = rows.reduce(
    (u, r) => ({ input: u.input + r.usage.input, cacheRead: u.cacheRead + r.usage.cacheRead, cacheWrite: u.cacheWrite + r.usage.cacheWrite, output: u.output + r.usage.output }),
    { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
  );

  lines.push("");
  lines.push("**Summary**");
  lines.push("");
  lines.push(`- Field accuracy: ${allOk}/${allOf} (${pct(allOk, allOf)}). ${FIELDS.map((f) => `${f} ${cell(total[f])}`).join(", ")}.`);
  lines.push(`- PII leaks: ${leaks} (must be 0).`);
  lines.push(`- Invented facts: ${invented} (must be 0). Missed expected facts: ${missed} of ${expectedFacts}.`);
  lines.push(`- Risk flags as expected: ${ok.length - flagRows}/${ok.length} inputs.`);
  lines.push(`- Six languages present on every fact: ${langRows}/${ok.length} inputs.`);
  lines.push(`- Errors: ${rows.length - ok.length}.`);
  lines.push(`- Latency: median ${median} ms, mean ${mean} ms, min ${ms[0] ?? 0} ms, max ${ms[ms.length - 1] ?? 0} ms.`);
  lines.push(`- Tokens: input ${usage.input}, cache read ${usage.cacheRead}, cache write ${usage.cacheWrite}, output ${usage.output}.`);
  lines.push("- `merges_with`, `updates` and `creates_beside` are scored by `pnpm eval --reconcile` (second table).");

  const details = rows.filter((r) => r.problems.length || r.invented.length || r.leaks.length || r.error);
  if (details.length) {
    lines.push("");
    lines.push("**Details**");
    lines.push("");
    for (const r of details) {
      const items = [
        ...(r.error ? [`error: ${r.error}`] : []),
        ...r.problems,
        ...r.invented.map((s) => `invented: ${s}`),
        ...r.leaks.map((s) => `PII leak: ${s}`),
      ];
      lines.push(`- ${r.file}: ${items.join("; ")}`);
    }
  }
  return lines.join("\n");
}

const DOC_HEADER = `# Eval

\`pnpm eval\` runs extract over every fixture input that has an expected file and scores it against \`fixtures/expected\`. Each run replaces its own section below (one per model); notes at the bottom are written by hand.

How to read the table: each field cell is checks passed over checks made for the expected facts of that input; "-" means the expected file does not check that field. "invented" counts extracted facts that match no expected fact (strict: chatter turned into a fact counts). "PII leaks" counts planted names, handles and numbers found in any text that reaches the board or the uploader. Times are compared in Japan time; fixtures that say 本日 are checked on the time of day only.

`;

/** Replaces the section between the markers for `marker`, or inserts one before the notes. */
function writeDoc(section: string, marker = `eval:${model}`, heading = `## \`${model}\``) {
  const start = `<!-- ${marker} -->`;
  const end = `<!-- /${marker} -->`;
  const block = `${start}\n${heading}\n\n${section}\n${end}`;
  let doc = existsSync(EVAL_DOC) ? readFileSync(EVAL_DOC, "utf8") : `${DOC_HEADER}## Notes\n`;
  if (doc.includes(start) && doc.includes(end)) {
    doc = doc.slice(0, doc.indexOf(start)) + block + doc.slice(doc.indexOf(end) + end.length);
  } else {
    const notes = doc.indexOf("\n## Notes");
    doc = notes >= 0 ? `${doc.slice(0, notes)}\n${block}\n${doc.slice(notes)}` : `${doc}\n${block}\n`;
  }
  writeFileSync(EVAL_DOC, doc);
}

async function main() {
  if (reconcileMode) return mainReconcile();
  const startedAt = new Date();
  const expected = loadExpected();
  const jobs = expected.flatMap((e) =>
    [e.input, ...(e.variants ?? [])]
      .filter((f) => existsSync(join(INPUT_DIR, f)))
      .map((file) => ({ exp: e, file })),
  );
  console.log(`eval: ${jobs.length} inputs from ${expected.length} expected files, model ${model}`);
  const rows = await pool(jobs, concurrency, async ({ exp, file }) => {
    const row = await runOne(exp, file);
    console.log(`  ${file}: ${row.error ? `ERROR ${row.error}` : `${row.ms} ms, ${row.factsGot} facts, ${row.problems.length} problems`}`);
    return row;
  });
  const section = report(rows, startedAt);
  console.log(`\n${section}\n`);
  if (write) {
    writeDoc(section);
    console.log(`written to ${EVAL_DOC}`);
  }
  const leaks = rows.reduce((n, r) => n + r.leaks.length, 0);
  const invented = rows.reduce((n, r) => n + r.invented.length, 0);
  process.exitCode = leaks > 0 || invented > 0 ? 1 : 0;
}

// --- reconcile eval -------------------------------------------------------

type StepExpect = "create" | "merge" | "update";

interface ChainStep {
  id: string;
  file: string;
  expect: StepExpect;
  /** Update steps: the expected facts, whose times the card must carry afterwards. */
  expectedFacts: ExpectedFact[];
}

interface Chain {
  /** The first expected id of the merge group, used as the chain name. */
  anchor: string;
  /** Ids whose cards count as "the group's card" for merge and update targets. */
  groupIds: Set<string>;
  steps: ChainStep[];
}

/** The input file for a fixture id: the expected file's main input, else the one file named `<id>-*`. */
function inputFileFor(id: string, expected: Expected[]): string | null {
  const exp = expected.find((e) => e.id === id);
  if (exp) return existsSync(join(INPUT_DIR, exp.input)) ? exp.input : null;
  const files = readdirSync(INPUT_DIR).filter((f) => f.startsWith(`${id}-`)).sort();
  return files[0] ?? null;
}

/**
 * Chains from the expected files. A merge group is the transitive closure of
 * `merges_with`; its expected files run first in id order (the first one is
 * the anchor and must create), then the members without an expected file,
 * all expected to merge. Then `updates` and `creates_beside` of other
 * expected files are appended to the group they name.
 */
function buildChains(expected: Expected[]): Chain[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const e of expected) for (const other of e.merges_with ?? []) union(e.id, other);

  const groups = new Map<string, string[]>();
  for (const id of new Set([...parent.keys(), ...expected.flatMap((e) => e.merges_with ?? [])])) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  const expectedIds = new Set(expected.map((e) => e.id));
  const chains: Chain[] = [];
  for (const members of groups.values()) {
    const ordered = [
      ...members.filter((m) => expectedIds.has(m)).sort(),
      ...members.filter((m) => !expectedIds.has(m)).sort(),
    ];
    const steps: ChainStep[] = [];
    for (const [i, id] of ordered.entries()) {
      const file = inputFileFor(id, expected);
      if (!file) {
        console.warn(`eval --reconcile: no input for ${id}, skipped`);
        continue;
      }
      steps.push({ id, file, expect: i === 0 ? "create" : "merge", expectedFacts: [] });
    }
    if (steps.length) chains.push({ anchor: steps[0].id, groupIds: new Set(ordered), steps });
  }
  for (const e of expected) {
    for (const [key, expect] of [["updates", "update"], ["creates_beside", "create"]] as const) {
      const targets = e[key];
      if (!targets?.length) continue;
      const chain = chains.find((c) => targets.some((t) => c.groupIds.has(t)));
      const file = inputFileFor(e.id, expected);
      if (!chain || !file) {
        console.warn(`eval --reconcile: ${e.id}.${key} names ${targets.join(",")} but no chain has them, skipped`);
        continue;
      }
      chain.steps.push({ id: e.id, file, expect, expectedFacts: expect === "update" ? e.facts : [] });
    }
  }
  return chains.sort((a, b) => a.anchor.localeCompare(b.anchor));
}

/** A card as the eval keeps it: the columns reconcile and the candidate query look at. */
interface MemCard {
  id: string;
  from: string;
  category: Category;
  place_id: string | null;
  place_text_ja: string | null;
  status: CardStatus | null;
  valid_from: string | null;
  valid_until: string | null;
  valid_until_stated: boolean;
  conditions: string[];
  source_type: SourceType;
  official_confirmed: boolean;
  source_count: number;
  title_ja: string;
  visibility: "public" | "held";
  created_at: string;
  updated_at: string;
}

/** Mirrors listReconcileCandidates in lib/db/cards.ts over the in-memory list. */
function candidatesFor(cards: MemCard[], fact: ExtractFact, now: Date): ReconcileCandidate[] {
  const recentSince = now.getTime() - 24 * 3_600_000;
  return cards
    .filter((c) => c.visibility === "public" && c.category === fact.category)
    .filter((c) => (fact.place_id ? c.place_id === fact.place_id || c.place_id === null : c.place_id === null))
    .filter(
      (c) =>
        c.valid_until === null ||
        new Date(c.valid_until).getTime() > now.getTime() ||
        new Date(c.created_at).getTime() > recentSince,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      place_id: c.place_id,
      place_text_ja: c.place_text_ja,
      status: c.status,
      valid_from: c.valid_from,
      valid_until: c.valid_until,
      conditions: c.conditions,
      source_type: c.source_type,
      official_confirmed: c.official_confirmed,
      source_count: c.source_count,
      title_ja: c.title_ja,
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));
}

/** Card validity as lib/db/cards.ts computes it: the stated end, else the category default. */
function memValidity(fact: ExtractFact, now: Date): { validUntil: string; stated: boolean } {
  if (fact.valid_until) return { validUntil: fact.valid_until, stated: true };
  const from = fact.valid_from && new Date(fact.valid_from) > now ? fact.valid_from : now;
  return { validUntil: addHours(from, DEFAULT_VALID_HOURS[fact.category]), stated: false };
}

function memCard(from: string, fact: ExtractFact, visibility: MemCard["visibility"], now: Date): MemCard {
  const { validUntil, stated } = memValidity(fact, now);
  return {
    id: randomUUID(),
    from,
    category: fact.category,
    place_id: fact.place_id,
    place_text_ja: fact.place_text_ja,
    status: fact.status,
    valid_from: fact.valid_from,
    valid_until: validUntil,
    valid_until_stated: stated,
    conditions: fact.conditions,
    source_type: fact.source_type,
    official_confirmed: false,
    source_count: 1,
    title_ja: fact.title.ja,
    visibility,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
}

/** Applies a checked decision to the in-memory list the way applyDecision does to the database. */
function applyInMemory(cards: MemCard[], from: string, fact: ExtractFact, d: ReconcileDecision, now: Date): MemCard {
  if (d.action === "create") {
    const c = memCard(from, fact, "public", now);
    cards.push(c);
    return c;
  }
  if (d.action === "hold") {
    const c = memCard(from, fact, "held", now);
    cards.push(c);
    return c;
  }
  const target = cards.find((c) => c.id === d.target_card_id);
  if (!target) throw new Error(`decision ${d.action} targets ${d.target_card_id}, which is not on the board`);
  target.updated_at = now.toISOString();
  if (d.action === "merge") {
    target.source_count += 1;
    if (trustRank(fact.source_type) > trustRank(target.source_type)) target.source_type = fact.source_type;
    if (d.fill_missing) {
      if (!target.place_id && fact.place_id) target.place_id = fact.place_id;
      if (!target.place_text_ja && fact.place_text_ja) target.place_text_ja = fact.place_text_ja;
      if (!target.valid_from && fact.valid_from) target.valid_from = fact.valid_from;
      if (!target.conditions.length && fact.conditions.length) target.conditions = fact.conditions;
      if ((!target.status || target.status === "unknown") && fact.status !== "unknown") target.status = fact.status;
      if (!target.valid_until_stated && fact.valid_until) {
        target.valid_until = fact.valid_until;
        target.valid_until_stated = true;
      }
    }
  } else if (d.action === "update") {
    const { validUntil, stated } = memValidity(fact, now);
    Object.assign(target, {
      place_id: fact.place_id ?? target.place_id,
      place_text_ja: fact.place_text_ja ?? target.place_text_ja,
      status: fact.status,
      valid_from: fact.valid_from,
      valid_until: validUntil,
      valid_until_stated: stated,
      conditions: fact.conditions,
      source_type: fact.source_type,
      source_count: 1,
      title_ja: fact.title.ja,
    });
  }
  // conflict: the card content is unchanged.
  return target;
}

interface FactOutcome {
  category: Category;
  place_id: string | null;
  candidates: number;
  action: ReconcileDecision["action"] | "held";
  /** "<from>/<place>" of the target card, or null. */
  target: string | null;
  override: string | null;
  reason: string;
  reconcileMs: number;
  problems: string[];
}

interface ChainRow {
  chain: string;
  step: ChainStep;
  extractMs: number;
  facts: FactOutcome[];
  pass: boolean;
  error?: string;
  usage: { input: number; cacheRead: number; cacheWrite: number; output: number };
}

const cardLabel = (c: MemCard) => `${c.from}/${c.place_id ?? "no place"}`;

/** Runs one chain: extract then reconcile per input, in order, scoring each step against its expectation. */
async function runChain(board: Board, chain: Chain): Promise<ChainRow[]> {
  const cards: MemCard[] = [];
  const rows: ChainRow[] = [];
  for (const step of chain.steps) {
    const row: ChainRow = {
      chain: chain.anchor,
      step,
      extractMs: 0,
      facts: [],
      pass: false,
      usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
    };
    rows.push(row);
    let result: ExtractResult;
    try {
      const o = await extract(board, toInput(step.file), { model, now: clock() });
      row.extractMs = o.latencyMs;
      result = o.result;
    } catch (e) {
      row.error = `extract: ${e instanceof ExtractError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e)}`;
      console.log(`  [${chain.anchor}] ${step.file}: ERROR ${row.error}`);
      continue;
    }
    if (result.facts.length === 0) row.error = "extract returned no facts";

    for (const fact of result.facts) {
      const now = clock();
      const outcome: FactOutcome = {
        category: fact.category,
        place_id: fact.place_id,
        candidates: 0,
        action: "held",
        target: null,
        override: null,
        reason: "",
        reconcileMs: 0,
        problems: [],
      };
      row.facts.push(outcome);
      if (fact.risk_flags.length) {
        cards.push(memCard(step.id, fact, "held", now));
        outcome.reason = `risk flags ${fact.risk_flags.join(",")}`;
        outcome.problems.push(`held for ${fact.risk_flags.join(",")}, expected ${step.expect}`);
        continue;
      }
      const candidates = candidatesFor(cards, fact, now);
      outcome.candidates = candidates.length;
      let decision: ReconcileDecision;
      try {
        const o = await reconcile(board, fact, candidates, { model: rModel, now });
        decision = o.decision;
        outcome.override = o.override;
        outcome.reconcileMs = o.latencyMs;
        row.usage.input += o.usage.inputTokens;
        row.usage.cacheRead += o.usage.cacheReadTokens;
        row.usage.cacheWrite += o.usage.cacheWriteTokens;
        row.usage.output += o.usage.outputTokens;
      } catch (e) {
        outcome.action = "create";
        outcome.reason = `reconcile failed: ${e instanceof Error ? e.message : String(e)}`;
        outcome.problems.push(outcome.reason);
        cards.push(memCard(step.id, fact, "public", now));
        continue;
      }
      outcome.action = decision.action;
      outcome.reason = decision.reason;
      const card = applyInMemory(cards, step.id, fact, decision, now);
      if (decision.action !== "create" && decision.action !== "hold") outcome.target = cardLabel(card);
      scoreFact(step, chain, fact, decision, card, outcome);
    }
    row.pass = !row.error && row.facts.length > 0 && row.facts.every((f) => f.problems.length === 0);
    console.log(
      `  [${chain.anchor}] ${step.file}: extract ${row.extractMs} ms, ` +
        row.facts.map((f) => `${f.action}${f.target ? ` -> ${f.target}` : ""} (${f.candidates} cand, ${f.reconcileMs} ms)`).join("; ") +
        ` ${row.pass ? "PASS" : "FAIL"}`,
    );
  }
  return rows;
}

function scoreFact(step: ChainStep, chain: Chain, fact: ExtractFact, d: ReconcileDecision, card: MemCard, o: FactOutcome) {
  if (d.action !== step.expect) {
    o.problems.push(`${d.action}, expected ${step.expect}`);
    return;
  }
  if (step.expect === "create") return;
  if (!chain.groupIds.has(card.from)) o.problems.push(`target ${cardLabel(card)} is not a card of this group`);
  if (fact.place_id && card.place_id && card.place_id !== fact.place_id) {
    o.problems.push(`target ${cardLabel(card)} is at another place than ${fact.place_id}`);
  }
  if (step.expect === "update") {
    const e = step.expectedFacts.find((x) => categoryOk(x, fact) && placeOk(x, fact)) ?? step.expectedFacts[0];
    if (!e) return;
    if (!timeOk(e.valid_from, card.valid_from) || !timeOk(e.valid_until, card.valid_until)) {
      o.problems.push(`card now ${jstIso(card.valid_from)} to ${jstIso(card.valid_until)}, expected ${show(e.valid_from)} to ${show(e.valid_until)}`);
    }
  }
}

function reportReconcile(rows: ChainRow[], chains: Chain[], startedAt: Date): string {
  const lines: string[] = [];
  const jstNow = new Date(startedAt.getTime() + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
  lines.push(
    `Run ${jstNow} JST, extract \`${model}\`, reconcile \`${rModel}\`, effort low, ${chains.length} chains, ${rows.length} steps, ` +
      `candidates selected in memory the way lib/db/cards.ts does, no database writes${clockNote}.`,
  );
  lines.push("");
  lines.push("| chain | input | extract ms | reconcile ms | facts | candidates | decision | expected | result |");
  lines.push("|---|---|---:|---:|---:|---:|---|---|---|");
  for (const r of rows) {
    if (r.error && r.facts.length === 0) {
      lines.push(`| ${r.chain} | ${r.step.file} | ${r.extractMs} | | error | | ${r.error.replace(/\|/g, "/")} | ${r.step.expect} | fail |`);
      continue;
    }
    const decision = r.facts
      .map((f) => `${f.action}${f.target ? ` to ${f.target}` : ""}${f.override ? " (code override)" : ""}`)
      .join("; ");
    const cand = r.facts.map((f) => f.candidates).join("; ");
    const rms = r.facts.reduce((n, f) => n + f.reconcileMs, 0);
    lines.push(
      `| ${r.chain} | ${r.step.file} | ${r.extractMs} | ${rms} | ${r.facts.length} | ${cand} | ${decision} | ${r.step.expect} | ${r.pass ? "pass" : "fail"} |`,
    );
  }
  const passed = rows.filter((r) => r.pass).length;
  const byExpect = (e: StepExpect) => {
    const s = rows.filter((r) => r.step.expect === e);
    return `${e} ${s.filter((r) => r.pass).length}/${s.length}`;
  };
  const rms = rows.flatMap((r) => r.facts.filter((f) => f.candidates > 0).map((f) => f.reconcileMs)).sort((a, b) => a - b);
  const median = rms.length ? rms[Math.floor(rms.length / 2)] : 0;
  const usage = rows.reduce(
    (u, r) => ({ input: u.input + r.usage.input, cacheRead: u.cacheRead + r.usage.cacheRead, cacheWrite: u.cacheWrite + r.usage.cacheWrite, output: u.output + r.usage.output }),
    { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
  );
  lines.push("");
  lines.push("**Summary**");
  lines.push("");
  lines.push(`- Steps passed: ${passed}/${rows.length} (${byExpect("create")}, ${byExpect("merge")}, ${byExpect("update")}). Must be all.`);
  lines.push(`- Chains: ${chains.map((c) => `${c.anchor} (${c.steps.map((s) => s.id).join(", ")})`).join("; ")}.`);
  lines.push(`- Code overrides of the model's proposal: ${rows.reduce((n, r) => n + r.facts.filter((f) => f.override).length, 0)}.`);
  lines.push(
    `- Reconcile latency over ${rms.length} calls with candidates: median ${median} ms, min ${rms[0] ?? 0} ms, max ${rms[rms.length - 1] ?? 0} ms. ` +
      `Steps with no candidates make no call.`,
  );
  lines.push(`- Reconcile tokens: input ${usage.input}, cache read ${usage.cacheRead}, cache write ${usage.cacheWrite}, output ${usage.output}.`);
  const details = rows.filter((r) => !r.pass);
  if (details.length) {
    lines.push("");
    lines.push("**Details**");
    lines.push("");
    for (const r of details) {
      const items = [
        ...(r.error ? [`error: ${r.error}`] : []),
        ...r.facts.flatMap((f, i) => f.problems.map((p) => `fact ${i} (${f.category} at ${f.place_id ?? "no place"}): ${p}; model reason: ${f.reason}`)),
      ];
      lines.push(`- ${r.chain} / ${r.step.file}: ${items.join("; ")}`);
    }
  }
  return lines.join("\n");
}

async function mainReconcile() {
  const startedAt = new Date();
  const board = localBoardBySlug("musashikosugi");
  if (!board) throw new Error("seed board musashikosugi missing");
  const chains = buildChains(loadExpected(false)).filter((c) => !only || c.steps.some((s) => only.includes(s.id)));
  console.log(
    `eval --reconcile: ${chains.length} chains, extract ${model}, reconcile ${rModel}\n` +
      chains.map((c) => `  ${c.anchor}: ${c.steps.map((s) => `${s.id} (${s.expect})`).join(" -> ")}`).join("\n"),
  );
  const rows = (await pool(chains, concurrency, (chain) => runChain(board, chain))).flat();
  const section = reportReconcile(rows, chains, startedAt);
  console.log(`\n${section}\n`);
  if (write) {
    writeDoc(section, `eval-reconcile:${rModel}`, `## reconcile on \`${rModel}\``);
    console.log(`written to ${EVAL_DOC}`);
  }
  process.exitCode = rows.every((r) => r.pass) ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
