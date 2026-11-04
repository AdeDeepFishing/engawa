"use client";

import type { KeyboardEvent } from "react";
import { useLang } from "@/lib/i18n/LangProvider";
import { JAPAN_VIEWBOX, OKINAWA_INSET, PREFECTURE_SHAPES } from "./japan-map-paths";
import { PREFECTURES, type Prefecture } from "./prefectures";

/*
 * Sizes in map units (the view box is 347 wide). The map is drawn at least
 * 358 px wide (a 390 px phone less its gutters), where one unit is 1.03 px:
 * the badge digits are then 16.5 px, and the hit circle 45 px across. Wider
 * maps only make them larger.
 */
const BADGE_R = 13;
const BADGE_FONT = 16;
const HIT_R = 22;

/**
 * The home page map: every prefecture as a quiet outline, the ones with a
 * listed board in the accent with the board count. Those are buttons
 * (pointer, Enter, Space) that hand the prefecture code to `onSelect`;
 * the others are inert and carry their name in a <title>. Okinawa sits in a
 * framed inset at the top left. Badges that would overlap (Tokyo next to
 * Kanagawa) are moved apart to the east, over the sea.
 */
export function JapanMap({
  counts,
  onSelect,
}: {
  counts: Record<string, number>;
  onSelect: (prefectureCode: string) => void;
}) {
  const { lang, t } = useLang();
  const active = PREFECTURES.filter((p) => (counts[p.code] ?? 0) > 0);
  const badges = placeBadges(active);

  function onKey(e: KeyboardEvent<SVGGElement>, code: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(code);
    }
  }

  return (
    <svg viewBox={JAPAN_VIEWBOX} role="group" aria-label={t("home.map_label")} className="block h-auto w-full">
      <rect
        x={OKINAWA_INSET[0]}
        y={OKINAWA_INSET[1]}
        width={OKINAWA_INSET[2]}
        height={OKINAWA_INSET[3]}
        rx={6}
        fill="none"
        stroke="var(--line)"
        strokeWidth={1}
      />
      {PREFECTURES.filter((p) => !counts[p.code]).map((p) => (
        <path key={p.code} d={PREFECTURE_SHAPES[p.id].d} fill="var(--map-land)" stroke="var(--background)" strokeWidth={0.8}>
          <title>{p.names[lang]}</title>
        </path>
      ))}
      {active.map((p) => {
        const n = counts[p.code];
        const [bx, by] = badges.get(p.code) ?? PREFECTURE_SHAPES[p.id].label;
        const [lx, ly] = PREFECTURE_SHAPES[p.id].label;
        return (
          <g
            key={p.code}
            role="button"
            tabIndex={0}
            aria-label={t(n === 1 ? "home.map_pref_one" : "home.map_pref_other", { pref: p.names[lang], n })}
            onClick={() => onSelect(p.code)}
            onKeyDown={(e) => onKey(e, p.code)}
            className="group cursor-pointer outline-none"
            data-map-pref={p.code}
          >
            <path d={PREFECTURE_SHAPES[p.id].d} fill="var(--accent)" stroke="var(--background)" strokeWidth={0.8} />
            {bx !== lx || by !== ly ? <line x1={lx} y1={ly} x2={bx} y2={by} stroke="var(--accent-hover)" strokeWidth={1.5} /> : null}
            <circle cx={bx} cy={by} r={HIT_R} fill="transparent" />
            <circle
              cx={bx}
              cy={by}
              r={HIT_R - 2}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={3.5}
              className="opacity-0 group-focus-visible:opacity-100"
            />
            <circle cx={bx} cy={by} r={BADGE_R} fill="var(--accent-hover)" stroke="var(--surface)" strokeWidth={2.5} />
            <text
              x={bx}
              y={by}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={BADGE_FONT}
              fontWeight={700}
              fill="var(--accent-ink)"
              aria-hidden="true"
            >
              {n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Badge centres: each prefecture's label point, moved east until it clears the badges already placed. */
function placeBadges(prefs: Prefecture[]): Map<string, [number, number]> {
  const placed = new Map<string, [number, number]>();
  for (const p of [...prefs].sort((a, b) => PREFECTURE_SHAPES[a.id].label[1] - PREFECTURE_SHAPES[b.id].label[1])) {
    const y = PREFECTURE_SHAPES[p.id].label[1];
    let x = PREFECTURE_SHAPES[p.id].label[0];
    while ([...placed.values()].some(([px, py]) => Math.hypot(px - x, py - y) < BADGE_R * 2.4)) x += BADGE_R * 2.4;
    placed.set(p.code, [x, y]);
  }
  return placed;
}
