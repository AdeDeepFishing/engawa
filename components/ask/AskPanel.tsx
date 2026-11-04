"use client";

import { useId, type FormEvent } from "react";
import { CATEGORY_ICON } from "@/lib/cards/categories";
import type { AskAnswer } from "@/lib/claude/ask";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { BoardMode, Card } from "@/lib/types";
import type { AskController } from "./useAsk";

const MAX_QUESTION_CHARS = 500;
/** Questions a reader of this kind of board is likely to have, so a tap does not land on "no information yet". */
const SUGGESTIONS: Record<BoardMode, MessageKey[]> = {
  disaster: ["ask.suggest_1", "ask.suggest_2", "ask.suggest_3"],
  peace: ["ask.suggest_peace_1", "ask.suggest_peace_2", "ask.suggest_peace_3"],
};

/**
 * The question box with three suggested questions above it and the thread
 * of earlier question and answer pairs. Each answer comes back whole (no
 * streaming); a skeleton covers the wait. Cited cards are listed as chips
 * under each answer, and a chip opens its card on the board. The thread
 * lives in `ask` (useAsk), so the board can move the one mounted panel
 * between its phone, tablet and laptop placements without losing it.
 */
export function AskPanel({
  ask,
  mode,
  cards,
  onOpenCard,
  onDropIn,
}: {
  ask: AskController;
  /** The board's mode picks the suggested questions. */
  mode: BoardMode;
  /** Cards currently on the board, to label the chips. */
  cards: Card[];
  onOpenCard: (cardId: string) => void;
  /** Opens the drop-in; offered under an answer that found nothing. Absent when drop-in is off. */
  onDropIn?: () => void;
}) {
  const { t } = useLang();
  const { question, setQuestion, turns, loading, send, clear } = ask;
  const uid = useId();
  const headingId = `${uid}-heading`;
  const suggestId = `${uid}-suggest`;
  const inputId = `${uid}-input`;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(question);
  }

  const byId = new Map(cards.map((c) => [c.id, c]));
  const chip =
    "inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-left text-base font-semibold hover:border-accent hover:bg-held-bg active:bg-held-bg disabled:opacity-50 disabled:hover:border-line disabled:hover:bg-surface";

  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="text-lg font-bold">
          {t("ask.heading")}
        </h2>
        {turns.length ? (
          <button
            type="button"
            onClick={clear}
            className="min-h-11 shrink-0 rounded-lg border border-line px-4 text-base font-semibold hover:border-accent active:bg-held-bg"
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
              {turn.kind === "answer" ? <Answer answer={turn.answer} byId={byId} onOpenCard={onOpenCard} onDropIn={onDropIn} /> : null}
            </li>
          ))}
        </ol>
      ) : null}

      <p className="mt-3 text-base text-muted" id={suggestId}>
        {t("ask.suggest_heading")}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2" aria-labelledby={suggestId} data-ask-suggestions>
        {SUGGESTIONS[mode].map((key) => {
          const text = t(key);
          return (
            <li key={key}>
              <button type="button" className={chip} disabled={loading} onClick={() => void send(text)}>
                {text}
              </button>
            </li>
          );
        })}
      </ul>

      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t("ask.label")}
        </label>
        <input
          id={inputId}
          type="text"
          enterKeyHint="send"
          value={question}
          maxLength={MAX_QUESTION_CHARS}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t(mode === "peace" ? "ask.placeholder_peace" : "ask.placeholder")}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base"
        />
        <button
          type="submit"
          disabled={!question.trim() || loading}
          className="min-h-12 shrink-0 rounded-xl bg-accent px-5 text-lg font-bold text-accent-ink hover:bg-accent-hover active:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent"
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
  onDropIn,
}: {
  answer: AskAnswer;
  byId: Map<string, Card>;
  onOpenCard: (cardId: string) => void;
  onDropIn?: () => void;
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
                    className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-accent bg-surface px-3 py-2 text-left text-base hover:bg-held-bg active:bg-held-bg disabled:border-line disabled:text-muted disabled:hover:bg-surface"
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
      {/* An answer that cites no card found nothing on the board (answers use only cards), so the
          reader is offered the drop-in, as "no information yet" already suggests in words. */}
      {(answer.noInfo || answer.cardIds.length === 0) && onDropIn ? (
        <button
          type="button"
          onClick={onDropIn}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-accent bg-surface px-4 text-base font-semibold text-accent hover:bg-held-bg active:bg-held-bg"
          data-ask-dropin
        >
          {t("empty.ask_cta")}
        </button>
      ) : null}
    </div>
  );
}
