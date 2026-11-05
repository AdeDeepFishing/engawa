import { PREFECTURE_SHAPES } from "./japan-map-paths";

/*
 * Where the board count of each highlighted prefecture goes on the home page
 * map (components/home/JapanMap.tsx). Pure geometry in CSS pixels of the map
 * as drawn, so the 44 px targets and the 16 px text hold at every map width.
 *
 * A prefecture large enough for the badge (its disc plus a clearance from
 * the outline, measured at the prefecture's label point) gets the round
 * count badge there. Every other one gets a labelled pill ("東京都 2")
 * beside it, joined to its label point by a leader line: right, then left,
 * then above, then below, the first side where the pill stays inside the
 * map and clear of the badges, the other pills, the Okinawa inset and every
 * highlighted prefecture. A pill that meets another pill on the same side
 * stacks under it (over it, above the prefecture), a gap apart; where even
 * that is taken, it slides along the side before the next side is tried.
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
  code: string;
  /** The prefecture's label point, px. */
  cx: number;
  cy: number;
  /** Distance from the label point to the prefecture's outline, px. */
  room: number;
  /** Width of the prefecture's pill in the reader's language, px. */
  pillW: number;
}

export type Callout =
  | { code: string; kind: "badge"; cx: number; cy: number }
  | { code: string; kind: "pill"; cx: number; cy: number; side: Side; rect: Rect };

export interface CalloutSizes {
  /** The badge's disc, its clearance from the outline, and its square tap target. */
  disc: number;
  clear: number;
  hit: number;
  pillH: number;
  /** Between two stacked pills. */
  gap: number;
  /** From the label point to the near edge of a pill, and the least distance from it to a side pill's middle. */
  reach: number;
}

/** The outline's rings: generated paths are `M x y` then relative `l` pairs, closed by `z`. */
function ringsOf(d: string): Pt[][] {
  const rings: Pt[][] = [];
  const tokens = d.match(/[Mlz]|-?\d*\.?\d+/g) ?? [];
  let ring: Pt[] = [];
  let cmd = "";
  for (let i = 0; i < tokens.length; ) {
    const tok = tokens[i];
    if (tok === "M" || tok === "l" || tok === "z") {
      cmd = tok;
      i++;
      if (cmd === "z") {
        if (ring.length > 2) rings.push(ring);
        ring = [];
      }
      continue;
    }
    const x = Number(tokens[i]);
    const y = Number(tokens[i + 1]);
    i += 2;
    if (cmd === "M") {
      ring = [[x, y]];
    } else {
      const [px, py] = ring[ring.length - 1];
      ring.push([px + x, py + y]);
    }
  }
  return rings;
}

function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export interface ShapeInfo {
  /** Distance from the label point to the nearest edge of the outline, map units. */
  room: number;
  /** Bounding box of the largest island (x, y, width, height), map units. */
  box: [number, number, number, number];
}

const shapes = new Map<string, ShapeInfo>();

/** Room around a prefecture's label point and the box of its largest island, worked out once per prefecture. */
export function shapeInfo(id: string): ShapeInfo {
  const known = shapes.get(id);
  if (known) return known;
  const { label, d } = PREFECTURE_SHAPES[id];
  const rings = ringsOf(d);
  let room = Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) room = Math.min(room, distToSegment(label, r[i], r[(i + 1) % r.length]));
  }
  const main = rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
  const xs = main.map((p) => p[0]);
  const ys = main.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const info: ShapeInfo = { room, box: [x, y, Math.max(...xs) - x, Math.max(...ys) - y] };
  shapes.set(id, info);
  return info;
}

function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

/**
 * Badges and pills for `items`, returned in the order given (the map renders
 * them in that order, so it is also the tab order). `box` is the map's size,
 * `inset` the rectangles nothing may cover (the Okinawa inset), `prefectures`
 * the boxes of the highlighted prefectures, which a pill may not cover either.
 */
export function placeCallouts(
  items: CalloutItem[],
  box: { w: number; h: number },
  s: CalloutSizes,
  inset: Rect[],
  prefectures: Rect[],
): Callout[] {
  const out = new Map<string, Callout>();
  const badges: Rect[] = [];
  /** Placed pills; `stack` is shared by pills stacked on one another. */
  const pills: { side: Side; rect: Rect; it: CalloutItem; stack: number }[] = [];
  let stackOf = -1;
  const north = [...items].sort((a, b) => a.cy - b.cy);

  const square = (it: CalloutItem): Rect => ({ x: it.cx - s.hit / 2, y: it.cy - s.hit / 2, w: s.hit, h: s.hit });
  const looseBadge = (r: Rect) => ![...inset, ...badges].some((o) => overlaps(o, r));

  for (const it of north) {
    const r = square(it);
    if (it.room >= s.disc / 2 + s.clear && looseBadge(r)) {
      out.set(it.code, { code: it.code, kind: "badge", cx: it.cx, cy: it.cy });
      badges.push(r);
    }
  }

  // A pill pulled back inside the map, or stacked under another, may reach
  // back past the label point, as long as its middle stays on its side.
  const onSide = (rect: Rect, side: Side, it: CalloutItem) =>
    side === "right" ? rect.x + rect.w / 2 >= it.cx + s.reach : side === "left" ? rect.x + rect.w / 2 <= it.cx - s.reach : true;
  const clearOf = (rect: Rect, others: Rect[]) =>
    rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= box.w && rect.y + rect.h <= box.h && ![...inset, ...prefectures, ...badges, ...others].some((o) => overlaps(o, rect));

  function trySide(it: CalloutItem, side: Side): Rect | null {
    stackOf = -1;
    const w = it.pillW;
    const h = s.pillH;
    let rect: Rect =
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
    for (let guard = 0; guard < items.length; guard++) {
      const q = pills.find((p) => p.side === side && overlaps(p.rect, rect, s.gap - 0.5));
      if (!q) break;
      const y = side === "above" ? q.rect.y - s.gap - h : q.rect.y + q.rect.h + s.gap;
      let x = rect.x;
      if (side === "right" && q.rect.x + w <= box.w) x = q.rect.x;
      if (side === "left" && q.rect.x + q.rect.w - w >= 0) x = q.rect.x + q.rect.w - w;
      rect = { x, y, w, h };
      stackOf = q.stack;
    }
    // Where that is taken, slide along the side, half a pill at a time, nearer first.
    const step = (h + s.gap) / 2;
    for (let k = 0; k <= 8; k++) {
      const d = Math.ceil(k / 2) * step * (k % 2 ? 1 : -1);
      const along: Rect =
        side === "right" || side === "left"
          ? { ...rect, y: rect.y + d }
          : { ...rect, x: Math.max(0, Math.min(rect.x + d, box.w - w)) };
      if (onSide(along, side, it) && clearOf(along, []) && !pills.some((p) => overlaps(p.rect, along, s.gap - 0.5))) return along;
    }
    return null;
  }

  for (const it of north) {
    if (out.has(it.code)) continue;
    let placed = false;
    for (const side of SIDES) {
      const rect = trySide(it, side);
      if (!rect) continue;
      pills.push({ side, rect, it, stack: stackOf >= 0 ? stackOf : pills.length });
      placed = true;
      break;
    }
    // Nowhere free on any side: the badge at the label point, which still works as a button.
    if (!placed) {
      out.set(it.code, { code: it.code, kind: "badge", cx: it.cx, cy: it.cy });
      badges.push(square(it));
    }
  }

  // Line up each stack: on the edge facing the prefectures (the left edge on
  // the right side, the right edge on the left side), else on the far edge,
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
  for (const p of pills) out.set(p.it.code, { code: p.it.code, kind: "pill", cx: p.it.cx, cy: p.it.cy, side: p.side, rect: p.rect });

  return items.map((it) => out.get(it.code) as Callout);
}

/** Where a pill's leader line meets it: the middle of the edge facing the label point. */
export function leaderEnd(c: Extract<Callout, { kind: "pill" }>): Pt {
  const { rect, side } = c;
  if (side === "right") return [rect.x, rect.y + rect.h / 2];
  if (side === "left") return [rect.x + rect.w, rect.y + rect.h / 2];
  const x = Math.max(rect.x + rect.h / 2, Math.min(c.cx, rect.x + rect.w - rect.h / 2));
  return [x, side === "above" ? rect.y + rect.h : rect.y];
}
