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

/**
 * The admin session. The entry link (`/api/b/[slug]/admin/enter?token=`)
 * checks the token once; after that the browser holds HttpOnly cookies for
 * 12 hours and the token itself is in no URL. The cookie value is
 * `<expiry>.<sha256 digest over the expiry and the token>`, never the token,
 * so the expiry is enforced on the server too. One cookie is scoped to the
 * board's admin page and one to its admin API; no other path receives them.
 */
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;
export const ADMIN_PAGE_COOKIE = "engawa_admin";
export const ADMIN_API_COOKIE = "engawa_admin_api";

export function adminCookies(slug: string): { name: string; path: string }[] {
  return [
    { name: ADMIN_PAGE_COOKIE, path: `/b/${slug}/admin` },
    { name: ADMIN_API_COOKIE, path: `/api/b/${slug}/admin` },
  ];
}

function sessionDigest(token: string, expiresAt: number): string {
  return createHash("sha256").update(`engawa-admin-session:${expiresAt}:${token}`).digest("hex");
}

/** The cookie value for a session starting now, or null when there is no admin. */
export function adminCookieValue(now = new Date()): string | null {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 16) return null;
  const expiresAt = Math.floor(now.getTime() / 1000) + ADMIN_SESSION_SECONDS;
  return `${expiresAt}.${sessionDigest(expected, expiresAt)}`;
}

/** Checks a cookie value: well formed, not expired, digest equal in constant time. */
export function isAdminCookie(candidate: unknown, now = new Date()): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < 16) return false;
  if (typeof candidate !== "string" || candidate.length > 200) return false;
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(candidate);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt * 1000 <= now.getTime()) return false;
  const a = createHash("sha256").update(match[2]).digest();
  const b = createHash("sha256").update(sessionDigest(expected, expiresAt)).digest();
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
