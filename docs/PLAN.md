# Implementation plan

Written on 2026-11-02 evening (JST), after the kickoff. Updated as the week goes. The task board at the bottom is the ticket list: one line per task, checked when it runs on the deployed URL.

Deadline: official 2026-11-08 20:00 JST. Internal: submit by 2026-11-07 21:00 JST.

## 1. The one demo scenario

Everything (fixtures, known places, prompts, seed, recording) is built around this chain on the 武蔵小杉 board. The shelter in steps 1 to 4 is 小杉小学校 (Kosugi Elementary School, 小杉町2-295-1), the designated shelter for 小杉町2丁目 and 3丁目 per the city's list as of 2025-04-01, spelled the way each platform would spell it. The real emergency water point nearest the station is 中原区役所 (小杉町3-245).

1. 佐藤さん photographs the water distribution notice at a shelter entrance (Japanese paper) and drops it in.
2. Within about 15 to 25 seconds, the same card appears in Japanese, English and Chinese on three screens: place, time, "bring your own container", source type "official notice (unconfirmed)".
3. チェンさん drops in a WeChat screenshot (Chinese): the convenience store in front of the station is open and has water. 佐藤さん sees a Japanese card tagged "heard from others".
4. Someone drops in a LINE screenshot (Japanese) and a Vietnamese Facebook post about the same water point. No new card appears. The original card now says "3 sources".
5. Maria asks in English: "Where can I get water? Can I bring my cat to the shelter?" The answer cites cards. For the cat it says the board has no information about that yet.
6. A rumour ("M8 aftershock in 2 hours") is dropped in. The uploader sees "not public yet, it needs checking first". Nothing appears on the board.
7. Maria photographs the queue and drops in "The line is short now, about 10 people." 佐藤さん sees it in Japanese, tagged "seen firsthand".

## 2. Scope

### Must ship (planned green by 2026-11-05 21:00; all green on 2026-11-03)

| # | Feature | Cut to |
|---|---|---|
| S1 | Board page `/b/[slug]` | SSR card list. Language switch ja/en/zh/ko/vi, follows the browser, remembered locally. Card detail sheet: all languages, PII-stripped original, source list. Category filter optional |
| S2 | Drop-in | One big button: camera, choose image, text. No hint chips. Browser re-encodes to JPEG with long edge at most 1568px, which drops EXIF. Upload through the route handler, which strips metadata again before storing. Placeholder card "organizing" appears at once. One-line purpose notice on first drop-in |
| S3 | extract | One structured-outputs call: facts, category, place normalized to known places, times, validity, conditions, source type, platform, risk flags, PII-stripped original, all six languages. Measure on 2026-11-03 with five fixtures; if over 20 seconds, split into extract (ja, en, source language) and translate (the rest) |
| S4 | reconcile | No agent loop. Code selects candidates (same board, same category, not expired or within 24h, same place_id or null place, at most 20, compact JSON). One structured-outputs call returns `create`, `merge`, `update`, `conflict` or `hold`. Code checks the target is in the candidate list, then applies. Conflict is a label plus both statements |
| S5 | Card signals | Category icon, place, "N minutes ago", source type, source count, expired cards greyed with "may be outdated", held cards not public |
| S6 | Ask | Citations API, one document per public card. Non-streaming with a skeleton first. Citation chips map to cards. "No information yet" when absent. Questions are not stored |
| S7 | Share | Web Share API with copy-link fallback. Fullscreen QR. One static OG image and per-language title |
| S8 | Updates | Poll every 5 seconds. Supabase Realtime broadcast only as a "board changed" hint if time allows |
| S9 | Minimal admin | Secret link `/api/b/[slug]/admin/enter?token=` sets a 12 hour cookie for `/b/[slug]/admin`: held queue (publish or hide), confirm official, hide any card |
| S10 | Deletion | `purge_after` computed at write time. Chat screenshot originals deleted right after processing. Daily purge job deletes storage objects, then rows. Retention table in `docs/PRIVACY.md` |
| S11 | Abuse and budget | 3 submissions per device per minute, 30 per board per minute, a daily Claude call cap (`DAILY_CLAUDE_CALL_CAP`), 8 MB image limit. Over the cap: "busy, try again later" |
| S12 | Eval | `scripts/eval.ts` over 20 fixtures: field accuracy, PII leaks (must be 0), invented facts (must be 0), multilingual duplicates merged into one card. Results table in `docs/EVAL.md` and README |

### Only after every must item is green, in this order

- G2 uploader area badge: only this board's simplified polygons (a few KB) shipped to the client, point-in-polygon in the browser, only the area code sent. Wording: "self-reported area". About 2 hours. Done 2026-11-03.
- G3 printable A4 QR poster page `/b/[slug]/poster`. About 1 hour. Done 2026-11-03.
- G1 pink masking of names and avatars in chat screenshots. Hard 3 hour time box. Ships only at 100% coverage on the masking fixtures; otherwise chat screenshots stay text-only. Done 2026-11-03: 50 of 50 boxes covered on five fixtures, on by default, `MASKING_ENABLED=0` turns it off.

### Nice to have, from 2026-11-04 (the must list went green two days early)

Ranked by value on the judging axes (impact, demo, use of Claude, depth) against effort. Each ships in its own PR with its acceptance line on the task board.

- N1 Try it with a sample: the drop-in panel offers three sample inputs (a paper notice photo, a chat screenshot, a text) so a judge can run the whole pipeline on the deployed URL without printing anything. Demo. About 1 hour. Done 2026-11-04.
- N2 Share one card: a per-card page with its own OG title, and "copy as text" in the reader's language so a card can be forwarded into a LINE or WeChat group, the reverse of the drop-in direction. Impact. About 1.5 hours. Done 2026-11-04.
- N3 Hidden and merged drawer: a collapsed list at the bottom of the board holds cards the admin hid as duplicates; a card's sources expand to their original text; the admin page gets "hide as duplicate of". Depth. About 2 hours. Done 2026-11-04.
- N4 How this card was made: the reconcile decision and its reason are stored; the card sheet shows the chain (source, extract, merge or update with the reason, admin confirmation). Use of Claude. About 2 hours. Done 2026-11-04.
- N5 Multilingual notice back: from a card, a printable A4 notice in six languages with the board QR, so a building manager can replace the Japanese-only paper. Impact and demo. About 2 hours. Done 2026-11-04.
- N6 Reader confirmations: "still true" and "no longer true", one tap per device; bumps `last_confirmed_at` or opens a conflict. Depth. About 2 hours. Done 2026-11-04.
- N7 Suggested questions per language above the ask box, and follow-up questions in the same thread. Demo. About 1.5 hours. Done 2026-11-04.
- N8 Read aloud with the Web Speech API for the card text in the reader's language and やさしい日本語. Impact. About 1 hour. Done 2026-11-04.
- N9 Offline snapshot: a service worker keeps the last board page for when the network drops, with a "last updated" banner. Impact. About 2 hours. Done 2026-11-04.
- N10 Place view: cards grouped by known place with its address; shelter status at a glance. Depth. About 2 hours. Done 2026-11-04.
- N11 Extract on `claude-fable-5-1` versus `claude-opus-5-5` on the eval, recorded in `docs/EVAL.md`. Use of Claude. About 1 hour of API time. Done 2026-11-04.
- N12 Board index and a "make a board" form (name, area, places from the city list) that shows the admin link once. Impact. About 3 hours.
- N13 Claude Code visible in the repo: a pre-commit hook that runs the dash scan and the i18n parity check, a project skill for the throwaway-board acceptance run, the review subagent definition, and a README section on which model and which Claude Code feature did what and why. Use of Claude (the criteria ask for Skills, subagents, MCP and hooks chosen by purpose). About 1.5 hours. Done 2026-11-04.
- N14 About page `/about` in five languages: who the board is for (named people and scenes, with numbers for 中原区), what it does with their data, who runs it after the event. Impact (the criteria ask who, in what scene, how much, and who keeps using it). About 1 hour. Done 2026-11-04.
- N15 Loudspeaker broadcasts into the board: an "I heard the loudspeaker" input that transcribes the 防災行政無線 with the browser's speech recognition into an editable box (secondhand, platform loudspeaker), and an official inbox that turns the city's broadcast mail (メールニュースかわさき, forwarded by a mail worker the human wires) into official cards. Impact (foreign and hard-of-hearing residents miss the loudspeaker). About 4 hours. Done 2026-11-04.
- N16 Laptop layout: three columns at 1024 px and wider (list, card in place, ask), two on tablets, keyboard navigation, the open card in the URL; plus a polish pass on empty states, spacing, hover and focus. Demo (the video is recorded on a laptop). About 4 hours. Done 2026-11-04.
- N17 Open in maps: a card with a known place gets an "Open in maps" link built from the place's Japanese name and address (a Google Maps search URL, which opens the Maps app on a phone; no API key, nothing leaves the phone until the tap). A card with only `place_text_ja` searches that text with the board's area appended. Impact and demo. About 1 hour. Done 2026-11-04.
- N18 Second board, Shibuya: a Tokyo board next to the Kawasaki one, to show the setup is per city, not per code. Needs the ward's shelter list and 町丁目 polygons (same sources and tools as 中原区), a seed, a second routing address and inbox secret (the worker takes a map of address to board), and the ward's own broadcast mail: each city publishes its 防災行政無線 through its own service (Kawasaki through メールニュースかわさき; Shibuya's しぶや安全・安心メール still to be confirmed as carrying the broadcast text), so each board is one more subscription through the same relay mailbox with one more filter. Impact. About 3 hours plus the human's registration steps. Done 2026-11-04 (data, polygons, seed and `docs/BOARDS.md`; the Shibuya mail subscription is the human's).
- N19 Home page: what the board is in one sentence, a Japan map of prefecture polygons with the boards' prefectures highlighted, board cards with live counts, three steps in the UI's own words, footer links; only listed boards (migration 0008) so acceptance leftovers never show. Demo and impact. About 2 hours. Done 2026-11-04.
- N20 Brand: a mark that reads at 16 px, favicon, apple icon, manifest icons, root and board OG images, the accent colour changed from green to a deep rose with a contrast table. Demo. About 1.5 hours. Done 2026-11-04.
- N21 Disaster mode as a real state: admin switch with the reason recorded (migration 0009), automatic switch when the city's broadcast mail carries an evacuation order or a strong quake, automatic return after 7 quiet days, and a visibly different board in disaster mode (red strip, official and danger first, water, shelter, medical and danger filters pinned, loudspeaker input first). Impact and demo. About 3 hours. Done 2026-11-04.
- N22 More cities on the map: Sapporo and Fukuoka boards by the checklist in `docs/BOARDS.md`, so the map has a board in the north, the centre and the south. Data work per city (shelters, water points, polygons, seed) plus the city's broadcast mail. About 3 hours each. Planned after the video.
- N23 Two more boards after the video, lower priority: 高津区 (川崎市, its own board beside 武蔵小杉; the city's mail already covers it, so the forwarder learns to post one mail to two boards) and 上野 (台東区; check whether the ward publishes its broadcasts like 渋谷区). About 3 hours each.

### Not this week

Peace/disaster mode switch, safety check-in, Android share target, Managed Agents, runtime model comparison beyond the eval.

## 3. Architecture decisions

**Hosting: Vercel Hobby (free).** Cloudflare Workers was the first choice, but its free plan allows 10 ms of CPU per request (waiting on I/O does not count), which is too tight for Next.js server rendering, and `waitUntil` stops 30 seconds after the client disconnects. There is no budget for the paid plan this week. Vercel Hobby gives functions up to 300 seconds, one cron job per day, and automatic deploys from GitHub at no cost. Nothing in the code depends on Vercel except `vercel.json`, so a later move to a paid Workers plan stays possible. Set `cacheComponents: false` in `next.config.ts` so dynamic server rendering behaves classically. Keep the pure JS image stripping anyway; it keeps the app portable.

**Database and files: Supabase Postgres and Storage** through `@supabase/supabase-js` over HTTP. Service role key only on the server. RLS enabled on all tables with no policies. One private bucket `submissions`. Uploads go browser to route handler (multipart, well under the 4.5 MB function body limit after browser compression), which strips metadata and stores the object with the service role. Decided on 2026-11-03 instead of signed upload URLs: no Supabase key in the browser at all, and no unstripped image ever lands in storage. The server downloads the object again to send it to Claude.

**Processing is client-driven.** `POST /api/b/[slug]/submissions` creates the row and returns the id. The client then calls `POST /api/process/[id]` and keeps the connection open while the server streams stage events (`stripping`, `extracting`, `reconciling`, `translating`, `done`, `failed`). The route runs within the 300 second function limit, which is far above the pipeline's 30 to 60 seconds. If the client disconnects, the run carries on to the end inside the same function (`after()`, since 2026-11-06) and the board's poll shows the cards; a run that dies anyway is left in `processing`, and the watchdog (checked on read) marks it `failed` after 330 seconds, above the function limit, with a retry button. A later upgrade path is Cloudflare Queues or Workflows; not this week.

**Image handling without sharp.** Browser: `canvas` re-encode to JPEG (drops EXIF, applies orientation). Server: a small pure JS stripper that removes JPEG APPn and COM segments and PNG ancillary text and eXIf chunks before storing or sending to Claude. Base64 size stays under the vision limits.

**Claude calls** (`lib/claude/`). Exact parameter names come from the `claude-api` skill at implementation time.
- `extract`: `claude-opus-5-5`, vision, structured outputs with `schemas/extract.schema.json`, low effort, system prompt and board context cached, user content last. Input: image or text, `now` in JST, board mode, known places.
- `translate` (only if extract is split): structured outputs with `schemas/translate.schema.json`.
- `reconcile`: structured outputs with `schemas/reconcile.schema.json`. Input: the new fact plus candidate cards. Output: one decision. Code validates and applies.
- `ask`: Citations with one document per public card (title and body in the reader's language, with Japanese place names kept). Start with `claude-sonnet-5-5` for speed; switch to Opus if answers are weaker on the fixtures. Non-streaming first.
- No fallbacks beta, no Managed Agents unless the eval shows refusals.

**Deletion.** `purge_after`: chat screenshot originals right after processing (24h at most); paper photos and cards `valid_until + 30 days`; devices last seen + 90 days. Purge runs daily: a `vercel.json` cron (Hobby allows one run per day, executed some time within the scheduled hour) calls `/api/cron/purge` with `CRON_SECRET`. Supabase `pg_cron` is the alternative if the platform ever changes. "Disaster ended" has no switch this week; everything is time based and the README says so. No zero-data-retention claim about the Claude API.

**Identity and abuse.** Random `device_id` in localStorage. Admin token hashed in the database. Rate limits are Postgres counts. Daily Claude cap in `usage_daily`. Cloudflare Turnstile is a later add.

**i18n.** Own dictionary: `lib/i18n/messages/{ja,en,zh,ko,vi}.json` and `t(key, lang)`. Locale from `navigator.language` on first visit, then localStorage. No route prefixes.

**Location (G2).** Polygons per board, simplified with mapshaper from e-Stat 小地域 boundaries, bundled as a few KB. For a whole-country version later: vector tiles of boundaries so the client fetches only its tile, or the GSI reverse geocoder called from the browser.

## 4. Data model

See `supabase/migrations/0001_init.sql`. Tables: `boards`, `submissions`, `cards`, `card_sources`, `devices`, `usage_daily`. Card text fields are JSON objects keyed by language (`ja`, `en`, `zh`, `ko`, `vi`, `easy_ja`).

Categories and default validity (hours): `water` 6, `food` 6, `supplies` 12, `shelter` 12, `medical` 12, `power_comms` 12, `shops` 3, `transport` 3, `danger` 24, `official_notice` 72, `daily_notice` 720, `other` 12. An explicit end time in the source always wins.

## 5. Task board

Owner for implementation: Claude Code. The plan said `claude-opus-5-5`; in practice every session up to 2026-11-04 10:00 JST ran on `claude-fable-5-1` while the weekly budget allowed, and `claude-opus-5-5` implements from then on. Planning, prompt design, reviews and merges: `claude-fable-5-1`. The human reviews, runs manual checks, handles accounts and secrets, and talks to native speakers. The dates below are when the work happened: the original schedule ran one to two days later, and the must list went green on 2026-11-03.

### 2026-11-02 (Mon): kickoff, board live, drop-in to card
The implementation items ran from the kickoff evening into the early hours of 11-03.
- [x] Private repo created after kickoff, scaffold committed
- [x] CLAUDE.md, this plan, DEVLOG, PRIVACY
- [x] Initial schema migration and seed drafts
- [x] Prompts and JSON schemas for extract, translate, reconcile, ask
- [x] Set `cacheComponents: false`; add `typecheck`, `db:migrate`, `db:seed`, `eval`, `purge`, `latency` scripts (deploys happen on push, so no `preview` or `deploy` script)
- [x] Supabase: apply `0001_init.sql` over the session pooler with `pnpm db:migrate` (no CLI login needed); bucket created by the migration
- [x] Run the seed with the secret key (admin token written to a git-ignored file)
- [x] `lib/i18n` dictionary with the key UI strings in five languages; language switch; locale from cookie, else Accept-Language
- [x] `/b/[slug]` SSR card list from seed; card detail sheet; text size toggle
- [x] First Vercel deploy from `main`; `maxDuration` set on the process route; the deployed board renders the seed cards
- [x] Drop-in UI: camera, image, text; browser compression and EXIF removal; upload through the route handler; purpose notice
- [x] `POST /api/b/[slug]/submissions`; `POST /api/process/[id]` with SSE stages; server metadata strip (pure JS, tested on planted EXIF, COM, tEXt, eXIf and a post-EOI trailer)
- [x] `lib/claude/extract.ts` using the prompt and schema; cards written; placeholder replaced; polling
- [x] Delete chat screenshot originals after processing; `purge_after` set on every row
- [x] Measure extract latency on five fixtures; decide one call or extract plus translate; record in DEVLOG

Human, the same day:
- [x] Create the Supabase project (Tokyo region), put URL, anon key and service role key in `.env.local`
- [x] Put the hackathon Anthropic API key in `.env.local`
- [x] Create the Vercel project from the GitHub repo (Hobby), add the environment variables, confirm the first deploy
- [x] Shelter list verified against 川崎市地域防災計画 資料編 2-06 (as of 2025-04-01) and 2-18 water points; `supabase/seed/boards.json` updated
- [x] Prepare fixture inputs (paper notices, chat screenshots with fake names and avatars, text) into `fixtures/inputs/` with a note on which real shelter they name

### 2026-11-03 (Tue, holiday): reconcile, trust, admin, ask, share, limits, eval, G items
Two implementation sessions ran side by side (branches `day2-reconcile-admin`, PR #1, and `day3-ask-share`, PR #2, merged with review fixes as PR #3), then the G items (PRs #4 and #5, merged with review fixes as PR #7).
- [x] Candidate selection query; `lib/claude/reconcile.ts`; apply decisions with validation; `card_sources`; `source_count`
- [x] Update and conflict handling (priority: official over firsthand over secondhand; newer over older; old official versus new secondhand is a conflict, not an overwrite)
- [x] Held state from risk flags; minimal admin page and route; confirm official
- [x] Expiry greying; "N minutes ago"; source type labels in five languages
- [x] README skeleton (English) and `docs/PRIVACY.md` linked
- [x] Acceptance: the same water fact dropped in Japanese, Chinese and Vietnamese yields one card with 3 sources; the rumour fixture is held and the admin page can publish or hide it
- [x] `lib/claude/ask.ts` with Citations; `POST /api/b/[slug]/ask`; chips linking to cards; "no information yet"
- [x] Web Share, copy link, fullscreen QR, static OG image and per-language title
- [x] Rate limits, daily Claude cap, image size cap, friendly messages
- [x] Purge route plus cron trigger; test it on a dev copy
- [x] `scripts/eval.ts`, `fixtures/expected/*.json`, run, write `docs/EVAL.md`
- [x] Review fixes before the merge: admin entry link sets HttpOnly cookies instead of a token in the URL, drill stamps never set the category, screenshots are `secondhand`, ask answers show both sides of a conflict
- [x] Checkpoint: all must items green on the deployed URL, two days before the planned 11/05 21:00 gate; the cut order was not needed
- [x] G2 area badge (2h), then G3 poster (1h), on branch `g2-area-g3-poster`
- [x] G1 masking on branch `g1-masking-eval`: 50 of 50 boxes covered on five fixtures, on by default; masked copies uploaded only when a card needs them, never for flagged screenshots
- [x] `pnpm eval --reconcile`: 10 of 11 chains pass; t03 open (see 11/04)
- [x] Production check after the merge: poster, masked route and board answer; `NEXT_PUBLIC_APP_URL` is used only when it is an http(s) URL (merged on 11/04 as PR #8)

### 2026-11-04 (Wed): polish and nice-to-haves
Session PRs were merged in pairs after review through the integration PRs #11, #15, #18 and #21. Each item had its acceptance on a throwaway board (tables in the DEVLOG).
- [x] t03: a spot described only by its relation to a known place takes that place's id (extract prompt rule); `pnpm eval --reconcile` 11 of 11, `pnpm eval` 100/100 (PR #9)
- [x] Phone UI polish, accessibility pass at 390 px: contrast on expired cards and control borders, 44 px summaries, `lang` on place names; measured before and after in the DEVLOG (PR #9)
- [x] N3 hidden duplicates drawer; admin "hide as duplicate of" and unhide; migration 0004 (PR #9)
- [x] Waiting card: four step stepper from the real pipeline stages with elapsed seconds, added on request (PR #9)
- [x] N1 try with a sample: three fictional fixtures under `public/samples/` through the real pipeline (PR #10)
- [x] N2 share one card: `/b/[slug]/c/[id]` with its own title per language, system share, copy link, copy as text (PR #10)
- [x] N4 how this card was made: reason and model on `card_sources` (migration 0005), `GET /api/cards/[id]/trace`, one line per step in the sheet (PR #10)
- [x] Combined smoke of PRs #9 and #10 on the integration branch: 2 drop-ins, hide as duplicate, drawer, trace, card page and admin all answer as specified (PR #11)
- [x] After the merge: on the deployed URL, the two water duplicates were hidden again "as a duplicate of" the remaining card and the drawer shows on the live board
- [x] Faster first card: extract writes ja, en and the input's language, translate fills the rest after the card is on the board; first card at a median 8.3 s instead of 13.0 s on the 23 fixtures, eval 100/100 (PR #13)
- [x] N5 multilingual notice back, N7 suggested questions and a thread, N8 read aloud (PR #12)
- [x] N13 Claude Code setup visible (PostToolUse guard hook, acceptance-run skill, reviewer agent, README section), N14 about page, N11 Fable versus Opus extract eval; Opus stays at runtime (PR #14)
- [x] N6 reader confirmations: "still true" and "no longer true" per device, counts on public cards, a hint when two devices say a card may no longer be true (migration 0006, PR #17)
- [x] N9 offline snapshot: service worker keeps the board, card pages, the cards poll and the about page; banner with the saved time, drop-in disabled while offline (PR #16)
- [x] Peace-mode suggested questions; eval refreshed for the split pipeline (100/100, 0 PII leaks, six languages 15/15) (PR #16)
- [x] Leftovers from the day 4 reviews: `lib/ids.ts`, usage recorded for rejected responses, placeholder check on translate output (PR #17)
- [x] N16 laptop layout and polish pass (PR #19)
- [x] N15 loudspeaker broadcasts: heard input and official inbox (migration 0007, PR #20); the mail forwarding and the city list subscription are the human's (see 11/05)
- [x] engawaboard.com bought and wired (Vercel, Cloudflare DNS and Email Routing), the city list subscribed through a Gmail relay, the sender on the allowlist: the inbox is live (details in `docs/INBOX.md` and the DEVLOG)
- [x] N17 open in maps, N10 place view, one ask panel per breakpoint, shared links carry the reader's language (PR #23)
- [x] N19 home page with the prefecture map, N20 mark and icons, rose accent, listed boards (migration 0008), inbox 403 for unknown slugs, per-IP limit on reactions (PR #24)
- [x] N21 disaster mode: admin switch with the reason (migration 0009), automatic switch from the city's mail, automatic return after a quiet week for automatic switches only, the disaster layout (PR #25)
- [x] N18 Shibuya board data: 渋谷駅 area 町丁目, shelters and places from the ward's lists, e-Stat polygons, per-board polygon loading, multi-board seed with a dry run, `docs/BOARDS.md` with the city checklist (PR #28); seeded after the merge
- [x] Home page rework to the design bar: wordmark hero, plank divider, warm map with the islands inset and tooltips, quiet entrance motion, six-language tagline, footer with Made by Yanwen and Source on GitHub, map credit moved to the about page, eight mark candidates for the human to pick (PR #29)
- [x] Mark 04 (Tatami edges) applied to the favicon, the icons, the manifest and both OG images, solid and outlined variants behind one switch (PR #32); the human picked solid, the default, so nothing to flip
- [x] Shibuya broadcasts: a Cloudflare cron Worker polls the ward portal's feed and posts new broadcasts to the board inbox (PR #31); the human generated the board's inbox secret, the portal sender is on the allowlist

### 2026-11-05 (Thu): demo walk-through, README, remaining nice-to-haves
- [x] A read-only pass over the five message files and the about page for natural Korean and Vietnamese and consistent terms (done at the 11/06 review, fixes in PR #47; the human decided against outside native readers)
- [ ] Human: try the heard input on a real phone next to a broadcast; watch the first real city mail become a card and confirm it on the admin page (not done during the event; no city mail arrived in the window)
- [x] Demo walk-through on the deployed URL with the disaster mode switch: the seven steps pass in about two minutes on a throwaway copy of the pilot board. Demo board content decided: sample cards made by the pipeline from fictional inputs, stored in the seed for every board
- [x] README final with the new domain, home page, six boards, the three ways into the inbox, disaster mode, alerts; README.ja.md; the about page's two-layer maintenance model
- [x] N22 Sapporo and Fukuoka boards, and N23 溝の口 and 上野 brought forward: four boards added, all live on 11/05, each a pin on the home page map
- [x] Web push for official and danger cards (migration 0010, VAPID keys from the human)
- [x] Area names in the reader's language on the home card, the drop-in panel and the card badge (PR #42); sample cards for the five newer boards, made by the pipeline from fictional inputs (PR #43); both merged and seeded on the live boards on 11/05
- [ ] N12 make a board with per-board admin tokens: dropped at the freeze (time)

### 2026-11-06 (Fri): review, freeze, demo prep
- [x] Full run of the 7-step demo scenario on the deployed URL; fix what breaks (rehearsal on a throwaway board 11/06, fixes in PR #48)
- [x] Human: photograph a paper notice on a phone; the card appears in all languages on the deployed URL within 30 seconds (first card about 20 seconds in the recorded takes)
- [x] Fable review of the whole repo; fix findings; freeze (PRs #47 and #48, tag v1.0-hackathon)
- [x] Seed the demo board (fresh notices with the right date and time); record rough footage
- [x] The mission in one sentence: ordinary days a neighbourhood board, in a disaster water, shelters and supplies in your own language; on the home hero, the about page and both READMEs, in all five message files (PR #45)
- [x] Demo prep before the freeze: balanced home footer, a dated 断水 sample and a garbage-day sample on 武蔵小杉, fixture p13 for the conflict beat, drop-in consent wording that no longer promises full removal (PR #46)
- [x] Freeze review fixes from three read-only passes (code, ko/zh/vi language, easy Japanese against Kawasaki's booklet): a drop-in survives the uploader leaving, a wider phone check that also covers conditions, an IP window on ask, five small code fixes, one easy_ja sentence for disaster terms, and the ko, zh and vi corrections (PR #47)
- [x] Rehearsal fixes from the live run on a throwaway board: an ask answer that cites no card is flagged `noInfo` and stays out of follow-ups, Japanese titles no longer repeat the place name in parentheses, and the fixtures README no longer calls the visible drill marking a finding (PR #48)

### 2026-11-07 (Sat): video and submission
- [x] Record screen and phone inserts (recorded on the live pilot board, reset before and after)
- [x] Japanese narration, edit, subtitles (native proofreading not done)
- [x] README.md final, README.ja.md, Japanese project summary, Claude usage answers from DEVLOG
- [ ] Submit by 21:00 JST

## 6. Cut order if 2026-11-05 21:00 is not green

Not needed: the must list was green on 2026-11-03. Kept for the record.

1. All G items
2. S7: keep QR and copy link only
3. S6: non-streaming and no chip navigation
4. S4: conflicts marked in the database only
5. S1: UI strings in ja, en, zh only (card content stays six languages)

Never cut: S2, S3, S4 merge, S5, S9, S10.

## 7. Risks and time boxes

| Risk | Response |
|---|---|
| Vercel Hobby limits (300 s functions, daily cron, hobby use only) | Fine for the event; the pipeline is client-driven and finishes well under 300 s |
| Extract over 20 seconds | Split extract and translate; try `claude-sonnet-5-5`; placeholder card already covers the wait; the video shows the real time |
| Reconcile misses the merge in the demo | Fixtures name the same shelter; candidates filtered by `place_id`; known places carry aliases in six languages |
| Public URL burns the API budget | Daily cap and per-board limits from day one |
| Pre-event planning text ends up in the repo | Only this plan and the docs written here; the local planning folder is read, never copied |
