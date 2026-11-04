# Boards

One section per board: its area, where its known places come from, and how the city's 防災行政無線 text reaches it. The last section is the checklist for the next city (Sapporo and Fukuoka are next on the list).

The code is the same for every board. A board is a row in `boards` (seeded from `supabase/seed/boards.json`), a polygon file `lib/geo/<slug>.json`, one line in `lib/geo/polygons.ts` and one in the municipality table in `lib/geo/index.ts`, and, for the official inbox, its own secret and forwarder address (`docs/INBOX.md`). The home page map lights the prefecture from the first two digits of the board's area codes, with no per-board code.

## Kawasaki: 武蔵小杉 (`musashikosugi`)

- **Area.** 23 町丁目 of 川崎市中原区 (city code `14133`) around 武蔵小杉駅. Polygons `lib/geo/musashikosugi.json`, 16 KB, e-Stat 2020 small areas, built 2026-11-03 (`scripts/geo/README.md`).
- **Known places.** Nine shelters with their target areas from 川崎市地域防災計画 資料編 2-06 避難所（指定避難所）一覧表 (as of 令和7年4月1日), two water points from 2-18 応急給水拠点, two stations, 等々力緑地. Verified 2026-11-02 against https://www.city.kawasaki.jp/601/page/0000140630.html.
- **Broadcast text.** Kawasaki publishes each 防災行政無線 broadcast by email through メールニュースかわさき (topic 防災行政無線), in the かわさき防災アプリ and on a phone line. No feed or API.
- **Wired today** (2026-11-04, `docs/INBOX.md` and the DEVLOG entry "the inbox wired for real"): a Gmail is subscribed to メールニュースかわさき with 緊急情報 and 防災行政無線 ticked; a Gmail filter on `sg-p.jp` forwards to `bousai-musashikosugi@engawaboard.com`; Cloudflare Email Routing hands that address to the Worker `engawa-inbox`, which posts to `/api/b/musashikosugi/inbox` with the board's secret. Allowed sender: `kawasaki@sg-p.jp`.

## Shibuya: 渋谷 (`shibuya`)

- **Area.** 11 町丁目 of 渋谷区 (city code `13113`) around 渋谷駅, one e-Stat small area each, none split:

  | code | 町丁目 | code | 町丁目 |
  |---|---|---|---|
  | 13113010001 | 渋谷1丁目 | 131130180 | 宇田川町 |
  | 13113010002 | 渋谷2丁目 | 131130110 | 桜丘町 |
  | 13113010003 | 渋谷3丁目 | 13113019001 | 神南1丁目 |
  | 13113010004 | 渋谷4丁目 | 13113019002 | 神南2丁目 |
  | 13113013001 | 道玄坂1丁目 | 13113032006 | 神宮前6丁目 |
  | 13113013002 | 道玄坂2丁目 | | |

  Polygons `lib/geo/shibuya.json`, 8 KB, built 2026-11-04. The ハチ公口 (35.6590, 139.7005) falls in 道玄坂2丁目 (`pnpm check:boards`).

- **Evacuation in this area.** Every 町丁目 of the board except 渋谷4丁目 is in the 地区内残留・渋谷地区: buildings are fire resistant enough that people stay in the district instead of walking to a 避難場所. 渋谷4丁目 goes to 青山学院・実践女子学園一帯. Source: 渋谷区 一時集合場所・避難場所・地区内残留地区一覧 (updated 2026-07-17), https://www.city.shibuya.tokyo.jp/bosai/bosai/hinan/basyo.html. Not stored as data: `known_places` has no field for it.

- **Known places** (19, all `verified: true`, read 2026-11-04):

  | id | kind | place | source |
  |---|---|---|---|
  | `shoko-kaikan` | shelter | 商工会館・消費者センター, 渋谷1-12-5; 渋谷1丁目, 渋谷2丁目, 渋谷3丁目の一部 | A, B |
  | `owada` | shelter | 文化総合センター大和田, 桜丘町23-21; 桜丘町, 道玄坂1丁目, 南平台町 | A, B |
  | `jinnan-es` | shelter | 神南小学校, 宇田川町5-1; 宇田川町, 神南1丁目, 神南2丁目, 道玄坂2丁目の一部 and more. **Closed for rebuilding since 2026-08-06** | A, B |
  | `shoto-jhs` | shelter | 松濤中学校, 松濤1-20-4; 道玄坂2丁目の一部 and five areas outside the board. **Closed since 2025-08-14** | A, B |
  | `aoyama-campus` | shelter | 渋谷区立小中学校 青山キャンパス, 神宮前5-53-18: the substitute for both closed schools | B |
  | `amway-hq` | shelter | 日本アムウェイ本社ビル, 宇田川町7-1: substitute for people who cannot reach 青山キャンパス (older people, disabled people, infants, pregnant women) | B |
  | `tokiwamatsu-es` | shelter | 常磐松小学校, 東1-7-10; 渋谷3丁目の一部, 渋谷4丁目 | A, B |
  | `jingumae-es` | shelter | 神宮前小学校, 神宮前4-20-12; 神宮前5丁目, 神宮前6丁目 | A, B |
  | `yoyogi-park` | water_point | 都立代々木公園, 代々木神園町2-1: 災害時給水ステーション, next to 神南2丁目 | D |
  | `shibuya-sta` | station | 渋谷駅: JR (道玄坂1丁目), 東京メトロ 銀座線, 半蔵門線, 副都心線 (渋谷2-21-1), 東急, 京王井の頭線 | E |
  | `shibuya-city-office` | office | 渋谷区役所, 宇田川町1-1 | F |
  | `hikarie`, `scramble-square`, `shibuya-stream`, `fukuras`, `sakura-stage`, `miyashita-park`, `konno-hachimangu` | commuter_shelter | 帰宅困難者受入施設 at the station: 渋谷ヒカリエ, 渋谷スクランブルスクエア, 渋谷ストリーム, 渋谷フクラス, 渋谷サクラステージ, MIYASHITA PARK, 金王八幡宮 | C |
  | `jingudori-park` | park | 神宮通公園, 神宮前6-22-8: 一時集合場所 of the 神宮前 district | G |

  Sources:
  - A. 渋谷区地域防災計画（令和5年度修正）資料編, 資料5 避難所一覧, the 収容地区 column (the page was updated 2026-06-05): https://www.city.shibuya.tokyo.jp/bosai/bosai/bosai-plan/bosai_plan.html
  - B. 避難所・自主避難施設一覧 (updated 2026-07-03), names, addresses, closures and substitutes: https://www.city.shibuya.tokyo.jp/bosai/bosai/hinan/itiran.html
  - C. 渋谷区防災ポータル 帰宅困難者受入施設一覧 (data updated 2026-07-21): https://bosai.city.shibuya.tokyo.jp/hinan/kitaku-konnan-ichiran.html, linked from https://www.city.shibuya.tokyo.jp/bosai/bosai/bosai-shisetsu/kitakon-shisetsu.html (updated 2026-04-02)
  - D. 東京都水道局渋谷営業所, 渋谷水道ミニ情報 令和7年9月号: the ward's three stations are 都立代々木公園, 都立第一商業高校 (鉢山町8-1) and 区立景丘公園 (恵比寿4-19-21). https://www.waterworks.metro.tokyo.lg.jp/documents/d/waterworks/105017-shibuya-r709
  - E. JR East station page https://www.jreast.co.jp/estation/station/info.aspx?StationCd=808 and Tokyo Metro https://www.tokyometro.jp/station/shibuya/index.html. The 東急 and 京王 pages were not opened; their station is named 渋谷 on every map, so the aliases stand.
  - F. The ward's site footer: 〒150-8010 東京都渋谷区宇田川町1-1.
  - G. 一時集合場所・避難場所・地区内残留地区一覧 (updated 2026-07-17), https://www.city.shibuya.tokyo.jp/bosai/bosai/hinan/basyo.html

  Left out on purpose: the 協定避難所 渋谷教育学園 (渋谷1-21-18) and 青山学院高等部 (渋谷4-4-25), which serve no 町丁目 in the plan; the other 帰宅困難者受入施設 inside the board's 町丁目 (セルリアンタワー東急ホテル, 渋谷エクセルホテル東急, 渋谷東武ホテル, 日本基督教団東京山手教会, 豊栄稲荷神社, 渋谷キャスト, 渋谷ソラスタ, 住友不動産渋谷タワー, LINE CUBE SHIBUYA, 渋谷 パルコ・ヒューリックビル, 道玄坂通, 渋谷アクシュ, 関電不動産渋谷ビル, 青山学院大学), which can be added from source C the same way. The portal lists 渋谷サクラステージ at "桜丘1-4ほか", so the seed has no address for it.

- **Where the broadcast text is published.** Shibuya publishes more than Kawasaki:
  1. **渋谷区防災ポータル, 防災行政無線放送内容**, https://bosai.city.shibuya.tokyo.jp/musen/index.html: every broadcast as text and audio in Japanese, English, Simplified and Traditional Chinese, Korean and French (no Vietnamese, no やさしい日本語). The page reads a JSON feed (`/apps/get_json.php?file=renkei_73_bosai_radio_list.js` lists the months, `renkei_73_bosai_radio_<yyyymm>.js` the broadcasts). Latest items on 2026-11-04: 2026-10-16 12:40 緊急地震速報, 2026-08-26 and 2026-07-01 J-Alert tests. The feed is the portal's own endpoint, not a published API; polling it needs the ward's consent first.
  2. **しぶや安全・安心メール** (page updated 2024-04-23, https://www.city.shibuya.tokyo.jp/bosai/bosai/bosai-shisetsu/anzen_mail.html): category 防災メール, 防災行政情報 ("渋谷区の防災行政情報を配信します"), next to 震度情報, 気象情報 and others. Subscribing: send an empty mail to `login@shibuya.mailio.jp`, open the URL in the reply, choose the categories. Mail comes from `info@shibuya.tokyo` (the page gives the address and the domain `@shibuya.tokyo` for spam filters; it is not the address the empty mail goes to). Without a working URL, a mail to `div-bousai@shibuya.tokyo` with the subject しぶや安全・安心メール登録希望 registers by hand.
  3. Phone: 03-3463-6570, 6571 and 6572 replay broadcasts of the last 24 hours (https://www.city.shibuya.tokyo.jp/bosai/bosai/bosai-shisetsu/musen.html, updated 2026-07-09). The same page lists yearly 放送内容一覧 pages, the last one for 令和5年度.
  4. 渋谷区防災アプリ (push for evacuation information) and the X account @city_shibuya. Not a mail.

- **Wiring the inbox** (`docs/INBOX.md`, "When the list registers by empty mail"). The same Gmail as Kawasaki can serve. Session steps first: on `/b/shibuya/admin`, generate the inbox secret; route `bousai-shibuya@engawaboard.com` in Cloudflare Email Routing; give the Worker this board's URL and secret (today it posts to one board, so either a second Worker or a map of routing address to board URL and secret, as `docs/PLAN.md` N18 says). Then the two human steps:
  1. In the Gmail, add `bousai-shibuya@engawaboard.com` as a forwarding address (the confirmation link arrives through the Worker log) and a filter `from:(info@shibuya.tokyo)` that forwards to it.
  2. From the Gmail, send the empty mail to `login@shibuya.mailio.jp`, open the registration URL from the reply, choose 防災行政情報 only (the weather and seismic categories would cost Claude calls for what the board does not need) and register.

  Then read the From address of the first mail that arrives and put it on the board's allowed sender list.

- **Not confirmed.** (a) That 防災行政情報 mails carry the text of each 防災行政無線 broadcast; the mail page does not say what the category contains, and the 防災行政無線 page names the phone line and the yearly lists, not the mail. The first mail after subscribing settles it; if they are only announcements, the portal feed (1) is the source to ask the ward about. (b) The sender address beyond what the page states. (c) A 渋谷区 LINE account carrying the broadcasts: none is mentioned on the ward pages read. (d) The 東京都防災アプリ: not checked. (e) The 東急 and 京王 station pages. (f) A report that the ward's 防災情報配信サービス vendor had an intrusion on 2026-10-13 and paused the service, with the ward saying しぶや安全・安心メール runs on another vendor and was not affected (statement of 2026-10-15): read during the research, URL not kept, so treat it as unconfirmed.

## Checklist for a new city

1. **Scope.** 10 to 25 町丁目 around one station in one ward; a slug; the name in ja, en, zh, ko, vi; mode `peace`. Ask before including a 町丁目 the station touches but the shelter plan assigns elsewhere.
2. **Data sources**, each with the URL, the "as of" date on the page and the date read, in the DEVLOG:
   - the city's 地域防災計画 資料編: shelters with the areas they serve (収容地区, 対象町丁目);
   - the current shelter page: closures and substitutes, which the plan does not have;
   - water: the city's 応急給水拠点 list, or the prefecture's water bureau (Tokyo: 災害時給水ステーション);
   - stations from the operators' pages; the ward or city office;
   - 一時集合場所 and 帰宅困難者受入施設 only where the city lists them.
   `verified: true` only for what was read on the official page; otherwise `false` and a `notes_ja` saying what is missing.
3. **Polygons.** Download the e-Stat 2020 small-area Shapefile for the ward (`scripts/geo/README.md`, `code=<5-digit city code>`; designated cities have one code per ward: Sapporo's 中央区 is 01101, Fukuoka's 博多区 40132 and 中央区 40133, check on e-Stat). Print the `S_NAME` column first: Sapporo spells areas like 北一条西一丁目, and `scripts/geo/build.ts` only turns the final 丁目 numeral into a digit, so the seed must keep the rest as e-Stat writes it. Add the board to `boards.json` with `code: null`, run `node --import=tsx scripts/geo/build.ts <shp> --board <slug> --write-seed`, check the file is a few KB to 20 KB, delete the download. A board across two wards needs the two Shapefiles merged first (mapshaper `-merge-layers`); the script reads one.
4. **Code.** One import and one `BY_SLUG` line in `lib/geo/polygons.ts`; one line in `MUNICIPALITY_JA` in `lib/geo/index.ts`; the board's prefecture, municipality and one landmark in `scripts/check-boards.ts`; a new place kind only with its label in the five message files and its icon in `lib/cards/places.ts`. Then `pnpm check:boards`, `pnpm typecheck`, `pnpm lint`, `pnpm guard --all`.
5. **Seed.** `pnpm db:seed --dry-run --board <slug>` shows the rows; the integrator runs `pnpm db:seed --board <slug> --token-file .env.admin-token.local` after review. The board is created listed; another board is never touched.
6. **Inbox address.** Secret on the admin page, `bousai-<slug>@engawaboard.com` in Email Routing, the Worker pointed at the board.
7. **Mail subscription.** Find the city's service that publishes the 防災行政無線 text (by mail, app, feed or phone), note how to subscribe and the sender, run the two Gmail steps above, and set the allowed sender from the first real mail. Say plainly in this file what could not be confirmed.
