"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { TopBar } from "@/components/TopBar";
import { AskPanel } from "@/components/ask/AskPanel";
import { useAsk } from "@/components/ask/useAsk";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { ShareButton } from "@/components/share/ShareButton";
import { CardItem } from "./CardItem";
import { CardSheet } from "./CardSheet";
import { DropIn, type PendingItem } from "./DropIn";
import { HiddenDrawer } from "./HiddenDrawer";
import { PendingCard } from "./PendingCard";
import { CardPanel, CardPanelEmpty } from "./layout/CardPanel";
import { dropInPanel, openDropIn, useDropInOpen } from "./layout/dropInBridge";
import { DropInTopButton, ModeBadge } from "./layout/TopBarParts";
import { useCardHash } from "./layout/useCardHash";
import { LAPTOP_QUERY, TABLET_QUERY, useMediaQuery } from "./layout/useMediaQuery";
import type { HiddenDuplicate } from "@/lib/db/boards";
import { useLang } from "@/lib/i18n/LangProvider";
import { askServedFromCache, FROM_CACHE_HEADER, formatSnapshotTime, useOnline } from "@/lib/offline";
import type { Board, Card } from "@/lib/types";

const POLL_MS = 5_000;
const DONE_LINGER_MS = 2_500;

export function BoardView({
  board,
  initialCards,
  initialHiddenDuplicates = [],
  serverNow,
  canSubmit,
  footer,
}: {
  board: Board;
  initialCards: Card[];
  /** Cards hidden as duplicates of a public card; shown in a drawer under the list. */
  initialHiddenDuplicates?: HiddenDuplicate[];
  serverNow: string;
  /** False when the server has no database (seed fallback), so drop-in is hidden. */
  canSubmit: boolean;
  /** Rendered at the end of the card list (the about link). */
  footer?: ReactNode;
}) {
  const { lang, t } = useLang();
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [hidden, setHidden] = useState<HiddenDuplicate[]>(initialHiddenDuplicates);
  const [now, setNow] = useState<Date>(() => new Date(serverNow));
  /** The open card, kept in the URL hash so a refresh or a copied link keeps it. */
  const [selectedId, setSelectedId] = useCardHash();
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [retryRequest, setRetryRequest] = useState<PendingItem | null>(null);
  /** True while the poll cannot reach the server: it failed, or the offline worker answered from its cache. */
  const [stale, setStale] = useState(false);
  const online = useOnline();
  const offline = stale || !online;
  /** Server time of the cards on screen, so an older saved copy never replaces newer cards. */
  const shownAt = useRef(new Date(serverNow).getTime());
  const inFlight = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = selectedId ? (cards.find((c) => c.id === selectedId) ?? null) : null;
  /** From 768 px the selected card opens beside the list instead of in the bottom sheet. */
  const tablet = useMediaQuery(TABLET_QUERY);
  /** From 1024 px the drop-in opens from the top bar as a drawer. */
  const laptop = useMediaQuery(LAPTOP_QUERY);
  const ask = useAsk(board.slug);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropInHost = useRef<HTMLDivElement>(null);
  const dropInTop = useRef<HTMLButtonElement>(null);
  const dropInOpen = useDropInOpen(dropInHost);

  const refresh = useCallback(async () => {
    if (inFlight.current || document.visibilityState === "hidden") return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/b/${board.slug}/cards`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { cards: Card[]; hidden_duplicates?: HiddenDuplicate[]; now: string };
        const fromCache = res.headers.has(FROM_CACHE_HEADER);
        const at = new Date(data.now).getTime();
        // The offline banner shows `now`, the time of what is on screen.
        if (!fromCache || at >= shownAt.current) {
          shownAt.current = at;
          setCards(data.cards);
          setHidden(data.hidden_duplicates ?? []);
          setNow(new Date(data.now));
        }
        setStale(fromCache);
      }
    } catch {
      // Offline with nothing saved, or a dropped request: keep showing what we have.
      setStale(true);
    } finally {
      inFlight.current = false;
    }
  }, [board.slug]);

  // A page opened offline, or answered from the worker's cache, polls at once
  // instead of in 5 seconds, so the banner and the newest saved cards show up.
  // Coming back online polls at once too; the banner goes when that poll succeeds.
  useEffect(() => {
    void askServedFromCache().then((storedAt) => {
      if (storedAt) setStale(true);
      if (storedAt || !navigator.onLine) void refresh();
    });
    const onOnline = () => {
      inFlight.current = false;
      void refresh();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh]);

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

  /** Pending items whose cards were already fetched once, so the `cards` event refreshes only once per drop-in. */
  const fetchedCardsFor = useRef(new Set<string>());

  const upsertPending = useCallback(
    (item: PendingItem) => {
      setPending((list) => {
        const idx = list.findIndex((p) => p.id === item.id);
        if (idx < 0) return [item, ...list];
        const next = [...list];
        next[idx] = { ...next[idx], ...item };
        return next;
      });
      // The cards land before their translation: fetch the list as soon as
      // they exist, so the uploader sees the card in its first languages.
      if (item.status === "processing" && item.cardIds?.length && !fetchedCardsFor.current.has(item.id)) {
        fetchedCardsFor.current.add(item.id);
        inFlight.current = false;
        void refresh();
      }
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

  const open = useCallback((card: Card) => setSelectedId(card.id), [setSelectedId]);
  const close = useCallback(() => setSelectedId(null), [setSelectedId]);

  /** The list button of a card, to hand focus back when its panel closes. */
  const cardButton = useCallback(
    (cardId: string) => listRef.current?.querySelector<HTMLButtonElement>(`[data-card-id="${cardId}"] > button`) ?? null,
    [],
  );

  // A citation chip scrolls its card into view and opens it, as a tap on the
  // card does. CardItem marks its <li> with data-card-id.
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
    [cards, setSelectedId],
  );

  /** Opens DropIn's panel from any of its triggers and moves focus into it. */
  const startDropIn = useCallback(() => {
    // Already open (a photo being picked): keep its state, just move focus in.
    if (dropInPanel(dropInHost.current)) {
      dropInPanel(dropInHost.current)?.querySelector<HTMLElement>("button, textarea, input:not([type=file])")?.focus();
      return;
    }
    if (!openDropIn(dropInHost.current)) return;
    window.requestAnimationFrame(() => {
      dropInPanel(dropInHost.current)?.querySelector<HTMLElement>("button, textarea, input:not([type=file])")?.focus();
    });
  }, []);

  /** Closes the laptop or tablet card panel and returns focus to the card's button in the list. */
  const closePanel = useCallback(() => {
    const id = selected?.id ?? null;
    close();
    if (id) cardButton(id)?.focus();
  }, [selected, close]);

  // When the drop-in closes with focus inside it, focus goes back to the
  // button that opens it instead of being lost on the page.
  const dropInWasOpen = useRef(false);
  useEffect(() => {
    if (dropInWasOpen.current && !dropInOpen) {
      const active = document.activeElement;
      if (!active || active === document.body) {
        const trigger = laptop ? dropInTop.current : dropInHost.current?.querySelector<HTMLButtonElement>("[data-dropin-button]");
        trigger?.focus();
      }
    }
    dropInWasOpen.current = dropInOpen;
  }, [dropInOpen, laptop]);

  // Escape closes the card beside the list. The drop-in and the share panel
  // close first (their own listeners run after this capture listener), and
  // Escape in a text box stays with the box.
  useEffect(() => {
    if (!tablet || !selected) return;
    const cardId = selected.id;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (dropInPanel(dropInHost.current) || document.getElementById("share-panel")) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select")) return;
      const focusInPanel = Boolean(target?.closest("[data-card-panel]"));
      close();
      if (focusInPanel || document.activeElement === document.body) cardButton(cardId)?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tablet, selected, close, cardButton]);

  // The top bar and the offline banner set where the laptop drawer starts.
  useEffect(() => {
    const root = rootRef.current;
    const header = root?.querySelector("header");
    if (!root || !header) return;
    const update = () => root.style.setProperty("--board-top", `${Math.round(header.getBoundingClientRect().bottom)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    if (header.previousElementSibling) observer.observe(header.previousElementSibling);
    return () => observer.disconnect();
  }, []);

  /** Arrow keys, Home and End move between the cards of the list; Enter or Space opens one. */
  const onListKeyDown = useCallback((e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>(":scope > li[data-card-id] > button") ?? []);
    const index = buttons.indexOf(e.target as HTMLButtonElement);
    if (index < 0) return;
    e.preventDefault();
    const last = buttons.length - 1;
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? last : Math.min(last, Math.max(0, index + (e.key === "ArrowDown" ? 1 : -1)));
    buttons[next].focus();
  }, []);

  const askPanel = (
    <AskPanel
      ask={ask}
      mode={board.mode}
      cards={cards}
      onOpenCard={openFromAnswer}
      onDropIn={canSubmit && !offline ? startDropIn : undefined}
    />
  );

  // Each column scrolls on its own from 768 px; the floating drop-in button
  // still sits over the bottom between 768 and 1023 px, so they clear it there.
  const column = "md:min-h-0 md:overflow-y-auto md:pb-24 md:pt-4 lg:pb-8";

  return (
    <div ref={rootRef} className="flex flex-1 flex-col md:h-dvh md:flex-none md:overflow-hidden">
      <OfflineBanner message={offline ? t("offline.board_banner", { time: formatSnapshotTime(now, lang) }) : null} />
      <TopBar
        wide
        title={board.name[lang]}
        badge={<ModeBadge mode={board.mode} />}
        primary={
          canSubmit ? (
            <DropInTopButton ref={dropInTop} open={dropInOpen} offline={offline} onClick={startDropIn} />
          ) : null
        }
        actions={<ShareButton boardSlug={board.slug} boardName={board.name[lang]} />}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-4 md:grid md:min-h-0 md:max-w-[1600px] md:grid-cols-[clamp(300px,42vw,380px)_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:gap-4 md:px-4 md:py-0 lg:grid-cols-[clamp(300px,30vw,460px)_minmax(0,1fr)_clamp(280px,26vw,400px)] xl:gap-6 xl:px-6">
        <h1 className="sr-only">{board.name[lang]}</h1>
        {/* Phone: the ask panel above the list, as before. */}
        <div className="md:hidden">{askPanel}</div>

        <div className={column} data-board-column="list">
          <h2 className="mt-6 text-base font-semibold text-muted md:mt-0">{t("board.cards_heading")}</h2>
          {cards.length === 0 && pending.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-line p-6 text-center" data-board-empty>
              <p className="text-lg font-semibold">{t("board.empty")}</p>
              <p className="mt-2 text-base text-muted">{t("empty.board_hint")}</p>
              {canSubmit && !offline ? (
                <button
                  type="button"
                  onClick={startDropIn}
                  className="mt-4 hidden min-h-12 rounded-xl bg-accent px-6 text-lg font-bold text-accent-ink hover:bg-accent-hover active:bg-accent-hover md:inline-flex md:items-center"
                >
                  {t("empty.board_cta")}
                </button>
              ) : null}
            </div>
          ) : (
            <ul ref={listRef} onKeyDown={onListKeyDown} className="mt-3 flex flex-col gap-3">
              {pending.map((item) => (
                <PendingCard
                  key={item.id}
                  item={item}
                  onRetry={(it) => setRetryRequest({ ...it })}
                  onDismiss={removePending}
                />
              ))}
              {cards.map((card) => (
                <CardItem
                  key={card.id}
                  card={card}
                  board={board}
                  now={now}
                  onOpen={open}
                  selected={tablet && card.id === selected?.id}
                />
              ))}
            </ul>
          )}
          <HiddenDrawer items={hidden} now={now} onOpenOriginal={openFromAnswer} />
          {hidden.length === 0 && cards.length > 0 ? (
            <p className="mt-6 hidden text-base text-muted md:block" data-hidden-none>
              {t("empty.hidden_none")}
            </p>
          ) : null}
          {footer ? <footer className="mt-8">{footer}</footer> : null}
        </div>

        {/* Tablet: the open card above the ask panel. Laptop: the open card, or what to do before one is picked. */}
        <div className={`hidden md:block ${column}`} data-board-column="detail">
          {tablet && selected ? (
            <CardPanel card={selected} board={board} now={now} onClose={closePanel} />
          ) : (
            <div className="hidden h-full lg:block">
              <CardPanelEmpty />
            </div>
          )}
          <div className={`lg:hidden ${tablet && selected ? "mt-6" : ""}`}>{askPanel}</div>
        </div>

        {/* Laptop: the ask panel in its own column. */}
        <div className={`hidden lg:block ${column}`} data-board-column="ask">
          {askPanel}
        </div>
      </main>
      {canSubmit ? (
        <div ref={dropInHost} data-dropin-host>
          <DropIn
            boardSlug={board.slug}
            areaNames={board.area_names}
            offline={offline}
            onPending={upsertPending}
            retryRequest={retryRequest}
          />
        </div>
      ) : null}
      {selected && !tablet ? <CardSheet card={selected} board={board} now={now} onClose={close} /> : null}
    </div>
  );
}
