import { CARD_WITH_SOURCES, withSortedSources } from "./cards";
import { fillLangs, withLangFallback } from "@/lib/cards/langs";
import { db, hasDb } from "./client";
import { withAreaCodes } from "@/lib/geo/polygons";
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
  return data ? withAreaCodes(data as Board) : null;
}

export async function getBoardById(id: string): Promise<Board | null> {
  if (!hasDb()) return localBoards().find((b) => b.id === id) ?? null;
  const { data, error } = await db().from("boards").select(BOARD_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? withAreaCodes(data as Board) : null;
}

export async function listBoards(): Promise<Board[]> {
  if (!hasDb()) return localBoards();
  const { data, error } = await db().from("boards").select(BOARD_COLUMNS).order("slug");
  if (error) throw error;
  return ((data ?? []) as Board[]).map(withAreaCodes);
}

/** What the home page says about a board: its public cards and when the newest one was made. */
export interface BoardWithStats extends Board {
  public_cards: number;
  newest_card_at: string | null;
}

/** Row shape of the stats query: two embeds of cards, a count and the newest row. */
type BoardStatsRow = Board & {
  public_cards: { count: number }[];
  newest: { created_at: string }[];
};

/**
 * Boards for the home page with their public card count and newest public
 * card, in one round trip: both come from embeds of `cards` filtered to
 * public rows, the count as an aggregate and the newest as a one-row,
 * ordered embed. Only boards marked `listed` (migration 0008), so throwaway
 * boards from acceptance runs stay off the index; every board stays
 * reachable by its URL. Before 0008 is applied the column is unknown and
 * the query is repeated without it, listing every board as before.
 */
export async function listBoardsWithStats(): Promise<BoardWithStats[]> {
  if (!hasDb()) {
    return localBoards().map((b) => {
      const cards = sortCards(localCardsForBoard(b));
      return { ...b, public_cards: cards.length, newest_card_at: cards[0]?.created_at ?? null };
    });
  }
  let result = await boardStatsQuery(true);
  if (result.error && isMissingListedColumn(result.error)) {
    console.warn("listBoardsWithStats: boards.listed is missing (migration 0008 not applied), listing every board");
    result = await boardStatsQuery(false);
  }
  if (result.error) throw result.error;
  return ((result.data ?? []) as unknown as BoardStatsRow[]).map(({ public_cards, newest, ...board }) => ({
    ...withAreaCodes(board),
    public_cards: public_cards[0]?.count ?? 0,
    newest_card_at: newest[0]?.created_at ?? null,
  }));
}

function boardStatsQuery(onlyListed: boolean) {
  let query = db()
    .from("boards")
    .select(`${BOARD_COLUMNS}, public_cards:cards(count), newest:cards(created_at)`)
    .eq("public_cards.visibility", "public")
    .eq("newest.visibility", "public")
    .order("created_at", { referencedTable: "newest", ascending: false })
    .limit(1, { referencedTable: "newest" })
    .order("slug");
  if (onlyListed) query = query.eq("listed", true);
  return query;
}

/** Postgres "undefined column" naming boards.listed: the database predates migration 0008. */
function isMissingListedColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" && /\blisted\b/.test(error.message ?? "");
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
 * Columns only the server and the admin page use are removed too:
 * `held_reason` (it can hold reconcile model text), `risk_flags`,
 * `purge_after`, and the submission id on every conflict statement.
 */
export function toPublicCard(row: PublicCardRow): Card {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { masked_image_path, held_reason, risk_flags, purge_after, ...rest } = row as PublicCardRow & {
    purge_after?: string | null;
  };
  const conflict = rest.conflict
    ? {
        ...rest.conflict,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        statements: (rest.conflict.statements ?? []).map(({ submission_id, ...s }) => s),
      }
    : rest.conflict;
  return withLangFallback(withSortedSources({ ...rest, conflict, has_masked_image: Boolean(masked_image_path) }));
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}
