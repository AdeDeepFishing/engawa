"use client";

import type { Ref } from "react";
import { useLang } from "@/lib/i18n/LangProvider";
import type { BoardMode } from "@/lib/types";

/** The board's mode beside its name, from 768 px up; the phone bar has no room for it. */
export function ModeBadge({ mode }: { mode: BoardMode }) {
  const { t } = useLang();
  const disaster = mode === "disaster";
  return (
    <span
      className={`hidden shrink-0 items-center gap-1 rounded-full border px-3 py-0.5 text-base font-semibold md:inline-flex ${
        disaster ? "border-warn-ink bg-warn-bg text-warn-ink" : "border-line bg-held-bg text-foreground"
      }`}
      data-board-mode={mode}
    >
      <span aria-hidden="true">{disaster ? "⚠️" : "🏠"}</span>
      {t(disaster ? "layout.mode_disaster" : "layout.mode_peace")}
    </span>
  );
}

/**
 * The drop-in as the top bar's primary button, from 1024 px up, where the
 * floating button is hidden. It opens DropIn's own panel (see dropInBridge).
 */
export function DropInTopButton({
  ref,
  open,
  offline,
  onClick,
}: {
  ref: Ref<HTMLButtonElement>;
  open: boolean;
  offline: boolean;
  onClick: () => void;
}) {
  const { t } = useLang();
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={offline}
        aria-expanded={open}
        aria-describedby={offline ? "dropin-top-offline" : undefined}
        className="hidden items-center gap-2 rounded-lg bg-accent px-4 font-bold text-accent-ink hover:bg-accent-hover active:bg-accent-hover disabled:bg-muted lg:inline-flex"
        data-dropin-top
      >
        <span aria-hidden="true">＋</span>
        {t("dropin.button")}
      </button>
      {offline ? (
        <span id="dropin-top-offline" className="sr-only">
          {t("offline.dropin_reason")}
        </span>
      ) : null}
    </>
  );
}
