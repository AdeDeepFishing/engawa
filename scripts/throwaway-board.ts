/**
 * Throwaway boards for acceptance runs (the procedure is in
 * .claude/skills/acceptance-run/SKILL.md).
 *
 *   pnpm board:throwaway create <slug> [--from <slug>]   copy a board row under a new slug
 *   pnpm board:throwaway delete <slug>                   remove it with everything that hangs off it
 *
 * create copies the pilot board row (default `musashikosugi`: mode, areas and
 * known places) minus id and created_at, with a test name in every UI
 * language and a fresh random admin token hash that nothing reads (the
 * ADMIN_TOKEN environment variable gates the admin page for every board).
 *
 * delete removes, in this order: the storage objects of the board's
 * submissions and masked copies (referenced paths plus whatever sits under
 * the board's folders), card_sources, cards, submissions, the device rows
 * that only this board's submissions used, then the board row.
 *
 * Both commands refuse the slugs in supabase/seed/boards.json, so the live
 * board is never touched. Output is ids, counts and the local path only.
 */
import { createHash, randomBytes } from "node:crypto";
import boardsSeed from "../supabase/seed/boards.json";
import { db, hasDb, SUBMISSIONS_BUCKET } from "../lib/db/client";
import { MASKED_PREFIX } from "../lib/db/masked";
import { LANGS } from "../lib/i18n";

const PROTECTED = new Set(boardsSeed.boards.map((b) => b.slug));
const PILOT = "musashikosugi";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;
const CHUNK = 100;

interface BoardRow {
  id: string;
  slug: string;
  name: Record<string, string>;
  mode: string;
  area_codes: string[];
  area_names: unknown[];
  known_places: unknown[];
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function create(slug: string, from: string) {
  const client = db();
  const { data: src, error } = await client
    .from("boards")
    .select("id, slug, name, mode, area_codes, area_names, known_places")
    .eq("slug", from)
    .maybeSingle();
  if (error) throw error;
  if (!src) fail(`source board ${from} not found`);
  const source = src as BoardRow;
  const { data: existing, error: findErr } = await client.from("boards").select("id").eq("slug", slug).maybeSingle();
  if (findErr) throw findErr;
  if (existing) fail(`board ${slug} already exists; delete it first or pick another slug`);

  const name = Object.fromEntries(
    LANGS.map((l) => [l, l === "ja" ? `${source.name.ja}（テスト ${slug}）` : `${source.name[l] ?? source.name.ja} (test ${slug})`]),
  );
  const row = {
    slug,
    name,
    mode: source.mode,
    area_codes: source.area_codes,
    area_names: source.area_names,
    known_places: source.known_places,
    admin_token_hash: createHash("sha256").update(randomBytes(24)).digest("hex"),
  };
  const { data, error: insErr } = await client.from("boards").insert(row).select("id").single();
  if (insErr) throw insErr;
  console.log(
    `created board ${slug} (${data.id}) as a copy of ${from}: ${source.known_places.length} known places, ${source.area_names.length} areas`,
  );
  console.log(`open /b/${slug} on the local server. Afterwards: pnpm board:throwaway delete ${slug}`);
}

/** Object paths under a storage folder (one level; the app writes no deeper). */
async function listFolder(prefix: string): Promise<string[]> {
  const { data, error } = await db().storage.from(SUBMISSIONS_BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  // Objects carry an id; a folder entry does not.
  return (data ?? []).filter((o) => o.name && o.id).map((o) => `${prefix}/${o.name}`);
}

/** Deletes rows whose `column` is in `values`, in chunks. Returns the row count. */
async function deleteIn(table: string, column: string, values: string[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    const { count, error } = await db()
      .from(table)
      .delete({ count: "exact" })
      .in(column, values.slice(i, i + CHUNK));
    if (error) throw error;
    n += count ?? 0;
  }
  return n;
}

async function remove(slug: string) {
  if (PROTECTED.has(slug)) fail(`${slug} is a seeded board (supabase/seed/boards.json); this command never touches it`);
  const client = db();
  const { data: board, error } = await client.from("boards").select("id, slug").eq("slug", slug).maybeSingle();
  if (error) throw error;
  if (!board) fail(`board ${slug} not found`);
  const boardId = board.id as string;

  const { data: subs, error: subErr } = await client
    .from("submissions")
    .select("id, device_id, image_path, image_deleted_at")
    .eq("board_id", boardId)
    .limit(5000);
  if (subErr) throw subErr;
  const { data: cards, error: cardErr } = await client
    .from("cards")
    .select("id, masked_image_path")
    .eq("board_id", boardId)
    .limit(5000);
  if (cardErr) throw cardErr;
  const submissions = (subs ?? []) as { id: string; device_id: string; image_path: string | null; image_deleted_at: string | null }[];
  const cardRows = (cards ?? []) as { id: string; masked_image_path: string | null }[];

  // 1. Storage objects: every referenced path, plus the board's folders in case a row was lost.
  const paths = new Set<string>();
  for (const s of submissions) if (s.image_path && !s.image_deleted_at) paths.add(s.image_path);
  for (const c of cardRows) if (c.masked_image_path) paths.add(c.masked_image_path);
  for (const p of await listFolder(boardId)) paths.add(p);
  for (const p of await listFolder(`${MASKED_PREFIX}/${boardId}`)) paths.add(p);
  let objects = 0;
  if (paths.size) {
    const { data: removed, error: rmErr } = await client.storage.from(SUBMISSIONS_BUCKET).remove([...paths]);
    if (rmErr) throw rmErr;
    objects = removed?.length ?? 0;
  }

  // 2. Rows, children first (the foreign keys cascade too; explicit for the counts).
  const sources = await deleteIn("card_sources", "card_id", cardRows.map((c) => c.id));
  const cardsDeleted = await deleteIn("cards", "id", cardRows.map((c) => c.id));
  const subsDeleted = await deleteIn("submissions", "id", submissions.map((s) => s.id));

  // 3. Device rows that no other board's submission uses.
  const deviceIds = [...new Set(submissions.map((s) => s.device_id))];
  let devices = 0;
  let kept = 0;
  if (deviceIds.length) {
    const { data: stillUsed, error: useErr } = await client
      .from("submissions")
      .select("device_id")
      .in("device_id", deviceIds)
      .limit(5000);
    if (useErr) throw useErr;
    const inUse = new Set(((stillUsed ?? []) as { device_id: string }[]).map((r) => r.device_id));
    const orphans = deviceIds.filter((d) => !inUse.has(d));
    kept = deviceIds.length - orphans.length;
    devices = await deleteIn("devices", "device_id", orphans);
  }

  // 4. The board itself.
  const { error: boardErr } = await client.from("boards").delete().eq("id", boardId);
  if (boardErr) throw boardErr;
  console.log(
    `deleted board ${slug} (${boardId}): ${objects} storage objects, ${sources} card_sources, ${cardsDeleted} cards, ` +
      `${subsDeleted} submissions, ${devices} devices` +
      (kept ? ` (${kept} device rows kept, used on other boards)` : ""),
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const [command, slug] = argv;
  if (!hasDb()) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).");
  if ((command !== "create" && command !== "delete") || !slug) {
    fail("usage: pnpm board:throwaway create <slug> [--from <slug>] | delete <slug>");
  }
  if (!SLUG_RE.test(slug)) fail(`slug must match ${SLUG_RE} (lowercase letters, digits, hyphens)`);
  if (PROTECTED.has(slug)) fail(`${slug} is a seeded board (supabase/seed/boards.json); this command never touches it`);
  if (command === "create") await create(slug, flag(argv, "--from") ?? PILOT);
  else await remove(slug);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
