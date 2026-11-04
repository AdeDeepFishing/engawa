"use client";

import { useLang } from "@/lib/i18n/LangProvider";

export function TextSizeToggle() {
  const { textSize, setTextSize, t } = useLang();
  const large = textSize === "large";
  return (
    <button
      type="button"
      aria-pressed={large}
      aria-label={`${t("nav.text_size")}: ${large ? t("text_size.large") : t("text_size.normal")}`}
      onClick={() => setTextSize(large ? "normal" : "large")}
      className="rounded-lg border border-line-strong bg-surface px-3 font-semibold hover:border-accent active:bg-held-bg aria-pressed:border-accent aria-pressed:text-accent"
    >
      <span aria-hidden="true" className="text-base">A</span>
      <span aria-hidden="true" className="text-2xl">A</span>
    </button>
  );
}
