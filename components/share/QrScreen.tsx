"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useLang } from "@/lib/i18n/LangProvider";
import { encodeQr, qrPath } from "./qr";

const MARGIN = 4;

/**
 * Fullscreen QR code of the board URL, generated in the browser. Rendered in
 * a portal because the sticky top bar uses backdrop-filter, which would
 * otherwise become the containing block of this fixed layer. Like the card
 * sheet it does not trap focus; Escape or the close button returns.
 */
export function QrScreen({ url, boardName, onClose }: { url: string; boardName: string; onClose: () => void }) {
  const { t } = useLang();
  const closeRef = useRef<HTMLButtonElement>(null);
  const qr = useMemo(() => encodeQr(url), [url]);
  const view = qr.size + MARGIN * 2;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    // Black on white in every theme, so a scanner reads it; the focus ring keeps the light accent (6.6:1 on white).
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="qr-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-white p-6 text-center text-black [--accent:#ad235d] [color-scheme:light]"
    >
      <h2 id="qr-title" className="text-2xl font-bold">
        {boardName}
      </h2>
      <p className="text-lg">{t("share.qr_title")}</p>
      <svg
        role="img"
        aria-label={url}
        viewBox={`0 0 ${view} ${view}`}
        shapeRendering="crispEdges"
        className="h-auto w-[min(85vw,60vh)] max-w-[32rem]"
      >
        <rect width={view} height={view} fill="#ffffff" />
        <path d={qrPath(qr, MARGIN)} fill="#000000" />
      </svg>
      <p className="max-w-full break-all text-base">{url}</p>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="min-h-12 rounded-xl border-2 border-black px-8 text-lg font-bold"
      >
        {t("sheet.close")}
      </button>
    </section>,
    document.body,
  );
}
