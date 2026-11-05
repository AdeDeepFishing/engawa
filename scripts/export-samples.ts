/**
 * Exports the public cards of a throwaway board as sample cards of a seeded
 * board, into supabase/seed/sample_cards.json (docs/BOARDS.md, "Sample cards").
 *
 *   pnpm export:samples --board <throwaway slug> --as <seeded slug>
 *   pnpm export:samples --board <throwaway slug> --as <seeded slug> --dry-run
 *
 * The cards are made by the real pipeline on a throwaway copy of the seeded
 * board (`pnpm board:throwaway create <slug>-demo --from <slug>`), which keeps
 * the seeded board's place ids, so `place_id` carries over as it is. The
 * entries get `board_slug` <seeded slug> and `exported_from` <throwaway
 * slug>; a later run for the same board, from any throwaway, replaces its
 * exported entries in place instead of adding to them. Entries of other
 * boards and hand-written entries are never touched.
 *
 * Times: the oldest card gets `minutes_ago` 4320 (3 days), the newest 40,
 * the others spread between on a geometric scale, so the board looks like
 * one posted to over a few days whenever it is seeded. `valid_from` and
 * `valid_until` stay absolute when the source stated them (the card text
 * names those dates); `valid_hours` is counted from the relative creation
 * time and is what the seed uses when an entry has no absolute end.
 *
 * Refuses, and writes nothing, when a card is not finished (a language
 * missing), carries risk flags, names a place the seeded board does not
 * know, or contains an em dash or an en dash. Reads the database, never
 * writes it. Output is slugs, counts and Japanese titles only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import boardsSeed from "../supabase/seed/boards.json";
import { db, hasDb } from "../lib/db/client";
import { DEFAULT_VALID_HOURS } from "../lib/cards/categories";
import { CARD_LANGS } from "../lib/i18n";
import type { Category } from "../lib/types";

const SEED_PATH = join(process.cwd(), "supabase/seed/sample_cards.json");
const NEWEST_MIN = 40;
const OLDEST_MIN = 3 * 24 * 60;
const DASH_RE = new RegExp(`[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`);

interface CardRow {
  category: Category;
  place_id: string | null;
  place_text_ja: string | null;
  title: Record<string, string | null | undefined>;
  body: Record<string, string | null | undefined>;
  facts: Record<string, unknown> | null;
  original_text: string | null;
  original_lang: string | null;
  source_type: string;
  source_count: number;
  risk_flags: string[] | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

type Entry = Record<string, unknown>;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function flag(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith("--") ? v : null;
}

/** minutes_ago for card i of n, oldest first: OLDEST_MIN down to NEWEST_MIN on a geometric scale. */
function minutesAgo(i: number, n: number): number {
  if (n <= 1) return NEWEST_MIN;
  const t = 1 - i / (n - 1);
  return Math.round(NEWEST_MIN * Math.pow(OLDEST_MIN / NEWEST_MIN, t));
}

/** Every string inside a value, with a path for messages. */
function strings(value: unknown, path: string): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

/** JSON in the seed file's style: two-space indent, short objects and arrays on one line. */
function formatJson(value: unknown, indent = ""): string {
  const inline = inlineJson(value);
  if (inline.length + indent.length <= 100 || value === null || typeof value !== "object") return inline;
  const next = indent + "  ";
  if (Array.isArray(value)) return `[\n${value.map((v) => next + formatJson(v, next)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(value).map(([k, v]) => `${next}${JSON.stringify(k)}: ${formatJson(v, next)}`);
  return `{\n${entries.join(",\n")}\n${indent}}`;
}

function inlineJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return value.length ? `[${value.map(inlineJson).join(", ")}]` : "[]";
  const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inlineJson(v)}`);
  return entries.length ? `{ ${entries.join(", ")} }` : "{}";
}

function toEntry(c: CardRow, as: string, from: string, minutes: number, now: Date): Entry {
  const created = now.getTime() - minutes * 60_000;
  const stated = c.facts?.valid_until_stated !== false;
  // A default end counted from a stated start is as absolute as the start;
  // one counted from the moment of the run is not, so it becomes relative.
  const absoluteUntil = c.valid_until && (stated || c.valid_from) ? c.valid_until : null;
  const validHours = absoluteUntil
    ? Math.max(1, Math.ceil((new Date(absoluteUntil).getTime() - created) / 3_600_000))
    : DEFAULT_VALID_HOURS[c.category];
  const pick = (m: CardRow["title"]) => Object.fromEntries(CARD_LANGS.map((l) => [l, m[l] as string]));
  return {
    board_slug: as,
    exported_from: from,
    category: c.category,
    place_id: c.place_id,
    place_text_ja: c.place_text_ja,
    source_type: c.source_type,
    official_confirmed: false,
    original_lang: c.original_lang,
    original_text: c.original_text,
    minutes_ago: minutes,
    valid_hours: validHours,
    ...(c.valid_from ? { valid_from: c.valid_from } : {}),
    ...(absoluteUntil ? { valid_until: absoluteUntil } : {}),
    title: pick(c.title),
    body: pick(c.body),
    facts: c.facts ?? { status: "open", conditions: [] },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const from = flag(argv, "--board");
  const as = flag(argv, "--as");
  const dryRun = argv.includes("--dry-run");
  if (!from || !as) fail("usage: pnpm export:samples --board <throwaway slug> --as <seeded slug> [--dry-run]");
  const seeded = boardsSeed.boards.find((b) => b.slug === as);
  if (!seeded) fail(`--as ${as} is not in supabase/seed/boards.json`);
  if (boardsSeed.boards.some((b) => b.slug === from)) {
    fail(`--board ${from} is a seeded board; export reads throwaway boards only (pnpm board:throwaway create)`);
  }
  if (!hasDb()) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).");

  const { data: board, error } = await db().from("boards").select("id").eq("slug", from).maybeSingle();
  if (error) throw error;
  if (!board) fail(`board ${from} not found`);
  const { data, error: cardErr } = await db()
    .from("cards")
    .select(
      "category, place_id, place_text_ja, title, body, facts, original_text, original_lang, source_type, source_count, risk_flags, valid_from, valid_until, created_at",
    )
    .eq("board_id", board.id)
    .eq("visibility", "public")
    .order("created_at", { ascending: true });
  if (cardErr) throw cardErr;
  const cards = (data ?? []) as CardRow[];
  if (!cards.length) fail(`board ${from} has no public cards`);

  const placeIds = new Set(seeded.known_places.map((p) => p.id));
  const problems: string[] = [];
  cards.forEach((c, i) => {
    const label = `card ${i + 1} (${c.title.ja ?? "untitled"})`;
    for (const l of CARD_LANGS) {
      if (!c.title[l]?.trim() || !c.body[l]?.trim()) problems.push(`${label}: no ${l} yet, wait for translate`);
    }
    if (c.risk_flags?.length) problems.push(`${label}: risk flags ${c.risk_flags.join(", ")}`);
    if (c.place_id && !placeIds.has(c.place_id)) problems.push(`${label}: place ${c.place_id} is not a known place of ${as}`);
    for (const [path, s] of strings(c, "card")) if (DASH_RE.test(s)) problems.push(`${label}: em or en dash in ${path}`);
    if (c.source_count > 1) console.warn(`${label}: ${c.source_count} sources; the seed inserts it with one`);
  });
  if (problems.length) fail(problems.join("\n"));

  const now = new Date();
  const entries = cards.map((c, i) => toEntry(c, as, from, minutesAgo(i, cards.length), now));

  const file = JSON.parse(readFileSync(SEED_PATH, "utf8")) as { _note?: string; cards: Entry[] };
  // Earlier exports for this board give way, whatever throwaway they came from; hand-written entries (no exported_from) stay.
  const stale = (e: Entry) => e.board_slug === as && Boolean(e.exported_from);
  const firstOld = file.cards.findIndex(stale);
  const kept = file.cards.filter((e) => !stale(e));
  const at = firstOld >= 0 ? firstOld : kept.length;
  const replaced = file.cards.length - kept.length;
  file.cards = [...kept.slice(0, at), ...entries, ...kept.slice(at)];

  for (const e of entries) {
    const until = (e.valid_until as string | undefined) ?? `+${e.valid_hours} h`;
    console.log(`  ${e.minutes_ago} min ago  ${e.category}  ${e.place_id ?? "(no place)"}  ${(e.title as Record<string, string>).ja}  until ${until}`);
  }
  if (dryRun) {
    console.log(`dry run: would write ${entries.length} cards of ${from} as ${as}, replacing ${replaced}; nothing written`);
    return;
  }
  writeFileSync(SEED_PATH, formatJson(file) + "\n");
  console.log(`wrote ${entries.length} cards of ${from} as ${as} to supabase/seed/sample_cards.json, replacing ${replaced}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
