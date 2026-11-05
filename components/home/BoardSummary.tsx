"use client";

import { useId } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/cards/display";
import { tCount } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board } from "@/lib/types";

/** What the home page needs of a board: no known places, no mode, nothing the card needs to stay light. */
export interface HomeBoard {
  slug: string;
  name: Board["name"];
  area_names: Board["area_names"];
  /** JIS prefecture code ("14"), or null when the board has no area codes. Pins group only within a prefecture. */
  prefecture: string | null;
  /** The board's position on the home page map (map units), or null when it has no polygons: it is then listed but not on the map. */
  pin: [number, number] | null;
  public_cards: number;
  newest_card_at: string | null;
}

/** Element id of a board's card on the home page, the map's jump target. */
export function boardAnchor(slug: string): string {
  return `board-${slug}`;
}

/** Towns shown before "and N more"; the pilot board has 23 districts in 15 towns. */
const TOWNS_SHOWN = 3;

/** District names folded to their town: 小杉町1丁目, 小杉町2丁目 and 小杉町3丁目 are one 小杉町. */
export function townsOf(areas: Board["area_names"]): string[] {
  const towns: string[] = [];
  for (const a of areas) {
    const town = a.name_ja.replace(/[0-9０-９]+丁目$/u, "");
    if (!towns.includes(town)) towns.push(town);
  }
  return towns;
}

/**
 * One board on the home page: its name in the reader's language with the
 * Japanese name, the live facts (public cards, the newest one's age), the
 * area and one link into the board, whose target covers the whole card:
 * the card lifts 2 px on hover and settles when pressed. The six card
 * languages are every board's default and the intro already names them, so
 * the card leaves them out. Japanese text inside another language carries
 * lang="ja".
 */
export function BoardSummary({ board, now }: { board: HomeBoard; now: string }) {
  const { lang, t } = useLang();
  const nameId = useId();
  const localName = board.name[lang] || board.name.ja;
  const towns = townsOf(board.area_names);
  const more = towns.length - TOWNS_SHOWN;

  return (
    <article
      id={boardAnchor(board.slug)}
      tabIndex={-1}
      aria-labelledby={nameId}
      className="relative flex h-full scroll-mt-24 flex-col rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-rest)] transition-[translate,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] focus:outline-[3px] focus:outline-offset-2 focus:outline-accent focus:outline-solid active:translate-y-0 active:shadow-[var(--shadow-press)]"
      data-home-board={board.slug}
    >
      <h3 id={nameId} className="text-2xl font-bold">
        {localName}
        {localName !== board.name.ja ? (
          <span lang="ja" className="ml-2 inline-block text-lg font-normal whitespace-nowrap text-muted">
            {board.name.ja}
          </span>
        ) : null}
      </h3>

      <p className="mt-2 text-[1.0625rem] font-semibold" data-home-count={board.public_cards}>
        {board.public_cards > 0 ? tCount("home.cards", lang, board.public_cards) : t("home.no_cards")}
      </p>
      {board.newest_card_at ? (
        <p className="text-[1.0625rem]" data-home-newest={board.newest_card_at}>
          {t("home.newest", { time: timeAgo(board.newest_card_at, new Date(now), lang) })}
        </p>
      ) : null}

      {towns.length ? (
        // Inline, so the towns run on after the label instead of dropping under it in a narrow card.
        <dl className="mt-3 text-[1.0625rem]">
          <dt className="inline font-semibold">{t("home.area")}</dt>
          <dd className="ml-2 inline">
            <span lang="ja">{towns.slice(0, TOWNS_SHOWN).join("、")}</span>
            {more > 0 ? ` ${t("home.area_more", { n: more })}` : null}
          </dd>
        </dl>
      ) : null}

      {/* Pinned to the bottom, so the buttons of two cards side by side line up. */}
      <div className="mt-auto pt-5">
        <Link
          href={`/b/${board.slug}`}
          aria-describedby={nameId}
          className="tap inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 text-lg font-semibold text-accent-ink after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:bg-accent-hover"
        >
          {t("home.open")}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
