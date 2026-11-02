import { createHash, timingSafeEqual } from "node:crypto";
import { CARD_WITH_SOURCES, withSortedSources } from "./cards";
import { db } from "./client";
import type { Board, Card, Visibility } from "@/lib/types";

/**
 * The admin gate. ADMIN_TOKEN comes from the environment and is compared
 * in constant time: both sides are hashed first, so neither the length nor
 * the first differing byte shows in the timing. No token configured means
 * no admin at all.
 */
export function isAdminToken(candidate: unknown): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 16) return false;
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 200) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export interface AdminCardLists {
  held: Card[];
  public: Card[];
  hidden: Card[];
}

/** Everything the admin page shows: the held queue, then public and hidden cards, newest first. */
export async function listCardsForAdmin(board: Board): Promise<AdminCardLists> {
  const lists = await Promise.all(
    (["held", "public", "hidden"] as const).map(async (visibility) => {
      const { data, error } = await db()
        .from("cards")
        .select(CARD_WITH_SOURCES)
        .eq("board_id", board.id)
        .eq("visibility", visibility)
        .order("created_at", { ascending: false })
        .limit(visibility === "public" ? 200 : 100);
      if (error) throw error;
      return ((data ?? []) as Card[]).map(withSortedSources);
    }),
  );
  return { held: lists[0], public: lists[1], hidden: lists[2] };
}

export const ADMIN_ACTIONS = ["publish", "hide", "confirm_official", "unconfirm_official"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/**
 * The only writes the admin route can make. `confirm_official` is the only
 * code path in the app that sets official_confirmed to true.
 */
export async function applyAdminAction(
  board: Board,
  cardId: string,
  action: AdminAction,
): Promise<{ id: string; visibility: Visibility; official_confirmed: boolean } | null> {
  const patch =
    action === "publish"
      ? { visibility: "public" }
      : action === "hide"
        ? { visibility: "hidden" }
        : { official_confirmed: action === "confirm_official" };
  const { data, error } = await db()
    .from("cards")
    .update(patch)
    .eq("board_id", board.id)
    .eq("id", cardId)
    .select("id, visibility, official_confirmed")
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; visibility: Visibility; official_confirmed: boolean } | null) ?? null;
}
