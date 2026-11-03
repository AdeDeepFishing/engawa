"use client";

import { useRef, useState, type FormEvent } from "react";
import { CATEGORY_ICON } from "@/lib/cards/categories";
import type { AskAnswer, AskTurn } from "@/lib/claude/ask";
import { getDeviceId } from "@/lib/device";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Card } from "@/lib/types";

const MAX_QUESTION_CHARS = 500;
/** Question and answer pairs kept on screen; the oldest drops off. Client state only, never stored. */
const MAX_TURNS = 5;
const SUGGESTIONS: MessageKey[] = ["ask.suggest_1", "ask.suggest_2", "ask.suggest_3"];

type Turn =
  | { id: number; question: string; kind: "loading" }
  | { id: number; question: string; kind: "answer"; answer: AskAnswer }
  | { id: number; question: string; kind: "error"; key: MessageKey };

function errorKey(status: number): MessageKey {
  if (status === 429) return "limit.ask_rate";
  if (status === 503) return "limit.ask_busy";
  return "ask.error";
}

/** The answer as plain text, for the history sent with a follow-up question. */
function answerText(answer: AskAnswer): string {
  return answer.segments.map((s) => s.text).join("");
}

/**
 * The question box with three suggested questions above it and the thread
 * of earlier question and answer pairs. Each answer comes back whole (no
 * streaming); a skeleton covers the wait. Cited cards are listed as chips
 * under each answer, and a chip opens its card on the board. Earlier pairs
 * go along with a follow-up question as context; nothing is stored anywhere.
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
  const [turns, setTurns] = useState<Turn[]>([]);
  const requestId = useRef(0);
  const loading = turns.some((turn) => turn.kind === "loading");

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || loading) return;
    const id = ++requestId.current;
    const history: AskTurn[] = turns
      .filter((turn): turn is Extract<Turn, { kind: "answer" }> => turn.kind === "answer" && !turn.answer.noInfo)
      .map((turn) => ({ question: turn.question, answer: answerText(turn.answer) }));
    const pending: Turn = { id, question: q, kind: "loading" };
    setTurns((prev) => [...prev, pending].slice(-MAX_TURNS));
    setQuestion("");
    const settle = (turn: Turn) => setTurns((prev) => prev.map((x) => (x.id === id ? turn : x)));
    try {
      const res = await fetch(`/api/b/${boardSlug}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, lang, device_id: getDeviceId(), history }),
      });
      if (id !== requestId.current) return;
      if (!res.ok) {
        settle({ id, question: q, kind: "error", key: errorKey(res.status) });
        return;
      }
      const data = (await res.json()) as { answer: AskAnswer };
      if (id === requestId.current) settle({ id, question: q, kind: "answer", answer: data.answer });
    } catch {
      if (id === requestId.current) settle({ id, question: q, kind: "error", key: "ask.error" });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(question);
  }

  function onSuggest(text: string) {
    void send(text);
  }

  function clear() {
    // A reply still in flight is dropped when it arrives.
    requestId.current++;
    setTurns([]);
  }

  const byId = new Map(cards.map((c) => [c.id, c]));
  const chip =
    "inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-left text-base font-semibold hover:border-accent disabled:opacity-50";

  return (
    <section aria-labelledby="ask-heading" className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 id="ask-heading" className="text-lg font-bold">
          {t("ask.heading")}
        </h2>
        {turns.length ? (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-lg border border-line min-h-11 px-4 text-base font-semibold"
            data-ask-clear
          >
            {t("ask.clear")}
          </button>
        ) : null}
      </div>

      {turns.length ? (
        <ol className="mt-3 flex flex-col gap-4" aria-live="polite" aria-busy={loading} data-ask-thread>
          {turns.map((turn) => (
            <li key={turn.id} className="border-t border-line pt-3" data-ask-turn={turn.kind}>
              <p className="text-base font-semibold">
                <span className="sr-only">{t("ask.label")}: </span>
                <span aria-hidden="true" className="mr-2 text-muted">
                  Q
                </span>
                {turn.question}
              </p>
              {turn.kind === "loading" ? (
                <div className="mt-3" role="status">
                  <span className="sr-only">{t("ask.loading")}</span>
                  <div aria-hidden="true" className="flex animate-pulse flex-col gap-2">
                    <div className="h-4 w-11/12 rounded bg-held-bg" />
                    <div className="h-4 w-4/5 rounded bg-held-bg" />
                    <div className="h-4 w-2/3 rounded bg-held-bg" />
                    <div className="mt-2 h-11 w-3/5 rounded-xl bg-held-bg" />
                  </div>
                </div>
              ) : null}
              {turn.kind === "error" ? (
                <p className="mt-3 rounded-lg bg-warn-bg p-3 text-base text-warn-ink">{t(turn.key)}</p>
              ) : null}
              {turn.kind === "answer" ? <Answer answer={turn.answer} byId={byId} onOpenCard={onOpenCard} /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      <p className="mt-3 text-base text-muted" id="ask-suggest-heading">
        {t("ask.suggest_heading")}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2" aria-labelledby="ask-suggest-heading" data-ask-suggestions>
        {SUGGESTIONS.map((key) => {
          const text = t(key);
          return (
            <li key={key}>
              <button type="button" className={chip} disabled={loading} onClick={() => onSuggest(text)}>
                {text}
              </button>
            </li>
          );
        })}
      </ul>

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
          disabled={!question.trim() || loading}
          className="min-h-12 shrink-0 rounded-xl bg-accent px-5 text-lg font-bold text-accent-ink disabled:opacity-50"
        >
          {t("ask.submit")}
        </button>
      </form>
      <p className="mt-2 text-base text-muted">{t("ask.note")}</p>
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
    <div className="mt-3" data-ask-answer>
      <p className="whitespace-pre-line text-base leading-relaxed">
        <span className="sr-only">{t("ask.answer_label")}: </span>
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
          <h3 className="mt-4 text-base font-semibold text-muted">{t("ask.sources")}</h3>
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
                    data-ask-citation={id}
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
