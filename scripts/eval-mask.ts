/**
 * Coverage eval for the chat screenshot masking (docs/PLAN.md G1). For every
 * sidecar in fixtures/masking it runs the masking step on the input exactly
 * as the pipeline does (lib/image/mask-pipeline.ts), then checks each ground
 * truth box: it is covered when at least 95 percent of its area lies inside
 * the union of the predicted boxes after padding. The masked images go to
 * fixtures/tools/out/masked/ (git-ignored) so a person can look at them.
 *
 *   pnpm eval:mask                        default mask model (MASK_MODEL, else Opus)
 *   pnpm eval:mask --model claude-sonnet-5-5 --effort low
 *   pnpm eval:mask --only p04 --no-write  a quick look without touching docs/EVAL.md
 *
 * Exit code 1 unless every ground truth box on every sidecar is covered: the
 * ship rule says masking is enabled only at 100 percent.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { maskModel, type MaskEffort } from "../lib/claude/mask";
import { maskScreenshot } from "../lib/image/mask-pipeline";
import type { PixelBox } from "../lib/image/mask";

const ROOT = process.cwd();
const INPUT_DIR = join(ROOT, "fixtures/inputs");
const MASKING_DIR = join(ROOT, "fixtures/masking");
const OUT_DIR = join(ROOT, "fixtures/tools/out/masked");
const EVAL_DOC = join(ROOT, "docs/EVAL.md");
const COVERED_AT = 0.95;

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const model = flag("--model") ?? maskModel();
const effort = (flag("--effort") ?? "medium") as MaskEffort;
const only = flag("--only")?.split(",");
const concurrency = Number(flag("--concurrency") ?? 3);
const write = !argv.includes("--no-write");

interface GroundTruthBox extends PixelBox {
  kind: string;
  label: string;
}

interface Sidecar {
  id: string;
  input: string;
  width: number;
  height: number;
  boxes: GroundTruthBox[];
}

function loadSidecars(): Sidecar[] {
  return readdirSync(MASKING_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ id: f.replace(/\.json$/, ""), ...JSON.parse(readFileSync(join(MASKING_DIR, f), "utf8")) }) as Sidecar)
    .filter((s) => !only || only.includes(s.id));
}

/** Fraction of `box` covered by the union of `by`, counted pixel by pixel. */
function coverage(box: PixelBox, by: PixelBox[]): number {
  const area = box.w * box.h;
  if (area <= 0) return 1;
  const near = by.filter((b) => b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y);
  if (near.length === 0) return 0;
  let covered = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      for (const b of near) {
        if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) {
          covered++;
          break;
        }
      }
    }
  }
  return covered / area;
}

function intersection(a: PixelBox, b: PixelBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

interface Row {
  id: string;
  input: string;
  ms: number;
  error?: string;
  total: number;
  covered: number;
  missed: { kind: string; label: string; ratio: number; detail: string }[];
  predicted: number;
  extra: { kind: string; label: string }[];
  dropped: number;
  rescaled: boolean;
  usage: { input: number; cacheRead: number; cacheWrite: number; output: number };
}

async function runOne(s: Sidecar): Promise<Row> {
  const row: Row = {
    id: s.id,
    input: s.input,
    ms: 0,
    total: s.boxes.length,
    covered: 0,
    missed: [],
    predicted: 0,
    extra: [],
    dropped: 0,
    rescaled: false,
    usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
  };
  const path = join(INPUT_DIR, s.input);
  if (!existsSync(path)) {
    row.error = "input missing";
    return row;
  }
  const mime = extname(s.input).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const started = performance.now();
  try {
    const masked = await maskScreenshot(readFileSync(path), mime, { model, effort });
    row.ms = masked.outcome.latencyMs;
    row.usage = {
      input: masked.outcome.usage.inputTokens,
      cacheRead: masked.outcome.usage.cacheReadTokens,
      cacheWrite: masked.outcome.usage.cacheWriteTokens,
      output: masked.outcome.usage.outputTokens,
    };
    row.dropped = masked.outcome.dropped;
    row.rescaled = masked.outcome.rescaledFrom !== null;
    row.predicted = masked.boxes.length;
    if (masked.width !== s.width || masked.height !== s.height) {
      row.error = `image is ${masked.width}x${masked.height}, sidecar says ${s.width}x${s.height}`;
    }
    const fmt = (b: PixelBox) => `${b.x},${b.y} ${b.w}x${b.h}`;
    for (const gt of s.boxes) {
      const ratio = coverage(gt, masked.drawn);
      if (ratio >= COVERED_AT) {
        row.covered++;
        continue;
      }
      const best = masked.boxes.reduce<{ b: PixelBox; area: number } | null>((acc, b) => {
        const area = intersection(b, gt);
        return area > (acc?.area ?? 0) ? { b, area } : acc;
      }, null);
      row.missed.push({
        kind: gt.kind,
        label: gt.label,
        ratio,
        detail: `truth ${fmt(gt)}, model ${best ? fmt(best.b) : "none"}`,
      });
    }
    // A predicted box that overlaps no ground truth box at all is extra: it hides something it should not.
    for (const b of masked.boxes) {
      const area = b.w * b.h;
      const best = Math.max(0, ...s.boxes.map((gt) => intersection(b, gt)));
      if (area > 0 && best / area < 0.2) row.extra.push({ kind: b.kind, label: b.label });
    }
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, s.input), masked.bytes);
  } catch (e) {
    row.ms = Math.round(performance.now() - started);
    row.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  return row;
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

const esc = (s: string) => s.replace(/\|/g, "/");

function report(rows: Row[], startedAt: Date): string {
  const lines: string[] = [];
  const jstNow = new Date(startedAt.getTime() + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
  lines.push(
    `Run ${jstNow} JST, model \`${model}\`, effort ${effort}, ${rows.length} sidecars, model frame long edge 1568 px, ` +
      `a ground truth box counts as covered at ${Math.round(COVERED_AT * 100)} percent of its area under the padded predicted boxes.`,
  );
  lines.push("");
  lines.push("| input | ms | boxes | covered | missed (kind: label, share covered) | predicted | extra | result |");
  lines.push("|---|---:|---:|---:|---|---:|---|---|");
  for (const r of rows) {
    if (r.error && r.total && r.covered === 0 && r.predicted === 0) {
      lines.push(`| ${r.input} | ${r.ms} | ${r.total} | 0 | error: ${esc(r.error)} | | | fail |`);
      continue;
    }
    const missed = r.missed.map((m) => `${m.kind}: ${esc(m.label)} (${Math.round(m.ratio * 100)}%)`).join(", ") || "-";
    const extra = r.extra.length ? `${r.extra.length}: ${r.extra.map((e) => `${e.kind}: ${esc(e.label)}`).join(", ")}` : "0";
    const notes = [r.dropped ? `${r.dropped} dropped` : "", r.rescaled ? "rescaled" : "", r.error ? esc(r.error) : ""].filter(Boolean).join(", ");
    lines.push(
      `| ${r.input} | ${r.ms} | ${r.total} | ${r.covered} | ${missed} | ${r.predicted}${notes ? ` (${notes})` : ""} | ${extra} | ${r.covered === r.total && !r.error ? "pass" : "fail"} |`,
    );
  }
  const total = rows.reduce((n, r) => n + r.total, 0);
  const covered = rows.reduce((n, r) => n + r.covered, 0);
  const extra = rows.reduce((n, r) => n + r.extra.length, 0);
  // Per kind: ground truth boxes from the sidecars, minus the misses, so the summary says which kinds fail.
  const byKind = new Map<string, { ok: number; of: number }>();
  for (const s of loadSidecars()) {
    for (const b of s.boxes) {
      const k = byKind.get(b.kind) ?? { ok: 0, of: 0 };
      k.of++;
      k.ok++;
      byKind.set(b.kind, k);
    }
  }
  for (const r of rows) for (const m of r.missed) {
    const k = byKind.get(m.kind);
    if (k) k.ok--;
  }
  const kinds = [...byKind.entries()].map(([k, v]) => `${k} ${v.ok}/${v.of}`).join(", ");
  const ok = rows.filter((r) => !r.error);
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  const usage = rows.reduce(
    (u, r) => ({ input: u.input + r.usage.input, cacheRead: u.cacheRead + r.usage.cacheRead, cacheWrite: u.cacheWrite + r.usage.cacheWrite, output: u.output + r.usage.output }),
    { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
  );
  lines.push("");
  lines.push("**Summary**");
  lines.push("");
  lines.push(`- Coverage: ${covered}/${total} ground truth boxes (${total ? ((covered / total) * 100).toFixed(1) : "-"}%). Ship rule: 100% on all sidecars. ${kinds ? `By kind: ${kinds}.` : ""}`);
  lines.push(`- Sidecars fully covered: ${rows.filter((r) => r.covered === r.total && !r.error).length}/${rows.length}.`);
  lines.push(`- Extra boxes (overlapping no ground truth box): ${extra}.`);
  lines.push(`- Errors: ${rows.length - ok.length}.`);
  lines.push(`- Latency: median ${ms[Math.floor(ms.length / 2)] ?? 0} ms, min ${ms[0] ?? 0} ms, max ${ms[ms.length - 1] ?? 0} ms.`);
  lines.push(`- Tokens: input ${usage.input}, cache read ${usage.cacheRead}, cache write ${usage.cacheWrite}, output ${usage.output}.`);
  lines.push(`- Masked images written to \`fixtures/tools/out/masked/\` (not committed).`);
  return lines.join("\n");
}

function writeDoc(section: string) {
  const marker = `eval-mask:${model}`;
  const start = `<!-- ${marker} -->`;
  const end = `<!-- /${marker} -->`;
  const block = `${start}\n## masking on \`${model}\`\n\n${section}\n${end}`;
  let doc = readFileSync(EVAL_DOC, "utf8");
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
  const sidecars = loadSidecars();
  console.log(`eval:mask: ${sidecars.length} sidecars, model ${model}, effort ${effort}`);
  const rows = await pool(sidecars, concurrency, async (s) => {
    const row = await runOne(s);
    console.log(
      `  ${s.input}: ${row.error ? `ERROR ${row.error}` : `${row.ms} ms, ${row.covered}/${row.total} covered, ${row.predicted} predicted, ${row.extra.length} extra`}`,
    );
    for (const m of row.missed) console.log(`    missed ${m.kind} ${m.label} at ${Math.round(m.ratio * 100)}%: ${m.detail}`);
    return row;
  });
  const section = report(rows, startedAt);
  console.log(`\n${section}\n`);
  if (write) {
    writeDoc(section);
    console.log(`written to ${EVAL_DOC}`);
  }
  process.exitCode = rows.every((r) => !r.error && r.covered === r.total) ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
