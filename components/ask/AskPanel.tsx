"use client";

import { useRef, useState, type FormEvent } from "react";
import { CATEGORY_ICON } from "@/lib/cards/categories";
import type { AskAnswer } from "@/lib/claude/ask";
import { getDeviceId } from "@/lib/device";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Card } from "@/lib/types";

const MAX_QUESTION_CHARS = 500;

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "answer"; answer: AskAnswer }
  | { kind: "error"; key: MessageKey };

function errorKey(status: number): MessageKey {
  if (status === 429) return "limit.ask_rate";
  if (status === 503) return "limit.ask_busy";
  return "ask.error";
}

/**
 * One question box. The answer comes back whole (no streaming); a skeleton
 * covers the wait. Cited cards are listed as chips under the answer, and a
 * chip opens its card on the board.
 */
export function AskPanel({
  boardSlug,
  cards,
  onOpenCard,
}: {
  boardSlug: string;
  /** Cards currently on the board, to label the chips. */
  cards: Card[];
  onOpenCard: (cardId: string) => void;
}) {
  const { lang, t } = useLang();
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const requestId = useRef(0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || state.kind === "loading") return;
    const id = ++requestId.current;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/b/${boardSlug}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, lang, device_id: getDeviceId() }),
      });
      if (id !== requestId.current) return;
      if (!res.ok) {
        setState({ kind: "error", key: errorKey(res.status) });
        return;
      }
      const data = (await res.json()) as { answer: AskAnswer };
      if (id === requestId.current) setState({ kind: "answer", answer: data.answer });
    } catch {
      if (id === requestId.current) setState({ kind: "error", key: "ask.error" });
    }
  }

  const byId = new Map(cards.map((c) => [c.id, c]));

  return (
    <section aria-labelledby="ask-heading" className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <h2 id="ask-heading" className="text-lg font-bold">
        {t("ask.heading")}
      </h2>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <label htmlFor="ask-input" className="sr-only">
          {t("ask.label")}
        </label>
        <input
          id="ask-input"
          type="text"
          enterKeyHint="send"
          value={question}
          maxLength={MAX_QUESTION_CHARS}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("ask.placeholder")}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base"
        />
        <button
          type="submit"
          disabled={!question.trim() || state.kind === "loading"}
          className="min-h-12 shrink-0 rounded-xl bg-accent px-5 text-lg font-bold text-accent-ink disabled:opacity-50"
        >
          {t("ask.submit")}
        </button>
      </form>
      <p className="mt-2 text-sm text-muted">{t("ask.note")}</p>

      <div aria-live="polite" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" ? (
          <div className="mt-4" role="status">
            <span className="sr-only">{t("ask.loading")}</span>
            <div aria-hidden="true" className="flex animate-pulse flex-col gap-2">
              <div className="h-4 w-11/12 rounded bg-held-bg" />
              <div className="h-4 w-4/5 rounded bg-held-bg" />
              <div className="h-4 w-2/3 rounded bg-held-bg" />
              <div className="mt-2 h-11 w-3/5 rounded-xl bg-held-bg" />
            </div>
          </div>
        ) : null}

        {state.kind === "error" ? (
          <p className="mt-4 rounded-lg bg-warn-bg p-3 text-base text-warn-ink">{t(state.key)}</p>
        ) : null}

        {state.kind === "answer" ? (
          <Answer answer={state.answer} byId={byId} onOpenCard={onOpenCard} />
        ) : null}
      </div>
    </section>
  );
}

function Answer({
  answer,
  byId,
  onOpenCard,
}: {
  answer: AskAnswer;
  byId: Map<string, Card>;
  onOpenCard: (cardId: string) => void;
}) {
  const { lang, t } = useLang();
  // Chips are numbered in order of first citation; the text carries the numbers.
  const number = new Map(answer.cardIds.map((id, i) => [id, i + 1]));
  return (
    <div className="mt-4">
      <p className="whitespace-pre-line text-base leading-relaxed">
        {answer.segments.map((s, i) => (
          <span key={i}>
            {s.text}
            {s.cardIds.length ? (
              <span className="ml-0.5 font-semibold text-accent">
                {s.cardIds.map((id) => `[${number.get(id)}]`).join("")}
              </span>
            ) : null}
          </span>
        ))}
      </p>
      {answer.cardIds.length ? (
        <>
          <h3 className="mt-4 text-sm font-semibold text-muted">{t("ask.sources")}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {answer.cardIds.map((id) => {
              const card = byId.get(id);
              const title = card ? card.title[lang] : t("ask.card_gone");
              return (
                <li key={id}>
                  <button
                    type="button"
                    disabled={!card}
                    onClick={() => onOpenCard(id)}
                    aria-label={card ? t("ask.open_card", { title }) : title}
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-accent bg-surface px-3 py-2 text-left text-base hover:bg-held-bg disabled:border-line disabled:text-muted"
                  >
                    <span className="shrink-0 font-bold text-accent">[{number.get(id)}]</span>
                    {card ? (
                      <span aria-hidden="true" className="shrink-0">
                        {CATEGORY_ICON[card.category]}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
                    {card ? (
                      <span aria-hidden="true" className="shrink-0 text-accent">
                        ›
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
