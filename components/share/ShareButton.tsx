"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n/LangProvider";
import { QrScreen } from "./QrScreen";

type CopyState = "idle" | "copied" | "failed";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and non-secure contexts: fall back to a hidden textarea.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Share button for the top bar. Opens a small non-modal panel with the
 * system share sheet (when the browser has the Web Share API), copy link and
 * a fullscreen QR code. Everything happens in the browser; nothing is sent.
 */
export function ShareButton({ boardSlug, boardName }: { boardSlug: string; boardName: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState(false);
  const [copy, setCopy] = useState<CopyState>("idle");
  const [canShare, setCanShare] = useState(false);
  const [url, setUrl] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !qr) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!qr && !panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open, qr]);

  function toggle() {
    if (!open) {
      // Read the URL and the Share API only on click, so the server render
      // and the first client render stay identical.
      setUrl(`${window.location.origin}/b/${boardSlug}`);
      setCanShare(typeof navigator.share === "function");
      setCopy("idle");
    }
    setOpen((v) => !v);
  }

  async function onNativeShare() {
    try {
      await navigator.share({ title: `${boardName} | Engawa`, text: t("share.text", { board: boardName }), url });
      setOpen(false);
    } catch {
      // The user closed the share sheet, or the browser refused: keep the panel.
    }
  }

  async function onCopy() {
    setCopy((await copyText(url)) ? "copied" : "failed");
  }

  const action =
    "flex min-h-12 w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 text-left text-base font-semibold hover:border-accent";

  // Not positioned on purpose: the panel anchors to the top bar's content
  // column, so it stays on screen when the button wraps to a second row.
  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="share-panel"
        className="flex items-center gap-1 rounded-lg border border-line bg-surface px-3 font-semibold"
      >
        <span aria-hidden="true">↗</span>
        {t("share.button")}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id="share-panel"
          role="group"
          aria-label={t("share.title")}
          className="absolute right-4 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-3 shadow-2xl"
        >
          <p className="px-1 pb-2 text-base font-bold">{t("share.title")}</p>
          <div className="flex flex-col gap-2">
            {canShare ? (
              <button type="button" className={action} onClick={() => void onNativeShare()}>
                <span aria-hidden="true">📤</span>
                {t("share.native")}
              </button>
            ) : null}
            <button type="button" className={action} onClick={() => void onCopy()}>
              <span aria-hidden="true">🔗</span>
              {t("share.copy")}
            </button>
            <button type="button" className={action} onClick={() => setQr(true)}>
              <span aria-hidden="true">▦</span>
              {t("share.qr")}
            </button>
          </div>
          <p className="mt-3 break-all rounded-lg bg-held-bg px-3 py-2 text-base select-all">{url}</p>
          <p role="status" className="mt-2 min-h-6 px-1 text-base font-semibold text-accent">
            {copy === "copied" ? t("share.copied") : copy === "failed" ? t("share.copy_failed") : ""}
          </p>
        </div>
      ) : null}
      {qr ? (
        <QrScreen
          url={url}
          boardName={boardName}
          onClose={() => {
            setQr(false);
            buttonRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
