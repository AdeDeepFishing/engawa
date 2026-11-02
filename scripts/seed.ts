/**
 * Seeds the demo board, its known places and the sample cards.
 *
 *   pnpm db:seed                 create or update the board, keep its admin token
 *   pnpm db:seed --rotate-token  issue a new admin token for an existing board
 *   pnpm db:seed --reset-cards   delete this board's cards and re-insert the samples
 *   pnpm db:seed --token-file .env.admin-token.local
 *                                write the token to that file (mode 600) instead of stdout
 *
 * The admin token is shown exactly once. Only its sha256 hex is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, chmodSync } from "node:fs";
import boardsSeed from "../supabase/seed/boards.json";
import cardsSeed from "../supabase/seed/sample_cards.json";
import { db, hasDb } from "../lib/db/client";
import { seedCardToCard, seedPurgeAfter } from "../lib/db/local";

const argv = process.argv.slice(2);
const args = new Set(argv);
const tokenFileIdx = argv.indexOf("--token-file");
const tokenFile = tokenFileIdx >= 0 ? argv[tokenFileIdx + 1] : null;

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function main() {
  if (!hasDb()) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).");
    process.exit(1);
  }
  const client = db();
  const now = new Date();

  for (const b of boardsSeed.boards) {
    const { data: existing, error: findErr } = await client
      .from("boards")
      .select("id, slug")
      .eq("slug", b.slug)
      .maybeSingle();
    if (findErr) throw findErr;

    let token: string | null = null;
    const payload: Record<string, unknown> = {
      slug: b.slug,
      name: b.name,
      mode: b.mode,
      area_names: b.area_names,
      known_places: b.known_places,
    };
    if (!existing || args.has("--rotate-token")) {
      token = randomBytes(24).toString("base64url");
      payload.admin_token_hash = sha256Hex(token);
    }

    let boardId: string;
    if (existing) {
      const { error } = await client.from("boards").update(payload).eq("id", existing.id);
      if (error) throw error;
      boardId = existing.id;
      console.log(`updated board ${b.slug} (${boardId})`);
    } else {
      const { data, error } = await client.from("boards").insert(payload).select("id").single();
      if (error) throw error;
      boardId = data.id;
      console.log(`created board ${b.slug} (${boardId})`);
    }

    if (token) {
      const lines = [
        `# admin token for board ${b.slug}, generated ${now.toISOString()}`,
        `ADMIN_TOKEN_${b.slug.toUpperCase().replace(/[^A-Z0-9]/g, "_")}=${token}`,
        `# admin URL: /b/${b.slug}/admin?token=${token}`,
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

    const samples = cardsSeed.cards.filter((c) => c.board_slug === b.slug);
    if (args.has("--reset-cards")) {
      const { error } = await client.from("cards").delete().eq("board_id", boardId);
      if (error) throw error;
      console.log(`deleted existing cards for ${b.slug}`);
    }
    const { count, error: countErr } = await client
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("board_id", boardId);
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) {
      console.log(`board ${b.slug} already has ${count} cards, sample cards not inserted`);
      continue;
    }
    const rows = samples.map((c, i) => {
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
    if (rows.length) {
      const { error } = await client.from("cards").insert(rows);
      if (error) throw error;
      console.log(`inserted ${rows.length} sample cards for ${b.slug}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
