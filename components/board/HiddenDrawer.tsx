"use client";

import { CATEGORY_ICON } from "@/lib/cards/categories";
import { sourceLabel, timeAgo } from "@/lib/cards/display";
import type { HiddenDuplicate } from "@/lib/db/boards";
import { tCount } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import { fallbackLangAttr } from "@/lib/cards/langs";

/**
 * Hidden duplicates, readable on request. A collapsed <details> at the end
 * of the card list; its summary says how many there are. Each item is read
 * only (title, body, time, source type) with a line naming the card it
 * repeats, which links to that card on the board. Renders nothing when
 * there are none. Native disclosure, so keyboard and screen readers get the
 * expanded state for free.
 */
export function HiddenDrawer({
  items,
  now,
  onOpenOriginal,
}: {
  items: HiddenDuplicate[];
  now: Date;
  /** Scrolls to the original card and opens it, as a citation chip does. */
  onOpenOriginal: (cardId: string) => void;
}) {
  const { lang, t } = useLang();
  if (items.length === 0) return null;
  return (
    <details className="mt-6 rounded-xl border border-line bg-held-bg" data-hidden-drawer>
      <summary className="cursor-pointer px-4 py-2 text-base font-semibold hover:text-accent">
        {tCount("board.hidden_duplicates", lang, items.length)}
      </summary>
      <p className="px-4 text-base text-muted">{t("board.hidden_duplicates_note")}</p>
      <ul className="mt-3 flex flex-col gap-3 px-4 pb-4">
        {items.map((card) => (
          <li key={card.id} data-hidden-duplicate={card.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="text-2xl leading-none">
                {CATEGORY_ICON[card.category]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap gap-x-3 text-base font-medium text-muted">
                  <span>{t("card.hidden_duplicate")}</span>
                  <span>{t(`category.${card.category}`)}</span>
                </p>
                <h3 lang={fallbackLangAttr(card, lang)} className="mt-0.5 text-lg font-bold leading-snug">{card.title[lang]}</h3>
                <p lang={fallbackLangAttr(card, lang)} className="mt-1 text-base">{card.body[lang]}</p>
                {fallbackLangAttr(card, lang) ? <p className="mt-1 text-base text-muted">{t("card.translating")}</p> : null}
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-base text-muted">
                  <span>{timeAgo(card.created_at, now, lang)}</span>
                  <span>{sourceLabel(card.source_type, card.official_confirmed, lang, card.facts.platform)}</span>
                </p>
                <p className="mt-1 text-base">
                  <span className="text-muted">{t("card.duplicate_of_prefix")}: </span>
                  <a
                    href={`#card-${card.duplicate_of}`}
                    onClick={(e) => {
                      e.preventDefault();
                      onOpenOriginal(card.duplicate_of);
                    }}
                    className="tap inline-flex items-center font-semibold text-accent underline"
                  >
                    {card.original_title[lang]}
                  </a>
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
