"use client";

import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { CardShare } from "@/components/share/CardShare";
import { CATEGORY_ICON, isExpired } from "@/lib/cards/categories";
import {
  conflictStatements,
  formatDateTime,
  placeLabel,
  sourceLabel,
  supersededStatements,
  timeAgo,
} from "@/lib/cards/display";
import { areaName } from "@/lib/geo";
import { tCount } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card, CardTrace } from "@/lib/types";
import { Statement } from "./CardSheet";
import { CardTraceView } from "./CardTrace";
import { ReadAloud } from "./ReadAloud";
import { fallbackLangAttr } from "@/lib/cards/langs";

/**
 * One card on its own page, reached from a shared link. The same content as
 * the sheet in the reader's language, the share group, how the card was
 * made, and the way back to the board where new material is dropped in. A
 * client component so the language switch in the top bar changes the page.
 */
export function CardPage({
  board,
  card,
  trace,
  serverNow,
}: {
  board: Board;
  card: Card;
  trace: CardTrace | null;
  serverNow: string;
}) {
  const { lang, t } = useLang();
  const now = new Date(serverNow);
  const place = placeLabel(card, board, lang);
  const area = areaName(board, card.area_code);
  const expired = isExpired(card.valid_until, now);
  const conditions = card.facts.conditions ?? [];
  const conflicts = conflictStatements(card);
  const previous = supersededStatements(card);
  const boardHref = `/b/${board.slug}`;
  const link =
    "tap inline-flex items-center justify-center rounded-xl border border-line bg-surface px-4 font-semibold hover:border-accent";

  return (
    <>
      <TopBar title={board.name[lang]} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-4">
        <Link href={boardHref} className={link}>
          <span aria-hidden="true" className="mr-2">←</span>
          {t("poster.back")}
        </Link>

        <article className="mt-4 rounded-xl border border-line bg-surface p-4 shadow-sm" data-card-page={card.id}>
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="text-3xl leading-none">
              {CATEGORY_ICON[card.category]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-muted">{t(`category.${card.category}`)}</p>
              <h1 lang={fallbackLangAttr(card, lang)} className="text-2xl font-bold leading-snug">{card.title[lang]}</h1>
            </div>
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
            </dd>
            <dt className="text-muted">{t("sheet.posted")}</dt>
            <dd>{formatDateTime(card.created_at, lang)}</dd>
          </dl>

          {previous.length ? (
            <section className="mt-5 rounded-xl border border-line p-3">
              <h2 className="font-semibold">{t("card.previous_versions")}</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {previous.map((s, i) => (
                  <Statement key={`${s.at}-${i}`} statement={s} lang={lang} now={now} />
                ))}
              </ul>
            </section>
          ) : null}
        </article>

        <CardShare card={card} board={board} now={now} />

        {trace ? <CardTraceView cardId={card.id} trace={trace} now={now} /> : null}

        <section className="mt-5 rounded-xl border border-accent bg-surface p-4" data-card-cta>
          <p className="text-lg">{t("card_page.cta")}</p>
          <Link
            href={boardHref}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-lg font-bold text-accent-ink"
          >
            {t("card_page.open_board")}
          </Link>
        </section>
      </main>
    </>
  );
}
