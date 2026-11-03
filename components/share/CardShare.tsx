"use client";

import { useState } from "react";
import { cardAsText, cardPath } from "@/lib/cards/share";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";
import { copyText } from "./copy";

type CopyState = "idle" | "link" | "text" | "failed";

/**
 * "Share this card": the system share sheet when the browser has one, copy
 * the card's link, or copy the card as plain text for a chat group. Used in
 * the card sheet and on the card page. Everything happens in the browser.
 */
export function CardShare({ card, board, now }: { card: Card; board: Board; now: Date }) {
  const { lang, t } = useLang();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [url, setUrl] = useState<string | null>(null);
  // Read once on mount, on the client only; this component is never server-rendered with a different answer.
  const [canShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");

  function cardUrl(): string {
    const absolute = `${window.location.origin}${cardPath(board.slug, card.id)}`;
    setUrl(absolute);
    return absolute;
  }

  async function onNativeShare() {
    const link = cardUrl();
    try {
      await navigator.share({ title: card.title[lang], text: cardAsText(card, board, now, lang, null), url: link });
    } catch {
      // The user closed the share sheet, or the browser refused: nothing to do.
    }
  }

  async function onCopyLink() {
    setCopy((await copyText(cardUrl())) ? "link" : "failed");
  }

  async function onCopyText() {
    setCopy((await copyText(cardAsText(card, board, now, lang, cardUrl()))) ? "text" : "failed");
  }

  const action =
    "flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left text-base font-semibold hover:border-accent";
  const status =
    copy === "link"
      ? t("share.copied")
      : copy === "text"
        ? t("share.card_text_copied")
        : copy === "failed"
          ? t("share.copy_failed")
          : "";

  return (
    <section className="mt-5 rounded-xl border border-line p-3" aria-labelledby={`share-title-${card.id}`} data-card-share>
      <h3 id={`share-title-${card.id}`} className="font-semibold">
        {t("share.card_title")}
      </h3>
      <div className="mt-2 flex flex-col gap-2">
        {canShare ? (
          <button type="button" className={action} onClick={() => void onNativeShare()} data-share-native>
            <span aria-hidden="true">📤</span>
            {t("share.native")}
          </button>
        ) : null}
        <button type="button" className={action} onClick={() => void onCopyLink()} data-share-copy-link>
          <span aria-hidden="true">🔗</span>
          {t("share.copy")}
        </button>
        <button type="button" className={action} onClick={() => void onCopyText()} data-share-copy-text>
          <span aria-hidden="true">📋</span>
          {t("share.card_copy_text")}
        </button>
      </div>
      <p role="status" className="mt-2 min-h-6 text-base font-semibold text-accent">
        {status}
      </p>
      {url ? <p className="break-all rounded-lg bg-held-bg px-3 py-2 text-base select-all">{url}</p> : null}
    </section>
  );
}
