import { cache } from "react";
import { getBoardBySlug, getPublicCard } from "./boards";
import { hasDb } from "./client";
import { isUuid } from "@/lib/ids";
import type { Board, Card } from "@/lib/types";

/**
 * The board and one of its public cards, or null when either is missing, so
 * a page answers 404 for held, hidden and unknown cards. A malformed id never
 * reaches the database. Cached per request: metadata and page share one
 * read. Used by the card page and by the printable notice under it.
 */
export const loadPublicCard = cache(
  async (slug: string, id: string): Promise<{ board: Board; card: Card } | null> => {
    const board = await getBoardBySlug(slug);
    if (!board) return null;
    if (hasDb() && !isUuid(id)) return null;
    const card = await getPublicCard(board, id);
    return card ? { board, card } : null;
  },
);
