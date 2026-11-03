import { cache } from "react";
import { getBoardBySlug, getPublicCard } from "./boards";
import { hasDb } from "./client";
import type { Board, Card } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (hasDb() && !UUID_RE.test(id)) return null;
    const card = await getPublicCard(board, id);
    return card ? { board, card } : null;
  },
);
