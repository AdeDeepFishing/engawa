import { INTL_LOCALE, t, type Lang } from "@/lib/i18n";
import type { Board, Card, CardStatus, ConflictStatement, Platform, SourceType } from "@/lib/types";

/**
 * Place as shown to a reader, in parts: the name in the reader's language
 * and, when that differs, the Japanese name to mark with lang="ja", because
 * signs on the street are in Japanese. `ja` is null when the whole label is
 * already Japanese (the UI is Japanese, or the place is unknown).
 */
export function placeParts(
  card: Pick<Card, "place_id" | "place_text_ja">,
  board: Board,
  lang: Lang,
): { text: string; ja: string | null } | null {
  if (card.place_id) {
    const place = board.known_places.find((p) => p.id === card.place_id);
    if (place) {
      if (lang === "ja") return { text: place.name_ja, ja: null };
      const localized = place.names[lang];
      return localized ? { text: localized, ja: place.name_ja } : { text: place.name_ja, ja: null };
    }
  }
  return card.place_text_ja ? { text: card.place_text_ja, ja: null } : null;
}

/** Place as one string: translated name plus the Japanese name in parentheses. */
export function placeLabel(card: Pick<Card, "place_id" | "place_text_ja">, board: Board, lang: Lang): string | null {
  const parts = placeParts(card, board, lang);
  if (!parts) return null;
  return parts.ja ? `${parts.text} (${parts.ja})` : parts.text;
}

export function timeAgo(iso: string, now: Date, lang: Lang): string {
  const diffMin = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (diffMin < 1) return t("card.just_now", lang);
  if (diffMin < 60) return t("card.minutes_ago", lang, { n: diffMin });
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return t("card.hours_ago", lang, { n: hours });
  return t("card.days_ago", lang, { n: Math.round(hours / 24) });
}

const TZ = "Asia/Tokyo";

export function formatDateTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
    timeZone: TZ,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

type StatementCard = Pick<Card, "conflict" | "created_at">;

/** Earlier versions an update replaced, newest first. */
export function supersededStatements(card: Pick<Card, "conflict">): ConflictStatement[] {
  return (card.conflict?.statements ?? []).filter((s) => s.kind === "superseded").reverse();
}

/** Both sides of an open disagreement, oldest first. Empty when there is none. */
export function conflictStatements(card: Pick<Card, "conflict">): ConflictStatement[] {
  return (card.conflict?.statements ?? []).filter((s) => s.kind === "conflict");
}

/** When the card's current content reached the board: the last update, else creation. */
export function contentTime(card: StatementCard): string {
  const last = supersededStatements(card)[0];
  return last?.replaced_at ?? card.created_at;
}

/** A statement in the reader's language; rows from before multilingual statements fall back to the Japanese text. */
export function statementText(s: ConflictStatement, lang: Lang): string {
  return s.body?.[lang] || s.text;
}

/** Time range of a statement or card, for "previously: 11/3 14:00 to 16:00". */
export function timeRange(
  from: string | null | undefined,
  until: string | null | undefined,
  lang: Lang,
): string | null {
  if (from && until) {
    const end = jstDay(from) === jstDay(until) ? formatTime(until, lang) : formatDateTime(until, lang);
    return t("card.time_range", lang, { from: formatDateTime(from, lang), until: end });
  }
  if (from) return t("card.time_from", lang, { from: formatDateTime(from, lang) });
  if (until) return t("card.time_until", lang, { until: formatDateTime(until, lang) });
  return null;
}

function jstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** "Confirmed official" replaces "official notice (unconfirmed)" once the admin confirmed it. */
export function sourceLabel(sourceType: SourceType, officialConfirmed: boolean | undefined, lang: Lang): string {
  return officialConfirmed ? t("card.official_confirmed", lang) : t(`source.${sourceType}`, lang);
}

export function platformLabel(platform: Platform | null, lang: Lang): string {
  return t(`card.platform.${platform ?? "unknown"}`, lang);
}

type Facts = { valid_from?: string | null; valid_until?: string | null; status?: CardStatus | null };

/**
 * The shortest way to say how a statement differs from another one: its
 * time range if the times differ, else its status, else its title.
 */
export function statementSummary(s: ConflictStatement, other: Facts, lang: Lang): string {
  const range = timeRange(s.valid_from, s.valid_until, lang);
  if (range && range !== timeRange(other.valid_from, other.valid_until, lang)) return range;
  if (s.status && s.status !== other.status) return t(`status.${s.status}`, lang);
  return s.title?.[lang] || s.text;
}
