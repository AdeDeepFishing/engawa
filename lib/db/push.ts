import { db, hasDb } from "./client";
import { addDays } from "@/lib/cards/categories";
import { isLang, type Lang } from "@/lib/i18n";

/**
 * The push_subscriptions table (migration 0010): one row per board a browser
 * asked to be alerted for. Server only; no row ever reaches a browser, the
 * admin page gets the count per board. Until migration 0010 is applied the
 * table is missing: every read here then answers "missing" instead of
 * throwing, the key route answers 404 and the board hides "Get alerts".
 */

/** Days a subscription is kept after it was last used (a delivery, or the board page confirming it). */
export const PUSH_RETENTION_DAYS = 90;

/**
 * Devices one board alerts at most. A send to every one of them, ten at a
 * time, stays well inside the function's time limit, and a script that
 * makes up subscriptions cannot grow the table without end.
 */
export const MAX_SUBSCRIPTIONS_PER_BOARD = 5000;

export interface StoredSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: Lang;
}

const TABLE = "push_subscriptions";
/** Rows read per request: PostgREST caps an answer at 1000. */
const PAGE = 1000;
/** Ids per update or delete, so the filter stays a short URL. */
const ID_CHUNK = 200;

/**
 * Postgres undefined_table, or PostgREST's unknown table. A count request
 * with `head: true` on a missing table answers 204 with no error at all, so
 * nothing here counts with `head`.
 */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

let tableSeen = false;

/** Whether the table exists. Remembered once it does; asked again each time while it does not. */
export async function pushStoreReady(): Promise<boolean> {
  if (tableSeen) return true;
  if (!hasDb()) return false;
  const { error } = await db().from(TABLE).select("id").limit(1);
  if (isMissingTable(error)) return false;
  if (error) throw error;
  tableSeen = true;
  return true;
}

/** Subscriptions of one board, or null when the table is missing. */
export async function countSubscriptions(boardId: string): Promise<number | null> {
  if (!hasDb()) return null;
  const { count, error } = await db().from(TABLE).select("id", { count: "exact" }).eq("board_id", boardId).range(0, 0);
  if (isMissingTable(error)) return null;
  if (error) throw error;
  return count ?? 0;
}

export type SaveOutcome = "saved" | "missing" | "full";

/**
 * Stores a browser's subscription for a board, or refreshes the one it has:
 * a second POST with the same endpoint replaces the keys and the language
 * and counts as a use, so `purge_after` moves to 90 days from now.
 */
export async function saveSubscription(
  input: { boardId: string; deviceId: string; endpoint: string; p256dh: string; auth: string; lang: Lang },
  now = new Date(),
): Promise<SaveOutcome> {
  const client = db();
  const count = await countSubscriptions(input.boardId);
  if (count === null) return "missing";
  if (count >= MAX_SUBSCRIPTIONS_PER_BOARD) {
    // A board at the cap still lets a browser it already alerts refresh its row.
    const { data, error } = await client.from(TABLE).select("id").eq("board_id", input.boardId).eq("endpoint", input.endpoint).limit(1);
    if (error) throw error;
    if (!data?.length) return "full";
  }
  const { error } = await client.from(TABLE).upsert(
    {
      board_id: input.boardId,
      device_id: input.deviceId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      lang: input.lang,
      last_used_at: now.toISOString(),
      purge_after: addDays(now, PUSH_RETENTION_DAYS),
    },
    { onConflict: "board_id,endpoint" },
  );
  if (isMissingTable(error)) return "missing";
  if (error) throw error;
  return "saved";
}

/** Removes a browser's subscription for a board. The number of rows removed, or "missing". */
export async function deleteSubscription(boardId: string, endpoint: string): Promise<number | "missing"> {
  const { count, error } = await db().from(TABLE).delete({ count: "exact" }).eq("board_id", boardId).eq("endpoint", endpoint);
  if (isMissingTable(error)) return "missing";
  if (error) throw error;
  return count ?? 0;
}

/** Every subscription of a board, oldest first, or null when the table is missing. */
export async function subscriptionsForBoard(boardId: string): Promise<StoredSubscription[] | null> {
  if (!hasDb()) return null;
  const out: StoredSubscription[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db()
      .from(TABLE)
      .select("id, endpoint, p256dh, auth, lang")
      .eq("board_id", boardId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (isMissingTable(error)) return null;
    if (error) throw error;
    const rows = (data ?? []) as StoredSubscription[];
    for (const row of rows) out.push({ ...row, lang: isLang(row.lang) ? row.lang : "ja" });
    if (rows.length < PAGE) return out;
  }
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_CHUNK) out.push(items.slice(i, i + ID_CHUNK));
  return out;
}

/** Deletes subscriptions the push service said are gone (404, 410). Never throws: the send is over. */
export async function dropSubscriptions(ids: string[]): Promise<void> {
  for (const part of chunks(ids)) {
    const { error } = await db().from(TABLE).delete().in("id", part);
    if (error) console.error(`push: dropping ${part.length} gone subscriptions failed: ${error.message}`);
  }
}

/** Records a delivery the push service accepted: last used now, kept 90 days from now. Never throws. */
export async function touchSubscriptions(ids: string[], now = new Date()): Promise<void> {
  const patch = { last_used_at: now.toISOString(), purge_after: addDays(now, PUSH_RETENTION_DAYS) };
  for (const part of chunks(ids)) {
    const { error } = await db().from(TABLE).update(patch).in("id", part);
    if (error) console.error(`push: recording ${part.length} deliveries failed: ${error.message}`);
  }
}
