"use client";

import { useEffect, useRef } from "react";
import { CATEGORY_ICON, isExpired } from "@/lib/cards/categories";
import {
  conflictStatements,
  formatDateTime,
  placeLabel,
  platformLabel,
  sourceLabel,
  statementText,
  supersededStatements,
  timeAgo,
  timeRange,
} from "@/lib/cards/display";
import { areaName } from "@/lib/geo";
import { CARD_LANGS, tCount, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card, ConflictStatement } from "@/lib/types";
import { MaskedImage } from "./MaskedImage";

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
  const area = areaName(board, card.area_code);
  const expired = isExpired(card.valid_until, now);
  const conditions = card.facts.conditions ?? [];
  const conflicts = conflictStatements(card);
  const previous = supersededStatements(card);
  const sources = card.sources ?? [];

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
            <p className="text-base font-medium text-muted">{t(`category.${card.category}`)}</p>
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
          <p className="mt-3 inline-block rounded-md bg-warn-bg px-2 py-1 text-base font-medium text-warn-ink">
            {t("card.outdated")}
          </p>
        ) : null}

        {conflicts.length ? (
          <div className="mt-3 rounded-xl border border-warn-ink bg-warn-bg p-3 text-warn-ink">
            <p className="font-bold">
              <span aria-hidden="true">⚠️ </span>
              {t("conflict.label")}
            </p>
            <p className="mt-1">{t("conflict.explain")}</p>
            <ul className="mt-2 flex flex-col gap-2">
              {conflicts.map((s, i) => (
                <Statement key={`${s.at}-${i}`} statement={s} lang={lang} now={now} />
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-4 text-lg">{card.body[lang]}</p>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
          {place ? (
            <>
              <dt className="text-muted">{t("sheet.place")}</dt>
              <dd>{place}</dd>
            </>
          ) : null}
          {area ? (
            <>
              <dt className="text-muted">{t("area.label")}</dt>
              <dd>{area}</dd>
            </>
          ) : null}
          {card.facts.status ? (
            <>
              <dt className="text-muted">{t("card.status")}</dt>
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
            {sourceLabel(card.source_type, card.official_confirmed, lang)} ·{" "}
            {tCount("card.source_count", lang, card.source_count)}
            {card.last_confirmed_at ? (
              <span className="block text-muted">
                {t("card.last_confirmed", { time: timeAgo(card.last_confirmed_at, now, lang) })}
              </span>
            ) : null}
            {sources.length ? (
              <ul className="mt-1 flex flex-col gap-0.5 text-base text-muted">
                {sources.map((src, i) => (
                  <li key={`${src.created_at}-${i}`}>
                    {[
                      t(`card.relation.${src.relation}`),
                      platformLabel(src.platform, lang),
                      t(`source.${src.source_type}`),
                      formatDateTime(src.created_at, lang),
                    ].join(" · ")}
                  </li>
                ))}
              </ul>
            ) : null}
          </dd>
          <dt className="text-muted">{t("sheet.posted")}</dt>
          <dd>{formatDateTime(card.created_at, lang)}</dd>
        </dl>

        {previous.length ? (
          <section className="mt-5 rounded-xl border border-line p-3">
            <h3 className="font-semibold">{t("card.previous_versions")}</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {previous.map((s, i) => (
                <Statement key={`${s.at}-${i}`} statement={s} lang={lang} now={now} />
              ))}
            </ul>
          </section>
        ) : null}

        <details className="mt-5 rounded-xl border border-line p-3">
          <summary className="cursor-pointer py-2 font-semibold">{t("sheet.all_languages")}</summary>
          <ul className="mt-2 flex flex-col gap-3">
            {CARD_LANGS.filter((l) => l !== lang).map((l) => (
              <li key={l} lang={l === "easy_ja" ? "ja" : l}>
                <p className="text-base text-muted">{t(`lang.${l}`)}</p>
                <p className="font-semibold">{card.title[l]}</p>
                <p>{card.body[l]}</p>
              </li>
            ))}
          </ul>
        </details>

        {card.original_text || card.has_masked_image ? (
          <details className="mt-3 rounded-xl border border-line p-3">
            <summary className="cursor-pointer py-2 font-semibold">{t("sheet.original")}</summary>
            {card.original_text ? (
              <p lang={card.original_lang ?? undefined} className="mt-2 whitespace-pre-wrap text-muted">
                {card.original_text}
              </p>
            ) : null}
            {card.has_masked_image ? <MaskedImage cardId={card.id} /> : null}
          </details>
        ) : null}
      </div>
    </section>
  );
}

/** One statement in a conflict or in the update history: what it said, its time range, source and age. */
function Statement({ statement: s, lang, now }: { statement: ConflictStatement; lang: Lang; now: Date }) {
  const range = timeRange(s.valid_from, s.valid_until, lang);
  const meta = [
    sourceLabel(s.source_type, s.official_confirmed, lang),
    s.source_count ? tCount("card.source_count", lang, s.source_count) : null,
    timeAgo(s.at, now, lang),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li>
      <p>{statementText(s, lang)}</p>
      {range ? <p className="font-semibold">{range}</p> : null}
      <p className="text-base opacity-80">{meta}</p>
    </li>
  );
}
