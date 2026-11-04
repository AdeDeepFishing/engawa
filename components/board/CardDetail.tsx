"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { mapsUrl } from "@/lib/cards/maps";
import { CardShare } from "@/components/share/CardShare";
import { areaName } from "@/lib/geo";
import { CARD_LANGS, tCount, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card, CardTrace, ConflictStatement } from "@/lib/types";
import { CardReactions } from "./CardReactions";
import { CardTraceView } from "./CardTrace";
import { MaskedImage } from "./MaskedImage";
import { ReadAloud } from "./ReadAloud";
import { fallbackLangAttr } from "@/lib/cards/langs";

/** Id of the card title, for the region or dialog that holds the detail. */
export const cardTitleId = (cardId: string) => `sheet-title-${cardId}`;

/**
 * Everything a reader sees about one card: title, body, read aloud, facts,
 * sources, reader confirmations, earlier versions, share, how it was made,
 * the other languages and the original. The bottom sheet on a phone and the
 * centre panel on a laptop both render this, so the two never drift apart.
 * `action` sits beside the title (the close button of whichever holds it).
 */
export function CardDetail({
  card,
  board,
  now,
  action,
}: {
  card: Card;
  board: Board;
  now: Date;
  action?: ReactNode;
}) {
  const { lang, t } = useLang();
  /**
   * The trace for the card shown, kept with its card id so a stale answer is
   * never shown for another card. `data` null means the route answered 404
   * (seed cards without a database, a card no longer public) or the fetch
   * failed: the section is then left out instead of loading forever.
   */
  const [trace, setTrace] = useState<{ id: string; data: CardTrace | null } | null>(null);

  // Fetched when the card is shown and again when it gains a source, an
  // update or the admin's confirmation while it is open.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cards/${card.id}/trace`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<CardTrace>) : null))
      .catch(() => null)
      .then((data) => {
        if (!cancelled) setTrace({ id: card.id, data });
      });
    return () => {
      cancelled = true;
    };
  }, [card.id, card.source_count, card.updated_at, card.official_confirmed]);

  const place = placeLabel(card, board, lang);
  // A plain search link: nothing is fetched until the reader taps it (N17).
  const maps = mapsUrl(card, board);
  const area = areaName(board, card.area_code);
  const expired = isExpired(card.valid_until, now);
  const conditions = card.facts.conditions ?? [];
  const conflicts = conflictStatements(card);
  const previous = supersededStatements(card);
  const sources = card.sources ?? [];
  // Loading until the fetch settles, then the data or, on a 404, nothing.
  const traceState = trace?.id === card.id ? trace : null;
  const traceAbsent = traceState !== null && traceState.data === null;

  return (
    <>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-3xl leading-none">
          {CATEGORY_ICON[card.category]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-muted">{t(`category.${card.category}`)}</p>
          <h2 id={cardTitleId(card.id)} lang={fallbackLangAttr(card, lang)} className="text-xl font-bold leading-snug">
            {card.title[lang]}
          </h2>
        </div>
        {action}
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

      <p lang={fallbackLangAttr(card, lang)} className="mt-4 text-lg">{card.body[lang]}</p>
      {fallbackLangAttr(card, lang) ? <p className="mt-1 text-base text-muted">{t("card.translating")}</p> : null}
      <ReadAloud key={card.id} card={card} />

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
        {place ? (
          <>
            <dt className="text-muted">{t("sheet.place")}</dt>
            <dd>
              {place}
              {maps ? (
                <a
                  href={maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex min-h-11 w-fit items-center gap-2 rounded-lg border border-line bg-surface px-3 font-semibold hover:border-accent active:bg-held-bg"
                  data-maps-link
                >
                  <span aria-hidden="true">🗺️</span>
                  {t("maps.open")}
                  <span className="sr-only"> {t("maps.new_tab")}</span>
                </a>
              ) : null}
            </dd>
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
          {sourceLabel(card.source_type, card.official_confirmed, lang, card.facts.platform)} ·{" "}
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

      <CardReactions key={`reactions-${card.id}`} card={card} />

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

      <CardShare card={card} board={board} now={now} />

      {traceAbsent ? null : <CardTraceView cardId={card.id} trace={traceState?.data ?? null} now={now} />}

      <details className="mt-5 rounded-xl border border-line p-3">
        <summary className="cursor-pointer py-2 font-semibold hover:text-accent">{t("sheet.all_languages")}</summary>
        <ul className="mt-2 flex flex-col gap-3">
          {CARD_LANGS.filter((l) => l !== lang && !(card.missing_langs ?? []).includes(l)).map((l) => (
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
          <summary className="cursor-pointer py-2 font-semibold hover:text-accent">{t("sheet.original")}</summary>
          {card.original_text ? (
            <p lang={card.original_lang ?? undefined} className="mt-2 whitespace-pre-wrap text-muted">
              {card.original_text}
            </p>
          ) : null}
          {card.has_masked_image ? <MaskedImage cardId={card.id} /> : null}
        </details>
      ) : null}
    </>
  );
}

/** One statement in a conflict or in the update history: what it said, its time range, source and age. */
export function Statement({ statement: s, lang, now }: { statement: ConflictStatement; lang: Lang; now: Date }) {
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
