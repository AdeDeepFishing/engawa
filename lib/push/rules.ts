import { textLang } from "@/lib/cards/langs";
import { t, withLangParam, type Lang } from "@/lib/i18n";
import type { Board, Card, Category, ReconcileAction } from "@/lib/types";

/**
 * Web push (day 7): which cards alert the devices that opted in, and what
 * the notification says. Pure, no database and no keys, so
 * scripts/check-push.ts can check it. The sending is lib/push/send.ts.
 */

/** Categories in which an official card alerts. */
export const OFFICIAL_ALERT_CATEGORIES = ["danger", "official_notice", "shelter", "water"] as const satisfies readonly Category[];

/** Notifications the push service holds for a phone that is off or offline, in seconds. */
export const PUSH_TTL_SECONDS = 12 * 3600;

/** The longest body line kept, in characters; the push payload stays far under the 4 KB services accept. */
const BODY_MAX = 160;

/** Icon of every notification: the 192 px manifest icon (app/icons/[size]). */
export const PUSH_ICON = "/icons/192";

export type AlertCard = Pick<Card, "id" | "category" | "source_type" | "visibility" | "facts" | "title" | "body">;

/**
 * Whether a card, as it stands now, is one readers get alerted for: a public
 * official card in danger, official notice, shelter or water, or a public
 * danger card that came through the loudspeaker input or the official inbox
 * (the card's platform names the channel). Never a held or hidden card, never
 * a firsthand or secondhand card of any other kind.
 */
export function alertWorthy(card: Pick<AlertCard, "category" | "source_type" | "visibility" | "facts">): boolean {
  if (card.visibility !== "public") return false;
  if (card.source_type === "official" && (OFFICIAL_ALERT_CATEGORIES as readonly string[]).includes(card.category)) return true;
  const platform = card.facts?.platform;
  return card.category === "danger" && (platform === "loudspeaker" || platform === "city_mail");
}

/**
 * What one submission did to a card, as far as alerts care: the reconcile
 * actions on it (one submission can touch a card twice) and whether a merge
 * raised its source to a stronger one (lib/db/cards.ts mergeIntoCard).
 */
export interface CardChange {
  card_id: string;
  actions: ReconcileAction[];
  raised: boolean;
}

/**
 * Whether this change made a new version of the card that readers have not
 * been alerted for. A create or an update is new content. A merge adds a
 * source and repeats what the card says, except when it raised the card's
 * source: a neighbour's card that the city now confirms, or a loudspeaker
 * transcript replaced by the city's own text, is new to the reader. A
 * conflict leaves the card as it was, and a hold is not public. So the same
 * version never alerts twice: a second photo of the same notice is a merge.
 */
export function newVersion(change: Pick<CardChange, "actions" | "raised">): boolean {
  return change.actions.some((a) => a === "create" || a === "update") || (change.raised && change.actions.includes("merge"));
}

/** One change per public card a submission wrote, from its reconcile decisions (lib/db/submissions.ts WrittenCards). */
export function cardChanges(written: {
  decisions: { action: ReconcileAction; card_id: string; raised?: boolean }[];
  publicIds: string[];
}): CardChange[] {
  const byCard = new Map<string, CardChange>();
  for (const d of written.decisions) {
    if (!written.publicIds.includes(d.card_id)) continue;
    const change = byCard.get(d.card_id) ?? { card_id: d.card_id, actions: [], raised: false };
    change.actions.push(d.action);
    change.raised ||= d.raised === true;
    byCard.set(d.card_id, change);
  }
  return [...byCard.values()];
}

export interface PushPayload {
  title: string;
  body: string;
  /** A path on this site, opened when the notification is tapped. */
  url: string;
  /** One per card or per board's mode: a later notification with the same tag replaces the earlier one. */
  tag: string;
  icon: string;
  /** BCP 47 tag, so the phone draws Chinese and Japanese text with the right glyphs. */
  lang: string;
}

const NOTIFICATION_LANG: Record<Lang, string> = { ja: "ja-JP", en: "en", zh: "zh-CN", ko: "ko-KR", vi: "vi-VN" };

/** The first non-empty line, trimmed, cut at BODY_MAX with an ellipsis. */
export function firstLine(text: string): string {
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const chars = Array.from(line);
  return chars.length > BODY_MAX ? `${chars.slice(0, BODY_MAX - 1).join("")}…` : line;
}

/**
 * The notification for a card in the subscriber's language. The other
 * languages arrive a few seconds after the card (lib/pipeline.ts), and the
 * alert does not wait for them: a missing language falls back like the board
 * does (lib/cards/langs.ts), English, then Japanese.
 */
export function cardPayload(card: Pick<AlertCard, "id" | "title" | "body">, board: Pick<Board, "slug">, lang: Lang): PushPayload {
  return {
    title: card.title[textLang(card.title, lang)] ?? card.title.ja,
    body: firstLine(card.body[textLang(card.body, lang)] ?? card.body.ja ?? ""),
    url: withLangParam(`/b/${board.slug}/c/${card.id}`, lang),
    tag: `card-${card.id}`,
    icon: PUSH_ICON,
    lang: NOTIFICATION_LANG[lang],
  };
}

/** "Disaster mode on <board>", in the subscriber's language, opening the board. */
export function disasterModePayload(board: Pick<Board, "id" | "slug" | "name">, lang: Lang): PushPayload {
  return {
    title: t("push.mode_title", lang, { board: board.name[lang] ?? board.name.ja }),
    body: t("push.mode_body", lang),
    url: withLangParam(`/b/${board.slug}`, lang),
    tag: `mode-${board.id}`,
    icon: PUSH_ICON,
    lang: NOTIFICATION_LANG[lang],
  };
}

/**
 * The push services of the browsers that support web push: Chrome, Edge on
 * Android and every Chromium browser through Firebase Cloud Messaging,
 * Firefox through Mozilla's autopush, Safari through Apple's, Edge on Windows
 * through WNS. The server posts to the stored endpoint on every alert, so an
 * endpoint anywhere else (a private address, someone else's site) is refused.
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];
const MAX_ENDPOINT = 1024;

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_ENDPOINT) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

function base64UrlBytes(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  return new Uint8Array(Buffer.from(value, "base64url"));
}

/** The browser's keys as PushSubscription.toJSON() gives them: an uncompressed P-256 point and a 16 byte secret. */
export function validKeys(p256dh: unknown, auth: unknown): boolean {
  const point = base64UrlBytes(p256dh);
  const secret = base64UrlBytes(auth);
  return point !== null && point.length === 65 && point[0] === 4 && secret !== null && secret.length === 16;
}
