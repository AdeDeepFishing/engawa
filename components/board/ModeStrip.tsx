"use client";

import { formatDateTime, timeAgo } from "@/lib/cards/display";
import type { ModeView } from "@/lib/cards/mode";
import { useLang } from "@/lib/i18n/LangProvider";

/**
 * The full-width strip under the board's top bar in disaster mode (N21):
 * since when, who switched it in plain words (the city's broadcast mail or
 * the admin; nothing when the reason is not on record), and what the list
 * order now is. Nothing in peace mode. `now` is the server time of the last
 * poll, as for every relative time on the board.
 */
export function ModeStrip({ view, now }: { view: ModeView; now: Date }) {
  const { lang, t } = useLang();
  if (view.mode !== "disaster") return null;
  const reason = view.reason === "inbox" ? t("mode.reason_inbox") : view.reason === "admin" ? t("mode.reason_admin") : null;
  return (
    <div role="status" className="w-full bg-danger text-danger-ink" data-mode-strip data-board-mode="disaster">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-2 xl:px-6">
        <p className="text-lg font-bold leading-snug">
          <span aria-hidden="true">⚠️ </span>
          {view.since
            ? t("mode.strip_since", { time: formatDateTime(view.since, lang), ago: timeAgo(view.since, now, lang) })
            : t("layout.mode_disaster")}
        </p>
        <p className="text-base leading-snug">
          {reason ? `${reason} ` : null}
          {t("mode.strip_order")}
        </p>
      </div>
    </div>
  );
}
