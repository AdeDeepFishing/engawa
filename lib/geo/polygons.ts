/**
 * Every board's 町丁目 polygons, built by scripts/geo/build.ts from e-Stat
 * boundaries, one file per board slug. Server only: the board page hands
 * the browser the polygons of its own board as a prop, so a page never
 * ships another board's areas. A new board adds one import and one line in
 * BY_SLUG once lib/geo/<slug>.json exists.
 */
import mizonokuchi from "./mizonokuchi.json";
import ueno from "./ueno.json";
import musashikosugi from "./musashikosugi.json";
import shibuya from "./shibuya.json";
import sapporo from "./sapporo.json";
import hakata from "./hakata.json";
import type { AreaFeature } from "./pointInArea";
import type { Board } from "@/lib/types";

const BY_SLUG: Record<string, AreaFeature[]> = {
  mizonokuchi: mizonokuchi.features as unknown as AreaFeature[],
  ueno: ueno.features as unknown as AreaFeature[],
  musashikosugi: musashikosugi.features as unknown as AreaFeature[],
  shibuya: shibuya.features as unknown as AreaFeature[],
  sapporo: sapporo.features as unknown as AreaFeature[],
  hakata: hakata.features as unknown as AreaFeature[],
};

/** By code across every board, so a throwaway copy of a board (another slug, same codes) finds its polygons too. */
const polygonByCode = new Map(Object.values(BY_SLUG).flatMap((features) => features.map((f) => [f.properties.area_code, f] as const)));

type PolygonSource = Pick<Board, "slug" | "area_names">;

/** Polygons for the board's areas with a code, only those the bundle has geometry for. */
export function boardPolygons(board: PolygonSource): AreaFeature[] {
  return (board.area_names ?? [])
    .map((a) => (a.code ? polygonByCode.get(a.code) : undefined))
    .filter((f): f is AreaFeature => Boolean(f));
}

/** 町丁目 name to code: the board's own file first (names repeat across cities), then every file, first one wins. */
function codeForName(slug: string, name: string): string | null {
  const own = BY_SLUG[slug]?.find((f) => f.properties.name_ja === name);
  if (own) return own.properties.area_code;
  for (const features of Object.values(BY_SLUG)) {
    const hit = features.find((f) => f.properties.name_ja === name);
    if (hit) return hit.properties.area_code;
  }
  return null;
}

/**
 * The board with a code on every area the bundle knows. A row seeded before
 * the polygons existed has `code: null` (the live pilot row); the bundled
 * polygon with the same name supplies it, so the board works before and
 * after `pnpm db:seed` refreshes the row. Applied to every board read in
 * lib/db/boards.ts, so the browser and lib/geo/index.ts only ever see codes.
 */
export function withAreaCodes<B extends PolygonSource>(board: B): B {
  if (!board.area_names?.some((a) => !a.code)) return board;
  return {
    ...board,
    area_names: board.area_names.map((a) => (a.code ? a : { ...a, code: codeForName(board.slug, a.name_ja) })),
  };
}

/**
 * The area-weighted centroid of the polygons (outlines only), as longitude
 * and latitude, or null for none. Plane geometry on degrees, which is
 * exact enough over a few 町丁目. The home page map puts the board's pin here.
 */
export function centroidOf(features: AreaFeature[]): [number, number] | null {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (const f of features) {
    const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const [ring] of polygons) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        area += cross;
        cx += (ring[j][0] + ring[i][0]) * cross;
        cy += (ring[j][1] + ring[i][1]) * cross;
      }
    }
  }
  return area ? [cx / (3 * area), cy / (3 * area)] : null;
}
