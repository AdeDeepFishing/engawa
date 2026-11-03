# Development log

One entry per working day. What Claude Code did, which model did what, and what needed a human decision. This log is the source for the "how we used Claude" section of the README and the submission form.

## 2026-11-02 (Mon), kickoff day, evening session

**Model:** `claude-fable-5-1` in Claude Code, planning role.

**Done**
- Read the pre-event planning notes (kept outside the repo) and reviewed them critically: scope versus time, logical holes, judge questions.
- Created this private repository after the 12:00 JST kickoff and committed the `create-next-app` scaffold (Next.js 16, React 19, Tailwind 4, pnpm).
- Wrote `CLAUDE.md`, `docs/PLAN.md` (scope, architecture decisions, day-by-day task board), `docs/PRIVACY.md` (retention table), `.env.example`.
- Wrote the initial database migration (`supabase/migrations/0001_init.sql`) and seed drafts for the 武蔵小杉 board.
- Wrote the Claude prompts (`lib/claude/prompts/`) and JSON schemas (`lib/claude/schemas/`) for extract, translate, reconcile and ask.

**Decisions made today (human)**
- Product name: Engawa (縁側).
- Hosting: Cloudflare Workers was the first choice, revised the same evening to Vercel Hobby. The Workers free plan allows 10 ms of CPU per request, too tight for server rendering, and there is no budget for the paid plan. Vercel Hobby covers 300 second functions and a daily cron for free.
- No alert or early-warning features. The board starts where alerts stop.
- Pilot board: 武蔵小杉 (中原区, 川崎市).
- Reconcile is a single structured call over code-selected candidates, not an agent loop.
- Minimal admin page and the purge job are in the must list; pink masking of screenshots is a time-boxed experiment at the end.
- Area badge is "self-reported area", never "verified".
- Implementation from tomorrow runs on `claude-opus-5-5`; Fable returns for prompt tuning and the 11/6 review.

**Also done**
- Verified the shelters for the board against the city's designated shelter list (資料編 2-06, as of 2025-04-01) and the emergency water points (2-18), read from the city's PDFs. 小杉小学校 (opened 2019) is the designated shelter for 小杉町2丁目 and 3丁目 and becomes the demo shelter. Seed updated with addresses and target areas.

**Open for the human**
- Supabase project and keys, Anthropic API key, Vercel project from the GitHub repo.
- Fixture inputs with fake names and avatars.

## 2026-11-03 (Tue, holiday), implementation day 1

**Model:** `claude-fable-5-1` in Claude Code, implementation role. The plan said implementation would run on `claude-opus-5-5`; the session the human started for this day ran on Fable 5.1, so that is what is recorded here. Extraction itself runs on `claude-opus-5-5` (measured below). The session started late on the evening of 11/02 JST and ran into 11/03.

**Done**
- `next.config.ts`: `cacheComponents: false`. Scripts: `typecheck` (`next typegen && tsc --noEmit`), `db:migrate`, `db:seed`, `eval`, `purge`, `latency`.
- `lib/i18n`: five message files with 86 keys each (parity checked by script, no dashes), `t()` with `{placeholders}`, count variants, a `LanguageSwitch` and a `TextSizeToggle`. The first server render picks the language from a cookie, else from `Accept-Language` (the server side of `navigator.language`); the client writes the cookie and a localStorage mirror on change, so server and client agree and there is no flash of the wrong language.
- `/b/[slug]`: server-rendered board, card list with category icon, place in the reader's language plus the Japanese name, "N minutes ago", source type, source count and an "may be outdated" badge; a non-modal detail sheet (no focus trap, Escape closes) with all six languages and the stripped original; polling every 5 seconds with a visibility check. Index page lists boards. When `SUPABASE_URL` is empty the board renders from the seed JSON, read only.
- Supabase: `0001_init.sql` applied. The CLI was not logged in and the direct database host is IPv6 only, so `scripts/migrate.ts` builds the connection string from `SUPABASE_URL` and `SUPABASE_PASSWORD` and runs `supabase db push --db-url` through the Tokyo session pooler. `pnpm db:migrate` is now reproducible without a browser login. The bucket is created by the migration.
- Drop-in: one button, panel with camera, image and text, one-time purpose notice. Browser re-encodes to JPEG (long edge 1568px, EXIF gone). Upload goes to `POST /api/b/[slug]/submissions` as multipart, where a pure JS stripper removes JPEG APPn and COM segments (JFIF, ICC and Adobe kept) and PNG text, EXIF and time chunks before the image is stored with the service role. Tested on crafted files with planted EXIF, comments, text chunks and a post-EOI trailer. Decision: no signed upload URLs after all, so the browser never holds a Supabase key and no unstripped image ever reaches storage. Rate limits (3 per device, 30 per board per minute) and the 120 second watchdog are in.
- `POST /api/process/[id]` streams `stage`, `done` and `failed` as server-sent events while the uploader stays connected (`maxDuration = 300`). It claims the submission with a compare-and-set update, so a retry cannot run twice. Cards get `purge_after = valid_until + 30 days`, submissions get the latest card's `purge_after`, raw text is cleared, chat screenshot originals are deleted right after processing (detected platform not `paper`).
- `lib/claude/extract.ts`: `claude-opus-5-5`, `messages.stream()` with `output_config.format` set to the JSON schema file and `effort: low`, system prompt and board context as two cached blocks, the current JST time and the input in the user turn. Code validates enums and the six languages, nulls any `place_id` not on the board, and rejects the whole result if a phone number or email survives in any text field. The daily cap check and `bump_usage` wrap every call.
- `vercel.json` with the daily cron at 18:00 UTC (03:00 JST), `/api/cron/purge` guarded by `CRON_SECRET`, `lib/db/purge.ts` deletes storage objects first, then rows.
- `scripts/seed.ts` generates the admin token once and stores only its sha256; `--token-file` writes it to a git-ignored file so it never appears in a terminal or a chat.
- Seven text fixtures and one synthetic notice image written (fictional names, handles, a room number and a phone number planted on purpose).

**Extract latency (one structured call, six languages, `claude-opus-5-5`, effort low, text inputs, measured from this Mac)**

| fixture | ms | input | cache read | cache write | output | facts | place_id |
|---|---:|---:|---:|---:|---:|---:|---|
| t02 water notice (ja) | 14239 | 133 | 0 | 6607 | 1003 | 1 | kosugi-es |
| t03 WeChat konbini (zh) | 10152 | 156 | 6607 | 0 | 835 | 1 | musashikosugi-sta |
| p05 Facebook water (vi) | 10660 | 254 | 6607 | 0 | 1076 | 1 | kosugi-es |
| p06 aftershock rumour (ja) | 11623 | 135 | 6607 | 0 | 1062 | 1 | musashikosugi-sta, flagged `rumor` |
| p08 queue is short (en) | 7580 | 98 | 6607 | 0 | 770 | 1 | kosugi-es |

Median 10.7 s, mean 10.9 s, min 7.6 s, max 14.2 s. The prompt cache hits from the second call on (system prompt plus board context, 6607 tokens). Every planted name, handle, phone number and room number was absent from every output field; the WeChat line offering diapers from a room number was discarded as `personal_only`, which is the intended behaviour. The rumour was flagged and would be held.

Vision path, same call shape, the synthetic notice image `s02` (800 by 600 JPEG, 683 input tokens): `claude-opus-5-5` 9662 ms, 1 fact, `kosugi-es`, 14:00 to 16:00 on 11/03 as ISO with the +09:00 offset, source type `official`, confidence `high`.

Comparison run on the same six inputs with `claude-sonnet-5-5`, effort low:

| fixture | Opus ms | Sonnet ms | Sonnet result |
|---|---:|---:|---|
| t02 water notice (ja) | 14239 | 7527 | same card, `kosugi-es` |
| t03 WeChat konbini (zh) | 10152 | 7430 | same, `musashikosugi-sta` |
| p05 Facebook water (vi) | 10660 | 6164 | same, `kosugi-es`, phone number removed |
| p06 aftershock rumour (ja) | 11623 | 8080 | flagged `rumor`, `place_id` null where Opus chose `musashikosugi-sta` |
| p08 queue is short (en) | 7580 | 6788 | same, `kosugi-es` |
| s02 notice image | 9662 | 8232 | same, `kosugi-es` |

Sonnet median 7.5 s (mean 7.4 s), Opus median 10.7 s (mean 10.9 s). Both passed the planted PII check on every field.

**Decision:** one call, on `claude-opus-5-5`. Both models are well under the 20 second threshold in the plan, so extract is not split into extract plus translate and `translate.ts` stays unwritten. Opus stays the default because the eval on 11/05 decides quality, not three seconds of latency, and the placeholder card already covers the wait. `EXTRACT_MODEL=claude-sonnet-5-5` switches the pipeline in one environment variable if the deployed latency or the budget say otherwise. If photographed fixtures turn out slower, the threshold and the split path are unchanged.

**Second half: seed and end to end test** (`claude-opus-5-5` in Claude Code; the human switched the session model with `/model` after the secret key arrived)
- The human replaced the publishable key in `.env.local` with the secret key. `pnpm db:seed --token-file .env.admin-token.local` created the board and the 2 sample cards; the admin token is only in that git-ignored file (mode 600).
- The deployed board at `/b/musashikosugi` returned 404 before the seed because the board row did not exist yet (`getBoardBySlug` returned null, so the page called `notFound()`). After the seed it returns 200 and reads the same database.
- Drop-in tested on `pnpm dev` through the real UI in the browser: purpose notice on first use, then the fixture file set on the file input, so browser compression, upload, server strip, SSE and polling all ran. Times are from the file pick to the finished card, measured in the page.

| input | path | stages seen | time to card | result |
|---|---|---|---:|---|
| `p02-water-distribution-notice.jpg` | photo | received, preparing image, reading, checking, done | 18.7 s (extract about 15 s) | public card, `water`, `kosugi-es`, 14:00 to 16:00, `official`, all six languages; the 訓練用 stamp is reported in the text, not hidden |
| `p04-line-water-same-fact.png` | chat screenshot | same | 14.1 s | public card, `water`, `kosugi-es`, `secondhand`, platform `line` |
| `p06-rumour-aftershock.txt` | pasted text | received, reading, checking, held | 12.5 s | card stored with `visibility = held`, flag `rumor`; uploader sees "not public yet, it needs checking first"; the public cards API does not return it |

- PII: none of the 14 planted strings from `fixtures/expected/p04.json` (four names in kanji and kana, the handle すずき and the phone number) appear anywhere in the p04 card row, including `original_text`. The excerpt keeps only the three messages about water.
- Deletion: the p04 original was removed from Storage 0.5 s after processing (`image_deleted_at` set, object gone from the bucket listing). The p02 paper photo stays, as designed, with `purge_after` 30 days after the card expires. Raw text is cleared on every submission.
- The stored p02 photo was 298 KB in, 169 KB after browser re-encoding, and contains only JFIF and ICC segments, no EXIF.
- Both water cards show "may be outdated" when tested at 23:07 JST. That is correct: the notice says 本日 14:00 to 16:00, which the prompt resolves to today, and 16:00 has passed. The demo must be recorded with a notice dated for the recording time, or during the stated hours.
- Expected gap: p04 created a second water card instead of merging into the p02 card, because reconcile is day 2 work. `fixtures/expected/p04.json` already lists the merge as required.
- Deployed pipeline: the p08 text fixture sent to `https://engawa-pearl.vercel.app` through the same two routes produced a public card. Claude took 7.8 s; the whole request took 18.8 s from this Mac. So the prompt and schema files are bundled correctly on Vercel. The functions run in `iad1` (Washington) while Supabase is in Tokyo, and one drop-in makes about a dozen database calls, which explains most of the gap.
- Fixed: text submissions no longer show "preparing the image"; the process route starts them at the reading stage.

**Needed a human (open at the end of the session)**
- Review day 1 on localhost and on the deployed URL (checklist in the hand-over message).
- Decide whether to pin Vercel functions to Tokyo: `"regions": ["hnd1"]` in `vercel.json` (Hobby allows one region). Expected effect: the dozen database calls per drop-in and every board render stay in Tokyo; the single Claude call crosses the Pacific instead. Not changed in this session so the deployment under review stays as it is.
- `NEXT_PUBLIC_APP_URL` on Vercel (being added). Nothing in day 1 code reads it yet; share links on day 3 will.
- Acceptance with a real phone photo on the deployed URL is still the human's step.

## 2026-11-04 (Wed), reconcile, trust signals, admin

**Model:** `claude-opus-5-5` in Claude Code, implementation role. The session ran early, in the small hours of 11/03 JST, in its own git worktree (branch `day2-reconcile-admin`) while a second session worked on the 11/05 list (ask, share, limits, eval) in another worktree. The two sessions owned disjoint files so the branches merge cleanly; Fable reviews and merges. Reconcile runs on `claude-opus-5-5` (measured below against `claude-sonnet-5-5`).

**Done**
- `vercel.json`: functions pinned to `hnd1`, next to Supabase Tokyo. The deployed drop-in on 11/03 took 18.8 s against 7.8 s of Claude time because every database call crossed the Pacific.
- Migration `0002_reconcile_admin.sql` (additive, applied with `pnpm db:migrate`): `cards.held_reason`, `cards.last_confirmed_at`, and `bump_card_source()`, an atomic increment so two neighbours confirming the same card at once both count.
- `lib/claude/reconcile.ts`: one structured-outputs call over candidates that code selects (same board and category, public, still valid or created in the last 24 hours, same place or no place, at most 20). The system prompt and the board context (known places with aliases) are cached. No candidates, no call. Code checks the answer: the target must be a candidate, `create` has no target, anything else becomes `create` and is logged, and the trust order is enforced in code: an `update` from a weaker source than the card becomes a `conflict`. A failed call creates a card instead of losing the fact.
- `lib/db/cards.ts` applies decisions. Merge counts the source and can fill gaps; update keeps the id and the source rows and moves the old content into a statement history in all six languages; conflict keeps the card and stores both statements with source type and time; hold inserts a held card with the reason. Update and conflict are guarded by `updated_at` with one retry. `writeCardsForSubmission` now runs every fact through this, facts with risk flags still go straight to held, and the process route streams the `reconciling` stage and returns the action per fact.
- Card signals. List: an "updated" badge with the superseded time ("previously: 11/3 14:00 to 16:00"), a conflict label with both statements, their source type and age, "updated N minutes ago". Sheet: the conflicting statements in full, earlier versions with their source counts, every source with platform and relation, "last confirmed". A confirmed card reads "confirmed official" instead of "official notice (unconfirmed)". Day 1 already had "N minutes ago", source type labels, source count and the expiry greying, so those were kept as they were. 48 keys added at the end of all five message files (parity checked by script, no dashes).
- Admin: `/b/[slug]/admin?token=` with the held queue (publish or hide, reason in the reader's language, the stripped original), public cards (confirm official, hide) and hidden cards (publish). `POST /api/b/[slug]/admin` takes the token in the body and applies one whitelisted action to a card of that board. `ADMIN_TOKEN` is compared in constant time over sha256 digests; unset means no admin. The page sends no Referer. It is the only code path that sets `official_confirmed`.
- README skeleton in English; the reconcile section of `lib/claude/README.md` rewritten to match what was built.

**Acceptance run** (local dev server against the shared Supabase project, on a throwaway board `day2-acceptance` that copied the 武蔵小杉 known places, so the Day 1 test cards on the live board could not interfere; the board, its rows and its stored images were deleted afterwards). Inputs went through the same two routes as the browser (`POST /api/b/[slug]/submissions`, then `POST /api/process/[id]` over SSE); p05 was pasted into the real drop-in panel in the browser. "Reconcile stage" includes the candidate query and the database writes.

| order | input | reconcile action | Claude reconcile | reconcile stage | extract | total | board after |
|---|---|---|---:|---:|---:|---:|---|
| 1 | `t02` notice text (ja) | create, no candidates, no call | | 0.2 s | 9.3 s | 11.4 s | 1 water card, 1 source |
| 2 | `p04` LINE screenshot | merge | 2.3 s | 2.6 s | 10.9 s | 15.8 s | same card, 2 sources, screenshot deleted |
| 3 | `p05` Facebook post (vi), pasted in the UI | merge | 2.9 s | | | | same card, **3 sources**, no new card in the list |
| 4 | `p07` time change notice | update | 5.1 s | 5.4 s | 13.5 s | 20.7 s | same card now 15:00 to 16:00, "previously: 11/3 14:00 to 16:00" |
| 5 | `p10` supplies notice, same school | create, no candidates (other category) | | 0.2 s | 13.4 s | 15.2 s | separate supplies card |
| 6 | `p06` aftershock rumour | held by risk flag `rumor`, no reconcile | | 0.1 s | 10.2 s | 11.2 s | not on the board; admin lists it, publish made it public, hide removed it again |

A scratch run of the same chain before this one also produced the conflict case: a pasted secondhand LINE message saying the water "started at 14:00 after all" against the official 15:00 card came back as `conflict`, and the card kept 15:00 with both statements shown. Confirm official on the admin page turned the card's label into "confirmed official" on the board. The admin route refused a wrong or missing token (403), an unknown action (400) and a card id from another board (404).

**Reconcile model** (Claude time per call, same inputs, effort low)

| decision | `claude-opus-5-5` | `claude-sonnet-5-5` |
|---|---:|---:|
| p04 merge | 4.5 s, 2.3 s | 3.0 s |
| p05 merge | 3.0 s, 2.9 s | 1.6 s |
| p07 update | 2.3 s, 5.1 s | 1.8 s |
| secondhand conflict | 3.2 s | 2.1 s |
| median | 3.0 s (7 calls) | 2.0 s (4 calls) |

Both models made the same decision every time. A direct probe of two calls in a row: 2653 tokens written to the cache on the first, 3961 read from the cache on the second, 430 uncached input tokens and about 124 output tokens per decision.

**Decision:** reconcile stays on `claude-opus-5-5`. Sonnet was about a second faster with identical answers, but four cases are not an eval, and a wrong merge silently removes a card from the board, which is worse than a second of waiting behind a placeholder. `RECONCILE_MODEL=claude-sonnet-5-5` switches it in one environment variable if the 11/05 eval holds on Sonnet.

**Decisions taken in this session, open for review**
- After an update, `source_count` starts again at 1. It now says how many sources stand behind what the card says; the superseded statement keeps its own count ("previously: ..., 3 sources"). The alternative (keep counting) would show "4 sources" for a time only one notice stated.
- The admin gate is the `ADMIN_TOKEN` environment variable, one token for every board, as the task asked. `boards.admin_token_hash` from the seed is no longer read by anything.
- A merge raises the card's source type when a stronger source confirms it (a LINE card confirmed by the paper notice becomes "official notice"), but never sets `official_confirmed`.
- `PendingCard` can tell the uploader "added to an existing card as another source" (or updated, or conflicting) instead of a bare "done", which matters for demo step 4 where no new card appears. It reads `actions` from the done event, which `DropIn` does not pass through yet: one line in `DropIn.tsx`, owned by the other session this week.
- Found and fixed in passing: the sheet labelled the status row "Category".

**Needed a human**
- Add `ADMIN_TOKEN` to the Vercel project (the value is in `.env.vercel`, never in the repo or the chat), then redeploy.
- Review and merge the branch (Fable).

**Notes**
- Meta lines on cards (time, source, count) use 14px text from day 1, under the 16px rule; left for the accessibility pass on 11/06.
- Each scripted drop-in used a fresh random device id, so about 20 anonymous device rows from these runs stay until the 90 day device purge.

### Review fixes before the merge (branch `integration-day2-day3`)

**Model:** `claude-fable-5-1` in Claude Code, in a worktree holding the merge of `day2-reconcile-admin` and `day3-ask-share`. Fable's code review of the merged tree listed four things to fix before `main`, plus small items and two extract prompt rules. Seven small commits, each with `pnpm typecheck`, `pnpm lint` and `pnpm build` clean.

**Fixed**
- Admin token out of the URL. The link is now `GET /api/b/[slug]/admin/enter?token=`: it checks the token with the existing constant-time comparison, sets two HttpOnly cookies (one scoped to `/b/[slug]/admin`, one to `/api/b/[slug]/admin`, since a cookie has one path; value `<expiry>.<sha256 over expiry and token>`, 12 hours, Secure outside development, SameSite Lax) and redirects with 303 to the clean `/b/[slug]/admin`. Page and API read only the cookie; the expiry is checked on the server as well as by the browser. The enter path is excluded from the dev request log. README, PRIVACY, PLAN, `.env.example` and the seed's printed link describe the new flow.
- Merge feedback. `DropIn` now passes the done event's `actions` into the pending item, so the uploader reads "Added to an existing card as another source", "An existing card was updated with this" or "This differs from an existing card. Both are shown." `CardItem` marks its `<li>` with `data-card-id` and `BoardView` finds a cited card by that attribute instead of its list position.
- Text size. Conflict statements, the "previously" line, category and meta lines, the ask note and the sources heading were 14px; all content text in `CardItem`, `CardSheet`, `AdminView` and `AskPanel` is now 16px, and the original-text summary on the admin page is at least 44px tall. This closes the note above about meta lines.
- Conflicts reach ask. `cardDocument` ends with a "Conflicting reports" list (each statement in the reader's language with source type and time) when a card has open disagreements; the ask prompt describes the section, asks for both sides with source type and age, and keeps placeholders such as ［名前］ as they are.
- `updateCard` no longer writes `official_confirmed`; the reconcile trust check already turns any update to a confirmed card into a conflict, so the reset was a no-op.
- Extract prompt: a drill stamp never sets the category; a chat screenshot, a screenshot of someone's post or a forwarded message is `secondhand`. Eval re-run in `docs/EVAL.md`: p02 and p03 now score; p11 and p12 (X and Xiaohongshu screenshots) flipped to `secondhand` against expected files that said `firsthand` (97/100, from 98). Decision below.

**Acceptance run** (local dev server on port 3010 against the shared Supabase project; throwaway board `review-acceptance` with the 武蔵小杉 known places, deleted afterwards with its submissions, cards and storage objects; the live board was only used for the admin check and not changed).

- Admin: opening the enter link landed the browser on `/b/musashikosugi/admin` with the held queue (one rumour card) visible. By curl: the enter route answered 303 with both Set-Cookie headers (HttpOnly, SameSite=lax, Max-Age=43200, the digest and never the token); a wrong token answered 303 with no cookie; the page without a cookie showed "This admin link is not valid"; the API answered 403 without a cookie and with a forged one, and 400 `bad_action` with the real cookie. The token occurs zero times in the dev server log.
- Drop-ins through the real UI (the LINE screenshot was handed to the file input by script, since the browser pane has no file picker): `t02` text created the card (10.7 s). `p04` LINE screenshot merged into it (reconcile 3.2 s, 19.2 s in all); the pending card read "Added to an existing card as another source" and the board showed one card with 2 sources. A secondhand text "小杉小学校の給水は今日は中止だと聞きました" became a conflict on the same card (reconcile 2.3 s, 10.8 s in all); the pending card read "This differs from an existing card. Both are shown." and the card showed both statements.
- Ask "Is water distribution happening at Kosugi Elementary?" (3.5 s): the answer gave the notice's 14:00 to 16:00, then "the reports disagree", with the secondhand cancellation and its time, and that no admin had confirmed the notice. The citation chip opened the card sheet with both statements.

**Seen along the way, not changed**
- The same contradicting text without a place name ("給水は今日は中止だと聞きました") created a separate "place unknown" card with a note asking which water point, because reconcile only considers candidates at the same place or with no place. Correct by the rules, worth knowing for the demo script.
- In the conflict list a cancellation reads "03/11, 00:00 to 23:59": `statementSummary` shows the differing time range, not the status. A status word would read better; one for the UI pass.
- `scripts/seed.ts` still issues a per-board token that nothing reads since the admin gate became `ADMIN_TOKEN`.

**Needed a human**
- p11 and p12 source type, decided the same day by Fable: the rule stays as written, because the board cannot verify the author of any screenshot, so a screenshot of a post or a chat message is `secondhand` whoever wrote it and `firsthand` is reserved for text the uploader types in their own words; the two expected files now say `secondhand` (reason in their notes), and the re-run on `claude-opus-5-5` scores 100/100 with 0 PII leaks and 0 invented facts.
- The admin link format changed: `/api/b/<slug>/admin/enter?token=<ADMIN_TOKEN>`. Nothing new in Vercel; `ADMIN_TOKEN` is still the only setting.

## 2026-11-04 (Wed), G2 area badge and G3 poster

**Model:** `claude-fable-5-1` in Claude Code, implementation role, in its own worktree (branch `g2-area-g3-poster`, cut from `main` after the day 2 and day 3 merge) while another session worked on G1 masking and the eval wiring at the same time. No Claude call was added or changed; extract and reconcile ran as on day 2 during the acceptance.

**Done**
- Data: `lib/geo/musashikosugi.json`, the board's 23 町丁目 polygons, 16 KB. Source: e-Stat 小地域 boundaries of the 2020 census (survey `A002005212020`, 川崎市中原区 `14133`, Shapefile, world geodetic longitude and latitude), fetched with one curl from the command line (the URL is in `scripts/geo/README.md`; the same endpoint answers 404 for GeoJSON and 200 for the Shapefile, 54 KB). `scripts/geo/build.ts` matches the seed's `area_names` to e-Stat `S_NAME` after turning kanji numerals into digits (小杉町三丁目 is 小杉町3丁目), keeps those records, simplifies with `npx mapshaper` (`-simplify 30% keep-shapes`, coordinates rounded to 0.00001 degrees) and writes one Feature per area with `area_code` (the e-Stat `KEY_CODE`) and `name_ja` spelled as in the seed. All 23 names matched exactly one record. Sizes measured for the subset: unsimplified 42 KB, 30% 16 KB, 20% 13 KB, 10% 9.8 KB; 30% kept. The Voronoi fallback was not needed. The raw download stays out of git. `--write-seed` filled the codes in `supabase/seed/boards.json`.
- Client: `lib/geo/pointInArea.ts` (ray casting, holes and MultiPolygon handled) and `lib/geo/index.ts` (`boardAreas`, `isBoardAreaCode`, `areaName`, `boardPolygons`, `resolveArea`). A board row whose `area_names` still carry `code: null` (the live row, seeded before today) takes the codes from the bundled polygons by name, so the feature works without a re-seed. The drop-in panel shows the opt-in box "Add my area (self-reported)" with a one-line explanation under the three choices and above the send button. Ticking it calls `getCurrentPosition` (high accuracy, 10 s timeout, 60 s maximum age), resolves the area in the browser and shows "Your area: 小杉町3丁目" for confirmation. Only `area_code` goes into the form. The choice is remembered in localStorage; the position is read again every time the panel opens, since the phone moves. A denied, failed or outside position shows one line and the drop-in goes ahead without an area. The coordinates live in one callback and are not stored, logged or sent.
- Server: `POST /api/b/[slug]/submissions` accepts `area_code`, keeps it only when `isBoardAreaCode(board, code)` holds, else null, and passes it as `uploaderAreaCode` to `createSubmission`. `lib/db/cards.ts` already copied `uploader_area_code` to `cards.area_code` on insert and to `card_sources.uploader_area_code` on every source row, so a merge keeps the first card's area and records each source's own; nothing changed there.
- Display: `CardItem` shows "📍 Self-reported area: 小杉町3丁目" under the meta line (and in the button's accessible name) and marks its `<li>` with `data-area-code`; `CardSheet` has a "Self-reported area" row after the place. Area names stay Japanese in every UI language. The word "verified" appears nowhere.
- Nine `area.*` and eight `poster.*` keys at the end of all five message files (179 keys each, parity checked by script, no dashes). One paragraph in `docs/PRIVACY.md`.
- G3: `/b/[slug]/poster` renders the board name (Japanese, plus the reader's language when it differs), a large QR of the board URL from `components/share/qr.ts`, the URL in text, one call to action per language plus やさしい日本語, and the "community board" line. Print CSS sits in the page: `@page { size: A4 portrait; margin: 12mm }`, no top bar, the on-screen print button and back link hidden in print. "Print poster" in the share panel opens it in a new tab.
- One line outside the file list for this session: `BoardView.tsx` passes `areaNames={board.area_names}` to `DropIn`.

**Acceptance run** (local dev server on port 3020 against the shared Supabase project; throwaway board `g2-acceptance` with the 武蔵小杉 known places and areas, deleted afterwards with its 2 submissions and 2 cards, no storage objects; Playwright 1.62 Chromium with a mocked position and the geolocation permission on the context, 390 px wide, UI in English; the live board was not touched)

| position | opt-in line | input | result |
|---|---|---|---|
| 35.5763 N, 139.6566 E (中原区役所, 小杉町3-245) | "Your area: 小杉町3丁目" | `t02` water notice text | card in 26 s with the badge "Self-reported area: 小杉町3丁目" and `data-area-code="14133301003"`; the sheet row reads 小杉町3丁目; the POST body carried `area_code=14133301003` and nothing else about location; stored: submission `uploader_area_code`, card `area_code` and the source row all `14133301003` |
| 35.681 N, 139.767 E (東京駅) | "You seem to be outside this board's area. It will be sent without an area." | `p08` queue text | card in 20 s, no badge, no `data-area-code`; the POST body had no `area_code` field; all three stored values null |

Permission denied (a context without the geolocation permission, UI in Japanese): "位置情報が許可されませんでした。エリアなしで送ります。" and the panel stays usable. The browser console (6 and 2 lines) and the dev server log (29 lines) contain no coordinate, no "latitude" or "longitude" and no area value. Offline check of the polygons: each of the 23 areas' e-Stat centroids resolves to its own area, the 53 other centroids of the ward resolve to nothing.

Poster: `page.pdf({ format: "A4" })` gives one page of 595.9 by 842.9 pt (A4) with everything on it; the print-media screenshot and the 390 px screen view (Japanese and Vietnamese) look right; the share panel link opens it. The URL in the QR comes from `NEXT_PUBLIC_APP_URL` (on this Mac `http://localhost:3000`, on Vercel the production URL), else the request host.

**Decisions taken in this session, open for review**
- The whole polygon file is in the board page's client bundle (16 KB, about 5 KB gzipped) rather than loaded on opt-in, because `CardItem` needs the code-to-name map for rows with null codes anyway, and PLAN budgets "a few KB" for it.
- The opt-in is remembered per browser; the position is not. Every panel open reads it again.
- `enableHighAccuracy: true` with a 10 s timeout: 町丁目 blocks are 200 to 400 m across, so a coarse Wi-Fi fix could land next door; a timeout only means "sent without an area".
- Server validation reads the same bundle as the client through `boardAreas`, so a board whose row has null codes still accepts codes for its named areas.
- The seed carries the e-Stat codes now. `pnpm db:seed` is optional for the live board (it would update the board row only; cards untouched).

**Needed a human**
- Review and merge the branch (Fable). Nothing new in Vercel.
- Optional after the merge: `pnpm db:seed` to put the codes into the live board row.
- On a real phone the browser asks for location once when the box is ticked; iOS Safari needs https for that (Vercel has it).

## 2026-11-03 (Tue) night, production check after the PR #7 merge

**Model:** `claude-fable-5-1` in Claude Code, review and integration role.

- PR #7 (G1, G2, G3 with the review fixes) merged at 22:51 JST. The production deploy was live within a minute: `/b/musashikosugi/poster` 200, `/api/cards/<random id>/masked` 404, the board 200 in 0.5 s.
- Found on production: every share link, OG URL and the poster QR read `ttps://engawa-pearl.vercel.app/...`. The `NEXT_PUBLIC_APP_URL` value in Vercel had lost its first letter, and `new URL()` accepts any scheme, so nothing failed loudly. Fix in code: `lib/app-url.ts` uses the configured value only when it parses as http or https, otherwise logs one warning and falls back to the request host (on Vercel that is the production host anyway). The board page and the poster page share the helper now. Checked with seven values: valid https and http, the typo, a bare host, a `javascript:` URL, empty and unset.
- Date correction: the two previous entries and the matching lines in `docs/PLAN.md` and `docs/EVAL.md` were headed 2026-11-04. The commits show both pairs of sessions ran on 2026-11-03 JST. Headings now carry the real date.

**Needed a human**
- Set `NEXT_PUBLIC_APP_URL` in Vercel to `https://engawa-pearl.vercel.app` and redeploy, or remove it: with this fix the request host gives the same URL.
