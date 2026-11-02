"use client";

import { useEffect, useRef } from "react";
import { CATEGORY_ICON, isExpired } from "@/lib/cards/categories";
import { formatDateTime, placeLabel } from "@/lib/cards/display";
import { CARD_LANGS, tCount } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";

/**
 * Non-modal detail sheet. It does not trap focus: the page behind stays
 * reachable, Escape and the close button dismiss it.
 */
export function CardSheet({
  card,
  board,
  now,
  onClose,
}: {
  card: Card;
  board: Board;
  now: Date;
  onClose: () => void;
}) {
  const { lang, t } = useLang();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, card.id]);

  const place = placeLabel(card, board, lang);
  const expired = isExpired(card.valid_until, now);
  const conditions = card.facts.conditions ?? [];

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={`sheet-title-${card.id}`}
      className="fixed inset-x-0 bottom-0 z-20 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface shadow-2xl"
    >
      <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="text-3xl leading-none">
            {CATEGORY_ICON[card.category]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted">{t(`category.${card.category}`)}</p>
            <h2 id={`sheet-title-${card.id}`} className="text-xl font-bold leading-snug">
              {card.title[lang]}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-line px-3 font-semibold"
          >
            {t("sheet.close")}
          </button>
        </div>

        {expired ? (
          <p className="mt-3 inline-block rounded-md bg-warn-bg px-2 py-1 text-sm font-medium text-warn-ink">
            {t("card.outdated")}
          </p>
        ) : null}

        <p className="mt-4 text-lg">{card.body[lang]}</p>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
          {place ? (
            <>
              <dt className="text-muted">{t("sheet.place")}</dt>
              <dd>{place}</dd>
            </>
          ) : null}
          {card.facts.status ? (
            <>
              <dt className="text-muted">{t("sheet.category")}</dt>
              <dd>{t(`status.${card.facts.status}`)}</dd>
            </>
          ) : null}
          {card.valid_from ? (
            <>
              <dt className="text-muted">{t("sheet.valid_from")}</dt>
              <dd>{formatDateTime(card.valid_from, lang)}</dd>
            </>
          ) : null}
          {card.valid_until ? (
            <>
              <dt className="text-muted">{t("sheet.valid_until")}</dt>
              <dd>{formatDateTime(card.valid_until, lang)}</dd>
            </>
          ) : null}
          {conditions.length ? (
            <>
              <dt className="text-muted">{t("sheet.conditions")}</dt>
              <dd>{conditions.join(", ")}</dd>
            </>
          ) : null}
          <dt className="text-muted">{t("sheet.sources")}</dt>
          <dd>
            {t(`source.${card.source_type}`)}, {tCount("card.source_count", lang, card.source_count)}
            {card.official_confirmed ? `, ${t("card.official_confirmed")}` : ""}
          </dd>
          <dt className="text-muted">{t("sheet.posted")}</dt>
          <dd>{formatDateTime(card.created_at, lang)}</dd>
        </dl>

        <details className="mt-5 rounded-xl border border-line p-3">
          <summary className="cursor-pointer py-2 font-semibold">{t("sheet.all_languages")}</summary>
          <ul className="mt-2 flex flex-col gap-3">
            {CARD_LANGS.filter((l) => l !== lang).map((l) => (
              <li key={l} lang={l === "easy_ja" ? "ja" : l}>
                <p className="text-sm text-muted">{t(`lang.${l}`)}</p>
                <p className="font-semibold">{card.title[l]}</p>
                <p>{card.body[l]}</p>
              </li>
            ))}
          </ul>
        </details>

        {card.original_text ? (
          <details className="mt-3 rounded-xl border border-line p-3">
            <summary className="cursor-pointer py-2 font-semibold">{t("sheet.original")}</summary>
            <p lang={card.original_lang ?? undefined} className="mt-2 whitespace-pre-wrap text-muted">
              {card.original_text}
            </p>
          </details>
        ) : null}
      </div>
    </section>
  );
}
