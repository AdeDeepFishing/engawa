/**
 * Seeds the boards in supabase/seed/boards.json with their areas and known
 * places, and the sample cards of a board it creates.
 *
 *   pnpm db:seed                    every board: create the missing ones, refresh the others
 *   pnpm db:seed --board <slug>     one board only
 *   pnpm db:seed --dry-run          print what would be written; never connects to the database
 *   pnpm db:seed --rotate-token     issue a new admin token for an existing board
 *   pnpm db:seed --board <slug> --reset-cards
 *                                   delete that board's cards and re-insert its samples (needs --board)
 *   pnpm db:seed --token-file .env.admin-token.local
 *                                   write new tokens to that file (mode 600) instead of stdout
 *
 * A board that exists gets `name`, `area_names` and `known_places` refreshed
 * and nothing else: its mode, its listing, its admin token (unless
 * --rotate-token) and its cards stay as they are. A board created here
 * starts listed, in the seed's mode, with the sample cards whose
 * `board_slug` is its slug. Cards are deleted only by --reset-cards, and
 * only those of the one board --board names.
 *
 * The admin token is shown exactly once. Only its sha256 hex is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, chmodSync } from "node:fs";
import boardsSeed from "../supabase/seed/boards.json";
import cardsSeed from "../supabase/seed/sample_cards.json";
import { db, hasDb } from "../lib/db/client";
import { seedCardToCard, seedPurgeAfter } from "../lib/db/local";

type SeedBoard = (typeof boardsSeed.boards)[number];

const argv = process.argv.slice(2);
const args = new Set(argv);
const valueOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const tokenFile = valueOf("--token-file");
const only = valueOf("--board");
const dryRun = args.has("--dry-run");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function selectedBoards(): SeedBoard[] {
  if (args.has("--board") && (!only || only.startsWith("--"))) fail("--board needs a slug");
  if (args.has("--reset-cards") && !only) fail("--reset-cards deletes cards, so it needs --board <slug>");
  if (!only) return boardsSeed.boards;
  const board = boardsSeed.boards.find((b) => b.slug === only);
  if (!board) fail(`board ${only} is not in supabase/seed/boards.json (${boardsSeed.boards.map((b) => b.slug).join(", ")})`);
  return [board];
}

/** What a reseed writes to a board that already exists. */
function refreshed(b: SeedBoard) {
  return { name: b.name, area_names: b.area_names, known_places: b.known_places };
}

/** The sample cards of this board as rows for `cards`. */
function sampleRows(b: SeedBoard, boardId: string, now: Date) {
  return cardsSeed.cards
    .filter((c) => c.board_slug === b.slug)
    .map((c, i) => {
      const card = seedCardToCard(c, boardId, `unused-${i}`, now);
      return {
        board_id: boardId,
        category: card.category,
        place_id: card.place_id,
        place_text_ja: card.place_text_ja,
        title: card.title,
        body: card.body,
        facts: card.facts,
        original_text: card.original_text,
        original_lang: card.original_lang,
        source_type: card.source_type,
        official_confirmed: card.official_confirmed,
        source_count: 1,
        visibility: "public",
        valid_from: card.valid_from,
        valid_until: card.valid_until,
        mode_at_creation: b.mode,
        purge_after: seedPurgeAfter(card.valid_until as string),
        created_at: card.created_at,
      };
    });
}

/** --dry-run: the rows this run would write, read from the seed files only. */
function printDryRun(boards: SeedBoard[]): void {
  console.log("dry run: nothing is written and the database is not read, so each board shows both outcomes.");
  for (const b of boards) {
    const samples = cardsSeed.cards.filter((c) => c.board_slug === b.slug);
    const coded = b.area_names.filter((a) => a.code).length;
    const kinds = new Map<string, number>();
    for (const p of b.known_places) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
    const verified = b.known_places.filter((p) => p.verified).length;
    console.log("");
    console.log(`board ${b.slug}`);
    console.log(`  if absent:  insert slug, name, mode ${b.mode}, listed true, area_names, known_places, a new admin token; ${samples.length} sample cards`);
    console.log(`  if present: update ${Object.keys(refreshed(b)).join(", ")}; mode, listing, token${args.has("--rotate-token") ? " (rotated: --rotate-token)" : ""} and cards unchanged${args.has("--reset-cards") ? `; --reset-cards: delete this board's cards, insert ${samples.length} sample cards` : ""}`);
    console.log(`  name: ${Object.values(b.name).join(" / ")}`);
    console.log(`  area_names: ${b.area_names.length}, ${coded} with an e-Stat code`);
    for (const a of b.area_names) console.log(`    ${a.code ?? "(no code)"}  ${a.name_ja}`);
    console.log(`  known_places: ${b.known_places.length} (${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")}), verified ${verified}`);
    for (const p of b.known_places) {
      const address = "address_ja" in p && p.address_ja ? `  ${p.address_ja}` : "";
      console.log(`    ${p.id}  ${p.kind}${p.verified ? "" : " (unverified)"}  ${p.name_ja}${address}`);
    }
  }
}

async function main() {
  const boards = selectedBoards();
  if (dryRun) {
    printDryRun(boards);
    return;
  }
  if (!hasDb()) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).");
  const client = db();
  const now = new Date();

  for (const b of boards) {
    const { data: existing, error: findErr } = await client
      .from("boards")
      .select("id, slug")
      .eq("slug", b.slug)
      .maybeSingle();
    if (findErr) throw findErr;

    let token: string | null = null;
    if (!existing || args.has("--rotate-token")) token = randomBytes(24).toString("base64url");
    const tokenHash: Record<string, string> = token ? { admin_token_hash: sha256Hex(token) } : {};

    let boardId: string;
    if (existing) {
      const { error } = await client.from("boards").update({ ...refreshed(b), ...tokenHash }).eq("id", existing.id);
      if (error) throw error;
      boardId = existing.id;
      console.log(`updated board ${b.slug} (${boardId}): name, ${b.area_names.length} areas, ${b.known_places.length} known places`);
    } else {
      const row: Record<string, unknown> = { slug: b.slug, mode: b.mode, ...refreshed(b), ...tokenHash };
      // Listed on the home page (migration 0008). A database without the
      // column gets the row without it, listed like every board.
      let { data, error } = await client.from("boards").insert({ ...row, listed: true }).select("id").single();
      if (error && /\blisted\b/.test(error.message)) ({ data, error } = await client.from("boards").insert(row).select("id").single());
      if (error || !data) throw error ?? new Error(`insert of board ${b.slug} returned no row`);
      boardId = data.id;
      console.log(`created board ${b.slug} (${boardId}): ${b.area_names.length} areas, ${b.known_places.length} known places, listed`);
    }

    if (token) {
      const lines = [
        `# admin token for board ${b.slug}, generated ${now.toISOString()}`,
        `ADMIN_TOKEN_${b.slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}=${token}`,
        `# admin link: /api/b/${b.slug}/admin/enter?token=<ADMIN_TOKEN> (the ADMIN_TOKEN environment variable gates the page)`,
        "",
      ];
      if (tokenFile) {
        appendFileSync(tokenFile, lines.join("\n"));
        chmodSync(tokenFile, 0o600);
        console.log(`admin token for ${b.slug} written to ${tokenFile} (shown nowhere else)`);
      } else {
        console.log("");
        console.log(`ADMIN TOKEN for ${b.slug} (shown once, store it in a password manager):`);
        console.log(lines.join("\n"));
      }
    }

    // Cards: samples for a board created now, or for the one board named by
    // --board with --reset-cards. Every other board's cards are left alone.
    if (existing && !args.has("--reset-cards")) {
      console.log(`board ${b.slug}: cards untouched`);
      continue;
    }
    if (existing) {
      const { error } = await client.from("cards").delete().eq("board_id", boardId);
      if (error) throw error;
      console.log(`deleted existing cards for ${b.slug}`);
    }
    const rows = sampleRows(b, boardId, now);
    if (rows.length) {
      const { error } = await client.from("cards").insert(rows);
      if (error) throw error;
    }
    console.log(`inserted ${rows.length} sample cards for ${b.slug}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
