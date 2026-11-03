import boardsSeed from "@/supabase/seed/boards.json";
import cardsSeed from "@/supabase/seed/sample_cards.json";
import { addDays, addHours, CARD_RETENTION_DAYS } from "@/lib/cards/categories";
import type { Board, Card, Category, Multilingual, SourceType } from "@/lib/types";

/**
 * Read-only fallback used when SUPABASE_URL is empty: the board and its
 * cards come from the seed files so the UI can be built and demoed without
 * a database. Times are relative to process start.
 */
const startedAt = new Date();

type SeedCard = (typeof cardsSeed.cards)[number];
type SeedBoard = (typeof boardsSeed.boards)[number];

export function localBoardBySlug(slug: string): Board | null {
  const b = (boardsSeed.boards as SeedBoard[]).find((x) => x.slug === slug);
  return b ? toBoard(b) : null;
}

export function localBoards(): Board[] {
  return (boardsSeed.boards as SeedBoard[]).map(toBoard);
}

export function toBoard(b: SeedBoard): Board {
  return {
    id: `local-${b.slug}`,
    slug: b.slug,
    name: b.name,
    mode: b.mode as Board["mode"],
    area_names: b.area_names,
    known_places: b.known_places as Board["known_places"],
  };
}

export function localCardsForBoard(board: Board): Card[] {
  return (cardsSeed.cards as SeedCard[])
    .filter((c) => c.board_slug === board.slug)
    .map((c, i) => seedCardToCard(c, board.id, `seed-${i + 1}`, startedAt));
}

export function seedCardToCard(c: SeedCard, boardId: string, id: string, now: Date): Card {
  const created = new Date(now.getTime() - c.minutes_ago * 60_000).toISOString();
  const validUntil = addHours(created, c.valid_hours);
  return {
    id,
    board_id: boardId,
    category: c.category as Category,
    place_id: c.place_id,
    place_text_ja: c.place_text_ja,
    area_code: null,
    title: c.title as Multilingual,
    body: c.body as Multilingual,
    facts: c.facts as Card["facts"],
    original_text: c.original_text,
    original_lang: c.original_lang,
    source_type: c.source_type as SourceType,
    official_confirmed: c.official_confirmed,
    source_count: 1,
    risk_flags: [],
    visibility: "public",
    conflict: null,
    valid_from: created,
    valid_until: validUntil,
    pinned: false,
    created_at: created,
    updated_at: created,
    has_masked_image: false,
  };
}

export function seedPurgeAfter(validUntil: string): string {
  return addDays(validUntil, CARD_RETENTION_DAYS);
}
