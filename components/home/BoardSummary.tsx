"use client";

import { useId } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/cards/display";
import { CARD_LANGS, t as translate, tCount } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { Board } from "@/lib/types";

/** What the home page needs of a board: no known places, no mode, nothing the card needs to stay light. */
export interface HomeBoard {
  slug: string;
  name: Board["name"];
  area_names: Board["area_names"];
  /** JIS prefecture code ("14"), or null when the board has no area codes: it is then listed but not on the map. */
  prefecture: string | null;
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
 * Japanese name, the area, the live facts (public cards, the newest one's
 * age, the six languages) and one link into the board, whose target covers
 * the whole card: the card lifts 2 px on hover and settles when pressed.
 * Japanese text inside another language carries lang="ja"; each language
 * name carries its own.
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
      className="relative scroll-mt-24 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(27_27_27/0.04)] transition-[translate,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgb(27_27_27/0.08)] focus:outline-[3px] focus:outline-offset-2 focus:outline-accent focus:outline-solid active:translate-y-0 active:shadow-[0_1px_2px_rgb(27_27_27/0.06)]"
      data-home-board={board.slug}
    >
      <h3 id={nameId} className="text-2xl font-bold">
        {localName}
        {localName !== board.name.ja ? (
          <span lang="ja" className="ml-2 text-lg font-normal text-muted">
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

      <dl className="mt-4 flex flex-col gap-2 text-[1.0625rem]">
        {towns.length ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold">{t("home.area")}</dt>
            <dd>
              <span lang="ja">{towns.slice(0, TOWNS_SHOWN).join("、")}</span>
              {more > 0 ? ` ${t("home.area_more", { n: more })}` : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="font-semibold">{t("home.languages")}</dt>
          <dd>
            <ul className="mt-1 flex flex-wrap gap-2">
              {CARD_LANGS.map((l) => (
                <li key={l} lang={l === "easy_ja" ? "ja" : l} className="rounded-full bg-held-bg px-3 py-0.5">
                  {translate(`lang.${l}`, l === "easy_ja" ? "ja" : l)}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      <Link
        href={`/b/${board.slug}`}
        aria-describedby={nameId}
        className="tap mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 text-lg font-semibold text-accent-ink after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:bg-accent-hover"
      >
        {t("home.open")}
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
