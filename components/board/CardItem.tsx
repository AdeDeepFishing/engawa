"use client";

import { CATEGORY_ICON, isExpired } from "@/lib/cards/categories";
import {
  conflictStatements,
  contentTime,
  placeLabel,
  sourceLabel,
  statementSummary,
  supersededStatements,
  timeAgo,
} from "@/lib/cards/display";
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
  const conflicts = conflictStatements(card);
  const previous = supersededStatements(card)[0];
  const current = { valid_from: card.valid_from, valid_until: card.valid_until, status: card.facts.status };
  const when = previous
    ? t("card.updated_time", { time: timeAgo(contentTime(card), now, lang) })
    : timeAgo(card.created_at, now, lang);
  // The button's accessible name replaces its content, so the warnings go into it too.
  const label = [
    card.title[lang],
    conflicts.length ? t("conflict.label") : null,
    previous ? t("card.updated") : null,
    expired ? t("card.outdated") : null,
    t("card.open_detail"),
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <li data-card-id={card.id}>
      <button
        type="button"
        onClick={() => onOpen(card)}
        aria-label={label}
        className={`w-full rounded-xl border bg-surface p-4 text-left shadow-sm hover:border-accent ${
          conflicts.length ? "border-warn-ink" : "border-line"
        } ${expired ? "opacity-70" : ""}`}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-2xl leading-none">
            {CATEGORY_ICON[card.category]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-muted">{t(`category.${card.category}`)}</p>
            <h3 className="mt-0.5 text-lg font-bold leading-snug">{card.title[lang]}</h3>
            {place ? <p className="mt-1 text-base text-foreground">{place}</p> : null}
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-base text-muted">
              <span>{when}</span>
              <span className={card.official_confirmed ? "font-semibold text-accent" : undefined}>
                {sourceLabel(card.source_type, card.official_confirmed, lang)}
              </span>
              <span>{tCount("card.source_count", lang, card.source_count)}</span>
            </p>
            {conflicts.length ? (
              <span className="mt-2 block rounded-md bg-warn-bg px-2 py-1 text-base text-warn-ink">
                <span className="block font-semibold">
                  <span aria-hidden="true">⚠️ </span>
                  {t("conflict.label")}
                </span>
                {conflicts.map((s, i) => {
                  const other = conflicts[i === 0 ? 1 : 0] ?? current;
                  return (
                    <span key={`${s.at}-${i}`} className="mt-0.5 block">
                      {t("conflict.statement", {
                        summary: statementSummary(s, other, lang),
                        source: sourceLabel(s.source_type, s.official_confirmed, lang),
                        time: timeAgo(s.at, now, lang),
                      })}
                    </span>
                  );
                })}
              </span>
            ) : null}
            {previous ? (
              <span className="mt-2 flex flex-wrap items-baseline gap-x-2 text-base">
                <span className="rounded-md bg-accent px-2 py-0.5 font-semibold text-accent-ink">
                  {t("card.updated")}
                </span>
                <span className="text-muted">
                  {t("card.previously", { text: statementSummary(previous, current, lang) })}
                </span>
              </span>
            ) : null}
            {expired ? (
              <p className="mt-2 inline-block rounded-md bg-warn-bg px-2 py-0.5 text-base font-medium text-warn-ink">
                {t("card.outdated")}
              </p>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}
