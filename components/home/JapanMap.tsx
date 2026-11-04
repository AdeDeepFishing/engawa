"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { useLang } from "@/lib/i18n/LangProvider";
import { JAPAN_VIEWBOX, OKINAWA_INSET, PREFECTURE_SHAPES } from "./japan-map-paths";
import { PREFECTURES, type Prefecture } from "./prefectures";

/*
 * Sizes in map units (the view box is 347 wide). The map is drawn at least
 * 358 px wide (a 390 px phone less its gutters), where one unit is 1.03 px:
 * the badge digits are then 16.5 px, the inset's name 16 px, and the hit
 * circle 45 px across. Wider maps only make them larger.
 */
const BADGE_R = 13;
const BADGE_FONT = 17;
const HALO_R = BADGE_R + 8;
const HIT_R = 24;
/** Distance between two badge centres, so neither halo covers the other. */
const BADGE_GAP = HALO_R * 2 + 2;
const INSET_NAME_FONT = 15.5;

const [VB_X, VB_Y, VB_W, VB_H] = JAPAN_VIEWBOX.split(" ").map(Number);
const OKINAWA = PREFECTURES.find((p) => p.id === "okinawa");

/**
 * The home page map: every prefecture in a warm land tone with hairline
 * borders, the ones with a listed board in a rose tint with the board count
 * on an accent badge. Those are buttons (pointer, Enter, Space) that hand
 * the prefecture code to `onSelect`; hover and focus deepen the tint and
 * show the prefecture's name above the badge. The others are inert and carry
 * their name in a <title>. Okinawa sits in a dotted inset at the top left
 * with its name, its islands outlined so they show at phone size. Badges
 * that would overlap (Tokyo next to Kanagawa) are moved apart to the east,
 * over the sea.
 */
export function JapanMap({
  counts,
  onSelect,
}: {
  counts: Record<string, number>;
  onSelect: (prefectureCode: string) => void;
}) {
  const { lang, t } = useLang();
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const named = hovered ?? focused;
  const active = PREFECTURES.filter((p) => (counts[p.code] ?? 0) > 0);
  const badges = placeBadges(active);

  function onKey(e: KeyboardEvent<SVGGElement>, code: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(code);
    }
  }

  return (
    <div className="relative">
      <svg viewBox={JAPAN_VIEWBOX} role="group" aria-label={t("home.map_label")} className="block h-auto w-full">
        <rect
          x={OKINAWA_INSET[0]}
          y={OKINAWA_INSET[1]}
          width={OKINAWA_INSET[2]}
          height={OKINAWA_INSET[3]}
          rx={4}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={1}
          strokeDasharray="1 4"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {OKINAWA ? (
          <text
            x={OKINAWA_INSET[0] + 8}
            y={OKINAWA_INSET[1] + 8 + INSET_NAME_FONT}
            fontSize={INSET_NAME_FONT}
            fill="var(--muted)"
            aria-hidden="true"
          >
            {OKINAWA.names[lang]}
          </text>
        ) : null}
        {PREFECTURES.filter((p) => !counts[p.code]).map((p) => (
          <path
            key={p.code}
            d={PREFECTURE_SHAPES[p.id].d}
            fill="var(--map-land)"
            stroke={p === OKINAWA ? "var(--line-strong)" : "var(--line)"}
            strokeWidth={1}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          >
            <title>{p.names[lang]}</title>
          </path>
        ))}
        {active.map((p, i) => {
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
              onPointerEnter={() => setHovered(p.code)}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setFocused(p.code)}
              onBlur={() => setFocused(null)}
              className="group cursor-pointer outline-none"
              data-map-pref={p.code}
            >
              <path
                d={PREFECTURE_SHAPES[p.id].d}
                stroke="var(--accent)"
                strokeWidth={1}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="fill-[var(--map-active)] transition-[fill] duration-150 ease-out group-hover:fill-[var(--map-active-hover)] group-focus-visible:fill-[var(--map-active-hover)]"
              />
              {bx !== lx || by !== ly ? (
                <line x1={lx} y1={ly} x2={bx} y2={by} stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              ) : null}
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
              <g className="home-pop" style={{ "--rise-delay": `${420 + i * 60}ms` } as CSSProperties}>
                <circle cx={bx} cy={by} r={HALO_R} fill="var(--accent)" opacity={0.14} />
                <circle cx={bx} cy={by} r={BADGE_R} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2.5} />
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
            </g>
          );
        })}
      </svg>
      {active.map((p) => {
        const [bx, by] = badges.get(p.code) ?? PREFECTURE_SHAPES[p.id].label;
        const x = (bx - VB_X) / VB_W;
        // Centred over the badge, kept inside the map near its edges.
        const shift = x < 0.2 ? "0%" : x > 0.8 ? "-100%" : "-50%";
        return (
          <span
            key={p.code}
            aria-hidden="true"
            className={`pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-1 text-base font-semibold whitespace-nowrap shadow-sm transition-opacity duration-150 ease-out ${
              named === p.code ? "opacity-100" : "opacity-0"
            }`}
            style={{
              left: `${x * 100}%`,
              top: `${((by - VB_Y) / VB_H) * 100}%`,
              transform: `translate(${shift}, calc(-100% - ${HALO_R + 6}px))`,
            }}
          >
            {p.names[lang]}
          </span>
        );
      })}
    </div>
  );
}

/** Badge centres: each prefecture's label point, moved east until it clears the badges already placed. */
function placeBadges(prefs: Prefecture[]): Map<string, [number, number]> {
  const placed = new Map<string, [number, number]>();
  for (const p of [...prefs].sort((a, b) => PREFECTURE_SHAPES[a.id].label[1] - PREFECTURE_SHAPES[b.id].label[1])) {
    const y = PREFECTURE_SHAPES[p.id].label[1];
    let x = PREFECTURE_SHAPES[p.id].label[0];
    while ([...placed.values()].some(([px, py]) => Math.hypot(px - x, py - y) < BADGE_GAP)) x += BADGE_GAP;
    placed.set(p.code, [x, y]);
  }
  return placed;
}
