import { contentTime } from "./display";
import type { Card, ReactionCounts, ReactionKind } from "@/lib/types";

export const REACTION_KINDS = ["still_true", "no_longer_true"] as const satisfies readonly ReactionKind[];

export function isReactionKind(value: unknown): value is ReactionKind {
  return typeof value === "string" && (REACTION_KINDS as readonly string[]).includes(value);
}

export const NO_REACTIONS: ReactionCounts = { still_true: 0, no_longer_true: 0 };

/**
 * How many devices must say "no longer true" before the card in the list
 * carries the hint. Two, so one reader alone cannot put a doubt on a card.
 * The hint never hides the card and never changes what it says.
 */
export const DOUBT_HINT_AT = 2;

export function showsDoubtHint(card: Pick<Card, "reactions">): boolean {
  return (card.reactions?.no_longer_true ?? 0) >= DOUBT_HINT_AT;
}

// --- the device's own choice, in this browser only ---------------------------

const KEY = "engawa.reactions";
/** Choices kept in the browser; the oldest are dropped first. */
const MAX_KEPT = 200;

type Stored = Record<string, { kind: ReactionKind; at: string }>;

const listeners = new Set<() => void>();

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

/** For useSyncExternalStore: the stored string itself, so the snapshot is stable between changes. */
export function reactionsSnapshot(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function reactionsServerSnapshot(): string | null {
  return null;
}

export function subscribeReactions(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The device's choice on this card from a snapshot, or null. A choice made
 * before the card's content was last replaced by an update is ignored: the
 * update cleared the reactions on the server, since they were about the
 * old content.
 */
export function myReaction(snapshot: string | null, card: Pick<Card, "id" | "created_at" | "conflict">): ReactionKind | null {
  if (!snapshot) return null;
  let entry: Stored[string] | undefined;
  try {
    entry = (JSON.parse(snapshot) as Stored)[card.id];
  } catch {
    return null;
  }
  if (!entry || !isReactionKind(entry.kind)) return null;
  return Date.parse(entry.at) >= Date.parse(contentTime(card)) ? entry.kind : null;
}

/** Remembers (or with null forgets) the device's choice on a card and tells every subscriber. */
export function rememberReaction(cardId: string, kind: ReactionKind | null): void {
  const stored = read();
  delete stored[cardId];
  if (kind) stored[cardId] = { kind, at: new Date().toISOString() };
  const kept = Object.entries(stored)
    .sort(([, a], [, b]) => b.at.localeCompare(a.at))
    .slice(0, MAX_KEPT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Blocked storage: the server still has the choice; the button just will not show it as pressed.
  }
  for (const l of listeners) l();
}
