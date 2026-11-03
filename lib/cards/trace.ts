import { t, type Lang, type MessageKey } from "@/lib/i18n";
import type { CardTrace, Platform, TraceStep } from "@/lib/types";
import { formatDateTime, formatTime, jstDay } from "./display";

/**
 * Text for "How this card was made": one line per source row from i18n
 * templates, nothing invented. Shared by the card sheet and the card page.
 */

/** What kind of input a row came from, as far as the stored platform says. */
export function traceInputKey(platform: Platform | null): MessageKey {
  if (platform === "paper") return "trace.input.paper";
  if (platform === "line" || platform === "wechat") return "trace.input.chat";
  if (platform === "x" || platform === "xiaohongshu" || platform === "facebook") return "trace.input.post";
  return "trace.input.other";
}

/** "Confirmed by a chat message (heard from others), 14:07". The date is added when the step is not from today. */
export function traceStepLine(step: TraceStep, now: Date, lang: Lang): string {
  const sameDay = jstDay(step.created_at) === jstDay(now);
  return t(`trace.${step.relation}`, lang, {
    input: t(traceInputKey(step.platform), lang),
    source: t(`trace.source.${step.source_type}`, lang),
    time: sameDay ? formatTime(step.created_at, lang) : formatDateTime(step.created_at, lang),
  });
}

/** "Read by claude-opus-5-5 · compared by claude-opus-5-5"; the second part only when a comparison is on record. */
export function traceModelsLine(models: CardTrace["models"], lang: Lang): string {
  return [
    t("trace.model_extract", lang, { model: models.extract }),
    models.reconcile ? t("trace.model_reconcile", lang, { model: models.reconcile }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
