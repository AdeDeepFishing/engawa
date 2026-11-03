"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n/LangProvider";
import type { MessageKey } from "@/lib/i18n";
import type { PendingItem } from "./DropIn";

const STAGE_KEYS: Record<string, MessageKey> = {
  received: "dropin.stage.received",
  stripping: "dropin.stage.stripping",
  extracting: "dropin.stage.extracting",
  masking: "mask.stage",
  reconciling: "dropin.stage.reconciling",
  translating: "dropin.stage.translating",
  done: "dropin.stage.done",
  failed: "dropin.stage.failed",
};

/**
 * The five steps a drop-in goes through, as the uploader sees them. The
 * pipeline's finer stages map onto them: uploading, received and stripping
 * are "received"; extracting is "reading"; masking and reconciling are
 * "checking"; "translating" runs after the card is already on the board,
 * in Japanese, English and the input's language, and fills the rest.
 */
const STEPS = ["received", "reading", "checking", "translating", "done"] as const;
type Step = (typeof STEPS)[number];
const STEP_KEYS: Record<Step, MessageKey> = {
  received: "dropin.step.received",
  reading: "dropin.step.reading",
  checking: "dropin.step.checking",
  translating: "dropin.step.translating",
  done: "dropin.step.done",
};

function currentStep(item: PendingItem): number {
  if (item.status === "uploading") return 0;
  if (item.status !== "processing") return STEPS.length - 1;
  switch (item.stage) {
    case "extracting":
      return 1;
    case "masking":
    case "reconciling":
      return 2;
    case "translating":
      return 3;
    case "done":
      return 4;
    default:
      return 0;
  }
}

/**
 * What the uploader sees when processing finished. A merge adds no new card
 * to the list, so say where the drop-in went. `actions` comes from the done
 * event (one reconcile action per fact).
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

/** Seconds since this card appeared, ticking once a second while work is in progress. */
function useElapsedSeconds(running: boolean): number {
  // Set on the first tick, not during render, so the component stays pure.
  const startedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    startedAt.current ??= Date.now();
    const start = startedAt.current;
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return elapsed;
}

/**
 * Placeholder shown at the top of the list while a submission is processed.
 * A drop-in takes 10 to 20 seconds, so the card shows where the work is: a
 * five step stepper driven by the real pipeline stages (never by a timer),
 * the stage in words, and the usual duration with the seconds so far. The
 * active step pulses; under prefers-reduced-motion the steps still fill.
 */
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
  const elapsed = useElapsedSeconds(working);
  const step = currentStep(item);
  let line: string;
  if (item.status === "uploading") line = t("dropin.stage.received");
  else if (item.status === "processing") line = t(STAGE_KEYS[item.stage ?? "received"] ?? "dropin.stage.received");
  else if (item.status === "done") line = t(doneKey(item.actions));
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
            {working ? (
              <>
                <ol aria-label={t("dropin.progress")} className="mt-3 flex items-start">
                  {STEPS.map((s, i) => {
                    const state = i < step ? "done" : i === step ? "active" : "next";
                    return (
                      <li
                        key={s}
                        aria-current={state === "active" ? "step" : undefined}
                        className="flex min-w-0 flex-1 flex-col items-center text-center"
                      >
                        <span className="flex w-full items-center">
                          <span
                            aria-hidden="true"
                            className={`h-0.5 flex-1 ${i === 0 ? "invisible" : i <= step ? "bg-accent" : "bg-line"}`}
                          />
                          <span
                            aria-hidden="true"
                            className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                              state === "done"
                                ? "border-accent bg-accent"
                                : state === "active"
                                  ? "animate-pulse border-accent bg-surface"
                                  : "border-line bg-surface"
                            }`}
                          />
                          <span
                            aria-hidden="true"
                            className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "invisible" : i < step ? "bg-accent" : "bg-line"}`}
                          />
                        </span>
                        <span
                          className={`mt-1 text-base leading-tight ${
                            state === "active" ? "font-bold text-foreground" : state === "done" ? "text-foreground" : "text-muted"
                          }`}
                        >
                          {t(STEP_KEYS[s])}
                        </span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-2 text-base">{line}</p>
                <p className="mt-1 text-base text-muted">{t("dropin.usual_time", { n: elapsed })}</p>
              </>
            ) : null}
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
