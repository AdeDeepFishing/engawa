"use client";

import { useState } from "react";
import { formatDateTime, timeAgo } from "@/lib/cards/display";
import type { ModeReasonKind, ModeView } from "@/lib/cards/mode";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { BoardMode } from "@/lib/types";

const REASON_KEYS: Record<ModeReasonKind, MessageKey> = {
  admin: "admin.mode_reason_admin",
  inbox: "admin.mode_reason_inbox",
  auto_return: "admin.mode_reason_auto_return",
};

/**
 * "Board mode" on the admin page (N21): the current mode, when and why it
 * last changed, and one button to switch to the other mode. The switch
 * takes a second, inline tap (no browser dialog): the first tap shows what
 * the change does and the button that makes it. The request names the mode
 * wanted, so a stale page or a double tap cannot toggle the board back.
 */
export function ModeAdmin({ slug, initial, serverNow }: { slug: string; initial: ModeView; serverNow: string }) {
  const { lang, t } = useLang();
  const [view, setView] = useState(initial);
  const [now, setNow] = useState(() => new Date(serverNow));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [switched, setSwitched] = useState(false);
  const target: BoardMode = view.mode === "peace" ? "disaster" : "peace";
  const disaster = view.mode === "disaster";

  async function apply() {
    setBusy(true);
    setFailed(false);
    try {
      // The admin cookie goes along with the request; no token in the body.
      const res = await fetch(`/api/b/${slug}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_mode", mode: target }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const answer = (await res.json()) as { mode: ModeView; changed: boolean };
      setView(answer.mode);
      setNow(new Date());
      setSwitched(true);
      setConfirming(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface p-4" aria-labelledby="mode-heading" data-mode-admin data-board-mode={view.mode}>
      <h2 id="mode-heading" className="text-lg font-bold">
        {t("admin.mode_heading")}
      </h2>
      <p className="mt-2 text-base">{t("admin.mode_intro")}</p>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-lg font-semibold" data-mode-current>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-0.5 ${
            disaster ? "border-danger bg-danger text-danger-ink" : "border-line bg-held-bg text-foreground"
          }`}
        >
          <span aria-hidden="true">{disaster ? "⚠️" : "🏠"}</span>
          {t("admin.mode_current", { mode: t(disaster ? "layout.mode_disaster" : "layout.mode_peace") })}
        </span>
      </p>
      <p className="mt-2 text-base text-muted" data-mode-changed>
        {view.since
          ? t("admin.mode_changed", {
              time: formatDateTime(view.since, lang),
              ago: timeAgo(view.since, now, lang),
              reason: t(view.reason ? REASON_KEYS[view.reason] : "admin.mode_reason_unknown"),
            })
          : t("admin.mode_never")}
      </p>
      {switched ? (
        <p role="status" className="mt-2 text-base font-semibold" data-mode-switched>
          {t("admin.mode_switched")}
        </p>
      ) : null}
      {confirming ? (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line-strong p-3" data-mode-confirm>
          <p role="alert" className="text-base">
            {t("admin.mode_confirm_note")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy}
              aria-busy={busy}
              className={`rounded-lg px-4 font-semibold disabled:opacity-60 ${
                target === "disaster" ? "bg-danger text-danger-ink" : "bg-accent text-accent-ink hover:bg-accent-hover"
              }`}
              data-mode-confirm-button
            >
              {t(target === "disaster" ? "admin.mode_confirm_disaster" : "admin.mode_confirm_peace")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg border border-line bg-surface px-4 font-semibold disabled:opacity-60"
            >
              {t("admin.mode_cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            setSwitched(false);
            setFailed(false);
          }}
          className="mt-3 rounded-lg border border-line bg-surface px-4 font-semibold"
          data-mode-switch
        >
          {t(target === "disaster" ? "admin.mode_to_disaster" : "admin.mode_to_peace")}
        </button>
      )}
      {failed ? (
        <p role="alert" className="mt-2 text-warn-ink">
          {t("admin.error")}
        </p>
      ) : null}
    </section>
  );
}
