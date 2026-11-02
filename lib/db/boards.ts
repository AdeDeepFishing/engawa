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
 * Public cards for a board, pinned first, newest first. Held and hidden
 * cards never leave the server.
 */
export async function listPublicCards(board: Board): Promise<Card[]> {
  if (!hasDb()) return sortCards(localCardsForBoard(board));
  const { data, error } = await db()
    .from("cards")
    .select("*")
    .eq("board_id", board.id)
    .eq("visibility", "public")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Card[];
}

export async function getPublicCard(board: Board, cardId: string): Promise<Card | null> {
  if (!hasDb()) return localCardsForBoard(board).find((c) => c.id === cardId) ?? null;
  const { data, error } = await db()
    .from("cards")
    .select("*")
    .eq("board_id", board.id)
    .eq("id", cardId)
    .eq("visibility", "public")
    .maybeSingle();
  if (error) throw error;
  return (data as Card | null) ?? null;
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}
