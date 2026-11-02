/**
 * Measures extract latency on fixture inputs. No database needed: the board
 * comes from the seed file. The Anthropic key must be in .env.local.
 *
 *   pnpm latency                                   all text and image files in fixtures/inputs
 *   pnpm latency fixtures/inputs/p08-queue-short.txt
 *   pnpm latency --model claude-sonnet-5-5 --runs 2
 *
 * Prints one row per call and a summary per model. The usage counter in the
 * database is not bumped by this script.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { extract, type ExtractInput } from "../lib/claude/extract";
import { localBoardBySlug } from "../lib/db/local";

const argv = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const models = flag("--model", "claude-opus-5-5").split(",");
const runs = Number(flag("--runs", "1"));
const boardSlug = flag("--board", "musashikosugi");
const files = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));

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
          rows.push({
            file,
            model,
            ms: o.latencyMs,
            input: o.usage.inputTokens,
            cacheRead: o.usage.cacheReadTokens,
            cacheWrite: o.usage.cacheWriteTokens,
            output: o.usage.outputTokens,
            facts: o.result.facts.length,
            flags: Array.from(new Set(o.result.facts.flatMap((f) => f.risk_flags))).join("|") || "-",
            places: o.result.facts.map((f) => f.place_id ?? "null").join("|") || "-",
          });
          console.log(`${file} [${model}] ${o.latencyMs} ms, facts=${o.result.facts.length}`);
          console.log(JSON.stringify(o.result, null, 1).slice(0, 2500));
        } catch (e) {
          const ms = Math.round(performance.now() - started);
          rows.push({ file, model, ms, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, facts: 0, flags: "-", places: "-", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
          console.log(`${file} [${model}] FAILED after ${ms} ms: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  console.log("\n| file | model | ms | in | cache_r | cache_w | out | facts | flags | place_ids |");
  console.log("|---|---|---:|---:|---:|---:|---:|---:|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.file} | ${r.model} | ${r.ms} | ${r.input} | ${r.cacheRead} | ${r.cacheWrite} | ${r.output} | ${r.facts} | ${r.flags} | ${r.error ? "ERROR " + r.error : r.places} |`,
    );
  }
  for (const model of models) {
    const ok = rows.filter((r) => r.model === model && !r.error).map((r) => r.ms).sort((a, b) => a - b);
    if (!ok.length) continue;
    const median = ok[Math.floor(ok.length / 2)];
    const mean = Math.round(ok.reduce((a, b) => a + b, 0) / ok.length);
    console.log(`\n${model}: n=${ok.length} median=${median} ms mean=${mean} ms min=${ok[0]} ms max=${ok[ok.length - 1]} ms`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
