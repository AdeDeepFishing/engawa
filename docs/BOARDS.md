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
  - D. 2-05 広域避難場所一覧表 and 2-07 指定緊急避難場所一覧表 (the tables print no as-of date; the 資料編 page's update date applies).
  - E. 東急 https://www.tokyu.co.jp/area/mizonokuchi/station/ and JR East https://www.jreast.co.jp/estation/station/info.aspx?StationCd=1535, read in the browser pane.

  Left out on purpose: the other five 一時滞在施設 of the 武蔵溝ノ口駅 group (洗足学園音楽大学 久本2-3-1, 久本神社氏子会館 久本1-16-13, かながわサイエンスパーク西棟 坂戸3-2-1, ミュージション溝の口 久本3-1-5, 南武朝鮮初級学校 末長3-1-15) and the ones of other groups inside the board (川崎市立高津図書館 溝口4-16-3 and 川崎市大山街道ふるさと館 溝口3-13-3 under 高津駅, 川崎市総合教育センター 溝口6-9-3 under 二子新地駅), all addable from C the same way; the schools' 既設水栓型 taps (2-18, 高津 18 to 36, 開設不要), which are inside shelters already listed; the other 避難所補完施設 in the board's 町丁目. No page on current shelter closures in 高津区 was read; the pilot board used the 資料編 alone too.

- **Where the broadcast text is published.** The same channels as the pilot board: メールニュースかわさき (topic 防災行政無線), the かわさき防災アプリ and the phone line. The pilot's subscription (防災行政無線 and 緊急情報) is not tied to a ward, so the mails that reach 武蔵小杉 today are the ones 溝の口 needs.

- **Not confirmed.** (a) That the メールニュースかわさき topics the pilot subscribed to (防災行政無線, 緊急情報) carry the broadcasts made in 高津区 as well as 中原区: the registration page does not say whether the topic is city wide or per ward, and no 高津区 broadcast has arrived yet; the first one settles it. (b) The 高津区 closure and substitute page for shelters was not read; the list above comes from the 資料編 tables only.

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
  - A. 台東区地域防災計画（令和6年度修正）資料編 (page updated 2024-08-26), https://www.city.taito.lg.jp/bosai/houshin/bosaikaigi/chikibou_r6.html: 資料第126 町会別一時集合場所・避難所・避難場所一覧 (令和6年4月現在), 資料第127 避難所施設一覧 (令和6年7月現在: names, addresses, 避難予定町会, the two moves), 資料第128 避難場所と割当区分 (平成30年6月現在), 資料第129 区内帰宅困難者一時滞在施設等一覧, 資料第110 (給水拠点, 令和5年4月現在). Read from the PDF pages rendered as images, since the extracted text scrambles merged cells (no as-of date printed; the page's update date applies).
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

## Sapporo: 札幌 大通 (`sapporo`)

- **Area.** 45 条丁目 blocks of 札幌市中央区 (city code `01101`) from the south side of 札幌駅 to 狸小路, between 創成川 and 西5丁目: 北一条西 to 北五条西 1丁目 to 5丁目, 大通西1丁目 to 5丁目, 南一条西 to 南三条西 1丁目 to 5丁目. e-Stat keeps every block as its own small area (none grouped), so the brief's list is 45 areas rather than the 10 to 16 it expected; the whole board is still only 0.9 km by 1.4 km, smaller than the 13 町丁目 of 博多. Names follow e-Stat with the final 丁目 as a digit (北一条西1丁目), as `scripts/geo/build.ts` matches them; addresses in `known_places` keep the city's own form (北1条西2丁目). Codes run in a grid:

  | e-Stat names | codes |
  |---|---|
  | 北五条西1丁目 to 5丁目 | 01101790501 to 01101790505 |
  | 北四条西1丁目 to 5丁目 | 01101790401 to 01101790405 |
  | 北三条西1丁目 to 5丁目 | 01101790301 to 01101790305 |
  | 北二条西1丁目 to 5丁目 | 01101790201 to 01101790205 |
  | 北一条西1丁目 to 5丁目 | 01101790101 to 01101790105 |
  | 大通西1丁目 to 5丁目 | 01101210001 to 01101210005 |
  | 南一条西1丁目 to 5丁目 | 01101690101 to 01101690105 |
  | 南二条西1丁目 to 5丁目 | 01101690201 to 01101690205 |
  | 南三条西1丁目 to 5丁目 | 01101690301 to 01101690305 |

  Polygons `lib/geo/sapporo.json`, 12,820 bytes, built 2026-11-05 from `code=01101` (zip 214 KB, `r2ka01101.shp`, 990 small areas). 大通駅 (43.0607, 141.3538) falls in 大通西2丁目 (`pnpm check:boards`). JR 札幌駅's own building is north of 北5条, in 北区, outside the board and outside the one-ward rule; the subway さっぽろ駅 concourse (北4条西4丁目) and the station's south side (北五条西2丁目 to 4丁目) are inside. A narrower board would be 西2丁目 to 西4丁目 only (27 areas).

- **Evacuation in this area.** 札幌市 does not assign shelters to 条丁目, 町内会 or まちづくりセンター areas: its 中央区 list gives name and address only, so `target_areas_ja` is empty for every Sapporo shelter. No 指定避難所 or 指定緊急避難場所 lies inside the 45 blocks; the nearest are 資生館小学校 (south west) and 中央中学校 (east of 創成川). Inside the board the city's designations are 一時滞在施設 for 帰宅困難者. **Winter:** no shelter list says a place is closed in winter (冬期間使用不可 appears nowhere). The rule that matters is in the 札幌市避難場所基本計画: for earthquakes a 指定緊急避難場所 must allow people to stay indoors because of "寒さ・積雪等の冬季条件", which is why the large parks are 指定緊急避難場所 for 大規模な火事 only and never for 地震; and 避難の心得 tells people in a winter earthquake to go quickly to a designated 小中学校 (source F). Not stored as data.

- **Known places** (21, 20 `verified: true`, read 2026-11-05):

  | id | kind | place | source |
  |---|---|---|---|
  | `shiseikan-es` | shelter | 資生館小学校, 南3条西7丁目1-1: 指定緊急避難場所兼基幹避難所 (洪水, 地震, 大規模な火事), about 40 m outside the board | A |
  | `chuo-jhs` | shelter | 中央中学校, 北4条東3丁目: the same, about 190 m east of the board | A |
  | `akarenga-garden` | park | 赤レンガ庁舎前庭, 北3条西6丁目: 一時避難場所, next to the board | A |
  | `odori-park` | park | 大通公園, 大通西1丁目 to 12丁目. **`verified: false`**: the city designates "市内のすべての公園" as 一時避難場所 but names no park; the inference is ours | A, B |
  | `water-n5w6`, `water-n1w6`, `water-odori-w6`, `water-s3w6` | water_point | 給水口 No.13 (北5条西6丁目), No.10 (北1条西6丁目), No.8 (大通西6丁目), No.6 (南3条西6丁目) of the 藻岩第1緊急時給水管路, a buried pipe under 西6丁目 one block west of the board, where people fetch water themselves | C |
  | `odori-sta` | station | 大通駅: 南北線 N07, 東西線 T09, 東豊線 H08 | D |
  | `sapporo-sta` | station | 札幌駅: JR 札幌駅 and the subway's さっぽろ駅, 南北線 N06, 東豊線 H07; subway concourse 北4条西4丁目 | D, E |
  | `sapporo-city-hall` | office | 札幌市役所, 北1条西2丁目 (inside the board; 危機管理局 on the 7th floor) | G |
  | `chuo-ward-office` | office | 中央区役所, 南3条西11丁目 | G |
  | `odori-concourse`, `sapporo-concourse`, `chikaho`, `aurora-town`, `pole-town`, `apia`, `stellar-place`, `tv-tower`, `sapporo-community-plaza` | commuter_shelter | 一時滞在施設 at the two stations: 地下鉄大通駅コンコース (大通西4丁目), 地下鉄さっぽろ駅コンコース (北4条西4丁目), 札幌駅前通地下歩行空間 チ・カ・ホ (北3条西3丁目～大通西3丁目), さっぽろ地下街オーロラタウン (大通西1丁目～3丁目) and ポールタウン (南1条西3丁目～南4条西3丁目), アピア (北5条西3丁目～4丁目), 札幌ステラプレイス (北5条西2丁目), さっぽろテレビ塔 (大通西1丁目), 札幌市民交流プラザ (北1条西1丁目) | E |

  Sources (all read 2026-11-05):
  - A. 避難場所等（中央区）, https://www.city.sapporo.jp/kikikanri/higoro/hinan/cyuuou.html (更新日 2026-06-30): names, addresses, types and the hazard flags. The portal's `shelter.json` (below) gives capacities: 資生館小学校 622, 中央中学校 626, 赤レンガ庁舎前庭 6,700.
  - B. 避難場所の種類, https://www.city.sapporo.jp/kikikanri/higoro/hinan/hinanbasho.html (更新日 2024-12-06): "市内のすべての公園を指定しています" for 一時避難場所.
  - C. 札幌市水道局 拠点給水施設, https://www.city.sapporo.jp/suido/riyosya/saigai/torikumi/oukyu/index.html (更新日 2024-06-14): the 緊急時給水管路 給水口 and the 緊急貯水槽 list.
  - D. 札幌市交通局 timetable pages (`/st/subway/route_time/h26/n06.html`, `n07.html` 更新日 2026-08-01; `t09.html`, `h07.html`, `h08.html` 更新日 2016-07-25): station numbers and lines. The 交通局 publishes no station address in text; JR北海道's station CSV (https://www.jrhokkaido.co.jp/network/station/csv/station.csv, Last-Modified 2026-11-02) has the station but no address or line names, so `sapporo-sta` carries no address and no JR line aliases.
  - E. 一時滞在施設, https://www.city.sapporo.jp/kikikanri/torikumi/itizitaizaishisetsu.html (更新日 2026-03-06, list 令和6年8月現在): 22 facilities.
  - F. 札幌市避難場所基本計画, https://www.city.sapporo.jp/kikikanri/torikumi/hinanbasho_keikaku/documents/kihonkeikaku_honsho.pdf (令和元年改定), and 避難の心得, https://www.city.sapporo.jp/kikikanri/higoro/iza/kokorohe.html (更新日 2024-02-13): the winter rule.
  - G. (footers, undated beyond the 2026-11-05 read) The city's page footer (〒060-8611 札幌市中央区北1条西2丁目) and the 中央区 site footer (〒060-8612 札幌市中央区南3条西11丁目).

  Left out on purpose: the farther 基幹避難所 中央小学校 (大通東6丁目12, 670 m), 北ガスアリーナ札幌46 (北4条東6丁目) and 二条小学校 (南2条西15丁目), and the 地域避難所 西創成会館 (南5条西7丁目), 北海道神宮頓宮 (南2条東3丁目), 豊水会館, 北海寺, 中央区民センター and 札幌市教育文化会館, all on source A; the 北区 shelters just north of the station (北九条小学校, 信行寺); the other 一時滞在施設 inside the board (札幌市民ホール, 札幌三井JPビルディング, ほくほく札幌ビル, D-LIFEPLACE札幌, ヒューリックスクエア札幌, 札幌４丁目プレイス, 北1条地下駐車場連絡通路), which can be added from source E the same way; the other 給水口 along 西6丁目 (No.7 南1条西6丁目, No.9 大通西7丁目, No.11 北2条西6丁目, No.12 北4条西6丁目); the nearest 緊急貯水槽 (水道局本局庁舎, 大通東11丁目23, about 1.5 km east). The portal's `shelter.json` writes チ・カ・ホ at 北１条西４～６丁目, which looks like a copy of the 北1条地下駐車場連絡通路 row; the seed follows the city page.

- **Where the broadcast text is published.** Sapporo has no loudspeaker text to forward:
  1. **防災行政無線.** The city runs a 260 MHz digital 防災行政無線 as an emergency link between the city hall, the ward offices and the shelters ("非常通信手段として運用", 公募型企画競争提案説明書, https://www.city.sapporo.jp/kikikanri/keiyakujoho/r3keiyaku/documents/teiannsetumeisyo.pdf). No official page found names outdoor loudspeakers (屋外拡声子局) or publishes broadcast text.
  2. **さっぽろ防災ポータル**, https://bousai.city.sapporo.jp/: 緊急情報, 新着情報, 避難情報 and its history, shelter opening status. Japanese; the page offers browser machine translation into 12 languages.
  3. **札幌市防災アプリ「そなえ」** (https://www.city.sapporo.jp/kikikanri/apri.html, 更新日 2026-09-01): evacuation orders, shelter openings, J-Alert, weather and earthquake information, with a translation function. Push only.
  4. **LINE 札幌市公式アカウント** ＠sapp_ro (https://www.city.sapporo.jp/koho/line.html, 更新日 2026-06-26): weather and seismic notices on request, high urgency evacuation information to every follower; event information is auto-translated into 9 languages, and the page does not say whether evacuation messages are.
  5. **X** @sapporo_bousai (札幌市危機管理局, evacuation information and shelter openings), 緊急速報メール, and a landline voice service for residents aged 65 and over (https://www.city.sapporo.jp/kikikanri/koteidenwa.html).
  6. **No city disaster mail service** was found: none of the channel pages lists one. So there is nothing to subscribe the Gmail to, and the mail route of `docs/INBOX.md` does not apply.

- **Open feeds**, the way into this board's inbox:
  1. **Portal JSON, undocumented** (read from the portal's own scripts; no published API or terms, so the city's consent comes first, as for Shibuya). Plain GET, `application/json`, `Cache-Control: max-age=300`, no paging: each file is the whole current list as `{"items": [...], "total": n}`.
     - `https://bousai.city.sapporo.jp/data/news/emergency.json` (緊急情報) and `/data/news/news.json` (新着情報). Item fields: `emergencyNewsId` (int, the natural key), `emergencyNewsTypeCd`, `emergencyNewsTypeName`, `urgencyType`, `pubStartTimestamp`, `pubEndTimestamp`, `lastUpdTimestamp` (all `YYYY-MM-DD HH:MM:SS`, JST, no zone), `title`, `contents` (plain text with `\n`; Japanese, sometimes with a hand-written ＜English＞ paragraph), `refUrlPc`, `refUrlMobile`. The portal shows items with `pubStart <= now < pubEnd` (or no end), newest `lastUpdTimestamp` first. On 2026-11-05 `emergency.json` was empty and `news.json` held one item (a notice about Safari translation, last updated 2026-04-23 09:11:19).
     - `/data/evacorder/evacorder.json` (避難情報 and its history; the scripts read `evacOrderId`, `evacOrderTimestamp`, `municipalityCd`, `updateDateTime`, `fileName`, `riverCd`), empty on 2026-11-05; `/data/shelter/shelter.json` (722 facilities with type, hazard flags, `status` "1" when open, `latitude`, `longitude`); `/data/top/topdata.json` (per ward: alerts, rainfall, river levels, evacuation level).
     For the Shibuya poller this differs in three ways: no month files (one list per file), a numeric id instead of a time plus hash as the key, and `lastUpdTimestamp` to see an edited item. A generalized poller would take a feed adapter (list URL, item key, time field and format, title and body fields) and keep the state, ordering, attempts and inbox posting it has today.
  2. **City RSS 1.0**, documented at https://www.city.sapporo.jp/koho/hp/rss/index.html (更新日 2026-10-11): the 危機管理局 feed https://www.city.sapporo.jp/org/kikikanri/kikikanri_shinchaku.xml (latest 10 page updates, titles and links only, `dc:date` ISO 8601 with +09:00). Page updates, not alerts: an evacuation order appears only if the city writes a page for it. Not useful as a broadcast source.

- **Not confirmed.** (a) Outdoor 同報系 loudspeakers anywhere in 中央区; a search snippet counts Sapporo among towns with "同報系防災行政無線等" in a Hokkaido list that was not opened. (b) 大通公園 as a named 一時避難場所 (only "every park"). (c) JR 札幌駅's address and line names from JR itself: a secondary site gives 北区北６条西４丁目 and 函館本線, 学園都市線, 千歳線. (d) Whether the portal JSON is meant for reuse. (e) The contents of the 札幌駅・大通駅周辺地区都市再生安全確保計画 (8.6 MB PDF, not opened) and of the subway 避難経路図. (f) The landline service page carries a notice, 不正アクセスによる個人情報漏洩のおそれ, read but not followed up.

## Fukuoka: 博多 (`hakata`)

- **Area.** 13 町丁目 of 福岡市博多区 (city code `40132`) around 博多駅, one e-Stat small area each, none split, so the list stands as briefed:

  | code | 町丁目 | code | 町丁目 |
  |---|---|---|---|
  | 40132001001 | 博多駅前1丁目 | 40132003003 | 博多駅東3丁目 |
  | 40132001002 | 博多駅前2丁目 | 40132004001 | 博多駅南1丁目 |
  | 40132001003 | 博多駅前3丁目 | 40132004002 | 博多駅南2丁目 |
  | 40132001004 | 博多駅前4丁目 | 40132008001 | 住吉1丁目 |
  | 401320020 | 博多駅中央街 | 40132008002 | 住吉2丁目 |
  | 40132003001 | 博多駅東1丁目 | 40132008003 | 住吉3丁目 |
  | 40132003002 | 博多駅東2丁目 | | |

  Polygons `lib/geo/hakata.json`, 9,252 bytes, built 2026-11-05 from `code=40132` (zip 141 KB, `r2ka40132.shp`, 210 small areas). 博多駅 (33.5897, 130.4207) falls in 博多駅中央街 (`pnpm check:boards`).

- **Evacuation in this area.** 福岡市 does not assign shelters to areas: "避難所は、災害の状況等から、安全な施設を選んで開設します", and the 緊急情報 page says which are open. Its categories: 指定緊急避難場所 = 地区避難場所（屋内）, 地区避難場所（屋外）, 広域避難場所; 指定避難所 = 一時避難所 (公民館 and the like) and 収容避難所 (schools). Each site is marked usable or not for 浸水, 土砂, 高潮, 地震 and 津波, often "2階以上". **This matters here:** 堅粕小学校, 堅粕公民館 and 住吉小学校・中学校 are 使用不可 when flooded, and every outdoor site in the board is closed for 浸水 and 高潮. The seed's `target_areas_ja` follows the school zones (通学区域, source B): 堅粕小 serves 博多駅前2丁目, 博多駅中央街, 博多駅東1丁目 to 3丁目 and most of 博多駅前1丁目; 博多小 the rest of 博多駅前1丁目; 東住吉小 and 東住吉中 serve 博多駅前3丁目, 4丁目, 博多駅南1丁目, 2丁目; 住吉小・中 serve 住吉1丁目 to 3丁目. That mapping is ours, from an official list that is not a shelter list, and each shelter's `notes_ja` says so. Open for review.

- **Known places** (26, all `verified: true`, read 2026-11-05):

  | id | kind | place | source |
  |---|---|---|---|
  | `katakasu-es` | shelter | 堅粕小学校, 博多駅東1丁目8-1: 屋内・屋外・収容; 浸水時は使用不可, 高潮時は校舎2階以上 | A, B |
  | `katakasu-kominkan` | shelter | 堅粕公民館・老人いこいの家, 博多駅東1丁目8-2: 屋内・一時; 浸水・高潮時は使用不可 | A, B |
  | `toko-jhs` | shelter | 東光中学校, 東光2丁目15-1: the 中学校 of the 堅粕小 zone, usable when flooded; 高潮時は使用不可 | A, B |
  | `higashisumiyoshi-es` | shelter | 東住吉小学校, 博多駅南2丁目6-1: 高潮時は使用不可 | A, B |
  | `higashisumiyoshi-jhs` | shelter | 東住吉中学校, 博多駅南2丁目5-1: 浸水・高潮時は校舎2階以上 | A, B |
  | `higashisumiyoshi-kominkan` | shelter | 東住吉公民館・老人いこいの家, 博多駅前4丁目11-12: 浸水・高潮時は2階以上 | A, B |
  | `sumiyoshi-school` | shelter | 住吉小学校・中学校, 美野島3丁目22-7: 浸水・高潮時は使用不可 | A, B |
  | `sumiyoshi-kominkan` | shelter | 住吉公民館, 住吉5丁目6-1: 浸水・高潮時は2階以上 | A |
  | `hakata-es` | shelter | 博多小学校, 奈良屋町1-38: 収容, 高潮時は校舎2階以上 (for the 博多小 part of 博多駅前1丁目) | A, B |
  | `dekimachi-park`, `fujita-park`, `meiji-park`, `toryo-park`, `ninjin-park`, `nakahie-park`, `otowa-park` | park | 地区避難場所（屋外） inside the board, all 浸水・高潮時は使用不可: 出来町公園 (博多駅前1丁目), 藤田公園 (2丁目), 明治公園 (3丁目), 東領公園 and 人参公園 (4丁目), 中比恵公園 (博多駅東2丁目), 音羽公園 (博多駅南1丁目) | A |
  | `waterworks-hq` | water_point | 福岡市水道局本庁舎, 博多駅前1丁目28-15: a 給水基地 where 給水車 are filled; no page says residents collect water there, and the notes say so | C |
  | `hakata-sta` | station | 博多駅 (博多駅中央街): JR 鹿児島本線, 九州新幹線, 山陽新幹線, 地下鉄 空港線 and 七隈線 as aliases; the subway station is itself a 一時滞在施設 (交通局の覚書, up to 24 hours) | D, E |
  | `hakata-ward-office` | office | 博多区役所, 博多駅前2丁目8-1 (inside the board) | F |
  | `fukuoka-city-hall` | office | 福岡市役所, 福岡市中央区天神1丁目8番1号: three stops on 空港線; the full address keeps the map search out of 博多区 | F |
  | `hakata-underground`, `jrjp-hakata`, `kitte-hakata`, `kamiyo-hakata-chuo`, `connect-square`, `hakata-east-terrace` | commuter_shelter | 一時滞在施設 at the station: 博多駅地下街 (博多駅中央街1-1), JRJP博多ビル (8-1), KITTE博多 (9-1), 紙与博多中央ビル (7-21), and on the 筑紫口 side コネクトスクエア博多 (博多駅東1丁目17-1) and 博多イーストテラス (18-33). Opened on the city's request | E |

  Sources (all read 2026-11-05):
  - A. 指定緊急避難場所及び指定避難所一覧, https://www.city.fukuoka.lg.jp/bousai/shiteihinannbasyooyobishiteihinannjyoitirann.html (更新日 2024-08-28): names, addresses, the 注意 notes; the 博多区 PDF it links (https://www.city.fukuoka.lg.jp/bousai/documents/hakata.pdf, R5.5.1現在) gives the per-hazard grid. Definitions: https://www.city.fukuoka.lg.jp/bousai/shiteihinannbashooyobisiteihinannjyo.html (更新日 2023-05-01).
  - B. 通学区域, https://www.city.fukuoka.lg.jp/kyoiku-iinkai/tsuugaku/ed/area/tsugaku.html (更新日 2026-10-27), lists 学校別 and 町名別 (令和8年4月1日現在): the school of each 町丁目, and the 番 and 号 that split 博多駅前1丁目.
  - C. 水道局 災害時の対応, https://www.city.fukuoka.lg.jp/mizu/h_chosei/life/0043_2_2.html (更新日 2026-07-24): 配水池 as reservoirs, 拠点給水 (仮設水槽, 応急給水栓 at shelters and the like) and 運搬給水, no named supply points; 市議会 document of 2024-03-14 (https://www.city.fukuoka.lg.jp/gikaizimukyoku/giji/shisei/documents/20240314-suido-sanko2.pdf): "給水基地（水道局本庁舎）と給水車"; the address from https://www.city.fukuoka.lg.jp/mizu/somu/0017.html (更新日 2025-07-08).
  - D. 福岡市地下鉄 博多駅, https://subway.city.fukuoka.lg.jp/eki/stations/hakata.php: 所在地 博多区博多駅中央街, 空港線 and 七隈線. JR九州's station page (https://www.jrkyushu.co.jp/railway/station/1191771_1601.html) and its 構内図 (2024年10月現在) list no line names or street number; JR西日本's page returned 404. The JR line names are on every map and stand as aliases, as 東急 and 京王 do for 渋谷.
  - E. 帰宅困難者対策について, https://www.city.fukuoka.lg.jp/bousai/bousaibooklist_2.html (更新日 2026-07-23), and its PDF 福岡市内の一時滞在施設一覧（災害時応援協定） (令和8年3月末時点, 17 MB, the agreements themselves): facility names, addresses and spaces.
  - F. 博多区役所 access page https://www.city.fukuoka.lg.jp/hakataku/kikaku/kanren-shisetsu/hakata_new_building_access.html (更新日 2026-09-01); the city's page footer for 福岡市役所.

  Left out on purpose: 博多中学校 (対馬小路13-40, the 博多小 part of 博多駅前1丁目; 浸水・高潮時は使用不可), 旧住吉小学校 (住吉4丁目18-1), 美野島公民館, the neighbouring 春住小学校 (博多駅南5丁目3-1, the one site near the board marked usable for every hazard) and 春住公民館, the ward-level 博多市民センター and 博多体育館 (山王1丁目), the 広域避難場所 山王公園 and 東公園, the school grounds as 屋外 sites, 住吉公園 and 美野島公園 just outside the board, and the other 一時滞在施設 by the station (博多駅地下街's second agreement for 福岡朝日ビル, 近鉄博多ビル, JR九州ホテル ブラッサム福岡, ホテルフォルツァ博多駅筑紫口Ⅱ, 九勧承天寺通りビル, 西鉄ホテルクルーム博多, 福岡商工会議所ビル, 西日本シティビル, 中央日土地博多駅前ビル, NEWNO・ザイマックス博多駅前, 博多深見パークビルディング, ザ・ブラッサム博多), which can be added from source E the same way.

- **Where the broadcast text is published.** 福岡市 has no loudspeaker text either:
  1. **防災行政無線.** 福岡県's table 市町村防災行政無線の整備状況 (令和3年4月現在, https://www.pref.fukuoka.lg.jp/uploaded/life/668526_61585700_misc.pdf) gives 福岡市 a 移動系 system (H23) and no 同報系. No city page read mentions outdoor loudspeakers.
  2. **福岡市防災メール** (https://www.city.fukuoka.lg.jp/shimin/b_suishin/bousai/bousaimail.html, 更新日 2026-02-24): send an empty mail to `t-fukuoka-city@sg-p.jp`, open the URL in the reply from `bousaimail@fukuoka-city.jp`, agree to the terms, choose categories. 緊急情報 (避難勧告などの緊急情報) cannot be deselected; the others are 気象警報・注意報, 土砂災害警戒情報, 地震情報, 津波情報, 雨量情報, 記録的短時間大雨情報, 河川水位情報, 光化学オキシダント情報, 熱中症情報, 黄砂情報, PM2.5情報, 竜巻注意情報, 週末の天気予報, 下水道水位情報, 火災警報. Japanese only, no ward or 校区 choice. `sg-p.jp` is the same delivery service as メールニュースかわさき, so the Kawasaki Gmail and filter pattern applies as it is. **This is the board's route into the inbox** (`docs/INBOX.md`, "When the list registers by empty mail"): subscribe the Gmail, keep 緊急情報 only (every other category would cost Claude calls for what the board does not need), forward to `bousai-hakata@engawaboard.com`, and set the allowed sender from the first real mail (the page names `bousaimail@fukuoka-city.jp` as the reply address and the address to allow; the sender of the alerts themselves is not stated).
  3. **福岡市 LINE 公式アカウント** @fukuokacity (https://www.city.fukuoka.lg.jp/shimin/b_suishin/bousai/line_evacuation.html, 更新日 2022-05-24): evacuation information, weather warnings, earthquakes; in disaster mode it suggests actions for the current position and searches open shelters.
  4. **防災アプリ「ツナガル+」** (https://www.city.fukuoka.lg.jp/shimin/t_bousai/tsunagaru_plus.html, 更新日 2026-08-27): switches to 災害時モード with a notification; shelter list, map and an 電子掲示板. Push only.
  5. **Web pages.** 緊急情報 https://www.city.fukuoka.lg.jp/bousai/emevacuate.html ("現在、福岡市内に避難情報は発令されていません" on 2026-11-05) and 福岡市防災気象情報 https://bousai.city.fukuoka.lg.jp/ with 災害速報 (https://bousai.city.fukuoka.lg.jp/sokuho_2.html: rows of time without year, title and summary, and a PDF per item; latest on 2026-11-05: 令和８年７月５日福岡市災害警戒本部の廃止について, 07月05日 11時14分). Static HTML, Japanese; Google Translate links for English, Chinese and Korean. やさしい日本語 and English updates in a disaster go to the Global Community Fukuoka Facebook page (https://www.city.fukuoka.lg.jp/soki/kokusai/shisei/disasterprevention/disasterinformation.html).

- **Open feed.** Only one, and not for alerts: the RSS 2.0 feed of new pages in the city's 防災 section, https://www.city.fukuoka.lg.jp/data/open/rss/RSS_10795.xml (linked from https://www.city.fukuoka.lg.jp/bousai/index.html). Channel "防災情報（新着一覧）", `dc:language` ja; items have `title`, `link`, `description` (mostly empty) and `pubDate` in RFC 822 with "JST" (many at 00:00:00); no `guid`, no paging, the newest 30. It did not carry 避難情報 text. The 災害速報 page above is the nearest thing to a broadcast list: a poller could read its rows (time, title, summary, PDF link), but the year is not on the row and the text sits in PDFs, so mail is the better source for this board. For the Shibuya poller generalization this adds one more adapter shape, HTML rows instead of JSON.

- **Not confirmed.** (a) The From address of the alert mails (only the reply address is stated). (b) Whether 緊急情報 mails carry the full evacuation text or a notice with a link. (c) JR's line names and the street number 博多駅中央街1-1 from JR itself (secondary sources only). (d) The subway station numbers K11 and N18 (not used). (e) Any public 応急給水 point inside the 13 町丁目; the bureau names none. (f) That the 公民館 校区 matches the school zone (住吉小 and 美野島小 merged in 2012; the list still has both 公民館). (g) Whether 浸水 in the grid covers both 洪水 and 内水氾濫. (h) On 2026-10-15 the city reported unauthorised access to the separate phone and FAX alert service (福岡市避難情報配信システム, possible leak of 1,038 people's numbers, https://www.city.fukuoka.lg.jp/bousai/bousaikojinjohorouei.html); the mail service is not named in it.

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
