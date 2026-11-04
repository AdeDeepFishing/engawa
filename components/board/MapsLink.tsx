"use client";

import { mapsUrl } from "@/lib/cards/maps";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";

/**
 * "Open in maps" under a card's place (N17), in the card detail and on the
 * card page. A plain search link in a new tab: nothing is fetched until the
 * reader taps it. Nothing renders when the card names no place.
 */
export function MapsLink({ card, board }: { card: Pick<Card, "place_id" | "place_text_ja">; board: Board }) {
  const { t } = useLang();
  const href = mapsUrl(card, board);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 flex min-h-11 w-fit items-center gap-2 rounded-lg border border-line bg-surface px-3 font-semibold hover:border-accent active:bg-held-bg"
      data-maps-link
    >
      <span aria-hidden="true">🗺️</span>
      {t("maps.open")}
      <span className="sr-only"> {t("maps.new_tab")}</span>
    </a>
  );
}
