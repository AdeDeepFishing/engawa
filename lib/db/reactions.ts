import { db, hasDb } from "./client";
import { addDays, CARD_RETENTION_DAYS } from "@/lib/cards/categories";
import { NO_REACTIONS } from "@/lib/cards/reactions";
import type { Card, ReactionCounts, ReactionKind } from "@/lib/types";

/** Reactions one device may set or change in an hour, across all cards. */
export const REACTIONS_PER_DEVICE_PER_HOUR = 30;

/**
 * Counts per card for the given ids, through card_reaction_counts()
 * (migration 0006): one round trip for a whole board, counts only. A card
 * nobody reacted to is absent from the map. A read failure (a database
 * without 0006 among them) gives an empty map, so the board still renders
 * with zero counts instead of failing.
 */
export async function reactionCounts(cardIds: string[]): Promise<Map<string, ReactionCounts>> {
  const out = new Map<string, ReactionCounts>();
  if (!hasDb() || cardIds.length === 0) return out;
  const { data, error } = await db().rpc("card_reaction_counts", { p_card_ids: cardIds });
  if (error) {
    console.error(`reactionCounts: ${error.message}`);
    return out;
  }
  for (const row of (data ?? []) as { card_id: string; still_true: number; no_longer_true: number }[]) {
    out.set(row.card_id, { still_true: row.still_true, no_longer_true: row.no_longer_true });
  }
  return out;
}

/** The cards with `reactions` set from one count query; zero for cards nobody reacted to. */
export async function withReactions(cards: Card[]): Promise<Card[]> {
  if (!hasDb() || cards.length === 0) return cards;
  const counts = await reactionCounts(cards.map((c) => c.id));
  return cards.map((c) => ({ ...c, reactions: counts.get(c.id) ?? NO_REACTIONS }));
}

/** A card readers can react to: public, with the purge date its reactions inherit. Null otherwise. */
export async function getReactableCard(cardId: string): Promise<{ id: string; purge_after: string; valid_until: string | null } | null> {
  const { data, error } = await db()
    .from("cards")
    .select("id, purge_after, valid_until")
    .eq("id", cardId)
    .eq("visibility", "public")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { id: string; purge_after: string | null };
  // Every card gets purge_after when written; the fallback only covers a row that somehow lacks it.
  return { id: row.id, purge_after: row.purge_after ?? addDays(new Date(), CARD_RETENTION_DAYS) };
}

/** Reactions this device set or changed in the last hour (one row per card it reacted to). */
export async function recentReactionCount(deviceId: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const { count, error } = await db()
    .from("card_reactions")
    .select("card_id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gt("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Sets the device's reaction on a card, replacing any earlier one (a device
 * can change its mind, never add a second). Returns the kind it replaced.
 * On "still true" the card's last_confirmed_at moves to now, unless the
 * device had already said so: repeating the same tap confirms nothing new.
 * That write leaves updated_at alone (trigger in migration 0006).
 */
export async function setReaction(
  card: { id: string; purge_after: string },
  deviceId: string,
  kind: ReactionKind,
  now = new Date(),
): Promise<ReactionKind | null> {
  const client = db();
  const { data: before, error: readErr } = await client
    .from("card_reactions")
    .select("kind")
    .eq("card_id", card.id)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (readErr) throw readErr;
  const previous = ((before as { kind: ReactionKind } | null)?.kind ?? null) as ReactionKind | null;

  const { error } = await client.from("card_reactions").upsert(
    { card_id: card.id, device_id: deviceId, kind, created_at: now.toISOString(), purge_after: card.purge_after },
    { onConflict: "card_id,device_id" },
  );
  if (error) throw error;

  // The confirmation line moves only on a device's first "still true" on a
  // card that has not expired: a toggle must not re-bump it, and an expired
  // card must not read "confirmed just now" next to its outdated badge.
  if (kind === "still_true" && previous === null && !isExpired(card.valid_until, now)) {
    const { error: bumpErr } = await client
      .from("cards")
      .update({ last_confirmed_at: now.toISOString() })
      .eq("id", card.id)
      .eq("visibility", "public");
    if (bumpErr) throw bumpErr;
  }
  return previous;
}

/** Removes the device's reaction on a card, if any. */
export async function removeReaction(cardId: string, deviceId: string): Promise<void> {
  const { error } = await db().from("card_reactions").delete().eq("card_id", cardId).eq("device_id", deviceId);
  if (error) throw error;
}

/** The current counts for one card. */
export async function countsFor(cardId: string): Promise<ReactionCounts> {
  return (await reactionCounts([cardId])).get(cardId) ?? NO_REACTIONS;
}

/**
 * Drops every reaction on a card whose content an update just replaced:
 * they were about the old content, like the source count and the
 * confirmation that the update also resets. Never throws; the card update
 * has already happened and must not fail over this.
 */
export async function clearReactions(cardId: string): Promise<void> {
  if (!hasDb()) return;
  const { error } = await db().from("card_reactions").delete().eq("card_id", cardId);
  if (error) console.error(`clearReactions: ${error.message}`);
}
