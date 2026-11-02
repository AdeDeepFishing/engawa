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
 * Not scored yet: merges_with and updates. They need reconcile
 * (lib/claude/reconcile.ts), built in parallel on 2026-11-04; wire them in
 * behind --reconcile once it lands. The fixtures say 本日 14:00 to 16:00, so
 * a card that is already expired in the evening is expected: only the time
 * of day is checked for those.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { extract, ExtractError, type ExtractFact, type ExtractInput, type ExtractResult } from "../lib/claude/extract";
import { extractModel } from "../lib/claude/client";
import { localBoardBySlug } from "../lib/db/local";
import { CARD_LANGS } from "../lib/i18n";

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

if (argv.includes("--reconcile")) {
  console.error(
    "--reconcile is not wired yet: merges_with and updates need lib/claude/reconcile.ts. " +
      "Feed each merge group through extract then reconcile against the cards of the earlier inputs, " +
      "and check that one card results (merges_with) or that the earlier card is updated (updates).",
  );
  process.exit(2);
}

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
}

function loadExpected(): Expected[] {
  return readdirSync(EXPECTED_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ id: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(EXPECTED_DIR, f), "utf8")) }) as Expected)
    .filter((e) => !only || only.includes(e.id));
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
    const o = await extract(board, toInput(file), { model });
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
  lines.push(`Run ${jstNow} JST, model \`${model}\`, effort low, ${rows.length} inputs from ${expectedIds.size} expected files, concurrency ${concurrency}.`);
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
  lines.push("- Not scored: `merges_with` and `updates` (need reconcile).");

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

function writeDoc(section: string) {
  const start = `<!-- eval:${model} -->`;
  const end = `<!-- /eval:${model} -->`;
  const block = `${start}\n## \`${model}\`\n\n${section}\n${end}`;
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
