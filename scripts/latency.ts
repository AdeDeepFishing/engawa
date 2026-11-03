/**
 * Measures extract latency (time to the first card) and, after it, the
 * translate call that fills the other languages, on fixture inputs. No
 * database needed: the board comes from the seed file. The Anthropic key
 * must be in .env.local.
 *
 *   pnpm latency                                   all text and image files in fixtures/inputs
 *   pnpm latency fixtures/inputs/p08-queue-short.txt
 *   pnpm latency --model claude-sonnet-5-5 --runs 2
 *   pnpm latency --translate-model claude-sonnet-5-5
 *   pnpm latency --no-translate                    extract only
 *
 * Prints one row per input and a summary per model. The usage counter in the
 * database is not bumped by this script.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { extract, type ExtractInput } from "../lib/claude/extract";
import { translateFacts, translateModel } from "../lib/claude/translate";
import { localBoardBySlug } from "../lib/db/local";

const argv = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const models = flag("--model", "claude-opus-5-5").split(",");
const tModel = flag("--translate-model", translateModel());
const withTranslate = !argv.includes("--no-translate");
const runs = Number(flag("--runs", "1"));
const boardSlug = flag("--board", "musashikosugi");
const files = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && argv[i - 1] !== "--no-translate"));

const inputDir = join(process.cwd(), "fixtures/inputs");
const inputs =
  files.length > 0
    ? files
    : readdirSync(inputDir)
        .filter((f) => /\.(txt|jpe?g|png)$/i.test(f))
        .sort()
        .map((f) => join(inputDir, f));

function toInput(path: string): ExtractInput {
  const ext = extname(path).toLowerCase();
  if (ext === ".txt") return { text: readFileSync(path, "utf8") };
  const mediaType = ext === ".png" ? "image/png" : "image/jpeg";
  return { image: { data: readFileSync(path).toString("base64"), mediaType } };
}

type Row = {
  file: string;
  model: string;
  ms: number;
  /** The translate call after extract; 0 when nothing was missing or --no-translate. */
  translateMs: number;
  /** Languages the translate call wrote, or "-". */
  translated: string;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  facts: number;
  flags: string;
  places: string;
  error?: string;
};

async function main() {
  const board = localBoardBySlug(boardSlug);
  if (!board) throw new Error(`unknown board ${boardSlug}`);
  const rows: Row[] = [];
  for (const model of models) {
    for (let run = 0; run < runs; run++) {
      for (const path of inputs) {
        const file = basename(path);
        const started = performance.now();
        try {
          const o = await extract(board, toInput(path), { model });
          let translateMs = 0;
          let translated = "-";
          if (withTranslate && o.result.facts.length) {
            const tr = await translateFacts(board, o.result.facts, { model: tModel });
            translateMs = tr.latencyMs;
            translated = tr.outcome ? tr.outcome.langs.join("|") : "none needed";
          }
          rows.push({
            file,
            model,
            ms: o.latencyMs,
            translateMs,
            translated,
            input: o.usage.inputTokens,
            cacheRead: o.usage.cacheReadTokens,
            cacheWrite: o.usage.cacheWriteTokens,
            output: o.usage.outputTokens,
            facts: o.result.facts.length,
            flags: Array.from(new Set(o.result.facts.flatMap((f) => f.risk_flags))).join("|") || "-",
            places: o.result.facts.map((f) => f.place_id ?? "null").join("|") || "-",
          });
          console.log(`${file} [${model}] extract ${o.latencyMs} ms, translate ${translateMs} ms (${translated}), facts=${o.result.facts.length}`);
          console.log(JSON.stringify(o.result, null, 1).slice(0, 2500));
        } catch (e) {
          const ms = Math.round(performance.now() - started);
          rows.push({ file, model, ms, translateMs: 0, translated: "-", input: 0, cacheRead: 0, cacheWrite: 0, output: 0, facts: 0, flags: "-", places: "-", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
          console.log(`${file} [${model}] FAILED after ${ms} ms: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  console.log("\n| file | model | extract ms | translate ms | translated | in | cache_r | cache_w | out | facts | flags | place_ids |");
  console.log("|---|---|---:|---:|---|---:|---:|---:|---:|---:|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.file} | ${r.model} | ${r.ms} | ${r.translateMs} | ${r.translated} | ${r.input} | ${r.cacheRead} | ${r.cacheWrite} | ${r.output} | ${r.facts} | ${r.flags} | ${r.error ? "ERROR " + r.error : r.places} |`,
    );
  }
  const stats = (values: number[]) => {
    const v = [...values].sort((a, b) => a - b);
    const median = v[Math.floor(v.length / 2)];
    const mean = Math.round(v.reduce((a, b) => a + b, 0) / v.length);
    return `n=${v.length} median=${median} ms mean=${mean} ms min=${v[0]} ms max=${v[v.length - 1]} ms`;
  };
  for (const model of models) {
    const ok = rows.filter((r) => r.model === model && !r.error);
    if (!ok.length) continue;
    console.log(`\n${model} extract (time to the first card): ${stats(ok.map((r) => r.ms))}`);
    const tr = ok.filter((r) => r.translateMs > 0);
    if (tr.length) {
      console.log(`${tModel} translate: ${stats(tr.map((r) => r.translateMs))}`);
      console.log(`extract plus translate: ${stats(tr.map((r) => r.ms + r.translateMs))}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
