"use client";

import { useState, useSyncExternalStore } from "react";
import { cardAsText, cardPath, noticePath } from "@/lib/cards/share";
import { withLangParam } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";
import { copyText } from "./copy";

type CopyState = "idle" | "link" | "text" | "failed";

// Whether the browser has a share sheet, read as an external store: false in
// the server snapshot and therefore in the first client render, so the card
// page hydrates without a mismatch, then the real answer right after. The
// API does not appear or vanish while the page is open, so there is nothing
// to subscribe to. (An effect that sets state is what the lint rule forbids.)
const subscribeNever = () => () => {};
const hasShareApi = () => typeof navigator.share === "function";
const noShareOnServer = () => false;

/**
 * "Share this card": the system share sheet when the browser has one, copy
 * the card's link, copy the card as plain text for a chat group, or open
 * the printable six-language notice in a new tab. Used in the card sheet
 * and on the card page. Everything happens in the browser.
 */
export function CardShare({
  card,
  board,
  now,
  headingLevel = 3,
}: {
  card: Card;
  board: Board;
  now: Date;
  /** 3 inside the sheet and the panel; 2 on the card page, under its h1. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const { lang, t } = useLang();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const canShare = useSyncExternalStore(subscribeNever, hasShareApi, noShareOnServer);

  function cardUrl(): string {
    // The reader's language rides along, so a chat app's preview and the recipient's first view match it.
    const absolute = withLangParam(`${window.location.origin}${cardPath(board.slug, card.id)}`, lang);
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
    "flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left text-base font-semibold hover:border-accent active:bg-held-bg";
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
      <Heading id={`share-title-${card.id}`} className="font-semibold">
        {t("share.card_title")}
      </Heading>
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
        <a
          href={noticePath(board.slug, card.id)}
          target="_blank"
          rel="noopener"
          className={action}
          data-share-notice
        >
          <span aria-hidden="true">🖨️</span>
          {t("share.print_notice")}
        </a>
      </div>
      <p role="status" className="mt-2 min-h-6 text-base font-semibold text-accent">
        {status}
      </p>
      {url ? <p className="break-all rounded-lg bg-held-bg px-3 py-2 text-base select-all">{url}</p> : null}
    </section>
  );
}
