"use client";

import { CATEGORY_ICON, isExpired } from "@/lib/cards/categories";
import { placeLabel, timeAgo } from "@/lib/cards/display";
import { tCount } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";

export function CardItem({
  card,
  board,
  now,
  onOpen,
}: {
  card: Card;
  board: Board;
  now: Date;
  onOpen: (card: Card) => void;
}) {
  const { lang, t } = useLang();
  const expired = isExpired(card.valid_until, now);
  const place = placeLabel(card, board, lang);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(card)}
        aria-label={`${card.title[lang]}. ${t("card.open_detail")}`}
        className={`w-full rounded-xl border border-line bg-surface p-4 text-left shadow-sm hover:border-accent ${
          expired ? "opacity-70" : ""
        }`}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-2xl leading-none">
            {CATEGORY_ICON[card.category]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted">{t(`category.${card.category}`)}</p>
            <h3 className="mt-0.5 text-lg font-bold leading-snug">{card.title[lang]}</h3>
            {place ? <p className="mt-1 text-base text-foreground">{place}</p> : null}
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
              <span>{timeAgo(card.created_at, now, lang)}</span>
              <span>{t(`source.${card.source_type}`)}</span>
              <span>{tCount("card.source_count", lang, card.source_count)}</span>
              {card.official_confirmed ? (
                <span className="font-semibold text-accent">{t("card.official_confirmed")}</span>
              ) : null}
            </p>
            {expired ? (
              <p className="mt-2 inline-block rounded-md bg-warn-bg px-2 py-0.5 text-sm font-medium text-warn-ink">
                {t("card.outdated")}
              </p>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}
