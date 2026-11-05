import { boardArea } from "@/lib/geo";
import { INTL_LOCALE, t, type Lang } from "@/lib/i18n";
import type { Board, BoardAreaName, Card, CardStatus, ConflictStatement, KnownPlace, Platform, SourceType } from "@/lib/types";

/** The board's known place a card points at, or null when it has none or the board no longer lists it. */
export function knownPlaceOf(card: Pick<Card, "place_id">, board: Pick<Board, "known_places">): KnownPlace | null {
  if (!card.place_id) return null;
  return board.known_places.find((p) => p.id === card.place_id) ?? null;
}

/**
 * A known place's name in parts: the name in the reader's language and,
 * when that differs, the Japanese name to mark with lang="ja". `ja` is null
 * when `text` is already the Japanese name.
 */
export function knownPlaceName(place: KnownPlace, lang: Lang): { text: string; ja: string | null } {
  if (lang === "ja") return { text: place.name_ja, ja: null };
  const localized = place.names[lang];
  return localized ? { text: localized, ja: place.name_ja } : { text: place.name_ja, ja: null };
}

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
  const place = knownPlaceOf(card, board);
  if (place) return knownPlaceName(place, lang);
  return card.place_text_ja ? { text: card.place_text_ja, ja: null } : null;
}

/** Place as one string: translated name plus the Japanese name in parentheses. */
export function placeLabel(card: Pick<Card, "place_id" | "place_text_ja">, board: Board, lang: Lang): string | null {
  const parts = placeParts(card, board, lang);
  if (!parts) return null;
  return parts.ja ? `${parts.text} (${parts.ja})` : parts.text;
}

type AreaNames = Omit<BoardAreaName, "code">;

/**
 * A 町丁目 name in parts, as `knownPlaceName` gives a place: the name in the
 * reader's language and the Japanese name to mark with lang="ja", which is
 * what the street signs say. `ja` is null when `text` is already the
 * Japanese name (a Japanese reader, or a row seeded before the names).
 */
export function areaName(area: AreaNames, lang: Lang): { text: string; ja: string | null } {
  if (lang === "ja") return { text: area.name_ja, ja: null };
  const localized = area[`name_${lang}` as const]?.trim();
  return localized ? { text: localized, ja: area.name_ja } : { text: area.name_ja, ja: null };
}

/** The card's self-reported area (G2) in parts, or null when it has none or the board does not list its code. */
export function areaParts(
  card: Pick<Card, "area_code">,
  board: Pick<Board, "area_names">,
  lang: Lang,
): { text: string; ja: string | null } | null {
  const area = boardArea(board, card.area_code);
  return area ? areaName(area, lang) : null;
}

/**
 * The 丁目 at the end of a Japanese area name, with its number captured:
 * 小杉町1丁目 gives "1". ASCII digits only, as scripts/geo/build.ts writes
 * them; scripts/area-name-rules.ts shares this pattern and refuses a
 * full-width digit, so the seed and the display agree on what a 丁目 is.
 */
export const CHOME_JA = /([0-9]+)丁目$/u;

/** The 丁目 at the end of an area name in each language: "1丁目", " 1-chome", " 1초메". */
const CHOME: Record<Lang, RegExp> = {
  ja: CHOME_JA,
  zh: /[0-9]+丁目$/u,
  en: / [0-9]+-chome$/,
  vi: / [0-9]+-chome$/,
  ko: / [0-9]+초메$/u,
};

/** An area's town, the name without its 丁目, in the reader's language or in Japanese when that language has no name. */
export function townName(area: AreaNames, lang: Lang): { text: string; lang: Lang } {
  const name = areaName(area, lang);
  return name.ja === null ? { text: name.text.replace(CHOME.ja, ""), lang: "ja" } : { text: name.text.replace(CHOME[lang], ""), lang };
}

/**
 * A board's towns in area order, folded on the Japanese name: 小杉町1丁目
 * to 3丁目 are one 小杉町, shown as "Kosugi-machi" to an English reader. Each
 * town says which language it is in, so a Japanese fallback can carry
 * lang="ja", and carries its Japanese name, which is what tells two towns
 * apart (仲町 and 中町 would both read Naka-machi). `pnpm check:boards`
 * checks that every 丁目 of a town folds to the same name in every language
 * and that no two towns fold to one name.
 */
export function townsOf(areas: AreaNames[], lang: Lang): { text: string; lang: Lang; ja: string }[] {
  const towns = new Map<string, { text: string; lang: Lang; ja: string }>();
  for (const a of areas) {
    const ja = a.name_ja.replace(CHOME.ja, "");
    if (!towns.has(ja)) towns.set(ja, { ...townName(a, lang), ja });
  }
  return [...towns.values()];
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

/**
 * Day and time in the reader's locale with the month as a word, so it reads
 * the same way for everyone: "3 Nov, 07:29", "11月3日 07:29", "07:29 3 thg 11".
 * (en-GB "03/11" was read as 11 March by American readers.)
 */
export function formatDateTime(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Date with its year, for a printed page that may hang for weeks: "2026/11/04 10:30". */
export function formatFullDateTime(iso: string | Date, lang: Lang): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], {
    timeZone: TZ,
    year: "numeric",
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

/** Calendar day in Japan of an instant, for "same day, show the time only" decisions. */
export function jstDay(iso: string | Date): string {
  return new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * "Confirmed official" replaces "official notice (unconfirmed)" once the
 * admin confirmed it. With the card's platform, the two broadcast channels
 * get their own words: "heard from the disaster radio" for a loudspeaker
 * transcript, "from the city's broadcast mail" for the official inbox. Each
 * applies only with the source type its channel implies, so a card whose
 * label a stronger source raised never keeps the weaker channel's words.
 */
export function sourceLabel(
  sourceType: SourceType,
  officialConfirmed: boolean | undefined,
  lang: Lang,
  platform?: Platform | null,
): string {
  if (officialConfirmed) return t("card.official_confirmed", lang);
  const channel = channelSource(sourceType, platform);
  return channel ? t(`source.${channel}`, lang) : t(`source.${sourceType}`, lang);
}

/** One sentence on what a broadcast channel's label means, or null for every other source. */
export function sourceExplanation(
  sourceType: SourceType,
  officialConfirmed: boolean | undefined,
  lang: Lang,
  platform?: Platform | null,
): string | null {
  if (officialConfirmed) return null;
  const channel = channelSource(sourceType, platform);
  return channel ? t(`source.${channel}_explain`, lang) : null;
}

function channelSource(sourceType: SourceType, platform: Platform | null | undefined): "loudspeaker" | "city_mail" | null {
  if (platform === "loudspeaker" && sourceType === "secondhand") return "loudspeaker";
  if (platform === "city_mail" && sourceType === "official") return "city_mail";
  return null;
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
