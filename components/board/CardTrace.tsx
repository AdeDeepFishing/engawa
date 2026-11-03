"use client";

import { traceModelsLine, traceStepLine } from "@/lib/cards/trace";
import { useLang } from "@/lib/i18n/LangProvider";
import type { CardTrace } from "@/lib/types";

/**
 * "How this card was made": one line per source row in the reader's
 * language, Claude's reason under a line when the row has one, the admin
 * confirmation, and the models used. Nothing is invented: a row without a
 * reason shows none. `trace` null means the rows are still loading (sheet)
 * or there is no database (seed cards); the page then passes nothing.
 */
export function CardTraceView({ cardId, trace, now }: { cardId: string; trace: CardTrace | null; now: Date }) {
  const { lang, t } = useLang();
  return (
    <section className="mt-5 rounded-xl border border-line p-3" aria-labelledby={`trace-title-${cardId}`} data-trace>
      <h3 id={`trace-title-${cardId}`} className="font-semibold">
        {t("trace.heading")}
      </h3>
      <p className="mt-1 text-base text-muted">{t("trace.intro")}</p>
      {trace ? (
        <>
          <ol className="mt-3 flex flex-col gap-3">
            {trace.steps.map((s, i) => (
              <li key={`${s.created_at}-${i}`} data-trace-step={s.relation}>
                <p>{traceStepLine(s, now, lang)}</p>
                {s.reason ? (
                  <p className="mt-1 border-l-4 border-line pl-3 text-base text-muted">
                    <span className="font-semibold">{t("trace.reason_label")}: </span>
                    <q lang="en">{s.reason}</q>
                  </p>
                ) : null}
              </li>
            ))}
            {trace.official_confirmed ? (
              <li data-trace-step="official">
                <p className="font-semibold text-accent">{t("trace.official")}</p>
              </li>
            ) : null}
          </ol>
          <p className="mt-3 text-base text-muted" data-trace-models>
            {traceModelsLine(trace.models, lang)}
          </p>
        </>
      ) : (
        <p className="mt-3 text-base text-muted" aria-live="polite">
          {t("trace.loading")}
        </p>
      )}
    </section>
  );
}
