/**
 * Checks every board in supabase/seed/boards.json against its bundled
 * polygons (N18), without a database: each area has a code and a polygon,
 * the codes name one city and ward the municipality table knows, the home
 * page map would light the right prefecture, a known point resolves to the
 * expected 町丁目, and a row seeded before the polygons (`code: null`) gets
 * its codes back on read. On the home page map, each board's pin (the
 * centroid of its polygons, projected) lands on its own prefecture and next
 * to its landmark, and the projection still meets the nine capes it was
 * fitted to. Every area has its name in English, Chinese, Korean and
 * Vietnamese in the right form, the home card folds them into towns the
 * same way in every language, and the badge and drop-in line render them
 * with the Japanese after. Run it after adding a board (docs/BOARDS.md).
 *
 *   node --import=tsx scripts/check-boards.ts
 *
 * Exits 1 when a check fails.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import seed from "../supabase/seed/boards.json";
import { WithAreaName } from "../components/board/AreaName";
import { areaName, areaParts, townName, townsOf } from "../lib/cards/display";
import { boardAreas, boardMunicipality, resolveArea } from "../lib/geo";
import { LANGS, type Lang } from "../lib/i18n";
import { areaNameProblems } from "./area-name-rules";
import { boardPolygons, centroidOf, withAreaCodes } from "../lib/geo/polygons";
import { PREFECTURES, prefectureOfBoard } from "../components/home/prefectures";
import { PREFECTURE_SHAPES } from "../components/home/japan-map-paths";
import { pointInPrefecture, projectToMap, ringsOf } from "../components/home/map-pins";
import type { Board, BoardAreaName } from "../lib/types";

let passed = 0;
const failed: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passed++;
  else failed.push(name);
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

/** Per board: the prefecture, the city and ward, and one public landmark that must fall in a given 町丁目. */
const EXPECT: Record<string, { prefecture: string; municipality: string; point: { label: string; lat: number; lon: number; area: string } }> = {
  mizonokuchi: {
    prefecture: "14",
    municipality: "川崎市高津区",
    point: { label: "溝の口駅 (JR 武蔵溝ノ口 and 東急 溝の口)", lat: 35.5996, lon: 139.6106, area: "溝口1丁目" },
  },
  ueno: {
    prefecture: "13",
    municipality: "東京都台東区",
    point: { label: "上野駅 (JR East gives 上野7丁目)", lat: 35.7141, lon: 139.7774, area: "上野7丁目" },
  },
  musashikosugi: {
    prefecture: "14",
    municipality: "川崎市中原区",
    point: { label: "中原区役所 (小杉町3-245)", lat: 35.5763, lon: 139.6566, area: "小杉町3丁目" },
  },
  shibuya: {
    prefecture: "13",
    municipality: "東京都渋谷区",
    point: { label: "渋谷駅 ハチ公口, ハチ公前広場 is 道玄坂2丁目", lat: 35.659, lon: 139.7005, area: "道玄坂2丁目" },
  },
  sapporo: {
    prefecture: "01",
    municipality: "札幌市中央区",
    point: { label: "大通駅, under 大通公園 西2丁目", lat: 43.0607, lon: 141.3538, area: "大通西2丁目" },
  },
  hakata: {
    prefecture: "40",
    municipality: "福岡市博多区",
    point: { label: "博多駅, the station building is 博多駅中央街", lat: 33.5897, lon: 130.4207, area: "博多駅中央街" },
  },
};

for (const raw of seed.boards) {
  const board = { ...raw, id: `local-${raw.slug}` } as unknown as Board;
  const expect = EXPECT[board.slug];
  console.log(`\n# ${board.slug}`);
  check(`${board.slug}: expectations written in this script`, Boolean(expect));
  if (!expect) continue;

  const areas = boardAreas(board);
  const polygons = boardPolygons(board);
  check(`${board.slug}: every area has a code`, areas.length === board.area_names.length, `${areas.length} of ${board.area_names.length}`);
  check(`${board.slug}: every area has a polygon`, polygons.length === areas.length, `${polygons.length} polygons`);
  check(
    `${board.slug}: polygons carry the seed's names`,
    polygons.every((p) => areas.find((a) => a.code === p.properties.area_code)?.name_ja === p.properties.name_ja),
  );
  check(`${board.slug}: one city and ward`, new Set(areas.map((a) => a.code.slice(0, 5))).size === 1);
  check(`${board.slug}: municipality ${expect.municipality}`, boardMunicipality(board) === expect.municipality, String(boardMunicipality(board)));
  const pref = prefectureOfBoard(board.area_names);
  check(`${board.slug}: prefecture ${expect.prefecture}`, pref === expect.prefecture, String(pref));
  const centre = centroidOf(polygons);
  const pin = centre ? projectToMap(centre[0], centre[1]) : null;
  const prefId = PREFECTURES.find((p) => p.code === expect.prefecture)?.id ?? "";
  // The outlines are simplified at 0.45 units: a board on a prefecture border
  // (Kawasaki on the Tama) may fall in the gap between two outlines.
  const [px, py] = pin ?? [NaN, NaN];
  const onOwn =
    pointInPrefecture(prefId, px, py) ||
    (outlineDistance(prefId, [px, py]) < 0.5 && !PREFECTURES.some((p) => p.id !== prefId && pointInPrefecture(p.id, px, py)));
  check(`${board.slug}: map pin on ${prefId}`, Boolean(pin) && onOwn, `${px}, ${py}, ${outlineDistance(prefId, [px, py]).toFixed(2)} from its outline`);
  const landmark = projectToMap(expect.point.lon, expect.point.lat);
  const fromLandmark = Math.hypot(px - landmark[0], py - landmark[1]);
  check(`${board.slug}: map pin within 1 unit of ${expect.point.label.split(/[ ,]/)[0]}`, fromLandmark < 1, fromLandmark.toFixed(2));

  const { label, lat, lon, area } = expect.point;
  const hit = resolveArea(board, polygons, lon, lat);
  check(`${board.slug}: ${label} (${lat}, ${lon}) resolves to ${area}`, hit?.name_ja === area, hit ? `${hit.code} ${hit.name_ja}` : "outside");
  check(`${board.slug}: a point far away resolves to nothing`, resolveArea(board, polygons, 135.5, 34.7) === null);
  // The live pilot row was seeded before the polygons: codes are null there.
  const legacy = { ...board, area_names: board.area_names.map((a) => ({ ...a, code: null })) };
  const filled = withAreaCodes(legacy);
  check(
    `${board.slug}: a row without codes gets them back on read`,
    filled.area_names.every((a, i) => a.code === board.area_names[i].code),
  );
  const copy = withAreaCodes({ ...legacy, slug: `accept-${board.slug}` });
  check(`${board.slug}: a throwaway copy under another slug finds the same polygons`, boardPolygons(copy).length === polygons.length);

  const ids = board.known_places.map((p) => p.id);
  check(`${board.slug}: known place ids are unique`, new Set(ids).size === ids.length);

  // Localized area names (scripts/area-names.ts): four per area, each in its
  // own script, and on the home card every 丁目 of a town folds to one town.
  const nameProblems = board.area_names.flatMap((a) => areaNameProblems(a).map((p) => `${a.name_ja} ${p}`));
  check(`${board.slug}: every area has en, zh, ko and vi in their form`, nameProblems.length === 0, nameProblems.slice(0, 3).join("; "));
  const split: string[] = [];
  for (const lang of LANGS) {
    const seen = new Map<string, string>();
    for (const a of board.area_names) {
      const ja = townName(a, "ja").text;
      const town = townName(a, lang).text;
      if ((seen.get(ja) ?? town) !== town || /chome|초메|丁目/u.test(town)) split.push(`${ja} in ${lang}: ${town}`);
      if (!seen.has(ja)) seen.set(ja, town);
    }
  }
  check(`${board.slug}: every 丁目 of a town folds to one town name in five languages`, split.length === 0, split.slice(0, 3).join("; "));
  const resolved = hit ? areaName(hit, "ko") : null;
  check(
    `${board.slug}: the landmark's area reads in Korean with the Japanese after it`,
    Boolean(resolved && resolved.ja === area && resolved.text !== area),
    resolved ? `${resolved.text} (${resolved.ja})` : "outside",
  );
}

console.log("\n# across boards");
const all = seed.boards.map((b) => ({ ...b, id: `local-${b.slug}` }) as unknown as Board);
const codes = (b: Board) => new Set(boardPolygons(b).map((p) => p.properties.area_code));
for (const [i, board] of all.entries()) {
  const own = codes(board);
  for (const other of all.slice(i + 1)) {
    check(`${board.slug} and ${other.slug} share no polygon`, ![...codes(other)].some((c) => own.has(c)));
  }
  const point = EXPECT[board.slug]?.point;
  if (!point) continue;
  const elsewhere = all.filter((other) => other !== board && resolveArea(other, boardPolygons(other), point.lon, point.lat));
  check(`${board.slug}: ${point.label} falls in no other board`, elsewhere.length === 0, elsewhere.map((b) => b.slug).join(", "));
}

// The two renderers of an area name, on the server: the card badge in
// Vietnamese and the drop-in line in Korean, Japanese in parentheses with
// lang="ja"; a Japanese reader gets the Japanese alone; a row seeded before
// the names falls back to the Japanese, marked as such.
console.log("\n# area names as rendered");
{
  const pilot = all.find((b) => b.slug === "musashikosugi") as Board;
  const kosugi = pilot.area_names.find((a) => a.name_ja === "小杉町2丁目") as BoardAreaName;
  const card = { area_code: kosugi.code };
  const render = (lang: Lang, message: "area.badge" | "area.resolved", area = areaParts(card, pilot, lang)) =>
    area ? renderToStaticMarkup(createElement(WithAreaName, { message, name: area, lang })) : "";
  const badgeVi = render("vi", "area.badge");
  console.log(`  card badge, vi:     ${badgeVi}`);
  check("card badge in Vietnamese", badgeVi === 'Khu vực tự khai: <span>Kosugi-machi 2-chome</span> <span lang="ja">(小杉町2丁目)</span>');
  const dropKo = render("ko", "area.resolved");
  console.log(`  drop-in line, ko:   ${dropKo}`);
  check("drop-in line in Korean", dropKo === '내 구역: <span>고스기마치 2초메</span> <span lang="ja">(小杉町2丁目)</span>');
  const badgeJa = render("ja", "area.badge");
  check("card badge in Japanese has the Japanese alone", badgeJa === "自己申告のエリア：<span>小杉町2丁目</span>", badgeJa);
  const legacy = render("en", "area.badge", areaName({ name_ja: kosugi.name_ja }, "en"));
  check("a row without names shows the Japanese, marked", legacy === 'Self-reported area: <span lang="ja">小杉町2丁目</span>', legacy);
  const homeKo = townsOf(all.find((b) => b.slug === "ueno")?.area_names ?? [], "ko").map((t) => t.text);
  console.log(`  home card towns, ueno, ko: ${homeKo.join(", ")}`);
  check("home card towns in Korean, folded", homeKo.slice(0, 3).join(",") === "우에노,히가시우에노,우에노코엔" && homeKo.length === 5);
}

// Boards never overlap: a board must never carry another board's polygons to
// the browser, and each board's landmark falls in no other board.
// The projection (components/home/map-pins.ts) against the capes it was
// fitted to: each cape must land on the matching extreme point of its
// prefecture's main island in the outline file.
console.log("\n# home page map projection");
const CAPES: [string, string, "N" | "S" | "E", number, number][] = [
  ["宗谷岬", "hokkaido", "N", 45.5225, 141.9364],
  ["納沙布岬", "hokkaido", "E", 43.3853, 145.8172],
  ["白神岬", "hokkaido", "S", 41.3986, 140.1972],
  ["大間崎", "aomori", "N", 41.5464, 140.9128],
  ["魹ヶ埼", "iwate", "E", 39.5467, 142.0717],
  ["犬吠埼", "chiba", "E", 35.7076, 140.8689],
  ["潮岬", "wakayama", "S", 33.4336, 135.7625],
  ["足摺岬", "kochi", "S", 32.7244, 133.0181],
  ["佐多岬", "kagoshima", "S", 30.9944, 130.6614],
];
for (const [name, id, side, lat, lon] of CAPES) {
  const island = ringsOf(PREFECTURE_SHAPES[id].d).reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
  const tip = island.reduce((a, b) => (side === "N" ? (b[1] < a[1] ? b : a) : side === "S" ? (b[1] > a[1] ? b : a) : b[0] > a[0] ? b : a));
  const p = projectToMap(lon, lat);
  const off = Math.hypot(p[0] - tip[0], p[1] - tip[1]);
  check(`${name} lands on the ${side} tip of ${id}`, off < 0.5, `${off.toFixed(2)} units`);
}

function ringArea(r: number[][]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) a += r[i][0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * r[i][1];
  return Math.abs(a / 2);
}

/** Distance from a map point to the nearest edge of a prefecture's outline, map units. */
function outlineDistance(id: string, p: [number, number]): number {
  let best = Infinity;
  for (const r of ringsOf(PREFECTURE_SHAPES[id].d)) {
    for (let i = 0; i < r.length; i++) {
      const [a, b] = [r[i], r[(i + 1) % r.length]];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
  }
  return best;
}

console.log(`\n${passed} of ${passed + failed.length} checks pass`);
if (failed.length) process.exit(1);
