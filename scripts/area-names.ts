/**
 * Writes the localized names of each board's 町丁目 (name_en, name_zh,
 * name_ko, name_vi) into supabase/seed/boards.json: one Claude call per
 * board with the prompt lib/claude/prompts/area-names.system.md and the
 * structured output lib/claude/schemas/area-names.schema.json. Vietnamese
 * uses the English spelling and is copied in code. Every name is printed;
 * read them all against the rules in the prompt, fix by hand what is off,
 * then run `pnpm check:boards`.
 *
 *   node --env-file-if-exists=.env.local --import=tsx scripts/area-names.ts [--board <slug>] [--write] [--force]
 *
 *   --board <slug>  one board (default: every board with an area that lacks a name)
 *   --write         write the names into the seed (default: print only)
 *   --force         ask again for areas that already have all four names
 *
 * Code and name_ja are never changed: scripts/geo/build.ts and
 * `pnpm check:boards` match name_ja against lib/geo/<slug>.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { anthropic, MODELS } from "../lib/claude/client";
import { boardMunicipality } from "../lib/geo";
import type { Board, BoardAreaName } from "../lib/types";
import { AREA_NAME_LANGS, areaNameProblems } from "./area-name-rules";

const SEED_PATH = join(process.cwd(), "supabase/seed/boards.json");
const PROMPT = readFileSync(join(process.cwd(), "lib/claude/prompts/area-names.system.md"), "utf8");
const SCHEMA = JSON.parse(readFileSync(join(process.cwd(), "lib/claude/schemas/area-names.schema.json"), "utf8")) as Record<string, unknown>;
// "$schema" and "description" are for editors; the API wants the schema body only.
delete SCHEMA.$schema;
delete SCHEMA.description;

const argv = process.argv.slice(2);
const only = argv.includes("--board") ? argv[argv.indexOf("--board") + 1] : null;
const write = argv.includes("--write");
const force = argv.includes("--force");

type SeedBoard = Pick<Board, "slug" | "name" | "area_names">;
type Named = Required<Omit<BoardAreaName, "code">>;

function missing(area: BoardAreaName): boolean {
  return AREA_NAME_LANGS.some((l) => !area[`name_${l}`]);
}

async function namesFor(board: SeedBoard, areas: BoardAreaName[]): Promise<{ rule: string; named: Named[]; tokens: string }> {
  const n = board.name;
  const userText = [
    `Board: ${board.slug}, named ${n.ja} (en ${n.en}, zh ${n.zh}, ko ${n.ko}, vi ${n.vi}).`,
    `City and ward: ${boardMunicipality(board) ?? "unknown"}.`,
    "Districts, in order:",
    JSON.stringify(areas.map((a) => a.name_ja)),
  ].join("\n");
  const message = await anthropic()
    .messages.stream({
      model: MODELS.opus,
      max_tokens: 32000,
      system: [{ type: "text", text: PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    })
    .finalMessage();
  if (message.stop_reason === "refusal") throw new Error(`${board.slug}: refused (${message.stop_details?.explanation ?? "no detail"})`);
  if (message.stop_reason === "max_tokens") throw new Error(`${board.slug}: output hit max_tokens`);
  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  const out = JSON.parse(text) as { rule_en: string; areas: { name_ja: string; name_en: string; name_zh: string; name_ko: string }[] };
  // Claude proposes, code decides: same districts, same order, same Japanese.
  if (out.areas.length !== areas.length) throw new Error(`${board.slug}: ${out.areas.length} names for ${areas.length} districts`);
  const named = out.areas.map((a, i) => {
    if (a.name_ja !== areas[i].name_ja) throw new Error(`${board.slug}: entry ${i} is ${a.name_ja}, expected ${areas[i].name_ja}`);
    const trim = (s: string) => s.trim().replace(/\s+/g, " ");
    const en = trim(a.name_en);
    return { name_ja: areas[i].name_ja, name_en: en, name_zh: trim(a.name_zh), name_ko: trim(a.name_ko), name_vi: en };
  });
  const tokens = `${message.usage.input_tokens} in, ${message.usage.output_tokens} out`;
  return { rule: out.rule_en, named, tokens };
}

async function main(): Promise<void> {
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8")) as { boards: SeedBoard[] };
  const boards = seed.boards.filter((b) => (only ? b.slug === only : true));
  if (only && !boards.length) throw new Error(`no board ${only} in the seed`);
  const work = boards
    .map((board) => ({ board, areas: force ? board.area_names : board.area_names.filter(missing) }))
    .filter((w) => w.areas.length);
  if (!work.length) {
    console.log("every area already has its four names (--force asks again)");
    return;
  }

  const results = await Promise.all(work.map((w) => namesFor(w.board, w.areas)));
  let problems = 0;
  for (const [i, { board }] of work.entries()) {
    const { rule, named, tokens } = results[i];
    console.log(`\n# ${board.slug} (${named.length} areas, ${MODELS.opus}, ${tokens})\nrule_en: ${rule}`);
    for (const a of named) {
      const found = areaNameProblems({ code: null, ...a });
      problems += found.length;
      console.log(`  ${a.name_ja}\t${a.name_en}\t${a.name_zh}\t${a.name_ko}${found.length ? `\t!! ${found.join("; ")}` : ""}`);
    }
    if (!write) continue;
    const byJa = new Map(named.map((a) => [a.name_ja, a]));
    // Key order: code and name_ja first, as before, then the four names.
    board.area_names = board.area_names.map((a) => {
      const n = byJa.get(a.name_ja);
      return n ? { code: a.code, ...n } : a;
    });
  }
  if (write) {
    writeFileSync(SEED_PATH, `${JSON.stringify(seed, null, 2)}\n`);
    console.log(`\nwrote ${SEED_PATH}`);
  }
  console.log(`\n${problems} format problems`);
  if (problems) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
