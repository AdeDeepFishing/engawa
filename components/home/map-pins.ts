import { PREFECTURE_SHAPES } from "./japan-map-paths";

/*
 * Boards as pins on the home page map: a board's position (the centroid of
 * its 町丁目 polygons, worked out on the server) projected into the map's
 * view box, and boards close together on the map grouped into one pin.
 * Pure and shared by the home page (server render) and
 * scripts/check-boards.ts.
 */

/**
 * Longitude and latitude to map units. The outlines (japan-map-paths.ts)
 * turned out to be a Mercator map, so x and y are affine in longitude and
 * in the Mercator y of the latitude (in degrees). The six constants are a
 * least squares fit, done once, of nine capes at the extremes of their
 * prefecture's main island against the matching extreme point of the
 * outline: 宗谷岬 (north of 北海道), 納沙布岬 (east), 白神岬 (south), 大間崎
 * (north of 青森県), 魹ヶ埼 (east of 岩手県), 犬吠埼 (east of 千葉県), 潮岬
 * (south of 和歌山県), 足摺岬 (south of 高知県) and 佐多岬 (south of
 * 鹿児島県). The fit is within 0.15 units at every cape (0.08 RMS); a plain
 * latitude fit missed by up to 3.7 units. scripts/check-boards.ts repeats
 * the nine capes, so a regenerated outline file that no longer matches
 * fails there. Okinawa lives in the inset, moved and scaled, so a board
 * there would need the inset's own transform.
 */
const FIT = {
  x: [19.71006, -0.00433, -2436.9017],
  y: [-0.01659, -19.6121, 1007.67397],
} as const;

function mercatorDegrees(lat: number): number {
  return (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
}

/** A position in map units, rounded to a tenth. */
export function projectToMap(lon: number, lat: number): [number, number] {
  const m = mercatorDegrees(lat);
  const x = FIT.x[0] * lon + FIT.x[1] * m + FIT.x[2];
  const y = FIT.y[0] * lon + FIT.y[1] * m + FIT.y[2];
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

/**
 * Boards closer than this on the map (map units, about 0.7 degrees) share
 * one pin, so no two pins sit on top of each other, as long as they are in
 * the same prefecture: the four Kanto boards are within 3 units of each
 * other, and one pin for all four would need a label too long for a phone.
 */
export const GROUP_RADIUS = 14;

/** One pin: its boards (in the order given, the order of the cards) and its position in map units. */
export interface MapPin {
  slugs: string[];
  x: number;
  y: number;
}

/**
 * Pins for the boards that have a position: single linkage within
 * GROUP_RADIUS inside each prefecture, each pin at the mean of its boards,
 * ordered north to south (then west to east), which is the tab order.
 */
export function groupPins(boards: { slug: string; prefecture: string | null; pin: [number, number] | null }[]): MapPin[] {
  const placed = boards.filter((b): b is typeof b & { pin: [number, number] } => b.pin !== null);
  const group = placed.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [a, b] = [placed[i], placed[j]];
      if (a.prefecture === b.prefecture && Math.hypot(a.pin[0] - b.pin[0], a.pin[1] - b.pin[1]) < GROUP_RADIUS) {
        group[root(j)] = root(i);
      }
    }
  }
  const pins = new Map<number, typeof placed>();
  placed.forEach((b, i) => pins.set(root(i), [...(pins.get(root(i)) ?? []), b]));
  return [...pins.values()]
    .map((members) => ({
      slugs: members.map((b) => b.slug),
      x: Math.round((members.reduce((s, b) => s + b.pin[0], 0) / members.length) * 10) / 10,
      y: Math.round((members.reduce((s, b) => s + b.pin[1], 0) / members.length) * 10) / 10,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

type Pt = [number, number];

/** The outline's rings: generated paths are `M x y` then relative `l` pairs, closed by `z`. */
export function ringsOf(d: string): Pt[][] {
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

/** True when the map point lies on the prefecture's outline (any of its islands), by ray casting. */
export function pointInPrefecture(id: string, x: number, y: number): boolean {
  return ringsOf(PREFECTURE_SHAPES[id].d).some((r) => {
    let hit = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  });
}
