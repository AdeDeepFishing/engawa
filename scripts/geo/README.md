# Board polygons

`lib/geo/<board slug>.json` holds the simplified 町丁目 polygons of one board. `lib/geo/polygons.ts` imports every file on the server; the board page passes the browser the polygons of its own board only, which turn a position into an area code when the uploader opts in. Board reads on the server fill a missing area code from the same files. A new board adds one line to `lib/geo/polygons.ts` and one to the municipality table in `lib/geo/index.ts` (checklist in `docs/BOARDS.md`).

## Source

e-Stat 小地域 boundary data, 2020 census (令和2年国勢調査, survey id `A002005212020`), one city or ward per download (`code=`: 川崎市中原区 `14133`, 渋谷区 `13113`), world geodetic system, longitude and latitude, Shapefile. The download is one request:

```bash
curl -L -o /tmp/nakahara.zip "https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=A002005212020&code=14133&coordSys=1&format=shape&downloadType=5&datum=2011"
```

```bash
unzip -o /tmp/nakahara.zip -d /tmp/nakahara
```

The zip (about 54 KB) contains `r2ka14133.shp`, `.dbf`, `.shx` and `.prj`, 76 small areas with `KEY_CODE` (the area code, for example `14133301001`), `S_NAME` (the name with kanji numerals, 小杉町三丁目) and the centroid in `X_CODE` and `Y_CODE`. The same URL is reachable from the e-Stat GIS page (境界データ, 小地域, 国勢調査 2020, 神奈川県 川崎市中原区). Keep the raw download out of git.

## Build

```bash
node --import=tsx scripts/geo/build.ts /tmp/nakahara/r2ka14133.shp --write-seed
```

The script:

1. reads the board's `area_names` from `supabase/seed/boards.json`,
2. matches each name to an e-Stat record after turning kanji numerals into digits (小杉町三丁目 is 小杉町3丁目), and reports names it cannot find,
3. keeps only those records and simplifies them with `npx mapshaper` (`-simplify 30% keep-shapes`, coordinates rounded to 0.00001 degrees, about one metre),
4. writes `lib/geo/<slug>.json` as a GeoJSON FeatureCollection, one Feature per area with `area_code` and `name_ja` spelled as in the seed, in seed order,
5. with `--write-seed`, fills the `code` of each area in `supabase/seed/boards.json`. Run `pnpm db:seed` afterwards to copy the codes into the board row (the seed only updates the board; cards are untouched).

Options: `--board <slug>` (default `musashikosugi`), `--simplify <pct>` (default `30%`; 20% gives about 13 KB, 30% about 16 KB, the unsimplified subset is 42 KB).

Last built 2026-11-03 for `musashikosugi`: 23 areas, all 23 names matched one record each.

Built 2026-11-04 for `shibuya` from `code=13113` (zip 58 KB, `r2ka13113.shp`, 80 small areas): 11 areas, all 11 names matched one record each, 30% simplification, 8,038 bytes. Same command with `--board shibuya`; the download was deleted afterwards. `pnpm check:boards` checks every board against its file.

## Fallback

If e-Stat cannot be fetched, Voronoi cells around the 町丁目 centroids (the `X_CODE` and `Y_CODE` columns, or any geocoder), clipped to the ward's bounding box, give a coarse substitute. It was not needed.
