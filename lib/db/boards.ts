import { CARD_WITH_SOURCES, withSortedSources } from "./cards";
import { fillLangs, withLangFallback } from "@/lib/cards/langs";
import { db, hasDb } from "./client";
import { localBoardBySlug, localBoards, localCardsForBoard } from "./local";
import { withReactions } from "./reactions";
import type { Board, Card, Multilingual } from "@/lib/types";

const BOARD_COLUMNS = "id, slug, name, mode, area_names, known_places";

export async function getBoardBySlug(slug: string): Promise<Board | null> {
  if (!hasDb()) return localBoardBySlug(slug);
  const { data, error } = await db()
    .from("boards")
    .select(BOARD_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as Board | null) ?? null;
}

export async function getBoardById(id: string): Promise<Board | null> {
  if (!hasDb()) return localBoards().find((b) => b.id === id) ?? null;
  const { data, error } = await db().from("boards").select(BOARD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Board | null) ?? null;
}

export async function listBoards(): Promise<Board[]> {
  if (!hasDb()) return localBoards();
  const { data, error } = await db().from("boards").select(BOARD_COLUMNS).order("slug");
  if (error) throw error;
  return (data ?? []) as Board[];
}

/**
 * Public cards for a board, pinned first, newest first, each with its
 * sources (relation, source type, platform, time; no submission ids) and
 * its reader confirmation counts (one count query for the whole list, no
 * device ids). Held and hidden cards never leave the server.
 */
export async function listPublicCards(board: Board): Promise<Card[]> {
  if (!hasDb()) return sortCards(localCardsForBoard(board));
  const { data, error } = await db()
    .from("cards")
    .select(CARD_WITH_SOURCES)
    .eq("board_id", board.id)
    .eq("visibility", "public")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return withReactions(((data ?? []) as PublicCardRow[]).map(toPublicCard));
}

export async function getPublicCard(board: Board, cardId: string): Promise<Card | null> {
  if (!hasDb()) return localCardsForBoard(board).find((c) => c.id === cardId) ?? null;
  const { data, error } = await db()
    .from("cards")
    .select(CARD_WITH_SOURCES)
    .eq("board_id", board.id)
    .eq("id", cardId)
    .eq("visibility", "public")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [card] = await withReactions([toPublicCard(data as PublicCardRow)]);
  return card;
}

/**
 * A hidden duplicate as readers get it: the same public projection as any
 * card, plus the id of the card it repeats and that card's title for the
 * "duplicate of" line. Only cards hidden as a duplicate of a card that is
 * still public are returned; a held card, a plain hidden card, or a
 * duplicate whose original is no longer public never leaves the server.
 */
export interface HiddenDuplicate extends Card {
  duplicate_of: string;
  original_title: Multilingual;
}

/** Row shape of the hidden duplicates query: a public row plus the embedded original. */
type HiddenDuplicateRow = PublicCardRow & {
  duplicate_of: string | null;
  original: { id: string; title: Multilingual; visibility: string } | null;
};

export async function listHiddenDuplicates(boardId: string): Promise<HiddenDuplicate[]> {
  if (!hasDb()) return [];
  const { data, error } = await db()
    .from("cards")
    // The original is embedded through the foreign key column itself
    // (PostgREST resolves `duplicate_of(...)` to the parent row); naming the
    // constraint is not needed and a table hint would give the children instead.
    .select(`${CARD_WITH_SOURCES}, original:duplicate_of(id, title, visibility)`)
    .eq("board_id", boardId)
    .eq("visibility", "hidden")
    .not("duplicate_of", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    // The drawer is secondary to the card list: a database that lacks
    // migration 0004 (or any read failure here) must not take the board down.
    console.error(`listHiddenDuplicates: ${error.message}`);
    return [];
  }
  const out: HiddenDuplicate[] = [];
  for (const row of (data ?? []) as HiddenDuplicateRow[]) {
    const { original, duplicate_of, ...rest } = row;
    if (!duplicate_of || !original || original.visibility !== "public") continue;
    out.push({ ...toPublicCard(rest), duplicate_of, original_title: fillLangs(original.title) });
  }
  return out;
}

/** A cards row as the query returns it: the Card fields plus the storage path, which readers never get. */
type PublicCardRow = Omit<Card, "has_masked_image"> & { masked_image_path?: string | null };

/**
 * What readers get: the row without `masked_image_path` (it names the board
 * and the submission) and with `has_masked_image` instead, sources sorted,
 * and no language blank: a language the translate step has not written yet
 * carries English or Japanese, with `missing_langs` saying which ones.
 */
export function toPublicCard(row: PublicCardRow): Card {
  const { masked_image_path, ...rest } = row;
  return withLangFallback(withSortedSources({ ...rest, has_masked_image: Boolean(masked_image_path) }));
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}
