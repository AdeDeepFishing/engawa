"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type Ref } from "react";
import { isExpired } from "@/lib/cards/categories";
import { contentTime, knownPlaceName, timeAgo } from "@/lib/cards/display";
import { htmlLang, shownLang } from "@/lib/cards/langs";
import { groupByPlace, placeKindIcon, placeKindKey, type BoardViewMode, type PlaceGroup } from "@/lib/cards/places";
import { tCount, type MessageKey } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board, Card } from "@/lib/types";
import { CardItem } from "./CardItem";

const VIEWS: { value: BoardViewMode; key: MessageKey }[] = [
  { value: "list", key: "view.list" },
  { value: "places", key: "view.places" },
];

/** List or Places, two pressed-state buttons beside the cards heading. */
export function ViewToggle({ view, onChange }: { view: BoardViewMode; onChange: (view: BoardViewMode) => void }) {
  const { t } = useLang();
  return (
    <div
      role="group"
      aria-label={t("view.label")}
      className="inline-flex shrink-0 gap-1 rounded-xl border border-line-strong bg-surface p-1"
      data-view-toggle
    >
      {VIEWS.map(({ value, key }) => {
        const pressed = view === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(value)}
            className={`min-h-11 rounded-lg px-4 text-base font-semibold ${
              pressed ? "border border-accent bg-accent-soft text-accent" : "hover:bg-held-bg active:bg-held-bg"
            }`}
            data-view={value}
          >
            {t(key)}
          </button>
        );
      })}
    </div>
  );
}

const ROWS = "[data-place-toggle], li[data-card-id] > button";

function groupOf(groups: PlaceGroup[], cardId: string | null): string | null {
  if (!cardId) return null;
  return groups.find((g) => g.cards.some((c) => c.id === cardId))?.key ?? null;
}

/**
 * The board's cards grouped by known place (N10), each group a disclosure
 * with the place's name, kind, address, card count and newest time, and for
 * a shelter one line on how it is. Opened groups list the same CardItem rows
 * as the List view, so a card opens in the sheet or the panel as there.
 * Arrow keys, Home and End move through group headings and the cards of
 * open groups; Right opens a group, Left closes it.
 */
export function PlacesView({
  ref,
  cards,
  board,
  now,
  onOpen,
  selectedId,
  markSelected,
}: {
  ref?: Ref<HTMLUListElement>;
  cards: Card[];
  board: Board;
  now: Date;
  onOpen: (card: Card) => void;
  /** The card open in the sheet or the panel: its group opens so the card shows in the list. */
  selectedId: string | null;
  /** True where the open card sits beside the list (tablet and laptop), so its row is marked. */
  markSelected: boolean;
}) {
  const groups = useMemo(() => groupByPlace(cards, board), [cards, board]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const key = groupOf(groups, selectedId);
    return new Set(key ? [key] : []);
  });
  // A card opened from the URL or from a citation in an answer opens its
  // group and is scrolled to. Adjusted during render, so the group is open
  // in the same commit; a new object each time, so the effect runs again.
  const [seenSelected, setSeenSelected] = useState(selectedId);
  const [reveal, setReveal] = useState<{ id: string } | null>(() => (selectedId ? { id: selectedId } : null));
  if (selectedId !== seenSelected) {
    setSeenSelected(selectedId);
    const key = groupOf(groups, selectedId);
    if (key && selectedId && !expanded.has(key)) {
      setExpanded(new Set(expanded).add(key));
      setReveal({ id: selectedId });
    }
  }
  useEffect(() => {
    if (!reveal) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`card-${reveal.id}`)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
  }, [reveal]);

  const toggle = (key: string, open: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });

  function onKeyDown(e: ReactKeyboardEvent<HTMLUListElement>) {
    const target = e.target as HTMLElement;
    const groupKey = target.dataset.placeToggle;
    if (groupKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      toggle(groupKey, e.key === "ArrowRight");
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(ROWS));
    const index = rows.indexOf(target as HTMLButtonElement);
    if (index < 0) return;
    e.preventDefault();
    const last = rows.length - 1;
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? last : Math.min(last, Math.max(0, index + (e.key === "ArrowDown" ? 1 : -1)));
    rows[next].focus();
  }

  return (
    <ul ref={ref} onKeyDown={onKeyDown} className="mt-3 flex flex-col gap-3" data-places>
      {groups.map((group) => (
        <PlaceGroupItem
          key={group.key}
          group={group}
          open={expanded.has(group.key)}
          onToggle={() => toggle(group.key, !expanded.has(group.key))}
          board={board}
          now={now}
          onOpen={onOpen}
          selectedId={markSelected ? selectedId : null}
        />
      ))}
    </ul>
  );
}

function PlaceGroupItem({
  group,
  open,
  onToggle,
  board,
  now,
  onOpen,
  selectedId,
}: {
  group: PlaceGroup;
  open: boolean;
  onToggle: () => void;
  board: Board;
  now: Date;
  onOpen: (card: Card) => void;
  selectedId: string | null;
}) {
  const { lang, t } = useLang();
  const listId = `${useId()}-cards`;
  const { place, shelterCard } = group;
  const name = place ? knownPlaceName(place, lang) : null;
  // The Japanese name stands alone when the place has no name in the reader's language.
  const nameLang = name && lang !== "ja" && name.ja === null ? "ja" : undefined;

  return (
    <li className="rounded-xl border border-line bg-surface shadow-sm" data-place-group={group.key}>
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className="flex w-full items-start gap-3 rounded-xl p-4 text-left hover:bg-held-bg active:bg-held-bg"
          data-place-toggle={group.key}
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            {placeKindIcon(place?.kind ?? null)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold leading-snug">
              {name ? (
                <>
                  <span lang={nameLang}>{name.text}</span>
                  {name.ja ? (
                    <>
                      {" "}
                      <span lang="ja" className="font-semibold">
                        ({name.ja})
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                t("places.other")
              )}
            </span>
            {place ? (
              <span className="mt-0.5 block text-base text-muted" data-place-meta>
                {t(placeKindKey(place.kind))}
                {place.address_ja ? (
                  <>
                    {" · "}
                    <span lang="ja">{place.address_ja}</span>
                  </>
                ) : null}
              </span>
            ) : null}
            {place?.notes_ja ? (
              <span lang="ja" className="mt-0.5 block text-base text-warn-ink" data-place-note>
                {place.notes_ja}
              </span>
            ) : null}
            <span className="mt-1 flex flex-wrap gap-x-3 text-base text-muted">
              <span className="font-semibold text-foreground" data-place-count>
                {tCount("places.count", lang, group.cards.length)}
              </span>
              <span>{t("places.newest", { time: timeAgo(group.newestAt, now, lang) })}</span>
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`text-xl leading-none transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
      </h3>
      {shelterCard !== undefined ? (
        <ShelterStatus card={shelterCard} now={now} />
      ) : null}
      {open ? (
        <ul id={listId} className="flex flex-col gap-3 border-t border-line p-3">
          {group.cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              board={board}
              now={now}
              onOpen={onOpen}
              selected={card.id === selectedId}
              titleAs="h4"
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** One line under a shelter's heading: its newest shelter card (status, title, age), or that there is none yet. */
function ShelterStatus({ card, now }: { card: Card | null; now: Date }) {
  const { lang, t } = useLang();
  const status = card?.facts.status && card.facts.status !== "unknown" ? t(`status.${card.facts.status}`) : null;
  const textIn = card ? shownLang(card, lang) : lang;
  return (
    <p className="mx-4 mb-4 flex flex-wrap gap-x-1 rounded-md bg-held-bg px-3 py-2 text-base" data-shelter-status>
      <span className="font-semibold">{t("places.shelter_status")}</span>
      {card ? (
        <span>
          {status ? <span className="font-semibold">{status} · </span> : null}
          <span lang={textIn === lang ? undefined : htmlLang(textIn)}>{card.title[lang]}</span>
          {" · "}
          {timeAgo(contentTime(card), now, lang)}
          {isExpired(card.valid_until, now) ? ` · ${t("card.outdated")}` : null}
        </span>
      ) : (
        <span>{t("places.no_info")}</span>
      )}
    </p>
  );
}
