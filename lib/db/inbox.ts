import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./client";

/**
 * The official inbox of a board (migration 0007): a bearer secret, of which
 * only the sha256 digest is stored, and the sender addresses the inbox
 * route accepts. The admin generates the secret on the admin page and sees
 * it once; nothing can read it back. See docs/INBOX.md.
 */

/** `device_id` of submissions from the official inbox. No browser can send it: the submissions route accepts uuids only. */
export const INBOX_DEVICE_ID = "inbox";
export const INBOX_LIMIT_PER_HOUR = 60;
/** How many accepted mails the admin page lists, by time only. */
export const INBOX_RECENT_COUNT = 5;

export interface InboxConfig {
  secretHash: string | null;
  senders: string[];
}

function digest(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/** A new secret: 32 random bytes, base64url (43 characters), and the hex digest to store. */
export function newInboxSecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: digest(secret).toString("hex") };
}

/** Compares in constant time over the digests, so neither length nor content shows in the timing. No stored hash: nothing matches. */
export function inboxSecretMatches(candidate: string | null | undefined, storedHash: string | null): boolean {
  if (!storedHash || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 200) return false;
  return timingSafeEqual(digest(candidate), Buffer.from(storedHash, "hex"));
}

/** The board's inbox settings, or null when the database lacks migration 0007 (logged). */
export async function getInboxConfig(boardId: string): Promise<InboxConfig | null> {
  const { data, error } = await db()
    .from("boards")
    .select("inbox_secret_hash, inbox_senders")
    .eq("id", boardId)
    .maybeSingle();
  if (error) {
    console.error(`inbox config for ${boardId}: ${error.message}`);
    return null;
  }
  if (!data) return null;
  const row = data as { inbox_secret_hash: string | null; inbox_senders: string[] | null };
  return { secretHash: row.inbox_secret_hash, senders: row.inbox_senders ?? [] };
}

export async function setInboxSecretHash(boardId: string, hash: string): Promise<void> {
  const { error } = await db().from("boards").update({ inbox_secret_hash: hash }).eq("id", boardId);
  if (error) throw error;
}

/** Stores the list as given: callers pass it through normalizeSenders (lib/inbox/clean.ts) first. */
export async function setInboxSenders(boardId: string, senders: string[]): Promise<void> {
  const { error } = await db().from("boards").update({ inbox_senders: senders }).eq("id", boardId);
  if (error) throw error;
}

/** Mails the inbox accepted in the last hour (one submission each), for the rate limit. */
export async function inboxMailsLastHour(boardId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const { count, error } = await db()
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("board_id", boardId)
    .eq("source_hint", "official")
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

/** When the latest accepted mails arrived, newest first. Times only: no sender, subject or text. */
export async function recentInboxMails(boardId: string, limit = INBOX_RECENT_COUNT): Promise<string[]> {
  const { data, error } = await db()
    .from("submissions")
    .select("created_at")
    .eq("board_id", boardId)
    .eq("source_hint", "official")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as { created_at: string }[]).map((r) => r.created_at);
}

/** What the admin page shows. `available` is false on a database without migration 0007. */
export interface InboxAdminState {
  available: boolean;
  has_secret: boolean;
  senders: string[];
  recent: string[];
}

export async function getInboxAdminState(boardId: string): Promise<InboxAdminState> {
  const config = await getInboxConfig(boardId);
  if (!config) return { available: false, has_secret: false, senders: [], recent: [] };
  const recent = await recentInboxMails(boardId).catch((err: unknown) => {
    console.error(`inbox recent for ${boardId}: ${err instanceof Error ? err.message : String(err)}`);
    return [] as string[];
  });
  return { available: true, has_secret: Boolean(config.secretHash), senders: config.senders, recent };
}
