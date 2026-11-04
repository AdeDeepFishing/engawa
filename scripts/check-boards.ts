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

// A board must never carry another board's polygons to the browser.
const [first, second] = seed.boards.map((b) => ({ ...b, id: `local-${b.slug}` }) as unknown as Board);
if (first && second) {
  const codes = (b: Board) => new Set(boardPolygons(b).map((p) => p.properties.area_code));
  const a = codes(first);
  check(`${first.slug} and ${second.slug} share no polygon`, ![...codes(second)].some((c) => a.has(c)));
}

console.log(`\n${passed} of ${passed + failed.length} checks pass`);
if (failed.length) process.exit(1);
