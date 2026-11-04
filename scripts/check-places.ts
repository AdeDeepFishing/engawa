/**
 * Checks the two place helpers on the seed's pilot board, without a
 * database: the "Open in maps" search URL (N17, lib/cards/maps.ts) and the
 * grouping behind the Places view (N10, lib/cards/places.ts); plus the
 * `?lang=` helpers for shared links (lib/i18n/langs.ts).
 *
 *   node --import=tsx scripts/check-places.ts
 *
 * Exits 1 when a check fails. Cards are built here from the seed's known
 * places; none comes from a submission.
 */
import seed from "../supabase/seed/boards.json";
import { boardMunicipality } from "../lib/geo";
import { mapsQuery, mapsUrl } from "../lib/cards/maps";
import { groupByPlace, OTHER_PLACES_KEY, parseBoardView } from "../lib/cards/places";
import { withLangParam, withoutLangParam } from "../lib/i18n/langs";
import type { Board, Card, Category } from "../lib/types";

let passed = 0;
const failed: string[] = [];

function check(name: string, ok: boolean): void {
  if (ok) passed++;
  else failed.push(name);
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
}

const raw = seed.boards[0];
const board = { ...raw, id: "board", mode: "peace" } as unknown as Board;

function card(
  id: string,
  place_id: string | null,
  place_text_ja: string | null,
  created_at: string,
  category: Category = "water",
): Card {
  return { id, place_id, place_text_ja, created_at, category, conflict: null } as unknown as Card;
}

const SEARCH = "https://www.google.com/maps/search/?api=1&query=";
const decode = (url: string | null) => (url?.startsWith(SEARCH) ? decodeURIComponent(url.slice(SEARCH.length)) : null);

// --- maps --------------------------------------------------------------------

check("municipality: read from the board's area codes", boardMunicipality(board) === "川崎市中原区");
check(
  "municipality: none for a board without codes the table knows",
  boardMunicipality({ area_names: [{ code: "99999000000", name_ja: "どこか" }] }) === null,
);

const school = mapsUrl(card("a", "kosugi-es", "小杉小学校の体育館", "2026-11-04T01:00:00Z"), board);
check("maps: a known place searches name, city and address", decode(school) === "川崎市立小杉小学校 川崎市中原区小杉町2-295-1");
check("maps: the query is percent encoded, no raw space or kanji", school !== null && !/[\s　-鿿]/.test(school));
check("maps: Google Maps search with api=1", school?.startsWith(SEARCH) === true);

check(
  "maps: a known place without an address searches name and city",
  mapsQuery(card("b", "musashikosugi-sta", "武蔵小杉駅前", "2026-11-04T01:00:00Z"), board) === "武蔵小杉駅 川崎市中原区",
);
check(
  "maps: a place text alone searches the text and the board's area",
  mapsQuery(card("c", null, "新丸子のパン屋", "2026-11-04T01:00:00Z"), board) === "新丸子のパン屋 川崎市中原区",
);
check(
  "maps: a place id the board no longer lists falls back to the text",
  mapsQuery(card("d", "gone", "中原図書館", "2026-11-04T01:00:00Z"), board) === "中原図書館 川崎市中原区",
);
check("maps: no place, no link", mapsUrl(card("e", null, null, "2026-11-04T01:00:00Z"), board) === null);
check(
  "maps: a board without a known city uses its own name",
  mapsQuery(card("f", null, "公園", "2026-11-04T01:00:00Z"), { ...board, area_names: [] }) === "公園 武蔵小杉",
);
check(
  "maps: characters with a meaning in URLs stay inside the query",
  decode(mapsUrl(card("g", null, "A&B #2 ?=", "2026-11-04T01:00:00Z"), board)) === "A&B #2 ?= 川崎市中原区",
);

// --- places ------------------------------------------------------------------

const cards = [
  card("w1", "kosugi-es", null, "2026-11-04T03:00:00Z", "water"),
  card("s1", "musashikosugi-sta", "武蔵小杉駅前のコンビニ", "2026-11-04T05:00:00Z", "shops"),
  card("o1", null, "新丸子のパン屋", "2026-11-04T04:00:00Z", "food"),
  card("o2", null, null, "2026-11-04T06:00:00Z", "daily_notice"),
  card("o3", null, "中原図書館", "2026-11-04T02:00:00Z", "other"),
  card("h1", "kosugi-es", null, "2026-11-04T01:00:00Z", "shelter"),
  card("h0", "kosugi-es", null, "2026-11-03T23:00:00Z", "shelter"),
];
const groups = groupByPlace(cards, board);
const keys = groups.map((g) => g.key);

check("places: one group per known place with cards, then the other group", keys.join(",") === "place:musashikosugi-sta,place:kosugi-es,other");
check("places: the other group comes last even when its card is the newest", keys[keys.length - 1] === OTHER_PLACES_KEY);
const school2 = groups.find((g) => g.key === "place:kosugi-es");
check("places: cards keep the board's order inside a place", school2?.cards.map((c) => c.id).join(",") === "w1,h1,h0");
check("places: newest time of a group", school2?.newestAt === "2026-11-04T03:00:00Z");
check("places: a shelter shows its newest shelter card", school2?.shelterCard?.id === "h1");
const station = groups.find((g) => g.key === "place:musashikosugi-sta");
check("places: a station has no shelter line", station !== undefined && station.shelterCard === undefined);
check(
  "places: a shelter without a shelter card says so",
  groupByPlace([card("w2", "kosugi-es", null, "2026-11-04T03:00:00Z")], board)[0].shelterCard === null,
);
const other = groupByPlace(
  [
    card("o1", null, "新丸子のパン屋", "2026-11-04T04:00:00Z"),
    card("o2", null, null, "2026-11-04T06:00:00Z"),
    card("o3", null, "中原図書館", "2026-11-04T02:00:00Z"),
    card("o4", null, "新丸子のパン屋", "2026-11-04T01:00:00Z"),
  ],
  board,
)[0];
const texts = other.cards.map((c) => c.place_text_ja ?? "-").join(",");
// Japanese collation decides 新 against 中; what matters is that one spot sits together and no place comes last.
check("places: other cards with the same place text sit together", /新丸子のパン屋,新丸子のパン屋/.test(texts));
check("places: other cards without a place text come last", other.cards[other.cards.length - 1].id === "o2");
check("places: the same text keeps the board's order", other.cards.findIndex((c) => c.id === "o1") < other.cards.findIndex((c) => c.id === "o4"));
check("places: no cards, no groups", groupByPlace([], board).length === 0);

check("view: places and list parse", parseBoardView("places") === "places" && parseBoardView("list") === "list");
check("view: anything else is ignored", parseBoardView("map") === null && parseBoardView(["places"]) === null);

// --- shared links -------------------------------------------------------------

check("lang: an absolute card link gets ?lang=", withLangParam("https://engawaboard.com/b/x/c/1", "zh") === "https://engawaboard.com/b/x/c/1?lang=zh");
check("lang: other parameters and the hash stay", withLangParam("/b/x?view=places#card-1", "ko") === "/b/x?view=places&lang=ko#card-1");
check("lang: an existing lang is replaced", withLangParam("/b/x?lang=en", "vi") === "/b/x?lang=vi");
check("lang: removed from the address bar, the rest kept", withoutLangParam("?lang=zh&view=places") === "?view=places" && withoutLangParam("?lang=zh") === "");

console.log(`\n${passed} of ${passed + failed.length} checks pass`);
if (failed.length) process.exit(1);
