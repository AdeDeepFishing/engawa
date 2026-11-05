# Demo inputs

The inputs from which the sample cards of the five newer boards (`shibuya`, `ueno`, `mizonokuchi`, `sapporo`, `hakata`) were made, through the real pipeline on throwaway copies of those boards. The cards themselves are in `supabase/seed/sample_cards.json`; how they were made and how to make them again is in `docs/BOARDS.md`, section "Sample cards".

## Provenance: fictional material only

- Made during the event, on 2026-11-05, by Claude Code. The images were rendered with Playwright by `fixtures/tools/` from `fixtures/tools/demo-specs.mjs`; the texts were written by hand.
- Every association is fictional: みずき町会, こもれび町会, ひばり町内会, すずらん町内会, なぎさ町内会, and the unnamed 商店会 and 管理組合. So are the events, the chat members (森 さやか, こうじ, はるな, 井上 直樹) and the phone number, which follows the obviously fake 090-1234-xxxx pattern. Avatars are generated shapes and initials, never photos.
- Place names are real public places from each board's `known_places` in `supabase/seed/boards.json` (stations, parks, schools used as shelters, a ward office, a community hall), so that place matching is exercised. No real company, official, business or person is named, and no event claims to be run by a real ward, city or utility.
- Peacetime content only, dated 11/08 to 11/21: drills, a water drill, a planned water outage for pipe work, cleanups, a talk, a collection time change, a bicycle parking closure for the winter. No emergency, injury or missing person.
- Unlike the notices in `fixtures/inputs/`, these carry no 訓練用・想定シナリオ stamp: the stamp ends up in the card text, and these are ordinary announcements of fictional associations, not shelter or official notices. Still no crest, logo or phone number on any notice, and no app name, logo or trademark in the chat screenshot (LINE-style layout and colours only).

## Files

Paper notices come as the clean A4 `.png` and the photo-like `.jpg` (the print taped to a wall); the `.jpg` is what was dropped in. The chat screenshot is iPhone size, 1170 by 2532.

```
shibuya/
  sh1-fire-watch-notice.{png,jpg}        paper, ja, 町会 notice: 夜回り for the autumn fire prevention campaign, 11/9 to 11/13, 神宮通公園
  sh2-machiaruki-ja.txt                  pasted text, ja, 町会 announcement: 防災まち歩き 11/14, meet at 渋谷区役所
  sh3-line-cleanup.png                   LINE-style group chat, ja, 道玄坂 cleanup 11/21 from ハチ公前広場; one name and one phone number planted
ueno/
  ue1-water-drill-notice.{png,jpg}       paper, ja, 町会 notice: 給水訓練 11/15, 上野恩賜公園 給水ステーション
  ue2-loudspeaker-ja.txt                 heard (防災行政無線 loudspeaker, as transcribed), ja, joint drill 11/14 10:00 to 12:00 at 上野恩賜公園, the plaza in kana (たけのだい広場), no opening formula
  ue3-wechat-zh.txt                      pasted chat message, zh (WeChat group relay), furniture safety talk 11/19, 東上野区民館
  ue4-collection-ja.txt                  pasted text, ja, 回覧板: 集団回収 now by 8:30, next on 11/18
mizonokuchi/
  mz1-shelter-drill-notice.{png,jpg}     paper, ja, 町内会 notice: 避難所開設訓練 11/21, 高津小学校
  mz2-facebook-vi.txt                    pasted post, vi (Facebook group style), water outage for pipe work 11/12 in a building near 溝の口駅
  mz3-leaves-cleanup-ja.txt              pasted text, ja, 町内会 and 商店会: leaf cleanup 11/8 at 溝の口駅 北口
sapporo/
  sp1-winter-shelter-notice.{png,jpg}    paper, ja, 町内会 notice: winter shelter experience and snowy road walking 11/21, 資生館小学校
  sp2-snow-volunteers-en.txt             pasted post, en, snow shovel volunteers, kick-off 11/14 at 大通公園 西6丁目
  sp3-bicycle-parking-ja.txt             pasted text, ja, 管理組合: bicycle parking closed for the winter from 11/20
hakata/
  hk1-pipe-work-outage-notice.{png,jpg}  paper, ja, 管理組合 notice: water outage for pipe work 11/17 10:00 to 14:00
  hk2-kakao-ko.txt                       pasted chat message, ko, disaster class for foreign residents 11/15, 東住吉公民館
  hk3-park-drill-ja.txt                  pasted text, ja, 町内会: storehouse check and fire extinguisher practice 11/14 10:00 to 10:30, 藤田公園
```

## Regenerate the images

```bash
pnpm --dir fixtures/tools install --ignore-workspace && pnpm --dir fixtures/tools render --demo
```

`render --demo sh1 ue1` renders only those ids. Demo inputs have no `expected/` or `masking/` files: they are not part of the eval.
