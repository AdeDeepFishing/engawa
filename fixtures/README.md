# Fixtures

Test inputs for the extraction and reconciliation pipeline, and for the eval script.

## Provenance: test material only

- Everything in `inputs/` is hand-made test material. It is not a deliverable, and no feature in this repository depends on it to run.
- The image fixtures were made during the event, on 2026-11-03, by Claude Code: HTML rendered and screenshotted with Playwright by `tools/` (see below). Paper notices imitate Japanese shelter and management-company notices. Chat and post screenshots imitate the layout and colours of LINE, WeChat, X and Xiaohongshu only: no logo, app name or trademark appears in any image.
- Every paper notice carries a 「訓練用・想定シナリオ」 stamp and has no municipal crest, logo or phone number, so it cannot be mistaken for an official notice.
- Every person, nickname, handle, phone number and room number is fictional. Phone numbers follow the obviously fake pattern 090-1234-xxxx. Avatars are generated shapes and initials, never photos. Place names are real public places near 武蔵小杉 from `supabase/seed/boards.json`, so that place normalization can be tested. No real person, business or private address appears.
- `expected/` and `masking/` hold the ground truth for the eval, written during the event.

## Status

- Text fixtures (`*.txt`) were written by Claude Code on 2026-11-03. `t02` and `t03` are text stand-ins for `p02` and `p03`. `s02` is the `t02` text rendered as an 800 by 600 image, used to measure the vision path before the rendered notices existed.
- Rendered image fixtures, their `expected/` files and the `masking/` boxes were made by Claude Code on 2026-11-03.
- Still to come from the human: phone photos of some printed notices (name them like `p02-water-distribution-notice.real.jpg` and add them to `variants` in the expected file), and a native speaker check of `p05-facebook-water-vi.txt`.
- `expected/` files for the text fixtures (`t02`, `t03`, `s02`, `p05`, `p06`, `p08`, `a01`, `a03`) are not written yet.
- Three inputs are also published under `public/samples/` for the board's "Try with a sample" row, so a judge on the deployed URL can run the real pipeline: `notice.jpg` is `p01-water-outage-notice.jpg`, `chat.png` is `p03-wechat-konbini.png`, `text.txt` is `p08-queue-short.txt`. Copy them again when those fixtures are re-rendered.

## Layout

```
fixtures/
  inputs/
    p01-water-outage-notice.{png,jpg}            paper, ja, peacetime building notice, 11/19 10:00 to 15:00
    p02-water-distribution-notice.{png,jpg}      paper, ja, 小杉小学校 shelter, 本日 14:00 to 16:00, bring containers
    t02-water-distribution-notice-ja.txt         text stand-in for p02
    s02-water-distribution-notice-synthetic.jpg  early rendered stand-in for p02 (vision path)
    p03-wechat-konbini.png                       WeChat-style screenshot, zh, store in front of the station, room and phone number planted
    t03-wechat-konbini-zh.txt                    text stand-in for p03, includes a room number to strip
    p04-line-water-same-fact.png                 LINE-style screenshot, ja, same fact as p02, one phone number
    p05-facebook-water-vi.txt                    text, vi, same fact as p02
    p06-rumour-aftershock.txt                    text, ja, rumour
    p07-water-time-change.{png,jpg}              paper, ja, update of p02: start moved to 15:00
    p08-queue-short.txt                          text, en, firsthand
    p09-shelter-rules-notice.{png,jpg}           paper, ja, shelter rules: pets, quiet hours
    p10-supplies-distribution-notice.{png,jpg}   paper, ja, diapers, formula and blankets, 本日 17:00 to 19:00
    p11-x-shelter-full.png                       X-style timeline, ja, 小杉小学校 shelter full, 中原中学校 has room
    p12-xhs-shelter-full-zh.png                  Xiaohongshu-style note, zh, same two facts as p11
    a01-scam-transfer.txt                        adversarial, scam
    a02-injection-mark-official.png              adversarial, LINE-style, prompt injection inside an ordinary message
    a03-group-accusation.txt                     adversarial, group accusation
  expected/<id>.json                             expected key fields for each rendered input
  masking/<id>.json                              pixel boxes of names, avatars, phone numbers, room numbers and handles per screenshot
  tools/                                         renderer: specs.mjs (all content), templates/, render.mjs
  demo/<board>/                                  inputs of the five newer boards' sample cards (demo-specs.mjs, render --demo), see demo/README.md
```

For each paper notice the `.png` is the clean A4 page (1588 by 2246, printable) and the `.jpg` is a photo-like version: the print taped to a plain wall, rotated 1 to 2 degrees with a slight keystone, soft shadow, paper texture, uneven light and vignette (1512 by 2016). Screenshots are iPhone size, 1170 by 2532.

## Regenerate

One command from the repository root (the install only touches `fixtures/tools/`, never the root `package.json` or lockfile):

```bash
pnpm --dir fixtures/tools install --ignore-workspace && pnpm --dir fixtures/tools render
```

`pnpm --dir fixtures/tools render p02 p04` renders only those ids. If Chromium for Playwright 1.62 is not installed yet, run `pnpm --dir fixtures/tools exec playwright install chromium` once. The renderer also writes `fixtures/tools/out/contact-sheet.png` (not committed) with every output on one page and the masking boxes drawn as outlines.

Fonts come from the system (Hiragino Sans and PingFang SC on macOS). On one machine a re-render is byte-identical; on another machine glyphs can shift by a few pixels. The masking boxes are measured from the same render as the image, so always commit an image and its `masking/` file together. The renderer warns if a masked name or number is missing from `must_not_contain`, and fails if a notice overflows its page.

## Expected file shape

```json
{
  "input": "p02-water-distribution-notice.jpg",
  "variants": ["p02-water-distribution-notice.png"],
  "source_platform": "paper",
  "facts": [
    {
      "category": "water",
      "place_id": "kosugi-es",
      "valid_from": "T14:00",
      "valid_until": "T16:00",
      "conditions_include": ["container", "10"],
      "source_type": "official"
    }
  ],
  "must_not_contain": [],
  "risk_flags": [],
  "merges_with": ["p04", "p05", "s02", "t02"],
  "notes": "Demo step 1."
}
```

- `input` is the main file; `variants` are other files with the same content and the same expectations (the clean PNG of a notice, later a real photo).
- `facts` lists the facts that must be found. Each key present in an expected fact is checked; keys that are absent are not checked. An extra fact is not a failure by itself; invented facts are judged against the input.
  - `category` is a string, or a list of acceptable categories when the input is genuinely ambiguous (`p09`).
  - `valid_from` and `valid_until` are matched as substrings of the ISO timestamp: `"T14:00"` checks the time on any date, `"2026-11-19T10:00"` also checks the date, `null` means the field must be null.
  - `status` is one of the extract schema's statuses.
  - `conditions_include`: each string must appear, case-insensitively, in at least one condition.
  - `en_include`: each string must appear, case-insensitively, in the English title or body.
- `must_not_contain` lists the fictional names, handles, phone numbers and room numbers planted in the input; the eval fails if any appears in any output field. Hiragana given names that are also parts of ordinary words (あきら, ゆい) are listed only within the full name.
- `risk_flags` must each be set on at least one fact.
- `merges_with` lists inputs that state the same fact and must end up on the same card.
- `updates` (only `p07`) lists inputs whose card this one must update rather than duplicate. Drop it in after them; the expected times are the card's times afterwards.
- `creates_beside` (only `p10`) lists inputs whose cards must already be on the board when this one is dropped in; it must still come back as `create` (same shelter, different category). The reconcile eval appends it to that group's chain.
- `notes` is for people reading the file and is not checked.

## Masking file shape

```json
{
  "input": "p04-line-water-same-fact.png",
  "width": 1170,
  "height": 2532,
  "boxes": [
    { "kind": "avatar", "label": "田中 美咲", "x": 30, "y": 448, "w": 114, "h": 115 },
    { "kind": "phone", "label": "090-1234-0347", "x": 436, "y": 1657, "w": 371, "h": 49 }
  ]
}
```

Boxes are in pixels of the input image, measured with `getClientRects` at render time, clipped to the visible part of the screen and rounded outward. `kind` is `avatar`, `name`, `phone`, `room` or `handle`. `label` is the visible text, or for an avatar the name of its owner (`(self)` for the uploader's own avatar). A partly visible element at the edge of the chat area gets a box for its visible part only.

`pnpm eval:mask` runs the masking step on each of these inputs and counts a box as covered when at least 95 percent of its area lies under the painted (padded) boxes. The masked images land in `tools/out/masked/` (not committed) so a person can look at them. Results and the ship decision are in `docs/EVAL.md`.

## Things to know when running the eval

- The 「訓練用・想定シナリオ」 stamp is part of every paper notice. If the extractor treats a stamped notice as a drill (`daily_notice`) or mentions the stamp in card text, that is a real finding: fix it in the prompt, not by removing the stamp.
- `p09` answers "can I bring my cat to the shelter". Keep it off the board before demo step 5, which expects "no information yet".
- `p10` and the water card share a place but not a category. They must stay separate cards.

- `h01-loudspeaker-garbled-ja.txt`: a fragmentary speech-recognition transcript of a 防災行政無線 broadcast (written 2026-11-04 during the event): a place heard as なかはら…がっこう that matches two known schools, a garbled hour, a repeat. Scored with `channel: loudspeaker`; the expected file says place and time stay null.
