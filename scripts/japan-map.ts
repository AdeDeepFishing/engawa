/**
 * Builds components/home/japan-map-paths.ts, the prefecture outlines of the
 * home page map, from the @svg-maps/japan package (2.0.0, CC BY 4.0, by
 * Victor Cazanave, itself based on the MapSVG map of Japan, CC BY 4.0).
 *
 *   npm pack @svg-maps/japan@2.0.0 && tar xzf svg-maps-japan-2.0.0.tgz
 *   node --import=tsx scripts/japan-map.ts package/index.js
 *
 * The package is read as data, never imported or run. Each outline is
 * simplified (Ramer-Douglas-Peucker at SIMPLIFY units), islands smaller than
 * MIN_ISLAND square units are dropped, coordinates are rounded to one
 * decimal, and every prefecture gets a label point inside its largest
 * island for the board count badge. Okinawa is moved into a framed inset
 * in the empty sea at the top left and enlarged INSET.scale times, as
 * Japanese maps usually do, and the view box is cropped to the land: the
 * map gets about a quarter larger at the same width. The output stays far under the 80 KB
 * the brief allowed for the inline map.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SIMPLIFY = 0.45;
const MIN_ISLAND = 2;
const OUT = "components/home/japan-map-paths.ts";
/** Okinawa's move into the inset (its top left corner `from` lands on `to`, scaled), and the inset's frame (x, y, width, height), in map units. */
const INSET = { id: "okinawa", from: [0, 421], to: [104, 10], scale: 1.5 };
const FRAME = [98, 4, 201, 155] as const;
const MARGIN = 4;

type Pt = [number, number];

interface Source {
  viewBox: string;
  locations: { id: string; name: string; path: string }[];
}

/** The package's paths use only relative moveto (with implicit lineto) and closepath. */
function rings(d: string): Pt[][] {
  const out: Pt[][] = [];
  const tokens = d.match(/[mMzZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let ring: Pt[] | null = null;
  let cmd = "";
  let firstInCommand = false;
  for (let i = 0; i < tokens.length; ) {
    const tok = tokens[i];
    if (/[mMzZ]/.test(tok)) {
      cmd = tok;
      i++;
      if (cmd === "z" || cmd === "Z") {
        if (ring && ring.length > 2) out.push(ring);
        ring = null;
        cur = start;
      } else {
        firstInCommand = true;
      }
      continue;
    }
    const x = Number(tokens[i]);
    const y = Number(tokens[i + 1]);
    i += 2;
    const relative = cmd === "m";
    cur = relative ? [cur[0] + x, cur[1] + y] : [x, y];
    if (firstInCommand) {
      if (ring && ring.length > 2) out.push(ring);
      ring = [cur];
      start = cur;
      firstInCommand = false;
    } else {
      ring?.push(cur);
    }
  }
  if (ring && ring.length > 2) out.push(ring);
  return out;
}

function area(r: Pt[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function rdp(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  let max = 0;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, index + 1), tol).slice(0, -1), ...rdp(pts.slice(index), tol)];
}

/** A closed ring simplified: split at the point farthest from the first, so both halves keep their ends. */
function simplifyRing(r: Pt[], tol: number): Pt[] {
  let far = 0;
  let best = 0;
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = rdp(r.slice(0, far + 1), tol);
  const b = rdp([...r.slice(far), r[0]], tol);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

const round = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => {
  const s = String(round(n));
  return s.replace(/^(-?)0\./, "$1.");
};

function pathOf(rs: Pt[][]): string {
  let d = "";
  for (const r of rs) {
    const pts = r.map(([x, y]) => [round(x), round(y)] as Pt).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
    if (pts.length < 3) continue;
    d += `M${fmt(pts[0][0])} ${fmt(pts[0][1])}l`;
    const steps: string[] = [];
    for (let i = 1; i < pts.length; i++) steps.push(`${fmt(pts[i][0] - pts[i - 1][0])} ${fmt(pts[i][1] - pts[i - 1][1])}`);
    d += steps.join(" ").replace(/ -/g, "-") + "z";
  }
  return d;
}

function inside(p: Pt, r: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The centroid of the ring when it falls inside, else the middle of the widest inside span on its horizontal. */
function labelPoint(r: Pt[]): Pt {
  let cx = 0;
  let cy = 0;
  const a = area(r);
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  const c: Pt = [cx / (6 * a), cy / (6 * a)];
  if (inside(c, r)) return c;
  const xs: number[] = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > c[1] !== yj > c[1]) xs.push(((xj - xi) * (c[1] - yi)) / (yj - yi) + xi);
  }
  xs.sort((m, n) => m - n);
  let span: Pt = [c[0], c[0]];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > span[1] - span[0]) span = [xs[i], xs[i + 1]];
  return [(span[0] + span[1]) / 2, c[1]];
}

const file = process.argv[2];
if (!file) {
  console.error("usage: node --import=tsx scripts/japan-map.ts <@svg-maps/japan index.js>");
  process.exit(2);
}
const text = readFileSync(file, "utf8");
const source = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Source;
if (source.locations.length !== 47) throw new Error(`expected 47 prefectures, got ${source.locations.length}`);

const entries: string[] = [];
let points = 0;
const box = [Infinity, Infinity, -Infinity, -Infinity];
const [fx, fy, fw, fh] = FRAME;
for (const loc of [...source.locations].sort((a, b) => a.id.localeCompare(b.id))) {
  let all = rings(loc.path);
  if (loc.id === INSET.id) {
    all = all.map((r) =>
      r.map(([x, y]) => [INSET.to[0] + (x - INSET.from[0]) * INSET.scale, INSET.to[1] + (y - INSET.from[1]) * INSET.scale] as Pt),
    );
  }
  for (const r of all) {
    for (const [x, y] of r) {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
      const inFrame = x >= fx && x <= fx + fw && y >= fy && y <= fy + fh;
      if ((loc.id === INSET.id) !== inFrame) throw new Error(`${loc.id} crosses the inset frame at ${x},${y}`);
    }
  }
  const largest = all.reduce((m, r) => (Math.abs(area(r)) > Math.abs(area(m)) ? r : m), all[0]);
  const kept = all.filter((r) => r === largest || Math.abs(area(r)) >= MIN_ISLAND).map((r) => simplifyRing(r, SIMPLIFY));
  points += kept.reduce((n, r) => n + r.length, 0);
  const [lx, ly] = labelPoint(simplifyRing(largest, SIMPLIFY));
  entries.push(`  ${loc.id}: { label: [${fmt(lx)}, ${fmt(ly)}], d: "${pathOf(kept)}" },`);
}

const out = `// Generated by scripts/japan-map.ts. Do not edit by hand.
//
// Prefecture outlines from @svg-maps/japan 2.0.0 by Victor Cazanave
// (https://github.com/VictorCazanave/svg-maps), based on the MapSVG map of
// Japan (https://mapsvg.com/maps/japan), both under the Creative Commons
// Attribution 4.0 International licence
// (https://creativecommons.org/licenses/by/4.0/). Changes: outlines
// simplified, small islands dropped, coordinates rounded, a label point
// added per prefecture. The credit is on the about page (/about#credits),
// linked from under the home page map.

export const JAPAN_VIEWBOX = "${[box[0] - MARGIN, Math.min(box[1], fy) - MARGIN, box[2] - box[0] + 2 * MARGIN, box[3] - Math.min(box[1], fy) + 2 * MARGIN].map((n) => fmt(Math.floor(n))).join(" ")}";

/** Frame of the Okinawa inset (x, y, width, height), drawn as a thin rounded box. */
export const OKINAWA_INSET = [${FRAME.join(", ")}] as const;

/** Outline (one path, every island) and label point per prefecture, keyed by the package's id. */
export const PREFECTURE_SHAPES: Record<string, { label: [number, number]; d: string }> = {
${entries.join("\n")}
};
`;
writeFileSync(OUT, out);
console.log(`${OUT}: ${source.locations.length} prefectures, ${points} points, ${Buffer.byteLength(out)} bytes`);
