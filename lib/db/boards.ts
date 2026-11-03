import { CARD_WITH_SOURCES, withSortedSources } from "./cards";
import { db, hasDb } from "./client";
import { localBoardBySlug, localBoards, localCardsForBoard } from "./local";
import type { Board, Card } from "@/lib/types";

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
 * sources (relation, source type, platform, time; no submission ids).
 * Held and hidden cards never leave the server.
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
  return ((data ?? []) as PublicCardRow[]).map(toPublicCard);
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
  return data ? toPublicCard(data as PublicCardRow) : null;
}

/** A cards row as the query returns it: the Card fields plus the storage path, which readers never get. */
type PublicCardRow = Omit<Card, "has_masked_image"> & { masked_image_path?: string | null };

/**
 * What readers get: the row without `masked_image_path` (it names the board
 * and the submission) and with `has_masked_image` instead, sources sorted.
 */
export function toPublicCard(row: PublicCardRow): Card {
  const { masked_image_path, ...rest } = row;
  return withSortedSources({ ...rest, has_masked_image: Boolean(masked_image_path) });
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}
