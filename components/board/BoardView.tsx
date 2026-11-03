"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { AskPanel } from "@/components/ask/AskPanel";
import { ShareButton } from "@/components/share/ShareButton";
import { CardItem } from "./CardItem";
import { CardSheet } from "./CardSheet";
import { DropIn, type PendingItem } from "./DropIn";
import { HiddenDrawer } from "./HiddenDrawer";
import { PendingCard } from "./PendingCard";
import type { HiddenDuplicate } from "@/lib/db/boards";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";

const POLL_MS = 5_000;
const DONE_LINGER_MS = 2_500;

export function BoardView({
  board,
  initialCards,
  initialHiddenDuplicates = [],
  serverNow,
  canSubmit,
}: {
  board: Board;
  initialCards: Card[];
  /** Cards hidden as duplicates of a public card; shown in a drawer under the list. */
  initialHiddenDuplicates?: HiddenDuplicate[];
  serverNow: string;
  /** False when the server has no database (seed fallback), so drop-in is hidden. */
  canSubmit: boolean;
}) {
  const { lang, t } = useLang();
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [hidden, setHidden] = useState<HiddenDuplicate[]>(initialHiddenDuplicates);
  const [now, setNow] = useState<Date>(() => new Date(serverNow));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [retryRequest, setRetryRequest] = useState<PendingItem | null>(null);
  const inFlight = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = selectedId ? (cards.find((c) => c.id === selectedId) ?? null) : null;

  const refresh = useCallback(async () => {
    if (inFlight.current || document.visibilityState === "hidden") return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/b/${board.slug}/cards`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { cards: Card[]; hidden_duplicates?: HiddenDuplicate[]; now: string };
        setCards(data.cards);
        setHidden(data.hidden_duplicates ?? []);
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

  const removePending = useCallback((id: string) => {
    setPending((list) => list.filter((p) => p.id !== id));
  }, []);

  const upsertPending = useCallback(
    (item: PendingItem) => {
      setPending((list) => {
        const idx = list.findIndex((p) => p.id === item.id);
        if (idx < 0) return [item, ...list];
        const next = [...list];
        next[idx] = { ...next[idx], ...item };
        return next;
      });
      if (item.status === "done") {
        void (async () => {
          inFlight.current = false;
          await refresh();
          window.setTimeout(() => removePending(item.id), DONE_LINGER_MS);
        })();
      }
    },
    [refresh, removePending],
  );

  const open = useCallback((card: Card) => setSelectedId(card.id), []);
  const close = useCallback(() => setSelectedId(null), []);

  // A citation chip scrolls its card into view and opens the same sheet a tap
  // on the card opens. CardItem marks its <li> with data-card-id.
  const openFromAnswer = useCallback(
    (cardId: string) => {
      if (!cards.some((c) => c.id === cardId)) return;
      const item = listRef.current?.querySelector(`[data-card-id="${cardId}"]`);
      if (item instanceof HTMLElement) {
        const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        item.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
      }
      setSelectedId(cardId);
    },
    [cards],
  );

  return (
    <>
      <TopBar title={board.name[lang]} actions={<ShareButton boardSlug={board.slug} boardName={board.name[lang]} />} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-32 pt-4">
        <h1 className="sr-only">{board.name[lang]}</h1>
        <AskPanel boardSlug={board.slug} cards={cards} onOpenCard={openFromAnswer} />
        <h2 className="mt-6 text-base font-semibold text-muted">{t("board.cards_heading")}</h2>
        {cards.length === 0 && pending.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-muted">
            {t("board.empty")}
          </p>
        ) : (
          <ul ref={listRef} className="mt-3 flex flex-col gap-3">
            {pending.map((item) => (
              <PendingCard
                key={item.id}
                item={item}
                onRetry={(it) => setRetryRequest({ ...it })}
                onDismiss={removePending}
              />
            ))}
            {cards.map((card) => (
              <CardItem key={card.id} card={card} board={board} now={now} onOpen={open} />
            ))}
          </ul>
        )}
        <HiddenDrawer items={hidden} now={now} onOpenOriginal={openFromAnswer} />
      </main>
      {canSubmit ? (
        <DropIn
          boardSlug={board.slug}
          areaNames={board.area_names}
          onPending={upsertPending}
          retryRequest={retryRequest}
        />
      ) : null}
      {selected ? <CardSheet card={selected} board={board} now={now} onClose={close} /> : null}
    </>
  );
}
