"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { CardItem } from "./CardItem";
import { CardSheet } from "./CardSheet";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";

const POLL_MS = 5_000;

export function BoardView({
  board,
  initialCards,
  serverNow,
}: {
  board: Board;
  initialCards: Card[];
  serverNow: string;
}) {
  const { lang, t } = useLang();
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [now, setNow] = useState<Date>(() => new Date(serverNow));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inFlight = useRef(false);
  // Derived, so a refreshed card is shown in the open sheet without extra state.
  const selected = selectedId ? (cards.find((c) => c.id === selectedId) ?? null) : null;

  const refresh = useCallback(async () => {
    if (inFlight.current || document.visibilityState === "hidden") return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/b/${board.slug}/cards`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { cards: Card[]; now: string };
        setCards(data.cards);
        setNow(new Date(data.now));
      }
    } catch {
      // Offline or slow network: keep showing what we have.
    } finally {
      inFlight.current = false;
    }
  }, [board.slug]);

  useEffect(() => {
    const id = window.setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const open = useCallback((card: Card) => setSelectedId(card.id), []);
  const close = useCallback(() => setSelectedId(null), []);

  return (
    <>
      <TopBar title={board.name[lang]} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-32 pt-4">
        <h1 className="sr-only">{board.name[lang]}</h1>
        <h2 className="text-base font-semibold text-muted">{t("board.cards_heading")}</h2>
        {cards.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-muted">
            {t("board.empty")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {cards.map((card) => (
              <CardItem key={card.id} card={card} board={board} now={now} onOpen={open} />
            ))}
          </ul>
        )}
      </main>
      {selected ? <CardSheet card={selected} board={board} now={now} onClose={close} /> : null}
    </>
  );
}
