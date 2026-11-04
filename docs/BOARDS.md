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

- **Broadcasts come from the portal feed.** The Cloudflare Worker `engawa-shibuya-portal` in `workers/shibuya-portal/` (its README has the details) reads the feed (1) every 5 minutes and posts each new broadcast to `/api/b/shibuya/inbox`, oldest first: the Japanese title and text, `received_at` from the broadcast's time read as JST, and the English only when it carries a number or a link the Japanese lacks. Its first run remembers the newest broadcast and posts nothing, so the broadcasts already on the portal never become cards. The ward's consent to the polling comes first (see (1)). Then:
  1. Human, on `/b/shibuya/admin`, section "Official inbox": generate the inbox secret (shown once) and put `portal@bosai.city.shibuya.tokyo.jp` on the allowed senders; the poller sends that address as `from`.
  2. Integrator, in `workers/shibuya-portal/`: `pnpm install`, `wrangler login`, `wrangler kv namespace create STATE` with the printed id put into `wrangler.toml`, `wrangler secret put ENGAWA_INBOX_SECRET` with that secret, `wrangler deploy`. Within 5 minutes, `wrangler kv key get state --binding STATE --remote` shows the seeded state.

- **Wiring the inbox by mail instead**, only if the ward does not agree to the polling: with both, every broadcast arrives twice (reconcile merges the second, at the cost of Claude calls). See `docs/INBOX.md`, "When the list registers by empty mail". The same Gmail as Kawasaki can serve. Session steps first: on `/b/shibuya/admin`, generate the inbox secret; route `bousai-shibuya@engawaboard.com` in Cloudflare Email Routing; give the Worker this board's URL and secret (today it posts to one board, so either a second Worker or a map of routing address to board URL and secret, as `docs/PLAN.md` N18 says). Then the two human steps:
  1. In the Gmail, add `bousai-shibuya@engawaboard.com` as a forwarding address (the confirmation link arrives through the Worker log) and a filter `from:(info@shibuya.tokyo)` that forwards to it.
  2. From the Gmail, send the empty mail to `login@shibuya.mailio.jp`, open the registration URL from the reply, choose 防災行政情報 only (the weather and seismic categories would cost Claude calls for what the board does not need) and register.

  Then read the From address of the first mail that arrives and put it on the board's allowed sender list.

- **Not confirmed.** (a) That 防災行政情報 mails carry the text of each 防災行政無線 broadcast; the mail page does not say what the category contains, and the 防災行政無線 page names the phone line and the yearly lists, not the mail. The first mail after subscribing settles it; if they are only announcements, the portal feed (1) is the source to ask the ward about. (b) The sender address beyond what the page states. (c) A 渋谷区 LINE account carrying the broadcasts: none is mentioned on the ward pages read. (d) The 東京都防災アプリ: not checked. (e) The 東急 and 京王 station pages. (f) A report that the ward's 防災情報配信サービス vendor had an intrusion on 2026-10-13 and paused the service, with the ward saying しぶや安全・安心メール runs on another vendor and was not affected (statement of 2026-10-15): read during the research, URL not kept, so treat it as unconfirmed.

## Kawasaki: 溝の口 (`mizonokuchi`)

- **Area.** 14 町丁目 of 川崎市高津区 (city code `14134`) around 溝の口駅 (東急 田園都市線, 大井町線) and 武蔵溝ノ口駅 (JR 南武線), one e-Stat small area each, none split:

  | code | 町丁目 | code | 町丁目 |
  |---|---|---|---|
  | 14134401101 | 溝口1丁目 | 14134411002 | 久本2丁目 |
  | 14134401102 | 溝口2丁目 | 14134411003 | 久本3丁目 |
  | 14134401103 | 溝口3丁目 | 14134410001 | 坂戸1丁目 |
  | 14134401104 | 溝口4丁目 | 14134410002 | 坂戸2丁目 |
  | 14134401105 | 溝口5丁目 | 14134410003 | 坂戸3丁目 |
  | 14134401106 | 溝口6丁目 | 14134412101 | 下作延1丁目 |
  | 14134411001 | 久本1丁目 | 14134412102 | 下作延2丁目 |

  "下作延 near the station" became 下作延1丁目 and 2丁目, whose centres are about 0.4 km from the station (2丁目 holds the ward office); 3丁目 to 7丁目 are 0.7 to 1.3 km away, and the bare 下作延 (`141344122`) has no residents. 二子1丁目 to 6丁目, east of 溝口, were not in the brief and stay out, although 高津小学校 and the 久本 schools serve them. Polygons `lib/geo/mizonokuchi.json`, 11,588 bytes, built 2026-11-05. The station point (35.5996, 139.6106) falls in 溝口1丁目 (`pnpm check:boards`).

- **Evacuation in this area.** Kawasaki assigns every 町丁 to a designated shelter (the 対象町丁 column of 資料編 2-06); the shelters below are the ones that serve the board. Seven 町丁目 are split between shelters and the plan does not say which blocks go where, so the seed keeps "の一部" as the city writes it: 溝口1丁目 (the 久本 schools, 坂戸小学校), 溝口2丁目 (高津小学校, 下作延小学校, the 久本 schools), 溝口3丁目 (高津小学校, the 久本 schools), 溝口6丁目 (高津小学校, 西高津中学校), 坂戸1丁目 (the 久本 schools, 坂戸小学校), 坂戸3丁目 (the 久本 schools, 東高津中学校), 下作延2丁目 (the 久本 schools, 西梶ヶ谷小学校). 高津中学校, 久本小学校 and 市立高津高校 stand side by side at 久本3-11 and share one list. For a large fire the city names 広域避難場所 without assigning 町丁 to them (2-05, 2-07); the nearest to the board is 緑ケ丘霊園.

- **Known places** (20, all `verified: true`, read 2026-11-05):

  | id | kind | place | source |
  |---|---|---|---|
  | `takatsu-es` | shelter | 川崎市立高津小学校, 溝口4-19-1; 溝口2丁目の一部, 溝口3丁目の一部, 溝口4丁目, 溝口5丁目, 溝口6丁目の一部, 二子1丁目, 二子2丁目. Also a 応急給水拠点 (100 m3 tank) | A, B |
  | `nishitakatsu-jhs` | shelter | 川崎市立西高津中学校, 久地1-10-1; 久地1丁目の一部, 久地2丁目, 溝口6丁目の一部 | A |
  | `shimosakunobe-es` | shelter | 川崎市立下作延小学校, 下作延5-19-1; 下作延, 下作延1丁目, 4丁目 to 7丁目, 溝口2丁目の一部, 上作延の一部 | A |
  | `takatsu-jhs`, `hisamoto-es`, `takatsu-hs` | shelter | 川崎市立高津中学校 (久本3-11-2), 久本小学校 (久本3-11-3, also a 100 m3 tank), 市立高津高校 (久本3-11-1); 下作延2丁目の一部, 久本1丁目 to 3丁目, 溝口1丁目 to 3丁目の一部, 坂戸1丁目の一部, 坂戸3丁目の一部, 二子3丁目 to 6丁目 | A, B |
  | `higashitakatsu-jhs` | shelter | 川崎市立東高津中学校, 末長4-1-1; 坂戸3丁目の一部, 末長4丁目 | A |
  | `sakado-es` | shelter | 川崎市立坂戸小学校, 坂戸1-18-1; 溝口1丁目の一部, 坂戸1丁目の一部, 坂戸2丁目, 北見方1丁目, 北見方3丁目の一部 | A |
  | `nishikajigaya-es` | shelter | 川崎市立西梶ヶ谷小学校, 梶ヶ谷2-14-1; 下作延2丁目の一部 and four areas outside the board | A |
  | `mizonokuchi1-water` | water_point | 溝口1-6-7, セレサ川崎前 (the city's name for it: 溝口（２）) | B |
  | `mizonokuchi5-water` | water_point | 溝口5-24, クリオ溝の口壱番館西側 (溝口（１）) | B |
  | `mizonokuchi-sta` | station | 溝の口駅: 東急 田園都市線, 大井町線 (溝口2-1-1) and JR 南武線 武蔵溝ノ口駅 (溝口), one transfer station | E |
  | `takatsu-ward-office` | office | 高津区役所, 下作延2-8-1; a 応急給水拠点 in front of it | B |
  | `takatsu-shiminkan`, `nocty1`, `hotel-mets-mizonokuchi`, `tecno-kawasaki`, `scrum21`, `kawasaki-daiichi-hotel` | commuter_shelter | 帰宅困難者用一時滞在施設 of the 武蔵溝ノ口駅 group at the station: 川崎市高津市民館 (溝口1-4-1, also a 避難所補完施設), ノクティ１ビル (溝口1-3-1), ホテルメッツ溝ノ口 (溝口1-1-5), てくのかわさき (溝口1-6-10), すくらむ２１ (溝口2-20-1), 川崎第一ホテル溝ノ口 (溝口2-3-12). The city opens them one by one once the buildings are safe | C |
  | `midorigaoka-cemetery` | park | 緑ケ丘霊園 (上作延, 下作延, 久地4丁目地内): 広域避難場所 for a large fire, just west of the board | D |

  Sources, all from 川崎市地域防災計画 資料編 (page updated 2026-08-13), https://www.city.kawasaki.jp/601/page/0000140630.html, except E:
  - A. 2-06 避難所（指定避難所）一覧表, 高津区 (令和7年4月1日現在); 2-04 地域防災拠点一覧表 (令和7年4月現在) for 高津中, 東高津中 and 西高津中.
  - B. 2-18 応急給水拠点一覧 (令和7年4月1日現在), 高津 4, 6, 7, 12 and 16. The ward office's address is the one this list gives.
  - C. 2-28 帰宅困難者用一時滞在施設一覧表 (令和7年5月1日現在), rows 31 to 41 (武蔵溝ノ口駅); 2-10 避難所補完施設一覧表 (令和4年8月25日時点) for 高津市民館.
  - D. 2-05 広域避難場所一覧表 and 2-07 指定緊急避難場所一覧表.
  - E. 東急 https://www.tokyu.co.jp/area/mizonokuchi/station/ and JR East https://www.jreast.co.jp/estation/station/info.aspx?StationCd=1535, read in the browser pane.

  Left out on purpose: the other five 一時滞在施設 of the 武蔵溝ノ口駅 group (洗足学園音楽大学 久本2-3-1, 久本神社氏子会館 久本1-16-13, かながわサイエンスパーク西棟 坂戸3-2-1, ミュージション溝の口 久本3-1-5, 南武朝鮮初級学校 末長3-1-15) and the ones of other groups inside the board (川崎市立高津図書館 溝口4-16-3 and 川崎市大山街道ふるさと館 溝口3-13-3 under 高津駅, 川崎市総合教育センター 溝口6-9-3 under 二子新地駅), all addable from C the same way; the schools' 既設水栓型 taps (2-18, 高津 18 to 36, 開設不要), which are inside shelters already listed; the other 避難所補完施設 in the board's 町丁目. No page on current shelter closures in 高津区 was read; the pilot board used the 資料編 alone too.

- **Where the broadcast text is published.** The same channels as the pilot board: メールニュースかわさき (topic 防災行政無線), the かわさき防災アプリ and the phone line. The pilot's subscription (防災行政無線 and 緊急情報) is not tied to a ward, so the mails that reach 武蔵小杉 today are the ones 溝の口 needs.

- **Wiring the inbox: one mail, two boards.** The city mail already arrives at the Email Worker `engawa-inbox` (outside the repository), which posts it to the 武蔵小杉 board. It must now post each mail to both `/api/b/musashikosugi/inbox` and `/api/b/mizonokuchi/inbox`, each with that board's own secret (one board per secret, `docs/INBOX.md`). The integrator changes the Worker. The two human steps:
  1. On `/b/mizonokuchi/admin`, section "Official inbox": generate the inbox secret (shown once) and give it to the integrator for the Worker's second secret.
  2. On the same page, enter the same allowed sender as the pilot board, `kawasaki@sg-p.jp`. Nothing changes in the Gmail: the filter on `sg-p.jp` and the forwarding address stay as they are.

  A consequence to decide on: the disaster switch reads categories and words, not wards, so a mail about an evacuation order for part of 中原区 would also switch 溝の口 to disaster mode (and the other way round). Either accept it (both boards are in the same city, and the admin can switch back), or let the Worker skip a board when the mail names only the other ward. Not built.

## Tokyo: 上野 (`ueno`)

- **Area.** 17 町丁目 of 台東区 (city code `13106`) around 上野駅, one e-Stat small area each, none split; the brief's list holds as written:

  | code | 町丁目 | code | 町丁目 |
  |---|---|---|---|
  | 13106004001 | 上野1丁目 | 13106003003 | 東上野3丁目 |
  | 13106004002 | 上野2丁目 | 13106003004 | 東上野4丁目 |
  | 13106004003 | 上野3丁目 | 13106003005 | 東上野5丁目 |
  | 13106004004 | 上野4丁目 | 13106003006 | 東上野6丁目 |
  | 13106004005 | 上野5丁目 | 131060060 | 上野公園 |
  | 13106004006 | 上野6丁目 | 13106013001 | 上野桜木1丁目 |
  | 13106004007 | 上野7丁目 | 13106013002 | 上野桜木2丁目 |
  | 13106003001 | 東上野1丁目 | 13106005001 | 池之端1丁目 |
  | 13106003002 | 東上野2丁目 | | |

  Polygons `lib/geo/ueno.json`, 12,080 bytes, built 2026-11-05. The 上野駅 point (35.7141, 139.7774) falls in 上野7丁目, JR East's address for the station (`pnpm check:boards`).

- **Evacuation in this area.** The ward's rule (震災時の避難, F): stay at home when it is safe; otherwise go to the 町会's 一時集合場所, then to a shelter or a 避難場所. By 町丁目 (資料第128, 避難場所と割当区分, 平成30年6月現在):
  - 上野1丁目 to 6丁目 are in the 地区内残留地区 301 (with all of 千代田区 and 台東区 秋葉原): no fire spread is expected, people move a block away from a fire instead of walking to a 避難場所.
  - 上野7丁目, 東上野1丁目 to 6丁目, 上野公園, 池之端1丁目 and part of 上野桜木1丁目 go to the 避難場所 上野公園一帯.
  - The rest of 上野桜木1丁目 and 上野桜木2丁目 go to 谷中墓地.

  Shelters are assigned per 町会, not per 町丁目 (資料第126 and 127). The target areas in the seed are the 町丁目 of each 町会 as the 町会区域一覧表 lists them, with "の一部" where a 町丁目 is split between 町会 with different shelters. 池之端1丁目 was under a 警戒レベル3 高齢者等避難 for 土砂災害 on 2026-09-21 (part of it, with parts of 谷中2丁目 and 池之端2丁目; shelters 谷中小学校 and 忍岡小学校), from the ward's mail archive below.

- **Known places** (18, all `verified: true`, read 2026-11-05):

  | id | kind | place | source |
  |---|---|---|---|
  | `kuromon-es` | shelter | 黒門小学校, 上野1-16-20; 上野1丁目 to 4丁目, 上野5丁目の一部, 上野6丁目, 池之端1丁目の一部 (14 町会 of the 上野 district plus 長者町一丁目 and 上野南大門町) | A, B |
  | `okachimachi-taito-jhs` | shelter | 御徒町台東中学校, 台東4-13-16; 上野5丁目の一部 (仲徒一丁目町会) and parts of 台東1丁目 to 4丁目 | A, B |
  | `ueno-es` | shelter | 上野小学校, 東上野6-16-8; 東上野3丁目の一部, 東上野4丁目の一部, 東上野5丁目, 東上野6丁目. Four 町会 moved here from the former 下谷小学校 "for the time being" | A, B |
  | `taito-rojin-center` | shelter | 老人福祉センター, 東上野2-25-14; 東上野1丁目, 東上野2丁目の一部 | A, B |
  | `higashiueno-kuminkan` | shelter | 東上野区民館, 東上野3-24-6; 東上野2丁目の一部, 東上野3丁目の一部 | A, B |
  | `shinobugaoka-jhs` | shelter | 忍岡中学校, 上野公園18-20; 上野公園, 上野7丁目の一部, 東上野4丁目の一部, 上野桜木1丁目の一部 and parts of 下谷 and 根岸. Three 町会 moved here from the former 坂本小学校 | A, B |
  | `ueno-jhs` | shelter | 上野中学校, 上野桜木1-14-55; 上野桜木1丁目の一部, 上野桜木2丁目, parts of 谷中6丁目 and 7丁目 | A, B |
  | `shinobugaoka-es` | shelter | 忍岡小学校, 池之端2-1-22; 池之端1丁目の一部, 池之端2丁目 | A, B |
  | `ueno-park-water` | water_point | 上野恩賜公園 災害時給水ステーション, 上野公園8-51: 東京都水道局's 1,500 m3 応急給水槽 | C, A |
  | `ueno-park` | park | 上野恩賜公園: the 避難場所 上野公園一帯 | A, F |
  | `yanaka-cemetery` | park | 谷中墓地: the 避難場所 for 上野桜木, outside the board | A, F |
  | `ueno-sta` | station | 上野駅: JR (上野7丁目), 東京メトロ 銀座線 G16 and 日比谷線 H18 (東上野3-19-6), 京成上野駅 (上野公園1-60) as an alias | E |
  | `taito-city-office` | office | 台東区役所, 東上野4-5-6; also a candidate 一時滞在施設 | A, D |
  | `tokyo-bunka-kaikan`, `tobikan`, `ueno-green-salon`, `ueno-hs` | commuter_shelter | 都立 帰宅困難者一時滞在施設 in the park: 東京文化会館 (上野公園5-45), 東京都美術館 (上野公園8-36), 上野グリーンサロン (上野公園7-47), 都立上野高等学校 (上野公園10-14, also the shelter of three 町会 outside the board) | A |
  | `ueno-chuo-parking` | commuter_shelter | 上野中央通り地下駐車場, 上野2-13先: the ward's candidate 一時滞在施設, which "may not open" | A, D |

  Sources:
  - A. 台東区地域防災計画（令和6年度修正）資料編 (page updated 2024-08-26), https://www.city.taito.lg.jp/bosai/houshin/bosaikaigi/chikibou_r6.html: 資料第126 町会別一時集合場所・避難所・避難場所一覧 (令和6年4月現在), 資料第127 避難所施設一覧 (令和6年7月現在: names, addresses, 避難予定町会, the two moves), 資料第128 避難場所と割当区分 (平成30年6月現在), 資料第129 区内帰宅困難者一時滞在施設等一覧, 資料第110 (給水拠点, 令和5年4月現在). Read from the PDF pages rendered as images, since the extracted text scrambles merged cells.
  - B. 町会区域一覧表 (令和8年3月修正), https://www.city.taito.lg.jp/kurashi/kyodo/tyoukai/choukaikuikiichiran.html (updated 2026-03-09): which 町丁目 and 番地 each 町会 covers.
  - C. 東京都水道局, 災害時給水ステーション（給水拠点）一覧 (区部, 令和7年11月1日現在), https://www.waterworks.metro.tokyo.lg.jp/kurashi/shinsai/ichiran.
  - D. 帰宅困難者対策 (updated 2026-09-03), https://www.city.taito.lg.jp/bosai/taisaku/kitakukonnan/kitaku.html: the ward's 17 candidate facilities.
  - E. JR East https://www.jreast.co.jp/estation/station/info.aspx?StationCd=204, Tokyo Metro https://www.tokyometro.jp/station/ueno/index.html, 京成 https://www.keisei.co.jp/keisei/tetudou/accessj/keisei-ueno.php, read in the browser pane.
  - F. 震災時の避難 (updated 2026-07-30), https://www.city.taito.lg.jp/bosai/taisaku/hinan/hinan.html: 避難場所 上野公園一帯, 谷中墓地, 隅田公園一帯.

  Readings to review: 仲御徒町中町会 (part of 上野5丁目) is under both 黒門小学校 and 御徒町台東中学校 in 資料第127 and under 黒門小学校 in 資料第126, so 上野5丁目の一部 is on both. 長者町一丁目町会 and 上野南大門町町会 (part of 上野3丁目) are under 黒門小学校 in 資料第126 and on no list in 資料第127; the seed follows 126, which makes all of 上野3丁目 黒門小学校's. 上野7丁目13 is in 下谷１丁目町会 (忍岡中学校); 上野7丁目1, the JR station block, is in no 町会. 京成上野 is its own station under the park, kept as an alias of 上野駅 as briefed, with its address in `notes_ja`.

  Left out on purpose: the 一時集合場所 (one per 町会, in 資料第126 as of 2024-04, re-checked with every 町会 for the 防災地図（地震編） revised 令和8年5月, https://www.city.taito.lg.jp/bosai/map/jishin/bosaimap.html, whose map PDF was not read); the 徒歩帰宅支援施設 下町風俗資料館 (上野公園2-1), 奏楽堂 (上野公園8-43) and the 旧吉田屋酒店 (上野桜木2-10-6); 本郷給水所 (文京区本郷2-7-29), the second water source the ward names for 上野公園一帯. The plan is from 2024: the ward says shelters can be out of use during renovation without listing them, and no newer shelter list was found.

- **Where the broadcast text is published.** 台東区 states it plainly:
  1. **たいとう防災気象情報メール** carries the broadcasts (防災行政無線の放送内容を確認できます, updated 2021-07-06, https://www.city.taito.lg.jp/bosai/jyouhou/gyouseimusen/bosaimusennaiyokaku.html): 警戒レベル3 高齢者等避難 and 警戒レベル4 避難指示 go to every subscriber under 防災緊急情報; the other broadcasts, except the daily ones, under 区からの防災情報; the daily ones (the 17:00 or 16:30 夕焼けタイム on weekdays, the Wednesday 13:00 特殊詐欺 warning) under 防災無線定時放送. Subscribing (page updated 2024-10-29, https://www.city.taito.lg.jp/bosai/jyouhou/mail/bosaiwasemail.html, and its 登録手順書 PDF): send an empty mail to `login@taito.mailio.jp`, open the URL in the reply within 24 hours, choose the topics; mail comes from the domain `taito.mailio.jp`. Same vendor as しぶや安全・安心メール.
  2. **Public archives** of the same mails: https://www.city.taito.lg.jp/bosaimail/html/index.html (the latest eleven; on 2026-11-05 the newest was 防災無線定時放送 2026-11-04 16:31, the 夕焼けタイム text word for word) and https://taito.mailio.jp/public/backnumber/ per topic. 区からの防災情報 holds the September case: 2026-09-20 自主避難場所の開設, 2026-09-21 レベル３高齢者等避難発令 (sent twice, the second to fix a link), 解除 and 閉鎖, all for parts of 谷中2丁目, 池之端1丁目 and 2丁目. It also carries ward notices that are not broadcasts (a crowdfunding appeal on 2026-10-08).
  3. Phone 03-5246-4057: the last 20 broadcasts, at any hour.
  4. 防災アプリ「台東防災」: every broadcast except the daily ones.

- **Wiring the inbox by mail**, as for the pilot (`docs/INBOX.md`, "When the list registers by empty mail"); the same Gmail can serve. Session and integrator steps first: on `/b/ueno/admin`, generate the inbox secret; route `bousai-ueno@engawaboard.com` in Cloudflare Email Routing; the Worker learns this board too (the same change as for 溝の口: a map from routing address to board URL and secret). Then the two human steps:
  1. In the Gmail, add `bousai-ueno@engawaboard.com` as a forwarding address and a filter `from:(taito.mailio.jp)` that forwards to it.
  2. From the Gmail, send the empty mail to `login@taito.mailio.jp`, open the URL from the reply, keep 防災緊急情報 (it cannot be turned off) and tick 区からの防災情報 only. 防災無線定時放送 would cost a Claude call every weekday for the same sentence, and the weather and seismic topics cost Claude calls for what the board does not need.

  Then read the From address of the first mail that arrives and put it on the board's allowed sender list.

- **Not confirmed.** (a) The sender address; only the domain is on the ward's page. (b) That the 区からの防災情報 mails repeat the loudspeaker text word for word: the September 警戒レベル3 mail came under 区からの防災情報 although the page says Level 3 goes under 防災緊急情報, whose archive is empty, and its wording reads like a notice. The daily mails do match the broadcast text. (c) A feed: neither archive page links one; reading the city's archive page like the Shibuya portal would need the ward's consent and was not built. (d) The 東京都防災アプリ: not checked. (e) Shelter changes since 資料第127 (2024-07).

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
