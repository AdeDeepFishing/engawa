"use client";

import { useEffect, useRef } from "react";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";
import { CardDetail, cardTitleId } from "./CardDetail";

export { Statement } from "./CardDetail";

/**
 * Non-modal detail sheet on a phone. It does not trap focus: the page behind
 * stays reachable, Escape and the close button dismiss it. The content is
 * CardDetail, the same the centre panel shows on a laptop.
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
  const { t } = useLang();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, card.id]);

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={cardTitleId(card.id)}
      className="fixed inset-x-0 bottom-0 z-20 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface shadow-2xl"
    >
      <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-3">
        <CardDetail
          card={card}
          board={board}
          now={now}
          action={
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-line px-3 font-semibold hover:border-accent active:bg-held-bg"
            >
              {t("sheet.close")}
            </button>
          }
        />
      </div>
    </section>
  );
}
