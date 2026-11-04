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
export function CardTraceView({
  cardId,
  trace,
  now,
  headingLevel = 3,
}: {
  cardId: string;
  trace: CardTrace | null;
  now: Date;
  /** 3 inside the sheet and the panel (under the card's h2); 2 on the card page (under its h1). */
  headingLevel?: 2 | 3;
}) {
  const { lang, t } = useLang();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const modelsLine = trace ? traceModelsLine(trace.models, lang) : "";
  return (
    <section className="mt-5 rounded-xl border border-line p-3" aria-labelledby={`trace-title-${cardId}`} data-trace>
      <Heading id={`trace-title-${cardId}`} className="font-semibold">
        {t("trace.heading")}
      </Heading>
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
          {modelsLine ? (
            <p className="mt-3 text-base text-muted" data-trace-models>
              {modelsLine}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-base text-muted" aria-live="polite">
          {t("trace.loading")}
        </p>
      )}
    </section>
  );
}
