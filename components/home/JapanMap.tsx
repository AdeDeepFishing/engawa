"use client";

import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from "react";
import type { Lang } from "@/lib/i18n";
import { useLang } from "@/lib/i18n/LangProvider";
import type { HomeBoard } from "./BoardSummary";
import { JAPAN_VIEWBOX, OKINAWA_INSET, PREFECTURE_SHAPES } from "./japan-map-paths";
import { leaderEnd, placeCallouts, type CalloutItem, type CalloutSizes, type Rect } from "./map-callouts";
import type { MapPin } from "./map-pins";
import { PREFECTURES } from "./prefectures";

/*
 * The outlines are drawn in map units (the view box is 347 wide) and scale
 * with the map; the pins and their pills are HTML in CSS pixels on top, so
 * the pins keep one size and the 16 px text and 44 px targets hold at every
 * width. The leaders are a second svg over the pins and under the pills, so
 * a leader crosses its pin's halo and meets the white ring: drawn in the
 * map's svg under the pins, the halo hid its last 7 px and the pill looked
 * adrift. The inset's name is 16.5 units: 16 px or more on a map from 337 px
 * wide (a 369 px phone less its gutters), 15.6 px on a 360 px phone.
 */
const INSET_NAME_FONT = 16.5;

/**
 * Placement sizes in rem, so the text size toggle scales them like the rest
 * of the page: the pin as drawn (a 10 px dot, its 2 px ring and the 9 px
 * halo, 28 px across), the gap between stacked pills, the distance from
 * the pin to its pill, and the longest leader (120 px).
 */
const SIZES_REM: CalloutSizes = { pin: 1.75, gap: 0.5, reach: 1.25, leader: 7.5 };

/** From a pin's centre to the outside of its white ring, where its leader meets it: the 10 px dot's radius (in rem) and the 2 px ring. */
const ringRadius = (rem: number) => 0.3125 * rem + 2;

/** Widest a pill gets before its names wrap (max-w-48), in rem. */
const PILL_MAX_REM = 12;

const [VB_X, VB_Y, VB_W, VB_H] = JAPAN_VIEWBOX.split(" ").map(Number);
const OKINAWA = PREFECTURES.find((p) => p.id === "okinawa");

/** What placement needs from the page: the map's width, the root font size and each pill's size, all in px. */
interface Measure {
  width: number;
  rem: number;
  pills: Record<string, [number, number]>;
}

/** Until the map is measured (the server render and the first client render): a 390 px phone, default text size. */
const FIRST: Measure = { width: 358, rem: 16, pills: {} };

function sameMeasure(a: Measure, b: Measure): boolean {
  if (a.width !== b.width || a.rem !== b.rem) return false;
  const keys = Object.keys(b.pills);
  return keys.length === Object.keys(a.pills).length && keys.every((k) => a.pills[k]?.[0] === b.pills[k][0] && a.pills[k]?.[1] === b.pills[k][1]);
}

/** A pill's size before it is measured: 1 em for each Japanese, Chinese or Korean character, 0.6 em for others, one line until the widest. */
function estimatePill(label: string, group: boolean, rem: number): [number, number] {
  let em = group ? 3.5 : 2;
  for (const ch of label) em += /[　-鿿가-힯＀-￯]/u.test(ch) ? 1 : 0.6;
  return em > PILL_MAX_REM ? [PILL_MAX_REM * rem, 3.75 * rem] : [Math.ceil(em * rem), 2.75 * rem];
}

/** A pill: the names wrap between boards, never inside one, once it reaches 12 rem. */
const PILL =
  "inline-flex min-h-11 w-max max-w-48 items-center gap-2 rounded-[1.375rem] border border-accent bg-surface py-1.5 text-left text-base leading-snug font-semibold";

interface PinName {
  text: string;
  /** Set when the board has no name in the reader's language and shows its Japanese one. */
  ja: boolean;
}

/** A pill's content: the boards' names, and for more than one board their count on a small accent disc. */
function PillBody({ names, sep }: { names: PinName[]; sep: string }) {
  return (
    <>
      <span>
        {names.map((n, i) => (
          <Fragment key={i}>
            {i ? sep : null}
            <span lang={n.ja ? "ja" : undefined} className="whitespace-nowrap">
              {n.text}
            </span>
          </Fragment>
        ))}
      </span>
      {names.length > 1 ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-base leading-none font-bold text-accent-ink">
          {names.length}
        </span>
      ) : null}
    </>
  );
}

const pillPadding = (group: boolean) => (group ? "pr-1.5 pl-3.5" : "px-3.5");

/**
 * The home page map: all 47 prefectures in the same quiet land tone with
 * hairline borders (each with its name in a <title>), Okinawa in a dotted
 * inset at the top left, and one pin per board at its real position (the
 * centroid of its 町丁目, projected on the server, see map-pins.ts). Boards
 * close together in one prefecture share a pin. Every pin is the same size
 * wherever it is: a 10 px accent dot with a white ring and a soft halo.
 *
 * Each pin has a pill beside it with its boards' names in the reader's
 * language, joined by a leader line (placement in map-callouts.ts). The
 * pill is the button ("渋谷・上野: 掲示板 2 件"), and the pin takes a click
 * too; both hand the pin to `onSelect`. A pin with no room for a pill is
 * the button itself. Pins follow the server's order, north to south, which
 * is also the tab order. Pointer (mouse or pen) and keyboard focus deepen
 * the pin and tint its pill; a touch has no hover.
 */
export function JapanMap({
  boards,
  pins,
  onSelect,
}: {
  boards: HomeBoard[];
  pins: MapPin[];
  onSelect: (pin: MapPin) => void;
}) {
  const { lang, t } = useLang();
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [measure, setMeasure] = useState<Measure>(FIRST);
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const keys = pins.map((p) => p.slugs.join("+"));
  const keysJoined = keys.join(",");

  // Measure the map and every pill, now and whenever either changes size
  // (a narrower window, the text size toggle, another language).
  useLayoutEffect(() => {
    const box = boxRef.current;
    const layer = measureRef.current;
    if (!box || !layer) return;
    const observer = new ResizeObserver(() => {
      const sizes: Record<string, [number, number]> = {};
      for (const el of layer.querySelectorAll<HTMLElement>("[data-measure]")) {
        // Fractional sizes: a width rounded down lets a pill at the map's edge cross it by a fraction of a pixel.
        const r = el.getBoundingClientRect();
        sizes[el.dataset.measure ?? ""] = [r.width, r.height];
      }
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const next: Measure = { width: box.getBoundingClientRect().width, rem, pills: sizes };
      setMeasure((prev) => (sameMeasure(prev, next) ? prev : next));
    });
    observer.observe(box);
    for (const el of layer.children) observer.observe(el);
    return () => observer.disconnect();
  }, [keysJoined]);

  const namesOf = (pin: MapPin): PinName[] =>
    pin.slugs.map((slug) => {
      const name = boards.find((b) => b.slug === slug)?.name;
      const own = name?.[lang as Lang];
      return own ? { text: own, ja: false } : { text: name?.ja ?? slug, ja: true };
    });
  const sep = t("home.map_names_sep");
  const labelOf = (pin: MapPin) =>
    t(pin.slugs.length === 1 ? "home.map_pin_one" : "home.map_pin_other", {
      names: namesOf(pin)
        .map((n) => n.text)
        .join(sep),
      n: pin.slugs.length,
    });

  const scale = measure.width / VB_W;
  const height = VB_H * scale;
  const units = (x: number, y: number): [number, number] => [x / scale + VB_X, y / scale + VB_Y];
  const sizes = Object.fromEntries(Object.entries(SIZES_REM).map(([k, v]) => [k, v * measure.rem])) as unknown as CalloutSizes;
  // A pill may cover the inset's edge, its dotted frame, but not what is inside it (8 px in from the frame).
  const [ix, iy, iw, ih] = OKINAWA_INSET;
  const edge = 0.5 * measure.rem;
  const inset: Rect = { x: (ix - VB_X) * scale + edge, y: (iy - VB_Y) * scale + edge, w: iw * scale - 2 * edge, h: ih * scale - 2 * edge };

  // Pins closer on screen than half a pin share one dot (the Tokyo and the
  // Kawasaki pins are 3 units apart), each keeping its own pill and leader.
  const spot = pins.map((_, i) => i);
  for (let i = 0; i < pins.length; i++) {
    for (let j = 0; j < i; j++) {
      if (spot[j] === j && Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y) * scale < sizes.pin / 2) {
        spot[i] = j;
        break;
      }
    }
  }
  const spotAt = (i: number): [number, number] => {
    const members = pins.filter((_, k) => spot[k] === spot[i]);
    const x = members.reduce((sum, p) => sum + p.x, 0) / members.length;
    const y = members.reduce((sum, p) => sum + p.y, 0) / members.length;
    return [(x - VB_X) * scale, (y - VB_Y) * scale];
  };

  const items: CalloutItem[] = pins.map((pin, i) => {
    const [cx, cy] = spotAt(i);
    const [pillW, pillH] =
      measure.pills[keys[i]] ??
      estimatePill(
        namesOf(pin)
          .map((n) => n.text)
          .join(sep),
        pin.slugs.length > 1,
        measure.rem,
      );
    return { key: keys[i], cx, cy, pillW, pillH };
  });
  const callouts = placeCallouts(items, { w: measure.width, h: height }, sizes, [inset]);

  const hot = (key: string) => hovered === key || focused === key;
  /** A shared dot deepens with any of its pins. */
  const hotSpot = (i: number) => pins.some((_, k) => spot[k] === spot[i] && hot(keys[k]));
  const pointerIn = (key: string) => (e: PointerEvent) => {
    // A touch has no hover; a tap goes straight to the boards.
    if (e.pointerType !== "touch") setHovered(key);
  };
  const pointerOut = (key: string) => () => setHovered((h) => (h === key ? null : h));
  const focusIn = (key: string) => (e: FocusEvent<HTMLElement>) => {
    // Older Safari throws on the selector; a thrown handler is worse than a tint, so fall back to focused.
    let visible = true;
    try {
      visible = e.currentTarget.matches(":focus-visible");
    } catch {
      visible = true;
    }
    if (visible) setFocused(key);
  };
  const focusOut = (key: string) => () => setFocused((f) => (f === key ? null : f));
  function select(pin: MapPin) {
    // The page scrolls away under a resting pointer, which then never leaves: drop the hover here.
    setHovered(null);
    onSelect(pin);
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
        {PREFECTURES.map((p) => (
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
      </svg>

      {callouts.map((c, i) => {
        const pin = pins[i];
        const names = namesOf(pin);
        const group = names.length > 1;
        const events = {
          onClick: () => select(pin),
          onPointerEnter: pointerIn(c.key),
          onPointerLeave: pointerOut(c.key),
          onPointerCancel: pointerOut(c.key),
        };
        const pop = { "--rise-delay": `${420 + i * 60}ms` } as CSSProperties;
        const dot = (
          <span
            style={pop}
            className="home-pop block size-2.5 rounded-full bg-accent shadow-[0_0_0_2px_var(--surface),0_0_0_9px_color-mix(in_srgb,var(--accent)_14%,transparent)] transition-colors duration-150 ease-out group-data-hot:bg-accent-hover"
          />
        );
        const pinClass = "group absolute z-[1] flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full";
        return (
          <Fragment key={c.key}>
            {c.side ? (
              // With a pill, the pin is a second pointer target (the pill is the button); a shared dot is drawn once, for the first of its pins.
              spot[i] === i ? (
                <span {...events} aria-hidden="true" style={pct(c.cx, c.cy)} className={pinClass} data-map-pin={c.key} data-hot={hotSpot(i) || undefined}>
                  {dot}
                </span>
              ) : null
            ) : (
              <button
                type="button"
                {...events}
                aria-label={labelOf(pin)}
                onFocus={focusIn(c.key)}
                onBlur={focusOut(c.key)}
                style={pct(c.cx, c.cy)}
                className={pinClass}
                data-map-pin={c.key}
                data-map-callout={c.key}
                data-hot={hot(c.key) || undefined}
              >
                {dot}
              </button>
            )}
            {c.side ? (
              <button
                type="button"
                {...events}
                aria-label={labelOf(pin)}
                onFocus={focusIn(c.key)}
                onBlur={focusOut(c.key)}
                style={{ ...pct(c.rect.x, c.rect.y), ...pop }}
                className={`home-pop absolute z-[2] cursor-pointer shadow-[var(--shadow-rest)] transition-colors duration-150 ease-out data-hot:bg-accent-soft ${PILL} ${pillPadding(group)}`}
                data-map-callout={c.key}
                data-side={c.side}
                data-hot={hot(c.key) || undefined}
              >
                <PillBody names={names} sep={sep} />
              </button>
            ) : null}
          </Fragment>
        );
      })}

      {/* The leaders: over the pins (later in the same layer) so each crosses its halo and meets the ring, under the pills (z-2). The box is the map's, so the view box maps as the pins' percentages do. */}
      <svg viewBox={JAPAN_VIEWBOX} preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] h-full w-full">
        {callouts.map((c) => {
          if (!c.side) return null;
          const [ex, ey] = leaderEnd(c);
          const len = Math.hypot(ex - c.cx, ey - c.cy);
          const ring = ringRadius(measure.rem);
          if (len <= ring) return null;
          const [x1, y1] = units(c.cx + ((ex - c.cx) * ring) / len, c.cy + ((ey - c.cy) * ring) / len);
          const [x2, y2] = units(ex, ey);
          return <line key={c.key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--line-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />;
        })}
      </svg>

      {/* Every pill as it would be drawn, out of sight, so placement knows its size in this language and text size. */}
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 flex w-full flex-col items-start">
        {pins.map((pin, i) => (
          <span key={keys[i]} data-measure={keys[i]} className={`${PILL} ${pillPadding(pin.slugs.length > 1)}`}>
            <PillBody names={namesOf(pin)} sep={sep} />
          </span>
        ))}
      </div>
    </div>
  );
}
