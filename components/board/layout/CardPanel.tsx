"use client";

import { useEffect, useRef } from "react";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";
import { CardDetail, cardTitleId } from "../CardDetail";

/**
 * The selected card in place, beside the list (tablet and laptop). Not a
 * dialog: it is a region of the page that reads like the phone's sheet,
 * with the same CardDetail inside. Focus stays where the reader is, so the
 * arrow keys keep moving through the list while a card is open. A new card
 * scrolls the panel back to its top.
 */
export function CardPanel({
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
  const { t } = useLang();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    // The column scrolls, not the page; scrollIntoView would move the list too.
    const column = ref.current?.closest("[data-board-column]");
    if (column) column.scrollTop = 0;
  }, [card.id]);

  return (
    <section
      ref={ref}
      aria-labelledby={cardTitleId(card.id)}
      className="rounded-2xl border border-line bg-surface p-4 shadow-sm xl:p-6"
      data-card-panel={card.id}
    >
      {/* The close button gets its own row: beside the title it left a narrow column a word wide at 1024 px. */}
      <div className="mb-2 flex items-center justify-between gap-4">
        <p className="text-base font-medium text-muted">{t("layout.detail_label")}</p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-line bg-surface px-3 font-semibold hover:border-accent active:bg-held-bg"
          data-card-panel-close
        >
          {t("layout.close_card")}
        </button>
      </div>
      <CardDetail card={card} board={board} now={now} />
    </section>
  );
}

/** What the centre shows before a card is picked (laptop only). */
export function CardPanelEmpty() {
  const { t } = useLang();
  return (
    <div className="flex min-h-full flex-col items-center justify-center rounded-2xl border border-dashed border-line px-8 py-16 text-center" data-card-panel-empty>
      <span aria-hidden="true" className="text-5xl leading-none">
        🗂️
      </span>
      <h2 className="mt-4 text-xl font-bold">{t("layout.pick_title")}</h2>
      <p className="mt-2 max-w-md text-base text-muted">{t("layout.pick_hint")}</p>
    </div>
  );
}
