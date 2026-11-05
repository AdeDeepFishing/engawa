"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from "react";
import type { Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import { JAPAN_VIEWBOX, OKINAWA_INSET, PREFECTURE_SHAPES } from "./japan-map-paths";
import { leaderEnd, placeCallouts, shapeInfo, type CalloutItem, type CalloutSizes, type Rect } from "./map-callouts";
import { PREFECTURES, type Prefecture } from "./prefectures";

/*
 * The outlines are drawn in map units (the view box is 347 wide) and scale
 * with the map; the callouts (badges and pills) are HTML in CSS pixels on
 * top, so their 16 px text and 44 px targets hold at every width. The
 * inset's name is 16.5 units: 16 px or more on a map from 337 px wide (a
 * 369 px phone less its gutters), 15.6 px on a 360 px phone.
 */
const INSET_NAME_FONT = 16.5;

/** Callout sizes in rem, so the text size toggle scales them like the rest of the page. */
const SIZES_REM: CalloutSizes = { disc: 1.5, clear: 0.25, hit: 2.75, pillH: 2.75, gap: 0.5, reach: 1 };

/** Width of a pill's padding, gap, count disc and border, in rem: pl-3.5, gap-2, size-6, pr-1.5, two 1 px borders. */
const PILL_CHROME_REM = 0.875 + 0.5 + 1.5 + 0.375 + 0.125;

const [VB_X, VB_Y, VB_W, VB_H] = JAPAN_VIEWBOX.split(" ").map(Number);
const OKINAWA = PREFECTURES.find((p) => p.id === "okinawa");

/** What placement needs from the page: the map's width, the root font size and each pill's width, all in px. */
interface Measure {
  width: number;
  rem: number;
  pills: Record<string, number>;
}

/** Until the map is measured (the server render and the first client render): a 390 px phone, default text size. */
const FIRST: Measure = { width: 358, rem: 16, pills: {} };

function sameMeasure(a: Measure, b: Measure): boolean {
  if (a.width !== b.width || a.rem !== b.rem) return false;
  const keys = Object.keys(b.pills);
  return keys.length === Object.keys(a.pills).length && keys.every((k) => a.pills[k] === b.pills[k]);
}

/** A pill's width before it is measured: 1 em for each Japanese, Chinese or Korean character, 0.6 em for others. */
function estimatePill(label: string, rem: number): number {
  let em = PILL_CHROME_REM + 0.5;
  for (const ch of label) em += /[　-鿿가-힯＀-￯]/u.test(ch) ? 1 : 0.6;
  return Math.ceil(em * rem);
}

const PILL =
  "inline-flex h-11 items-center gap-2 rounded-full border border-accent bg-surface pr-1.5 pl-3.5 text-base font-semibold whitespace-nowrap";

/** A pill's content: the prefecture's name and the board count on a small accent disc. */
function PillBody({ name, n }: { name: string; n: number }) {
  return (
    <>
      <span>{name}</span>
      <span className="flex size-6 items-center justify-center rounded-full bg-accent text-base leading-none font-bold text-accent-ink">
        {n}
      </span>
    </>
  );
}

function prefLabel(t: ReturnType<typeof useLang>["t"], p: Prefecture, n: number, lang: Lang): string {
  return t(n === 1 ? "home.map_pref_one" : "home.map_pref_other", { pref: p.names[lang], n });
}

/**
 * The home page map: every prefecture in a warm land tone with hairline
 * borders; the ones with a listed board filled in a rose tint, clearly off
 * the land, with a 1.5 px accent outline, and a step deeper while the
 * pointer rests on the prefecture or its callout, or the callout has
 * keyboard focus. Inert prefectures carry their name in a <title>.
 *
 * Each highlighted prefecture has one callout, a button with the same name
 * ("Tokyo: 2 boards") that hands the prefecture code to `onSelect`: the
 * round count badge inside the prefecture when it has room for it,
 * otherwise a pill with the prefecture's name and count beside it, joined
 * by a leader line (see map-callouts.ts). The outlines themselves take a
 * click too. Callouts follow the prefecture codes, north to south, which is
 * also the tab order. Okinawa sits in a dotted inset at the top left.
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
  const [measure, setMeasure] = useState<Measure>(FIRST);
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const active = PREFECTURES.filter((p) => (counts[p.code] ?? 0) > 0);
  const activeKey = active.map((p) => p.code).join(",");

  // Measure the map and every pill, now and whenever either changes size
  // (a narrower window, the text size toggle, another language).
  useLayoutEffect(() => {
    const box = boxRef.current;
    const layer = measureRef.current;
    if (!box || !layer) return;
    const observer = new ResizeObserver(() => {
      const pills: Record<string, number> = {};
      for (const el of layer.querySelectorAll<HTMLElement>("[data-measure]")) {
        pills[el.dataset.measure ?? ""] = el.offsetWidth;
      }
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const next: Measure = { width: box.clientWidth, rem, pills };
      setMeasure((prev) => (sameMeasure(prev, next) ? prev : next));
    });
    observer.observe(box);
    for (const el of layer.children) observer.observe(el);
    return () => observer.disconnect();
  }, [activeKey]);

  const scale = measure.width / VB_W;
  const height = VB_H * scale;
  const px = (x: number, y: number): [number, number] => [(x - VB_X) * scale, (y - VB_Y) * scale];
  const units = (x: number, y: number): [number, number] => [x / scale + VB_X, y / scale + VB_Y];
  const toRect = ([x, y, w, h]: readonly number[]): Rect => {
    const [rx, ry] = px(x, y);
    return { x: rx, y: ry, w: w * scale, h: h * scale };
  };
  const sizes = Object.fromEntries(
    Object.entries(SIZES_REM).map(([k, v]) => [k, v * measure.rem]),
  ) as unknown as CalloutSizes;

  const items: CalloutItem[] = active.map((p) => {
    const [cx, cy] = px(...PREFECTURE_SHAPES[p.id].label);
    return {
      code: p.code,
      cx,
      cy,
      room: shapeInfo(p.id).room * scale,
      pillW: measure.pills[p.code] ?? estimatePill(p.names[lang], measure.rem),
    };
  });
  const callouts = placeCallouts(
    items,
    { w: measure.width, h: height },
    sizes,
    [toRect(OKINAWA_INSET)],
    active.map((p) => toRect(shapeInfo(p.id).box)),
  );

  const hot = (code: string) => hovered === code || focused === code;
  const pointerIn = (code: string) => (e: PointerEvent) => {
    // A touch has no hover; a tap goes straight to the boards.
    if (e.pointerType !== "touch") setHovered(code);
  };
  const pointerOut = (code: string) => () => setHovered((h) => (h === code ? null : h));
  const focusIn = (code: string) => (e: FocusEvent<HTMLElement>) => {
    // Older Safari throws on the selector; a thrown handler is worse than a tint, so fall back to focused.
    let visible = true;
    try {
      visible = e.currentTarget.matches(":focus-visible");
    } catch {
      visible = true;
    }
    if (visible) setFocused(code);
  };
  const focusOut = (code: string) => () => setFocused((f) => (f === code ? null : f));
  function select(code: string) {
    // The page scrolls away under a resting pointer, which then never leaves: drop the hover here.
    setHovered(null);
    onSelect(code);
  }

  const pct = (x: number, y: number): CSSProperties => ({ left: `${(x / measure.width) * 100}%`, top: `${(y / height) * 100}%` });

  return (
    <div ref={boxRef} role="group" aria-label={t("home.map_label")} className="relative">
      <svg viewBox={JAPAN_VIEWBOX} aria-hidden="true" className="block h-auto w-full">
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
          <text x={OKINAWA_INSET[0] + 8} y={OKINAWA_INSET[1] + 8 + INSET_NAME_FONT} fontSize={INSET_NAME_FONT} fill="var(--muted)">
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
        {active.map((p) => (
          <path
            key={p.code}
            d={PREFECTURE_SHAPES[p.id].d}
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ fill: hot(p.code) ? "var(--map-active-hover)" : "var(--map-active)" }}
            className="cursor-pointer transition-[fill] duration-150 ease-out"
            onClick={() => select(p.code)}
            onPointerEnter={pointerIn(p.code)}
            onPointerLeave={pointerOut(p.code)}
            onPointerCancel={pointerOut(p.code)}
            data-map-active={p.code}
          >
            <title>{p.names[lang]}</title>
          </path>
        ))}
        {callouts.map((c) => {
          if (c.kind !== "pill") return null;
          const [x1, y1] = units(c.cx, c.cy);
          const [x2, y2] = units(...leaderEnd(c));
          return (
            <g key={c.code} pointerEvents="none">
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <circle cx={x1} cy={y1} r={3 / scale} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
      </svg>

      {callouts.map((c, i) => {
        const p = active[i];
        const n = counts[p.code];
        const common = {
          type: "button" as const,
          "aria-label": prefLabel(t, p, n, lang),
          onClick: () => select(p.code),
          onPointerEnter: pointerIn(p.code),
          onPointerLeave: pointerOut(p.code),
          onPointerCancel: pointerOut(p.code),
          onFocus: focusIn(p.code),
          onBlur: focusOut(p.code),
          "data-map-callout": p.code,
          "data-hot": hot(p.code) || undefined,
        };
        const pop = { "--rise-delay": `${420 + i * 60}ms` } as CSSProperties;
        if (c.kind === "pill") {
          return (
            <button
              key={`${p.code}-pill`}
              {...common}
              style={{ ...pct(c.rect.x, c.rect.y), ...pop }}
              className={`home-pop absolute z-[1] cursor-pointer shadow-[var(--shadow-rest)] transition-colors duration-150 ease-out data-hot:bg-accent-soft ${PILL}`}
              data-side={c.side}
            >
              <PillBody name={p.names[lang]} n={n} />
            </button>
          );
        }
        return (
          <button
            key={`${p.code}-badge`}
            {...common}
            style={pct(c.cx, c.cy)}
            className="group absolute z-[1] flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full"
          >
            <span
              style={pop}
              className="home-pop flex size-6 items-center justify-center rounded-full bg-accent text-base leading-none font-bold text-accent-ink shadow-[0_0_0_2px_var(--surface),0_0_0_9px_color-mix(in_srgb,var(--accent)_14%,transparent)] transition-colors duration-150 ease-out group-data-hot:bg-accent-hover"
            >
              {n}
            </span>
          </button>
        );
      })}

      {/* The prefecture's name over its badge while the pointer rests on it or the badge has keyboard focus; pills carry it already. */}
      {callouts.map((c, i) => {
        if (c.kind !== "badge") return null;
        const p = active[i];
        const x = c.cx / measure.width;
        // Centred over the badge, kept inside the map near its edges.
        const shift = x < 0.2 ? "0%" : x > 0.8 ? "-100%" : "-50%";
        return (
          <span
            key={p.code}
            aria-hidden="true"
            className={`pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-1 text-base font-semibold whitespace-nowrap shadow-sm transition-opacity duration-150 ease-out ${
              hot(p.code) ? "opacity-100" : "opacity-0"
            }`}
            style={{ ...pct(c.cx, c.cy), transform: `translate(${shift}, calc(-100% - ${1.25 * measure.rem}px))` }}
          >
            {p.names[lang]}
          </span>
        );
      })}

      {/* Every pill as it would be drawn, out of sight, so placement knows its width in this language and text size. */}
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 flex flex-col items-start">
        {active.map((p) => (
          <span key={p.code} data-measure={p.code} className={PILL}>
            <PillBody name={p.names[lang]} n={counts[p.code]} />
          </span>
        ))}
      </div>
    </div>
  );
}
