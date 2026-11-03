/**
 * Builds lib/geo/<board slug>.json, the simplified 町丁目 polygons the browser
 * uses to turn a position into an area code, from e-Stat small-area
 * boundaries (2020 census, survey A002005212020). The raw shapefile stays
 * out of git; scripts/geo/README.md says where to download it.
 *
 *   node --import=tsx scripts/geo/build.ts <path to r2ka14133.shp> [options]
 *
 *   --board <slug>     board in supabase/seed/boards.json (default musashikosugi)
 *   --simplify <pct>   mapshaper simplification, default 30%
 *   --write-seed       also fill area_names[].code in supabase/seed/boards.json
 *
 * Needs npx (mapshaper is fetched on demand). Output: one Feature per area
 * with properties {area_code, name_ja}, name_ja spelled as in the seed.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import boardsSeed from "../../supabase/seed/boards.json";

const MAPSHAPER = "mapshaper@0.7.101";
const PRECISION = "0.00001"; // about one metre at this latitude

const argv = process.argv.slice(2);
const shpPath = argv.find((a) => !a.startsWith("--"));
const option = (name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const slug = option("--board", "musashikosugi");
const simplify = option("--simplify", "30%");
const writeSeed = argv.includes("--write-seed");

if (!shpPath) {
  console.error("usage: node --import=tsx scripts/geo/build.ts <path to r2ka14133.shp> [--board slug] [--simplify 30%] [--write-seed]");
  process.exit(1);
}

const KANJI_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** e-Stat spells 丁目 with kanji numerals (小杉町三丁目); the seed uses 小杉町3丁目. */
export function normalizeAreaName(name: string): string {
  return name.trim().replace(/([一二三四五六七八九]?)(十?)([一二三四五六七八九]?)丁目$/, (m, tens, ten, ones) => {
    if (!tens && !ten && !ones) return m;
    const n = (ten ? (tens ? KANJI_DIGITS[tens] : 1) * 10 : KANJI_DIGITS[tens] ?? 0) + (ones ? KANJI_DIGITS[ones] : 0);
    return `${n}丁目`;
  });
}

interface EstatRecord {
  KEY_CODE: string;
  S_NAME: string;
}

interface Feature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

function run(args: string[]): void {
  const res = spawnSync("npx", ["--yes", MAPSHAPER, ...args], { stdio: "inherit" });
  if (res.status !== 0) throw new Error(`mapshaper failed: ${args.join(" ")}`);
}

function main() {
  const board = boardsSeed.boards.find((b) => b.slug === slug);
  if (!board) throw new Error(`board ${slug} is not in supabase/seed/boards.json`);
  const shp = resolve(shpPath as string);
  const work = mkdtempSync(join(tmpdir(), "engawa-geo-"));
  try {
    // 1. Attributes only: match the seed's area names to e-Stat records.
    const attrsPath = join(work, "attrs.json");
    run([shp, "-filter-fields", "KEY_CODE,S_NAME", "-o", attrsPath, "format=json"]);
    const records = JSON.parse(readFileSync(attrsPath, "utf8")) as EstatRecord[];
    const byName = new Map<string, EstatRecord[]>();
    for (const r of records) {
      const key = normalizeAreaName(r.S_NAME);
      byName.set(key, [...(byName.get(key) ?? []), r]);
    }
    const matched: { name_ja: string; code: string }[] = [];
    const missing: string[] = [];
    for (const area of board.area_names) {
      const hits = byName.get(normalizeAreaName(area.name_ja)) ?? [];
      if (hits.length === 0) {
        missing.push(area.name_ja);
        continue;
      }
      if (hits.length > 1) console.warn(`${area.name_ja}: ${hits.length} records, keeping all (${hits.map((h) => h.KEY_CODE).join(", ")})`);
      for (const h of hits) matched.push({ name_ja: area.name_ja, code: h.KEY_CODE });
    }
    if (missing.length) console.warn(`not in the shapefile: ${missing.join(", ")}`);
    if (matched.length === 0) throw new Error("no area matched");

    // 2. Geometry: keep only those records, simplify, round coordinates.
    const codes = JSON.stringify(matched.map((m) => m.code));
    const geoPath = join(work, "areas.json");
    run([
      shp,
      "-filter", `${codes}.indexOf(KEY_CODE) >= 0`,
      "-filter-fields", "KEY_CODE",
      "-simplify", simplify, "keep-shapes",
      "-o", geoPath, "format=geojson", `precision=${PRECISION}`,
    ]);
    const geo = JSON.parse(readFileSync(geoPath, "utf8")) as { features: Feature[] };
    const byCode = new Map(geo.features.map((f) => [String(f.properties.KEY_CODE), f]));

    // 3. Write in seed order with the seed's spelling.
    const lines = matched
      .map(({ name_ja, code }) => {
        const f = byCode.get(code);
        if (!f) throw new Error(`geometry for ${code} (${name_ja}) missing after simplification`);
        return JSON.stringify({ type: "Feature", properties: { area_code: code, name_ja }, geometry: f.geometry });
      });
    const note =
      `e-Stat 2020 census small-area boundaries (survey A002005212020, 川崎市中原区 14133, ` +
      `world geodetic lon/lat), ${board.area_names.length} areas of board ${slug}, ` +
      `simplified ${simplify} with mapshaper (keep-shapes, precision ${PRECISION}) by scripts/geo/build.ts`;
    const out = `{"type":"FeatureCollection","note":${JSON.stringify(note)},"features":[\n${lines.join(",\n")}\n]}\n`;
    const outPath = resolve(__dirname, "../../lib/geo", `${slug}.json`);
    writeFileSync(outPath, out);
    console.log(`wrote ${outPath}: ${lines.length} features, ${Buffer.byteLength(out)} bytes`);
    for (const m of matched) console.log(`  ${m.code}  ${m.name_ja}`);

    // 4. Optionally put the codes into the seed, one targeted replacement per area so the file keeps its layout.
    if (writeSeed) {
      const seedPath = resolve(__dirname, "../../supabase/seed/boards.json");
      let text = readFileSync(seedPath, "utf8");
      let changed = 0;
      for (const { name_ja, code } of matched) {
        const before = `{ "code": null, "name_ja": ${JSON.stringify(name_ja)} }`;
        const after = `{ "code": ${JSON.stringify(code)}, "name_ja": ${JSON.stringify(name_ja)} }`;
        if (text.includes(before)) {
          text = text.replace(before, after);
          changed++;
        }
      }
      writeFileSync(seedPath, text);
      console.log(`seed: ${changed} area codes filled in ${seedPath}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
