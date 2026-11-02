"use client";

import { useLang } from "@/lib/i18n/LangProvider";
import type { MessageKey } from "@/lib/i18n";
import type { PendingItem } from "./DropIn";

const STAGE_KEYS: Record<string, MessageKey> = {
  received: "dropin.stage.received",
  stripping: "dropin.stage.stripping",
  extracting: "dropin.stage.extracting",
  reconciling: "dropin.stage.reconciling",
  translating: "dropin.stage.translating",
  done: "dropin.stage.done",
  failed: "dropin.stage.failed",
};

/**
 * What the uploader sees when processing finished. A merge adds no new card
 * to the list, so say where the drop-in went. `actions` comes from the done
 * event (one reconcile action per fact) when DropIn passes it through.
 */
function doneKey(actions: string[] | undefined): MessageKey {
  if (!actions?.length || actions.includes("create")) return "dropin.stage.done";
  if (actions.includes("update")) return "card.result_updated";
  if (actions.includes("conflict")) return "card.result_conflict";
  if (actions.every((a) => a === "merge")) return "card.result_merged";
  return "dropin.stage.done";
}

function errorKey(code: string | undefined): MessageKey {
  if (code === "busy" || code === "rate_limited") return "dropin.busy";
  if (code === "too_large") return "dropin.too_large";
  return "dropin.error_generic";
}

/** Placeholder shown at the top of the list while a submission is processed. */
export function PendingCard({
  item,
  onRetry,
  onDismiss,
}: {
  item: PendingItem;
  onRetry: (item: PendingItem) => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useLang();
  const working = item.status === "uploading" || item.status === "processing";
  let line: string;
  if (item.status === "uploading") line = t("dropin.stage.received");
  else if (item.status === "processing") line = t(STAGE_KEYS[item.stage ?? "received"] ?? "dropin.stage.received");
  else if (item.status === "done") line = t(doneKey((item as PendingItem & { actions?: string[] }).actions));
  else if (item.status === "held") line = t("dropin.held");
  else if (item.status === "nothing") line = t("dropin.nothing");
  else line = t(errorKey(item.error));

  return (
    <li>
      <div
        role="status"
        aria-live="polite"
        className={`rounded-xl border-2 border-dashed p-4 ${
          item.status === "failed" ? "border-warn-ink bg-warn-bg" : "border-line bg-held-bg"
        }`}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={`text-2xl leading-none ${working ? "animate-pulse" : ""}`}>
            {working ? "⏳" : item.status === "done" ? "✅" : item.status === "failed" ? "⚠️" : "🔒"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{working ? t("dropin.placeholder_title") : line}</p>
            {working ? <p className="mt-1 text-muted">{line}</p> : null}
            {item.note ? <p className="mt-1 text-muted">{item.note}</p> : null}
            {!working ? (
              <div className="mt-3 flex gap-2">
                {item.status === "failed" && item.canRetry ? (
                  <button
                    type="button"
                    onClick={() => onRetry(item)}
                    className="rounded-lg bg-accent px-4 font-semibold text-accent-ink"
                  >
                    {t("dropin.retry")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDismiss(item.id)}
                  className="rounded-lg border border-line bg-surface px-4 font-semibold"
                >
                  {t("sheet.close")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
