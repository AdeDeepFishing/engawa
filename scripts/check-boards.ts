/**
 * Checks every board in supabase/seed/boards.json against its bundled
 * polygons (N18), without a database: each area has a code and a polygon,
 * the codes name one city and ward the municipality table knows, the home
 * page map would light the right prefecture, a known point resolves to the
 * expected 町丁目, and a row seeded before the polygons (`code: null`) gets
 * its codes back on read. Run it after adding a board (docs/BOARDS.md).
 *
 *   node --import=tsx scripts/check-boards.ts
 *
 * Exits 1 when a check fails.
 */
import seed from "../supabase/seed/boards.json";
import { boardAreas, boardMunicipality, resolveArea } from "../lib/geo";
import { boardPolygons, withAreaCodes } from "../lib/geo/polygons";
import { prefectureOfBoard } from "../components/home/prefectures";
import type { Board } from "../lib/types";

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
  check(`${board.slug}: home page map lights prefecture ${expect.prefecture}`, pref === expect.prefecture, String(pref));

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
}

// Boards never overlap: a board must never carry another board's polygons to
// the browser, and each board's landmark falls in no other board.
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

console.log(`\n${passed} of ${passed + failed.length} checks pass`);
if (failed.length) process.exit(1);
