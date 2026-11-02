import { INTL_LOCALE, t, type Lang } from "@/lib/i18n";
import type { Board, Card } from "@/lib/types";

/** Place as shown to a reader: translated name plus the Japanese name, because signs are in Japanese. */
export function placeLabel(card: Pick<Card, "place_id" | "place_text_ja">, board: Board, lang: Lang): string | null {
  if (card.place_id) {
    const place = board.known_places.find((p) => p.id === card.place_id);
    if (place) {
      if (lang === "ja") return place.name_ja;
      const localized = place.names[lang];
      return localized ? `${localized} (${place.name_ja})` : place.name_ja;
    }
  }
  return card.place_text_ja;
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
