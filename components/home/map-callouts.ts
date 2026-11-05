/*
 * Where the label of each pin goes on the home page map
 * (components/home/JapanMap.tsx). Pure geometry in CSS pixels of the map as
 * drawn, so the 44 px targets and the 16 px text hold at every map width.
 *
 * Every pin gets a pill with its boards' names beside it, joined to the pin
 * by a leader line: right, then left, then above, then below, the first
 * side with a place near the pin where the pill stays inside the map and
 * clear of every pin, the other pills and the inner part of the Okinawa
 * inset (else the side with the nearest place, within a longest leader).
 * A pill that meets another pill on the same side stacks under it (over
 * it, above the pin), a gap apart; where even that is taken, it takes the
 * free place along the side nearest its pin. A pin with no room on any
 * side keeps no pill: the pin itself is then the button.
 */

type Pt = [number, number];

/** A rectangle in px, from the map's top left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = "right" | "left" | "above" | "below";

const SIDES: Side[] = ["right", "left", "above", "below"];

export interface CalloutItem {
  key: string;
  /** The pin, px. */
  cx: number;
  cy: number;
  /** The pill's size in the reader's language and text size, px. */
  pillW: number;
  pillH: number;
}

export type Callout = { key: string; cx: number; cy: number } & ({ side: Side; rect: Rect } | { side: null });

export interface CalloutSizes {
  /** The pin as drawn (dot, ring and halo), which no pill may cover. */
  pin: number;
  /** Between two stacked pills. */
  gap: number;
  /** From the pin to the near edge of a pill, and the least distance from it to a side pill's middle. */
  reach: number;
  /** The longest leader line: a pill further from its pin than this reads as someone else's. */
  leader: number;
}

function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

/**
 * Pills for `items`, returned in the order given (the map renders them in
 * that order, so it is also the tab order). `box` is the map's size and
 * `inset` the rectangles nothing may cover (the Okinawa inset). Pills are
 * placed one by one, north to south; where that leaves a pin without a pill
 * (a narrow phone, large text, two long labels at one spot), the widest
 * first and south to north are tried too, and the order that labels the
 * most pins wins.
 */
export function placeCallouts(items: CalloutItem[], box: { w: number; h: number }, s: CalloutSizes, inset: Rect[]): Callout[] {
  const orders = [
    [...items].sort((a, b) => a.cy - b.cy),
    [...items].sort((a, b) => b.pillW * b.pillH - a.pillW * a.pillH || a.cy - b.cy),
    [...items].sort((a, b) => b.cy - a.cy),
  ];
  let best: Callout[] = [];
  let labelled = -1;
  for (const order of orders) {
    const out = placeInOrder(items, order, box, s, inset);
    const n = out.filter((c) => c.side).length;
    if (n > labelled) {
      best = out;
      labelled = n;
    }
    if (n === items.length) break;
  }
  return best;
}

function placeInOrder(items: CalloutItem[], order: CalloutItem[], box: { w: number; h: number }, s: CalloutSizes, inset: Rect[]): Callout[] {
  const pins: Rect[] = items.map((it) => ({ x: it.cx - s.pin / 2, y: it.cy - s.pin / 2, w: s.pin, h: s.pin }));
  /** Placed pills; `stack` is shared by pills stacked on one another. */
  const pills: { side: Side; rect: Rect; it: CalloutItem; stack: number }[] = [];

  // A pill pulled back inside the map, or stacked under another, may reach
  // back past its pin, as long as its middle stays on its side; a pill above
  // or below spans its pin, give or take the reach.
  const onSide = (rect: Rect, side: Side, it: CalloutItem) =>
    side === "right"
      ? rect.x + rect.w / 2 >= it.cx + s.reach
      : side === "left"
        ? rect.x + rect.w / 2 <= it.cx - s.reach
        : rect.x - s.reach <= it.cx && it.cx <= rect.x + rect.w + s.reach;
  const clearOf = (rect: Rect, others: Rect[]) =>
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.w <= box.w &&
    rect.y + rect.h <= box.h &&
    ![...inset, ...pins, ...others].some((o) => overlaps(o, rect));

  /** The free place on this side nearest the pin, with its leader's length and the stack it joins (-1 for none), or null. */
  function trySide(it: CalloutItem, side: Side): { rect: Rect; len: number; stack: number } | null {
    const w = it.pillW;
    const h = it.pillH;
    const first: Rect =
      side === "right"
        ? { x: Math.min(it.cx + s.reach, box.w - w), y: it.cy - h / 2, w, h }
        : side === "left"
          ? { x: Math.max(it.cx - s.reach - w, 0), y: it.cy - h / 2, w, h }
          : {
              x: Math.max(0, Math.min(it.cx - w / 2, box.w - w)),
              y: side === "above" ? it.cy - s.reach - h : it.cy + s.reach,
              w,
              h,
            };
    // Stack on the pills already on this side, lined up with them where this one still fits.
    let rect = first;
    let stackedOn = -1;
    for (let guard = 0; guard < items.length; guard++) {
      const q = pills.find((p) => p.side === side && overlaps(p.rect, rect, s.gap - 0.5));
      if (!q) break;
      const y = side === "above" ? q.rect.y - s.gap - h : q.rect.y + q.rect.h + s.gap;
      let x = rect.x;
      if (side === "right" && q.rect.x + w <= box.w) x = q.rect.x;
      if (side === "left" && q.rect.x + q.rect.w - w >= 0) x = q.rect.x + q.rect.w - w;
      rect = { x, y, w, h };
      stackedOn = q.stack;
    }
    // Where that is taken, slide along the side a gap at a time, from the
    // stacked place and from the first one, as far as the map goes (above and
    // below also step away from the pin), and keep the free place nearest
    // the pin (by the length of its leader); up (or left) wins a tie.
    const step = s.gap;
    const level = side === "right" || side === "left";
    const reachAlong = level ? box.h : box.w;
    const awayMax = level ? 0 : Math.ceil(box.h / step);
    const bases: [Rect, number][] = rect === first ? [[first, -1]] : [[rect, stackedOn], [first, -1]];
    const tries: { rect: Rect; stack: number }[] = [];
    for (const [base, stack] of bases) {
      for (let k = 0; k <= 2 * Math.ceil(reachAlong / step); k++) {
        const d = Math.ceil(k / 2) * step * (k % 2 ? -1 : 1);
        for (let a = 0; a <= awayMax; a++) {
          const away = a * step * (side === "above" ? -1 : 1);
          tries.push({
            rect: level ? { ...base, y: base.y + d } : { ...base, x: Math.max(0, Math.min(base.x + d, box.w - w)), y: base.y + away },
            stack,
          });
        }
      }
    }
    const leader = (r: Rect) => {
      const [x, y] = leaderEnd({ key: it.key, cx: it.cx, cy: it.cy, side, rect: r });
      return Math.hypot(x - it.cx, y - it.cy);
    };
    const nearest = tries
      .map((t, n) => ({ ...t, n, len: leader(t.rect) }))
      .sort((a, b) => a.len - b.len || a.n - b.n)
      .find((t) => t.len <= s.leader && onSide(t.rect, side, it) && clearOf(t.rect, []) && !pills.some((p) => overlaps(p.rect, t.rect, s.gap - 0.5)));
    return nearest ? { rect: nearest.rect, len: nearest.len, stack: nearest.stack } : null;
  }

  // The first side, in order, with a place near the pin (level with it, or a
  // pill's height off); failing that, whichever side has the nearest place.
  for (const it of order) {
    let chosen: { side: Side; rect: Rect; len: number; stack: number } | null = null;
    for (const side of SIDES) {
      const t = trySide(it, side);
      if (!t) continue;
      if (t.len <= s.reach + it.pillH) {
        chosen = { side, ...t };
        break;
      }
      if (!chosen || t.len < chosen.len) chosen = { side, ...t };
    }
    if (chosen) pills.push({ side: chosen.side, rect: chosen.rect, it, stack: chosen.stack >= 0 ? chosen.stack : pills.length });
  }

  // Line up each stack: on the edge facing the pins (the left edge on the
  // right side, the right edge on the left side), else on the far edge,
  // wherever every pill in it still clears everything else.
  for (const stack of new Set(pills.map((p) => p.stack))) {
    const group = pills.filter((p) => p.stack === stack);
    const side = group[0].side;
    if (group.length < 2 || (side !== "right" && side !== "left")) continue;
    const others = pills.filter((p) => p.stack !== stack).map((p) => p.rect);
    const starts = Math.min(...group.map((p) => p.rect.x));
    const ends = Math.max(...group.map((p) => p.rect.x + p.rect.w));
    const byStart = group.map((p) => ({ ...p.rect, x: starts }));
    const byEnd = group.map((p) => ({ ...p.rect, x: ends - p.rect.w }));
    for (const moved of side === "right" ? [byStart, byEnd] : [byEnd, byStart]) {
      if (!moved.every((r, i) => clearOf(r, others) && onSide(r, side, group[i].it))) continue;
      group.forEach((p, i) => (p.rect = moved[i]));
      break;
    }
  }

  return items.map((it) => {
    const p = pills.find((q) => q.it === it);
    return p ? { key: it.key, cx: it.cx, cy: it.cy, side: p.side, rect: p.rect } : { key: it.key, cx: it.cx, cy: it.cy, side: null };
  });
}

/** Where a pill's leader line meets it: the middle of the edge facing the pin. */
export function leaderEnd(c: Callout & { side: Side }): Pt {
  const { rect, side } = c;
  if (side === "right") return [rect.x, rect.y + rect.h / 2];
  if (side === "left") return [rect.x + rect.w, rect.y + rect.h / 2];
  const x = Math.max(rect.x + rect.h / 2, Math.min(c.cx, rect.x + rect.w - rect.h / 2));
  return [x, side === "above" ? rect.y + rect.h : rect.y];
}
