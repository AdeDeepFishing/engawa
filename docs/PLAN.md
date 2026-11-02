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

### Must ship (green by 2026-11-05 21:00)

| # | Feature | Cut to |
|---|---|---|
| S1 | Board page `/b/[slug]` | SSR card list. Language switch ja/en/zh/ko/vi, follows the browser, remembered locally. Card detail sheet: all languages, PII-stripped original, source list. Category filter optional |
| S2 | Drop-in | One big button: camera, choose image, text. No hint chips. Browser re-encodes to JPEG with long edge at most 1568px, which drops EXIF. Signed URL upload. Placeholder card "organizing" appears at once. One-line purpose notice on first drop-in |
| S3 | extract | One structured-outputs call: facts, category, place normalized to known places, times, validity, conditions, source type, platform, risk flags, PII-stripped original, all six languages. Measure on 2026-11-03 with five fixtures; if over 20 seconds, split into extract (ja, en, source language) and translate (the rest) |
| S4 | reconcile | No agent loop. Code selects candidates (same board, same category, not expired or within 24h, same place_id or null place, at most 20, compact JSON). One structured-outputs call returns `create`, `merge`, `update`, `conflict` or `hold`. Code checks the target is in the candidate list, then applies. Conflict is a label plus both statements |
| S5 | Card signals | Category icon, place, "N minutes ago", source type, source count, expired cards greyed with "may be outdated", held cards not public |
| S6 | Ask | Citations API, one document per public card. Non-streaming with a skeleton first. Citation chips map to cards. "No information yet" when absent. Questions are not stored |
| S7 | Share | Web Share API with copy-link fallback. Fullscreen QR. One static OG image and per-language title |
| S8 | Updates | Poll every 5 seconds. Supabase Realtime broadcast only as a "board changed" hint if time allows |
| S9 | Minimal admin | Secret link `/b/[slug]/admin?token=`: held queue (publish or hide), confirm official, hide any card |
| S10 | Deletion | `purge_after` computed at write time. Chat screenshot originals deleted right after processing. Daily purge job deletes storage objects, then rows. Retention table in `docs/PRIVACY.md` |
| S11 | Abuse and budget | 3 submissions per device per minute, 30 per board per minute, a daily Claude call cap (`DAILY_CLAUDE_CALL_CAP`), 8 MB image limit. Over the cap: "busy, try again later" |
| S12 | Eval | `scripts/eval.ts` over 20 fixtures: field accuracy, PII leaks (must be 0), invented facts (must be 0), multilingual duplicates merged into one card. Results table in `docs/EVAL.md` and README |

### Only after every must item is green, in this order

- G2 uploader area badge: only this board's simplified polygons (a few KB) shipped to the client, point-in-polygon in the browser, only the area code sent. Wording: "self-reported area". About 2 hours.
- G3 printable A4 QR poster page `/b/[slug]/poster`. About 1 hour.
- G1 pink masking of names and avatars in chat screenshots. Hard 3 hour time box. Ships only at 100% coverage on the masking fixtures; otherwise chat screenshots stay text-only.

### Not this week

Summaries, peace/disaster mode switch, safety check-in, follow-up questions, Android share target, offline snapshot, multiple boards UI beyond a simple index, Managed Agents, runtime model comparison beyond a 10-fixture spot check.

## 3. Architecture decisions

**Hosting: Vercel Hobby (free).** Cloudflare Workers was the first choice, but its free plan allows 10 ms of CPU per request (waiting on I/O does not count), which is too tight for Next.js server rendering, and `waitUntil` stops 30 seconds after the client disconnects. There is no budget for the paid plan this week. Vercel Hobby gives functions up to 300 seconds, one cron job per day, and automatic deploys from GitHub at no cost. Nothing in the code depends on Vercel except `vercel.json`, so a later move to a paid Workers plan stays possible. Set `cacheComponents: false` in `next.config.ts` so dynamic server rendering behaves classically. Keep the pure JS image stripping anyway; it keeps the app portable.

**Database and files: Supabase Postgres and Storage** through `@supabase/supabase-js` over HTTP. Service role key only on the server. RLS enabled on all tables with no policies. One private bucket `submissions`. Uploads go browser to Storage via signed upload URLs; the server downloads the object to send it to Claude.

**Processing is client-driven.** `POST /api/b/[slug]/submissions` creates the row and returns the id. The client then calls `POST /api/process/[id]` and keeps the connection open while the server streams stage events (`stripping`, `extracting`, `reconciling`, `translating`, `done`, `failed`). The route runs while the client stays connected, within the 300 second function limit, which is far above the pipeline's 30 to 60 seconds. If the client disconnects, the submission is left in `processing` and the watchdog (checked on read) marks it `failed` after 120 seconds with a retry button. A later upgrade path is Cloudflare Queues or Workflows; not this week.

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

Owner for implementation: Claude Code with `claude-opus-5-5`. Planning, prompt design and the 11/6 review: `claude-fable-5-1`. The human reviews, runs manual checks, handles accounts and secrets, and talks to native speakers.

### Done on 2026-11-02 (Fable)
- [x] Private repo created after kickoff, scaffold committed
- [x] CLAUDE.md, this plan, DEVLOG, PRIVACY
- [x] Initial schema migration and seed drafts
- [x] Prompts and JSON schemas for extract, translate, reconcile, ask

### Human, before 2026-11-03 morning
- [ ] Create the Supabase project (Tokyo region), put URL, anon key and service role key in `.env.local`
- [ ] Put the hackathon Anthropic API key in `.env.local`
- [ ] Create the Vercel project from the GitHub repo (Hobby), add the environment variables, confirm the first deploy
- [x] Shelter list verified against 川崎市地域防災計画 資料編 2-06 (as of 2025-04-01) and 2-18 water points; `supabase/seed/boards.json` updated
- [ ] Prepare fixture inputs (paper notices, chat screenshots with fake names and avatars, text) into `fixtures/inputs/` with a note on which real shelter they name

### 2026-11-03 (Tue, holiday): board live, drop-in to card
- [ ] Set `cacheComponents: false`; add `typecheck`, `db:*`, `eval`, `purge`, `preview`, `deploy` scripts
- [ ] Supabase: link project, apply `0001_init.sql`, create bucket, run seed
- [ ] `lib/i18n` dictionary with the key UI strings in five languages; language switch; locale persistence
- [ ] `/b/[slug]` SSR card list from seed; card detail sheet; text size toggle
- [ ] First Vercel deploy from `main`; `maxDuration` set on the process and ask routes; the deployed board renders the seed cards
- [ ] Drop-in UI: camera, image, text; browser compression and EXIF removal; signed upload; purpose notice
- [ ] `POST /api/b/[slug]/submissions`; `POST /api/process/[id]` with SSE stages; server metadata strip
- [ ] `lib/claude/extract.ts` using the prompt and schema; cards written; placeholder replaced; polling
- [ ] Delete chat screenshot originals after processing; `purge_after` set on every row
- [ ] Measure extract latency on five fixtures; decide one call or extract plus translate; record in DEVLOG
- [ ] Acceptance: photograph a paper notice on a phone; card appears in all languages on the deployed URL within 30 seconds

### 2026-11-04 (Wed): reconcile, trust, admin
- [ ] Candidate selection query; `lib/claude/reconcile.ts`; apply decisions with validation; `card_sources`; `source_count`
- [ ] Update and conflict handling (priority: official over firsthand over secondhand; newer over older; old official versus new secondhand is a conflict, not an overwrite)
- [ ] Held state from risk flags; minimal admin page and route; confirm official
- [ ] Expiry greying; "N minutes ago"; source type labels in five languages
- [ ] README skeleton (English) and `docs/PRIVACY.md` linked
- [ ] Acceptance: the same water fact dropped in Japanese, Chinese and Vietnamese yields one card with 3 sources; the rumour fixture is held and the admin page can publish or hide it

### 2026-11-05 (Thu): ask, share, limits, purge, eval
- [ ] `lib/claude/ask.ts` with Citations; `POST /api/b/[slug]/ask`; chips linking to cards; "no information yet"
- [ ] Web Share, copy link, fullscreen QR, static OG image and per-language title
- [ ] Rate limits, daily Claude cap, image size cap, friendly messages
- [ ] Purge route plus cron trigger; test it on a dev copy
- [ ] `scripts/eval.ts`, `fixtures/expected/*.json`, run, write `docs/EVAL.md`
- [ ] Full run of the 7-step demo scenario on the deployed URL; fix what breaks
- [ ] 21:00 checkpoint: all must items green, otherwise apply the cut order

### 2026-11-06 (Fri): polish, G items, freeze
- [ ] Phone UI polish, accessibility pass (16px, 44px targets, contrast, focus order, reduced motion)
- [ ] Korean and Vietnamese native speakers read the demo cards; fix wording
- [ ] G2 area badge (2h), then G3 poster (1h), then G1 masking (3h hard stop)
- [ ] Fable review of the whole repo; fix findings; freeze at 20:00
- [ ] Seed the demo board; record rough footage

### 2026-11-07 (Sat): video and submission
- [ ] Record screen (one screen, three browser windows side by side) and phone inserts
- [ ] Japanese narration, edit, subtitles, native proofreading
- [ ] README.md final, README.ja.md, Japanese project summary, Claude usage answers from DEVLOG
- [ ] Submit by 21:00 JST

## 6. Cut order if 2026-11-05 21:00 is not green

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
