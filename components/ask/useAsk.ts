"use client";

import { useCallback, useRef, useState } from "react";
import type { AskAnswer, AskTurn } from "@/lib/claude/ask";
import { getDeviceId } from "@/lib/device";
import type { MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";

/** Question and answer pairs kept on screen; the oldest drops off. Client state only, never stored. */
const MAX_TURNS = 5;

export type Turn =
  | { id: number; question: string; kind: "loading" }
  | { id: number; question: string; kind: "answer"; answer: AskAnswer }
  | { id: number; question: string; kind: "error"; key: MessageKey };

export type AskController = {
  question: string;
  setQuestion: (q: string) => void;
  turns: Turn[];
  loading: boolean;
  send: (raw: string) => Promise<void>;
  clear: () => void;
};

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
 * The question box and the thread, held by the board rather than by the
 * panel: the phone shows the panel above the list and the laptop in its own
 * column, and both read the same thread, so a resize loses nothing. Earlier
 * pairs go along with a follow-up question as context; nothing is stored.
 */
export function useAsk(boardSlug: string): AskController {
  const { lang } = useLang();
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const requestId = useRef(0);
  const loading = turns.some((turn) => turn.kind === "loading");

  const send = useCallback(
    async (raw: string) => {
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
    },
    [boardSlug, lang, loading, turns],
  );

  const clear = useCallback(() => {
    // A reply still in flight is dropped when it arrives.
    requestId.current++;
    setTurns([]);
  }, []);

  return { question, setQuestion, turns, loading, send, clear };
}
