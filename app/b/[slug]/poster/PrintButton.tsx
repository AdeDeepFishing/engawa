"use client";

import { useLang } from "@/lib/i18n/LangProvider";

/** Opens the browser's print dialog; the page's print stylesheet does the rest. */
export function PrintButton() {
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-base font-bold text-accent-ink"
    >
      <span aria-hidden="true" className="mr-2">🖨️</span>
      {t("poster.print_button")}
    </button>
  );
}
