import { isExpired } from "./categories";
import { placeLabel, sourceLabel, timeRange } from "./display";
import { t, tCount, type Lang } from "@/lib/i18n";
import type { Board, Card } from "@/lib/types";

/**
 * A card as plain text for a LINE or WeChat group: title and body, then the
 * place, the time window, the outdated warning when it applies and the
 * source line in words, then the card URL. No markdown, a blank line
 * between the parts, everything in the reader's language.
 */
export function cardAsText(card: Card, board: Board, now: Date, lang: Lang, url: string | null): string {
  const place = placeLabel(card, board, lang);
  const details = [
    place ? `${t("sheet.place", lang)}: ${place}` : null,
    timeRange(card.valid_from, card.valid_until, lang),
    isExpired(card.valid_until, now) ? t("card.outdated", lang) : null,
    `${sourceLabel(card.source_type, card.official_confirmed, lang)}, ${tCount("card.source_count", lang, card.source_count)}`,
  ].filter(Boolean);
  return [`${card.title[lang]}\n${card.body[lang]}`, details.join("\n"), url].filter(Boolean).join("\n\n");
}

/** Path of a card's own page on this site. */
export function cardPath(boardSlug: string, cardId: string): string {
  return `/b/${boardSlug}/c/${cardId}`;
}
