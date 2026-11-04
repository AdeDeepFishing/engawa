/**
 * Board areas (町丁目) and their polygons. The polygon files are built by
 * scripts/geo/build.ts from e-Stat boundaries and bundled here; one board is
 * a few KB. The same module serves the browser (resolve a position to an
 * area, show an area name) and the server (check a submitted code).
 */
import musashikosugi from "./musashikosugi.json";
import { pointInArea, type AreaFeature } from "./pointInArea";
import type { Board } from "@/lib/types";

export type { AreaFeature } from "./pointInArea";

export interface BoardArea {
  code: string;
  name_ja: string;
}

type AreaSource = Pick<Board, "area_names">;

const BUNDLED: AreaFeature[] = [...(musashikosugi.features as unknown as AreaFeature[])];
const polygonByCode = new Map(BUNDLED.map((f) => [f.properties.area_code, f]));
const codeByName = new Map(BUNDLED.map((f) => [f.properties.name_ja, f.properties.area_code]));

/**
 * The board's areas with a code. A seed row written before the polygons
 * existed has `code: null`; then the bundled polygon with the same name
 * supplies it, so the board works before and after `pnpm db:seed` refreshes
 * the row. Names with neither are left out.
 */
export function boardAreas(board: AreaSource): BoardArea[] {
  const out: BoardArea[] = [];
  for (const entry of board.area_names ?? []) {
    const code = entry.code ?? codeByName.get(entry.name_ja) ?? null;
    if (code && !out.some((a) => a.code === code)) out.push({ code, name_ja: entry.name_ja });
  }
  return out;
}

/** True when `code` is one of this board's area codes. Anything else is dropped by the server. */
export function isBoardAreaCode(board: AreaSource, code: unknown): code is string {
  return typeof code === "string" && boardAreas(board).some((a) => a.code === code);
}

/** 町丁目 name for a code on this board, or null when the board does not list it. Names stay Japanese in every UI language. */
export function areaName(board: AreaSource, code: string | null | undefined): string | null {
  if (!code) return null;
  return boardAreas(board).find((a) => a.code === code)?.name_ja ?? null;
}

/** Polygons for the board's areas, only those the bundle has geometry for. */
export function boardPolygons(board: AreaSource): AreaFeature[] {
  return boardAreas(board)
    .map((a) => polygonByCode.get(a.code))
    .filter((f): f is AreaFeature => Boolean(f));
}

/** Browser side: the board area containing a position, or null when it is outside every polygon. The coordinates are used here and nowhere else. */
export function resolveArea(board: AreaSource, lon: number, lat: number): BoardArea | null {
  const hit = pointInArea(lon, lat, boardPolygons(board));
  if (!hit) return null;
  return { code: hit.properties.area_code, name_ja: areaName(board, hit.properties.area_code) ?? hit.properties.name_ja };
}

/**
 * Japanese municipality names by the first five digits of an e-Stat area
 * code, which are the JIS code of the city and ward (14 Kanagawa, 133
 * 川崎市中原区). One line per ward that has a board.
 */
const MUNICIPALITY_JA: Record<string, string> = {
  "14133": "川崎市中原区",
};

/**
 * The city and ward of the board, read from its area codes: "川崎市中原区".
 * Null when the board lists no code the table knows. Used to make a place
 * name unambiguous outside the board, for example in a map search.
 */
export function boardMunicipality(board: AreaSource): string | null {
  for (const area of boardAreas(board)) {
    const name = MUNICIPALITY_JA[area.code.slice(0, 5)];
    if (name) return name;
  }
  return null;
}
