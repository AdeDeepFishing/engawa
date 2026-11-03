/**
 * Point-in-polygon for the board's area polygons. Runs in the browser so a
 * position never has to leave the phone: the caller passes longitude and
 * latitude in and gets an area back, and nothing here stores or logs them.
 */

export interface AreaProperties {
  /** e-Stat small-area code, for example 14133301003. */
  area_code: string;
  /** 町丁目 name as spelled in the board's area_names. */
  name_ja: string;
}

export type AreaGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface AreaFeature {
  type: "Feature";
  properties: AreaProperties;
  geometry: AreaGeometry;
}

/** Ray casting (Jordan curve): is the point inside this ring? Edges count as inside or outside by chance, which is fine at 町丁目 size. */
export function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** GeoJSON polygon: the first ring is the outline, any others are holes. */
export function pointInPolygon(lon: number, lat: number, polygon: number[][][]): boolean {
  if (polygon.length === 0 || !pointInRing(lon, lat, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lon, lat, polygon[i])) return false;
  }
  return true;
}

export function pointInFeature(lon: number, lat: number, feature: AreaFeature): boolean {
  const g = feature.geometry;
  if (g.type === "Polygon") return pointInPolygon(lon, lat, g.coordinates);
  return g.coordinates.some((polygon) => pointInPolygon(lon, lat, polygon));
}

/** The first feature containing the point, or null when none does (outside the board, or bad input). */
export function pointInArea(lon: number, lat: number, features: AreaFeature[]): AreaFeature | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return features.find((f) => pointInFeature(lon, lat, f)) ?? null;
}
