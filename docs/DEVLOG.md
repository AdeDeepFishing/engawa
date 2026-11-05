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

## 2026-11-03 (Tue) morning, reconcile, trust signals, admin

**Model:** `claude-opus-5-5` in Claude Code, implementation role. The session ran early, in the small hours of 11/03 JST, in its own git worktree (branch `day2-reconcile-admin`) while a second session, also on `claude-opus-5-5`, worked on the day 3 list (ask, share, limits, eval) in another worktree. The two sessions owned disjoint files so the branches merge cleanly; Fable reviews and merges. Reconcile runs on `claude-opus-5-5` (measured below against `claude-sonnet-5-5`).

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

## 2026-11-03 (Tue) afternoon and evening, G2 area badge and G3 poster

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

## 2026-11-04 (Wed), polish: t03, accessibility, hidden duplicates

**Model:** `claude-fable-5-1` in Claude Code, implementation role, in its own worktree (branch `day4-polish`, cut from `main` after PR #7) while a second session worked on the judge-facing features in another worktree. Extract and reconcile ran on `claude-opus-5-5` as before; no Claude call was added.

**Done**
- t03 merges. One rule in `prompts/extract.system.md` (Places): a shop, spot or queue described only by its relation to a known place (the convenience store in front of the station, 駅前のコンビニ, 站前的便利店) takes that place's `place_id`, with the spot itself kept in `place_text_ja`. The prompt rule was chosen over a wider candidate query because it fixes the fact where it is made: the card carries the station's id for the board, for ask and for reconcile alike, and `listReconcileCandidates` keeps its one rule. `t03` now extracts to `musashikosugi-sta` with 武蔵小杉駅前のコンビニ as the spot, sees the p03 card and merges onto it. `pnpm eval`: 100/100 fields, 0 PII leaks, 0 invented facts, median 13.6 s. `pnpm eval --reconcile --now 2026-11-03T10:00:00+09:00`: 11/11, reconcile median 2.7 s, 0 code overrides. Both tables and the note are in `docs/EVAL.md`.
- The chain clock. The first re-run of the chain with the real clock, at 01:28 JST, passed t03 and failed s02 and t02 as `conflict`: the p02 notice says 本日, which the model read as 11/04 at that hour, while those two inputs say 11月3日. Correct reading, wrong day. `scripts/eval.ts` gained `--now <ISO 8601>`, which pins the clock extract and reconcile see, and the run header records it; the extract table keeps the real clock as before, since it checks the time of day only.
- Accessibility pass at 390 px (Playwright 1.62 Chromium, UI in English and Japanese, board, poster, index, admin, share panel, sheet and drop-in panel measured; measurements below). Fixes in the files this session owns: an expired card is greyed by the beige background instead of 70% opacity, so its meta text keeps 5.8:1 (it was 3.3:1) and the outdated badge 9:1 (was 4.1:1); a control drawn with the hairline border (button, input, select, textarea, summary, link) gets `--line-strong`, 3.8:1 on white, 3.6:1 on the page and 3.3:1 on the beige, while decorative borders keep the hairline; `summary` joins the 44 px rule; the small "A" in the text size toggle is 16 px; the Japanese place name next to a translated one is wrapped in `lang="ja"` (`placeParts` in `lib/cards/display.ts`); card `<li>` elements carry `id="card-<id>"` so a link can point at them. Focus ring, tab order, icon labels, reduced motion, the remembered text size and `<html lang>` were already right and were verified, not changed. The look is the same: beige instead of faded for expired cards, a slightly darker hairline on controls.
- N3 hidden duplicates. Migration `0004_duplicate_of.sql` (idempotent): `cards.duplicate_of uuid references cards(id) on delete set null`, so the purge job never fails on a duplicate that outlives its original, and an index on `(board_id, visibility, duplicate_of)`. Admin (`lib/db/admin.ts`, the admin page and route): a new action `hide_as_duplicate` with `target_card_id`, a public card of the same board; a held, hidden, unknown or self target answers 409 with the reason; it sets `visibility = 'hidden'` and `duplicate_of`; plain hide keeps `duplicate_of` null; publish on a hidden card is labelled "Unhide" and clears `duplicate_of`. The admin page offers the action under each public card as a select of the other public cards, and shows "Duplicate of: <title>" on a hidden duplicate. Public read `listHiddenDuplicates(boardId)` in `lib/db/boards.ts` returns hidden cards with `duplicate_of` set whose original is still public, through the same projection as `listPublicCards` (no `masked_image_path`; held and plain hidden cards never), plus the original's title; a read failure logs and returns none, so the card list never depends on the drawer. The cards API carries `hidden_duplicates`, so the drawer follows the 5 second poll. `components/board/HiddenDrawer.tsx`: a collapsed `<details>` after the card list, summary "N hidden duplicates" in the UI language, each item read only (title, body, time, source type) with a "Duplicate of" link that scrolls to and opens the original; nothing when there are none. Eleven keys appended at the end of all five message files (193 each, parity checked, no dashes).

**Accessibility measurements** (390 by 844, device scale 2, `scripts` kept outside the repo; the audit walks every visible text node and control, composites translucent backgrounds and ancestor opacity before computing contrast, and tabs through the page to read the focus outline)

| check | before | after |
|---|---|---|
| text under 16 px | none on the board, poster, index, admin, share panel, sheet and drop-in panel; one decorative 14 px glyph (the small "A" in the toggle, aria-hidden) | none; the glyph is 16 px |
| controls under 44 by 44 | none on the board, poster, index and admin; the sheet's "In all languages" summary 332 by 40 (other session's file) | none; `summary` is covered by the global 44 px rule, so the sheet's summary is 44 without touching the file |
| text contrast under AA | expired cards: category, time, source and count lines 3.32:1 (muted at 70% opacity on white), "May be outdated" badge 4.1:1; the disabled Ask button 3.26:1 (exempt) | only the disabled Ask button (exempt); expired meta lines 5.8:1 on the beige, the badge 9.1:1 |
| control border contrast (1.4.11) | 1.39:1 on Share, the text size toggle, the language select and the card buttons; 1.45:1 on the ask input and the admin Hide buttons | 3.8:1 on white, 3.6:1 on the page, 3.3:1 on the beige (`--line-strong`); nothing under 3:1 on the board, index, admin or poster |
| focus ring | 3 px accent outline, offset 2 px, on every tabbed control | unchanged |
| tab order (board) | logo, Share, text size, language, ask input, cards top to bottom, drop-in button | unchanged, plus the drawer summary and its links after the list |
| icon-only controls without a name | none | none |
| `lang` | `html`, every language option, the sheet's language list and original text, the poster's lines | plus `span[lang=ja]` on the Japanese place name in the list |
| reduced motion | `animate-pulse` resolves to no animation and no transition under `prefers-reduced-motion: reduce` | unchanged |
| text size toggle | root 16 px to 18.88 px, still large after a reload (cookie and localStorage) | unchanged |
| `<html lang>` | follows the switch at once and after a reload | unchanged |

**Acceptance run** (local dev server on port 3410 against the shared Supabase project, after migration 0004; throwaway board `polish-acceptance`, a copy of the 武蔵小杉 row with its own slug and name, deleted afterwards with its 4 submissions, 4 cards, 4 source rows, 2 device rows and no storage objects; Playwright 1.62 Chromium at 390 px, UI in English; the live board was not changed: 7 cards before and after, none with `duplicate_of`)

| step | input, through the real drop-in panel | result |
|---|---|---|
| A | `t02` water notice text (11月3日 14:00 to 16:00) | card in 14.9 s, no candidates, no reconcile call |
| B | the same fact in the uploader's own words with 今日 | separate card in 18.1 s: reconcile (5.8 s) saw A and chose `create`, because at 02:02 JST on 11/04 "today" is 11/04 while A says 11/03. The same date reading as in the eval chain; it gave the two cards this run needs |
| C | phone charging at 中原区役所 | card in 9.8 s, other category, no candidates |
| R | `p06` aftershock rumour, from a second device (the first had hit the 3 a minute device limit, shown as "Busy right now") | held in 12.8 s, "Not public yet", on the admin page under "Waiting for a check" |
| admin | B hidden as a duplicate of A through the select under B; C hidden with the plain Hide | hidden list: B shows "Duplicate of: <A's title>" and Unhide, C shows Unhide only |
| API | `GET /api/b/<slug>/cards` | `hidden_duplicates` holds B alone with `duplicate_of`, `original_title` and `has_masked_image: false`, no `masked_image_path` key; R (held) and C (plain hidden) absent |
| refusals | `POST /api/b/<slug>/admin` | A as a duplicate of hidden B: 409 `target_not_public`; of itself: 409 `same_card`; unknown id: 409 `target_not_found`; no target: 400 `bad_target_card_id`; no cookie: 403 |
| board | the drawer | present with summary "1 hidden duplicate" (Japanese: 非表示の重複カード 1件), one read-only item (title, body, time, source type, no buttons) whose "Duplicate of" link points at `#card-<A>`; Enter on the link opened A's sheet |
| unhide | Unhide on B, then hide as a duplicate again, then plain-hide A, then unhide A | Unhide cleared `duplicate_of` and emptied the drawer; with A hidden the drawer was empty again (a duplicate shows only while its original is public); with A back it showed B again |

The admin page of the test board was measured too: no text under 16 px, no control under 44 px, no text under AA, no control border under 3:1; the new select and its label and button are in the tab order with the focus ring.

**Added later the same night: the waiting card.** The human asked whether the 10 to 20 seconds a drop-in takes could be shortened, and failing that, whether the wait could be made visible. Shortening: extract produces six languages in one call, which is most of the output; `claude-sonnet-5-5` saves about 3 s on the eval but invented facts on p09 (11/03 decision), and splitting extract from translate (the PLAN's S3 fallback, card first in the uploader's language and Japanese, the rest filled in by a second call) would put the first card at roughly 7 to 9 s but touches the extract prompt and schema, the process route and `cards.ts`, so it is a cross-session change for the reviewing session to schedule, not this branch. Made visible instead, in `components/board/PendingCard.tsx` (shared, not on the other session's list): a four step stepper (Received, Reading, Checking, Done) driven by the real pipeline stages and never by a timer, the stage in words under it, and "Usually 10 to 20 seconds. N s so far." with the seconds since the card appeared; the active step pulses, finished steps fill with the accent colour, and under `prefers-reduced-motion` the steps still fill without the pulse. Six keys appended to all five message files (199 each). Checked on a throwaway board (`polish-pending`, deleted afterwards): English, Received at 0.1 s, Reading at 1.8 s, done at 9.9 s with no candidates; Japanese, 受付, 読み取り at 1.0 s, 照合 at 11.9 s, merged onto the existing card at 14.8 s; the four labels fit at 390 px in both. Not done: showing the uploader's own text inside the placeholder, which needs `DropIn.tsx` to pass the text into the pending item (one field on `PendingItem`), owned by the other session this week.

**Decisions taken in this session, open for review**
- Prompt rule rather than a wider candidate query for t03 (reason above). The rule also applies to screenshots, so p03 keeps extracting to the station.
- The reconcile chain is run with `--now` on the fixture day. The alternative is to make that the chain's default in `scripts/eval.ts`; left as a flag so the choice is visible.
- `duplicate_of` is `on delete set null`: when the original is purged, the duplicate becomes a plain hidden card and leaves the drawer. The task text said only `references cards(id)`; without the clause the daily purge would fail on the original.
- The drawer shows a duplicate only while its original is public. If the admin later hides the original (plainly or as a duplicate of a third card), its duplicates leave the drawer with it, since the original was hidden for a reason.
- `listHiddenDuplicates` fails soft (logs, returns none) so a board whose database lacks migration 0004 still renders its cards. The admin page does not: it embeds the original through the new foreign key and errors until the migration is applied.
- `duplicate_of` is typed locally (`AdminCard` in `lib/db/admin.ts`, `HiddenDuplicate` in `lib/db/boards.ts`) because `lib/types.ts` belongs to the other session this week; one optional field `duplicate_of?: string | null` on `Card` would let both go.
- The original is embedded through the foreign key column (`original:duplicate_of(id, title, visibility)`), the PostgREST form for a recursive relationship. The constraint name as a hint was not found in the schema cache and the table hint on the column returns the children, so the first version of the query failed on the live project; verified after the migration.
- The stronger border applies to every control that used the hairline, including the card buttons, so a card's edge reads at 3:1 like any other button.

**Needed a human**
- Migration 0004 was applied by the human from this worktree with `pnpm db:migrate --include-all`: the plain push refused because the remote history already held version 0005 from the judge session's worktree, and the `--include-all` push was blocked for this session as a production change.
- Review and merge the branch (Fable). Nothing new in Vercel.
- On the live board the two water duplicates hidden by hand on 11/03 have `duplicate_of` null, so the drawer stays empty there until an admin unhides them and hides them again as a duplicate of the remaining card.
- Optional, for the owner of `lib/types.ts`: add `duplicate_of?: string | null` to `Card`.

**Seen along the way, not changed (other session's files)**
- `CardSheet.tsx`: the "In all languages" and "Original text" summaries were 40 px tall; the global `summary` rule now makes them 44. The sheet's conflict and language lists were fine at 16 px.
- `DropIn.tsx`: nothing under 16 px or 44 px in the open panel; the consent and choice buttons measure 48 px or more.
- The eval chain's date sensitivity (above) sits in the fixtures, not in reconcile: p02 says 本日 while s02 and t02 carry a written date.

## 2026-11-04 (Wed), judge-facing: samples, share a card, card trace

**Model:** `claude-fable-5-1` in Claude Code, implementation role, in its own worktree (branch `day4-judge`, cut from `main` after PR #7) while a second session worked on t03, the accessibility pass and the hidden-duplicates drawer in another worktree with its own file list. Commit `567e8a7` (`appBase()` in `lib/app-url.ts`) was cherry-picked from `fix-app-url-guard` (PR #8) because the card page needs it. Extract and reconcile ran on `claude-opus-5-5` throughout; no Claude call was added. The reconcile call changed in one place: code now keeps the model id with the decision and stores it.

**Done**
- N1, try with a sample. The drop-in panel has a dashed box "Try with a sample" under the three choices, labelled as fictional test material, with three buttons: a paper notice photo (`p01-water-outage-notice.jpg`), a chat screenshot (`p03-wechat-konbini.png`) and a text (`p08-queue-short.txt`), copied to `public/samples/` as `notice.jpg`, `chat.png` and `text.txt` (listed in `fixtures/README.md`). A tap fetches the file and hands it to the same code a user's own file takes: the image goes through `prepareImage` (browser re-encode, EXIF gone), the text into the same form, then `POST /api/b/[slug]/submissions` and the processing stream. Consent, rate limits and the daily cap apply as usual. Why these three and not p02 and t02: p02 says 本日 14:00 to 16:00, so after 16:00 the card a judge makes is born "may be outdated", and t02 carries the date 11月3日 with the same effect. p01 is dated 11/19, p03 has no end time and p08 says "right now" (six hours of validity), so a judge on any day of the judging week sees live cards, one per source type: official, heard from others, seen firsthand. The chat sample also shows the masked copy.
- N2, share one card. `app/b/[slug]/c/[id]/page.tsx` renders one public card (404 for held, hidden, unknown and malformed ids; the board and card are read once per request with React `cache`) with its own title and description per language (card title, board name, Engawa; the body cut at a word near 200 characters), the board's OG image, `og:url` and `og:image` made absolute with `appBase()`, and the same locale tags as the board page. The content is `CardPage`, a client component, so the language switch in the top bar changes the page like it changes the board. The page shows the card as the sheet does (conflicts and earlier versions included, through the sheet's exported `Statement`), the share group, how the card was made, a back link and a call to action that opens the board. `CardShare` (in the sheet and on the page) offers the system share sheet when the browser has one (title, plain text, card URL), copy link (the URL is then shown under the buttons) and copy as text: title and body, a blank line, place, time window, "may be outdated" when it applies and the source line in words ("Seen firsthand, 2 sources"), a blank line, the URL. No markdown. `copyText` moved from `ShareButton` to `components/share/copy.ts`; every control is 48 px high at 16 px text. The board stays the entry point: the only ways to the page are the copied link and the share sheet.
- N4, how this card was made. Migration `0005_card_trace.sql` (additive, applied to the shared project with `pnpm db:migrate`): `card_sources.reason` and `card_sources.model`, null on rows from before. `reconcile()` returns the decision with the model id set by code; `applyDecision` stores the decision's reason and that model on `confirmed`, `updated` and `conflict` rows; a `created` row stores no reason and names the extract model, which the process route passes through from the extract outcome. The reason is built from PII-stripped text only, but it reaches readers, so before it is stored it gets the same phone and email check as the extract output (`containsContact`) and is dropped when it fails. The prompt and schema now ask for one or two plain sentences about what the new fact shares with the chosen card or how it differs, without card ids (the first live reason read "confirms candidate c74b1a5e: ...", which no neighbour needs to see). `getPublicCardTrace` in `lib/db/cards.ts` returns a public card's rows oldest first (relation, source type, platform, time, reason, model, nothing from the submission) plus the admin flag and the models used, served by `GET /api/cards/[id]/trace` (404 for anything not public, `no-store`, like the masked route). The sheet fetches it when it opens and again when the card gains a source, an update or the admin's confirmation, and `CardTraceView` shows one line per step in the reader's language from i18n templates ("Created from a paper notice (official), 14:06", "Confirmed by a chat message (heard from others), 14:07", "Updated by text sent in (seen firsthand), 14:09", "Marked as conflicting with ..."), Claude's reason as a quote under a line when the row has one, "Confirmed as official by the board admin" when it applies, and a footer "Read by claude-opus-5-5 · compared by claude-opus-5-5". The input kind comes from the stored platform (paper, chat, social post, else "text sent in"), the date is added when a step is not from today. Nothing is invented: a row without a reason shows none.
- 30 keys at the top of all five message files (6 `sample.*`, 19 `trace.*`, 3 `share.*`, 2 `card_page.*`), 212 keys each, parity checked by script, no dashes in any changed file. `lib/claude/README.md` describes the trace columns and the public read.

**Acceptance run** (local dev server on port 3420 against the shared Supabase project; throwaway board `judge-acceptance`, a copy of the 武蔵小杉 row, deleted afterwards with its 2 storage objects, 6 source rows, 4 cards, 6 submissions and the 3 device rows the runs made; Playwright 1.62 Chromium at 390 px, UI in English; the live board was not touched). Everything went through the real UI: the sample buttons, the text box, the sheet, the copy buttons; the script only read the processing stream and the clipboard.

| step | input | result | time to done |
|---|---|---|---:|
| 1 | sample "Photo of a paper notice" (p01) | create: `daily_notice`, official, 11/19 10:00 to 15:00 | 15.3 s (extract 12.7 s) |
| 2 | sample "Chat screenshot" (p03) | create: `shops`, heard from others, masked copy stored, original deleted | 20.9 s (extract 12.2 s, masking beside reconcile) |
| 3 | sample "Pasted text" (p08) | create: `water`, seen firsthand, 小杉小学校 | 8.2 s (extract 7.3 s) |
| 4 | the same p08 text typed into the box | merge into the card from step 3, no new card, 2 sources | 12.0 s (reconcile 3.3 s) |
| 5 | p06 rumour typed | held; its card page and its trace route answer 404 | 12.0 s |

- A first run of the same script, cut short by a bug in the script itself (it waited for a held card to appear in the list), had already produced the same three cards; the chat screenshot then also yielded a second, held card ("Resident offering spare diapers", `sensitive_personal`), which is the pipeline working as designed and is why the done event lists public ids first.
- Sheet of the water card: "Created from text sent in (seen firsthand), 01:44", then "Confirmed by text sent in (seen firsthand), 01:44" with the quote "The new firsthand report confirms candidate c74b1a5e: water is open at Kosugi Elementary School with a short line and the same bring-your-own-bottle condition, and it adds no values the card lacks.", footer "Read by claude-opus-5-5 · compared by claude-opus-5-5". The same rows came back from the trace route as JSON with `reason` null on the created row and `model` on both.
- After the prompt rewording, one more p08 drop-in by curl merged again (reconcile 2.4 s) and stored: "A neighbour at Kosugi Elementary School again reports water open with a short line, and you still need to bring your own bottle. This firsthand report matches the existing card."
- Copy as text gave: the title, the body, a blank line, "Place: Kosugi Elementary School (川崎市立小杉小学校)", "04/11, 01:44 to 07:44", "Seen firsthand, 2 sources", a blank line, the card URL. Copy link gave the URL alone.
- Card page: with the language cookie set to English the title was "Water distribution at Kosugi Elementary School (小杉小学校), short line | Musashi-Kosugi (judge test) | Engawa", with Japanese "小杉小学校で給水中、列は短い | 武蔵小杉 (judge test) | Engawa", each with its own description; `og:type` article, `og:url` and `og:image` absolute (on this Mac `NEXT_PUBLIC_APP_URL` names port 3000, so the tags carried that host while the page ran on 3420; on Vercel both are the production URL); an unknown uuid and a malformed id both 404.
- Browser console: 0 errors across the run. Screenshots of the panel, the sheet (trace and share) and the page in both languages were checked by eye at 390 px: all text 16 px or larger, all controls 44 px or taller.
- `pnpm eval` twice after the reconcile change (the extract call is untouched): first 99/100 (p03 came back with `place_id` null once; the G1 session saw the same wobble on the text twin t03), second 100/100; 0 PII leaks and 0 invented facts both times; median extract 15.0 s and 14.2 s. `docs/EVAL.md` is not updated from this branch so that the two sessions do not edit the same section; the numbers are here. `pnpm eval --reconcile` was not re-run after the reason rewording; the live merges above are the evidence that decisions are unchanged.
- `pnpm typecheck`, `pnpm lint` and `pnpm build` clean on every commit.

**Decisions taken in this session, open for review**
- A `created` row names the extract model, so the footer can say which model read the input; the task only fixed "no reason" for a create. The reconcile model is named only when a confirmed, updated or conflict row exists: with one source there may have been no comparison at all, and the footer should not claim one.
- Claude's reason is stored and shown in English in every UI language, as the task allowed. Translating it would be one more call per decision.
- The trace is a separate route read when the sheet opens, not part of the card list payload, so the list stays small and the fallback to the configured model ids happens on the server, which is the only place that knows them.
- The reason rule in the prompt and schema was reworded (plain words, no card ids). It changes the cached reconcile system prompt once.
- The samples are p01, p03 and p08 rather than p02 and t02 (reason above).
- The card page also shows "how this card was made": a judge who receives the link sees the chain without going back to the board.
- The public `CardSource` type is unchanged; `TraceStep` extends it. The sheet's old source list is still there under "Sources".

**Needed a human**
- Review and merge the branch (Fable). Migration 0005 is already applied to the shared project; nothing new in Vercel.
- If the other session's migration 0004 is pushed after 0005, `supabase db push` may refuse the remote version it does not know; `pnpm db:migrate --include-all` applies the local file anyway, and after the merge both files exist in both trees.
- Tick N1, N2 and N4 under 2026-11-04 in `docs/PLAN.md` (the list introduced by PR #8).
- On a real phone the share sheet needs https (Vercel has it); the copy buttons work everywhere.

**Review fixes, same day** (Fable's review of PR #10; four commits, each with typecheck and lint clean before it, build clean after)
- Card page hydration: `CardShare` read `navigator.share` in its state initializer, so the server HTML had no native share button and a phone added one at hydration, a mismatch React reports and re-renders. The flag is now a `useSyncExternalStore` read with a false server snapshot (an effect that sets state is what the repository's `react-hooks/set-state-in-effect` rule rejects, which is why the top bar's pattern was not copied). Checked on the no-database server with `navigator.share` injected: the HTML has no button, the DOM has one after hydration, no hydration error in the console.
- Trace absent, not loading forever: the sheet now records a 404 or a failed fetch and leaves the section out, as the card page does. Checked on the no-database server with the seed cards: 0 trace sections, no "Loading the steps", the share group still there. (The browser logs the 404 of that fetch as a failed resource; that is the browser, not the app.)
- A rate-limited sample text no longer lands in the text box: samples are sent without `sentText`. Checked with three filler rows for the device: the text sample was refused with 429, the pending card showed the limit line, the text box stayed empty.
- The footer names only models the rows record: `models.extract` is nullable like `models.reconcile`, no configured default stands in, and the footer is left out when nothing is named.
- No model reason under an override: the decision carries the override text set by code, and `traceOf` stores no reason when it is set (the model's sentence would argue for the update that was not taken). Unit-checked on `checkDecision`: an update from a secondhand fact over an official card comes back as a conflict with the override set; a merge is untouched. In a live run on a throwaway board (t02, then a secondhand text moving the start to 15:00) the model itself chose conflict, so its own reason was stored: "Same water distribution at Kosugi Elementary School on Nov 3 ending at 16:00, but a secondhand neighbour message says it starts at 15:00 while the official notice says 14:00."; the sheet read "Marked as conflicting with text sent in (heard from others), 02:10" under "Created from text sent in (official), 02:10".
- Throwaway board `judge-review` deleted afterwards with its rows and the device row. Noted for the polish round, as the review said: the UUID regex lives in four files.

## 2026-11-04 (Wed), notice back, suggested questions, read aloud

**Model:** `claude-fable-5-1` in Claude Code, implementation role, in its own worktree (branch `day4-notice-ask`, cut from `origin/integration-day4`, which is `main` after PRs 9, 10 and 11) while another session worked on the Claude Code setup files, the README, the about page and the poster. No Claude call was added. The ask call (`claude-sonnet-5-5`, Citations) changed in one place: a follow-up question may carry the earlier question and answer pairs as plain turns.

**Done**
- N5, multilingual notice back. `app/b/[slug]/c/[id]/notice/page.tsx` is the reverse of the drop-in: one public card as a printable A4 notice in Japanese, やさしい日本語, English, Chinese, Korean and Vietnamese, in that order, each block with its `lang` attribute (easy Japanese carries `ja`), the language name as a label. Place, time window, status and the outdated warning once at the top in Japanese, with the reader's language beside it when different (cookie, else Accept-Language, the same rule as every page); the source line in words ("From a paper notice (official), 3 sources", input kind from the first source row's platform, else the facts' platform) and the date the paper was made, one line per language; the board QR and URL at the foot with "scan for updates in your language" in the five UI languages in two columns, so a reader of the paper reaches the live card. Same 404 rules as the card page (held, hidden, unknown, malformed ids) through `loadPublicCard` in `lib/db/public-card.ts`, the card page's loader moved out so both pages share one cached read per request. Print CSS lives with the page like the poster's: `@page` A4 portrait with 12 mm margins, the hint, print button and back link hidden in print, the brand line and board name in a header rule, no top bar. On screen the same sheet reads at phone width with nothing under 16 px. "Print as a notice (six languages)" is the fourth entry of the share group (`CardShare`, in the sheet and on the card page) and opens the notice in a new tab; `noticePath` sits next to `cardPath` in `lib/cards/share.ts`.
- N7, suggested questions and a thread. `AskPanel` shows three suggested questions per UI language as 44 px chips under the heading (where to get water, whether the shelter is open, what to bring; `ask.suggest_1` to `ask.suggest_3`); a tap fills the box and sends. Question and answer pairs stay on screen as a thread above the box, at most five (the oldest drops off), each answer with its citation chips, the newest with the skeleton while it loads, a failed one with its error line; "Clear questions" (44 px) empties the thread and drops a reply still in flight. Client state only: questions are never stored, and the route still does not log them. A follow-up such as "Until when?" needs the earlier turns, so the client sends the answered pairs (question and the answer's plain text, pairs that got "no information yet" left out) as `history`, and the route keeps at most five well formed pairs cut to the question and answer limits (anything else is ignored, not refused). In `ask()` the documents stay in the first user turn with the first question, the earlier answers follow as plain assistant turns, and the reader's language, the time and the latest question come last, so the cached prefix (system prompt and documents) and the citation indexes are unchanged. One paragraph in `ask.system.md` says earlier turns are context only and never a source; the cached system prompt changes once. With no public cards the route still answers "no information yet" in code without a call.
- N8, read aloud. `components/board/ReadAloud.tsx`, under the body in the sheet and on the card page: "Read aloud" (title and body in the reader's language) and "Read in easy Japanese" (the やさしい日本語 text), 44 px buttons with an icon and a label, each becoming "Stop reading" while it speaks; starting one cancels the other, leaving the sheet or the page cancels the voice. Voice tags `ja-JP`, `en-US`, `zh-CN`, `ko-KR`, `vi-VN`, easy Japanese on `ja-JP`. Text goes to the engine one sentence at a time (Chrome drops long utterances after about 15 seconds) and the utterances stay referenced until the last one ends (Safari drops speech when the object is collected). Availability is a `useSyncExternalStore` read with a false server snapshot, so the HTML has no button and the DOM gets them after hydration, the same lesson as the share button; the installed voices are a second store on `voiceschanged`, and a language with no installed voice is left out once the list is known, rather than read in another language's voice. The voice is the system default for the language, else the first plain system voice (macOS lists its novelty voices such as "Eddy (Japanese (Japan))" before Kyoko; their names carry a parenthesis), else whatever the engine picks for the tag.
- 16 keys at the top of all five message files (`share.print_notice`, 6 `notice.*`, 6 `ask.*`, 3 `read.*`), 245 keys each, parity checked by script; no dashes in any changed file.

**Acceptance run** (local dev server on port 3440 against the shared Supabase project; throwaway board, a copy of the 武蔵小杉 row with its own slug and a name object in every language, deleted afterwards with its 5 cards, 3 source rows, 1 submission and the device row; Playwright 1.62 Chromium headless shell at 390 px, UI in English; the live board was not touched: 4 public cards before and after). The notice cards were inserted directly so that their length is known: `fixtures/expected/*.json` hold facts, not card text, so there is no long fixture card to print; a short card (the seed water outage, 87 English characters), a medium one (a ward office disaster waste notice, 420 English characters, about the longest an extracted notice gets) and a deliberately long one (a shelter notice, 700 English characters) stood in. The water card and the questions went through the real route and Claude.

| step | result | measurement |
|---|---|---:|
| empty board: suggested question "Is the shelter open?" | "no information yet", no citations, no Claude call; clear removes the thread | |
| notice, short card | 200, six blocks ja, easy_ja, en, zh, ko, vi with `lang`, place and time in Japanese and English, QR and board URL, smallest on-screen text 16 px, one A4 page | 678 px of about 1032, body 12 pt, 13 estimated lines |
| notice, medium card | the same, one A4 page | 929 px, body 11 pt, 36 estimated lines |
| notice, long card | the same, two A4 pages at the 11 pt floor | 1101 px, body 11 pt, 51 estimated lines |
| notice, held card and malformed id | 404 and 404 | |
| chip "Where can I get water?" | answer with 2 citations, the water card first | 2.3 to 3.4 s over three runs |
| typed "What should I bring to the shelter?" | first pair still visible, answer with 1 citation | 2.4 s |
| typed "Until when?" | answered from the thread's context with a citation to the shelter card | 3.4 to 4.4 s |
| citation chip | opens the sheet; the sheet has the print entry (48 px, new tab, `/notice` href) and two read aloud buttons | |
| card page, read aloud | server HTML has no button; two buttons after hydration; tap: `speechSynthesis.speaking` true within 0.2 s and the label "Stop reading"; tap again: false and the label back; easy Japanese starts the same way | 44 px |

- Size tier: the page counts the estimated print lines of the six titles and bodies (a CJK or Hangul character as two Latin ones, 80 per line) and switches the body from 12 pt to 11 pt above 28, the only step there is: 12 pt holds about 28 lines on one page, 11 pt about 41, and beyond that the notice runs to a second page rather than below 11 pt, as specified. The first layout had the language label on its own line, the source and date on two lines and the five scan lines stacked; putting the label inline with the title in print, one line per language and two columns for the scan lines gained about 140 px, which is why the medium card fits.
- Voices on this Mac (macOS, Chromium headless shell, 191 voices): ja-JP Kyoko, O-Ren, Hattori plus eight novelty voices; en-US Samantha (default) and 29 others; zh-CN Tingting, Li-Mu, Yu-shu plus eight novelty voices; ko-KR Yuna plus eight; vi-VN Linh only. Vietnamese may have no voice on some phones: iOS has Linh only when the user downloads it, and Android depends on the installed TTS engine, which is why the button is left out when the list has no voice for it.
- Browser console: 2 errors across the run, both the browser's own log of the trace fetch answering 404 for cards inserted directly without source rows (the same log the judge session noted); nothing from the app.
- `pnpm typecheck`, `pnpm lint` clean on every commit; one `pnpm build` at the end, clean.

**Decisions taken in this session, open for review**
- The notice carries the board QR and URL, as the task said, not the card's: the paper hangs for days and the board shows the card's updates and its neighbours. The card URL is one more line if wanted.
- Follow-up context comes from the client as plain text pairs, so nothing is stored anywhere and a stale client still gets an answer; earlier answers are assistant turns without citations. The documents stay in the first user turn, which keeps the cache prefix. The alternative, no history and independent questions, would leave "Until when?" unanswerable.
- Pairs that got "no information yet" are not sent back as context; they add nothing.
- The source word in the notice's about line is the short form used by the trace ("official", "seen firsthand") rather than the badge text ("Official notice (unconfirmed)"), to avoid nested parentheses in Japanese.
- A second button reads the easy Japanese version to any reader; the plan's N8 line names both. The task's single button is the first one.
- A language without an installed voice is hidden rather than read in the default voice; a reader would otherwise hear Vietnamese in an English voice.
- The three suggested questions are the same in peace and disaster mode; on the live peace-mode board "Is the shelter open?" gets "no information yet", which also shows the honest answer.
- The card page's loader moved to `lib/db/public-card.ts` so the notice shares it; the UUID regex is now in four places still (admin, trace, masked, this loader).

**Needed a human**
- Review and merge the branch (Fable). Nothing new in Vercel, no migration.
- On a real phone: read aloud in Japanese, Chinese, Korean and Vietnamese (iOS Safari speaks only after a tap, which the button is; Android voices vary), and the share sheet's "Print as a notice" from the sheet.
- Print one notice on paper and scan the QR; on this Mac the URL carries port 3000 from `NEXT_PUBLIC_APP_URL`, on Vercel it is the production URL.
- Tick N5, N7 and N8 under 2026-11-05 in `docs/PLAN.md` (the work happened on 11-04).
- Native speakers read the 16 new strings, in particular the three suggested questions and "やさしい日本語で読み上げる".

## 2026-11-04 (Wed), Claude Code setup, about page, Fable eval

**Model:** `claude-fable-5-1` in Claude Code, implementation role, in its own worktree (branch `day4-claude-about`, cut from `origin/integration-day4` after PRs 9 and 10, merged with `main` before the PR) while a second session worked on the printable notice, the suggested questions and read aloud. No runtime Claude call was changed; the two eval runs below are the only API use of this session.

**Done**
- N13, Claude Code visible in the repo. `.claude/settings.json` registers a `PostToolUse` hook on `Edit|Write` that runs `scripts/guard.ts` (new) on the file just written: exit 2 with the finding when the file holds an em dash or an en dash, and, for the five message files, when the five key sets differ; it prints paths, line numbers and key names only. `pnpm guard <file>` and `pnpm guard --all` run it by hand (`AGENTS.md`, written by `next dev` with its own dash, is skipped). `.claude/skills/acceptance-run/SKILL.md` writes down the throwaway-board procedure every implementation session had been rebuilding (copy of the pilot board, dev server on a free port, the two routes the browser calls, what to record, cleanup, never the live board), backed by `scripts/throwaway-board.ts` with `create <slug>` and `delete <slug>` (`pnpm board:throwaway`), which refuses every seeded slug and prints ids and counts only. `.claude/agents/reviewer.md` is the read-only review subagent with the checklist the reviews have used (what a route exposes, Claude outputs as data, `t()` everywhere, 16px and 44px, no dashes, key parity) and the output format: ranked findings with file and line, then a verdict. `CLAUDE.md` gained a "Claude Code setup" section; the rest is unchanged. `README.md` gained "Built with Claude Code": how the sessions were organized, which model does what at runtime with the measured numbers, the Fable comparison, and where the hook, skill and agent live.
- N14, about page. `app/about/page.tsx` (server: metadata, optional `?b=<slug>` so the page can link back to the board the reader came from) and `components/about/AboutView.tsx` (client, so the language switch applies at once): who it is for (Maria, 佐藤さん, チェンさん), the wall it removes, who lives here, what happens to the data in plain words (coarse location, placeholders for personal information, screenshots never shown and deleted, expiry, no accounts, no indexing), who could run it after the event (phrased as intent: a building management association, a 自治会, a shelter team, an international exchange centre). 22 keys appended at the end of all five message files (250 keys each, parity checked by the guard). Linked from the board footer (`app/b/[slug]/page.tsx`, outside `BoardView.tsx`, a 44px link that sits above the floating drop-in button) and from the poster (a printed line with the about URL, a link on screen).
- N11, Fable 5.1 against Opus 5.5 on the eval. `scripts/eval.ts` already took `--model <id>` (overriding `EXTRACT_MODEL` for the run); the summary now also prints the p90 latency and the input, cache-read and output tokens per call. Full fixture set run once on each model; tables in `docs/EVAL.md` under their markers, comparison and reading in its notes.

**Figures on the about page, and where they come from**
- 65,745 foreign residents in 川崎市 and 8,631 in 中原区 at the end of September 2026: 川崎市「管区別年齢別外国人住民人口」(住民基本台帳, 令和8年9月末日現在), the XLSX the city publishes on its statistics pages, read with a script.
- The five largest nationality groups in 中原区 at the end of March 2026 (China 2,451, Korea 1,154, Vietnam 686, the Philippines 635, Nepal 495): 川崎市「外国人国籍地域別統計」(令和7年度分), the March 2026 CSV. These justify the five UI languages in the text.
- Both are named with their month in the page text, and the values sit in one constant in `AboutView.tsx` with the sources in a comment. Numbers that could not be confirmed from a city file (a city-wide share, the Dec 2024 survey figures seen in search results) were left out.

**Extract on `claude-opus-5-5` against `claude-fable-5-1`** (15 inputs, effort low, concurrency 3, 02:35 and 02:37 JST)

| | Opus 5.5 | Fable 5.1 |
|---|---:|---:|
| Field accuracy | 100/100 | 99/100 (p03 `water` for `shops`) |
| PII leaks, invented facts, missed facts | 0, 0, 0 of 17 | 0, 0, 0 of 17 |
| Latency median, p90 | 14.0 s, 18.5 s | 22.6 s, 26.7 s |
| Tokens per call: input, cache read, output | 4154, 6995, 1341 | 4154, 5596, 1948 |

**Decision:** extract stays on `claude-opus-5-5`. Fable 5.1 was not more accurate on these fixtures, kept the uploader waiting 22 seconds instead of 14 (over the 20 second threshold the plan set for splitting the call), wrote 45 percent more output tokens per card and costs two and a half times as much per token. The one category disagreement is defensible either way. What would reopen it: inputs where reading is the hard part (handwriting, bad photos, small print), which the rendered fixtures do not cover; the human's phone photos are the place to test, with `pnpm eval --model claude-fable-5-1 --only <ids> --no-write`.

**Checks**
- `pnpm typecheck`, `pnpm lint`, `pnpm guard --all` clean; `pnpm build` once at the end.
- Guard by hand: exit 2 with two findings on a file holding both dashes, the same through the hook's stdin JSON, exit 0 on a clean message file, on `--all`, and on a Bash tool event.
- About page at 375px in the built-in browser: no text under 16px, the three controls (home link, text size toggle, back link) at 44px, no horizontal scroll, `html lang` follows the language. Board footer link: 16px, 44px tall, its bottom 36px above the top of the floating drop-in button. Poster: the about line renders with the URL from `appBase()` (localhost locally, the deployed URL on Vercel). No drop-in was made; the live board was only read.

**Decisions open for review**
- The hook could not be seen firing in this session: Claude Code reads hook settings when a session starts, and a Write with an em dash made right after the settings file was added produced no hook output here. The script itself was verified with the same JSON the hook sends. A new session on this tree should edit a file with a dash and see the finding; until then the live firing is a claim from the docs, not a measurement.
- The guard checks every text file a session writes, fixtures included; the only tracked file with a dash is the generated `AGENTS.md`, skipped by name.
- `pnpm guard` and `pnpm board:throwaway` were added to `package.json`; the Commands block in `CLAUDE.md` was left as it was and the new section names them.
- The about page's Korean and Vietnamese strings are mine; the native read planned for 11/05 should cover them with the demo cards. 佐藤さん and チェンさん are written without a gendered title in every language.
- `throwaway-board.ts delete` keeps a device row when another board's submission uses the same device id, and says so in its output.

**Needed a human**
- Review and merge the PR. Nothing new in Vercel or the database.
- Tick in `docs/PLAN.md` under 2026-11-05: "N11 Fable versus Opus on the eval" and "N13 Claude Code visible in the repo; N14 about page".
- Confirm the hook fires in a fresh session, then open `/about` on the deployed URL in two languages.

## 2026-11-04 (Wed) early morning, extract split from translate: the first card in about 8 seconds

**Model:** `claude-fable-5-1` in Claude Code, implementation role, in its own worktree (branch `split-translate`, cut from `main` after PR #11) while two other sessions worked on their own file lists. Extract and translate both run on `claude-opus-5-5`; `claude-sonnet-5-5` was measured for translate (below) and not chosen.

**Why.** Until today one extract call wrote the card in six languages and took a median of 13 seconds on the fixtures, almost all of it output tokens. The PLAN's S3 fallback (split extract from translate) was written for the case of more than 20 seconds; it is used now for a different reason: the uploader should see their card as soon as it exists, and the other languages can follow a few seconds later.

**Done**
- Extract writes Japanese, English and the input's own language when that is Chinese, Korean or Vietnamese. In `schemas/extract.schema.json` the other languages are `["string", "null"]` and the prompt says to set them to null; validation (`toMultilingual` in `lib/claude/extract.ts`) requires `ja` and `en` and keeps any other non-empty string. The stored shape is `PartialMultilingual`; readers keep `Multilingual` (all six) because the projections below fill it.
- `lib/claude/translate.ts`: one structured-outputs call per submission over the day 0 prompt and schema. The schema is cut in code to the languages asked for (a Chinese input already has Chinese), one variant per subset; the prompt and the same board context block as extract (known places with their names in each language) are cached. Code checks one entry per item, every asked-for language non-empty, and no phone number or email (`TranslateError("pii_leak")`). `translateFacts` serves the scripts.
- `lib/db/translate.ts`: `fillCardLanguages` reads the written cards, builds one item per card and per conflict statement that lacks a language, makes one call for all of them and writes only the missing languages under the `updated_at` the row had when it was read. A row that changed meanwhile is read again and filled only if its Japanese and English are still the text that was translated. A card that lacks nothing causes no call: a merge target with six languages is read, found complete and left alone (checked live, step 3 below). `listCardsMissingLanguages` names up to 3 older public or held cards of the board still missing a language, so a translation that failed earlier is filled by the next drop-in on the board.
- `app/api/process/[id]/route.ts`: after reconcile and `finishSubmission` (status `done`, cards recorded) the route sends a `cards` event, then `stage: translating`, runs the fill with one retry (none after the daily cap), then `done` with `translate_ms` and `translated`. A failed translate never fails the submission. The translation state lives on the cards, not on the submission row.
- Client: `DropIn` refreshes the list on the `cards` event, so the card appears while translate runs; `PendingCard` has a fifth step, Translating; `dropin.step.translating` and `card.translating` were appended to the five message files (231 keys each, parity checked, no dashes).
- Readers: `lib/cards/langs.ts` fills a missing language with English, then Japanese (やさしい日本語 with Japanese first), in `toPublicCard` and the admin list, never in the row, and sets `missing_langs` on the card. `CardItem` marks the title with the language it is really in (`lang` attribute) and says "Translation coming soon." under it. The sheet, the card page, share and ask read the same filled records and show the fallback text without the hint (their files belong to other sessions this week; `missing_langs` is there for them).
- `pnpm eval` runs translate after extract and scores six languages on the result, with a translate column; `pnpm latency` prints extract and translate side by side (`--no-translate` for extract alone). `lib/claude/README.md` and `.env.example` (`TRANSLATE_MODEL`) updated.

**Latency, before and after** (`pnpm latency`, all 23 fixture inputs one after another, `claude-opus-5-5`, effort low, prompt cache warm; the first column is the code on `main` at 18ced70, the others this branch)

| ms | before: one call, six languages | after: extract (ja, en, input language) | after: translate | after: extract plus translate |
|---|---:|---:|---:|---:|
| median | 12980 | 8296 | 8635 | 15798 |
| mean | 12662 | 7947 | 8605 | 16552 |
| min | 7147 | 4766 | 4528 | 10321 |
| max | 22519 | 10589 | 12898 | 22944 |

The time to the first card is the extract column: 13.0 to 8.3 seconds at the median, 22.5 to 10.6 at the worst (the p09 photo). Extract output tokens over the 23 inputs went from 28385 to 16839. The full set of six languages now lands about 2.8 seconds later than before at the median, as a second step the reader does not wait for.

**Eval** (`pnpm eval --no-write`, 15 inputs, concurrency 3; `docs/EVAL.md` is another session's file this week, so the numbers are here): 100/100 fields, 0 PII leaks, 0 invented facts, risk flags 15/15, six languages present on every fact after translate 15/15, extract median 7391 ms. `pnpm eval --reconcile --now 2026-11-03T10:00:00+09:00 --no-write`: 11/11 (create 4/4, merge 6/6, update 1/1), reconcile median 2323 ms; t03 merges since the PR #9 prompt rule.

**Translate model.** Same eval with `--translate-model claude-sonnet-5-5`: 100/100, 0 leaks, 0 invented, 15/15 six languages, translate median 7780 ms against 9991 ms for Opus in the eval (both ran beside the latency run) and 8635 ms for Opus in the sequential latency run. Decision: translate stays on `claude-opus-5-5`. The card is already on the board when translate runs, so the second saved buys little, and the Korean and Vietnamese text is what native speakers read on 11/05. `TRANSLATE_MODEL=claude-sonnet-5-5` switches it in one variable.

**Acceptance** (local dev server on port 3131 against the shared Supabase project; throwaway board `split-acceptance-0323`, a copy of the 武蔵小杉 row; a script sent the text through the two routes and polled the public cards API every second as a reader's browser would; the built-in browser pane watched the board with the interface in Vietnamese; the live board was not touched). Times are from the submission's creation.

| step | input | `cards` event | a poll saw the card | `done`, six languages | what the Vietnamese browser showed |
|---|---|---:|---:|---:|---|
| 1 | `t02` water notice text (ja) | 10.2 s (extract 8.2 s; the first request compiled the route) | 11.9 s, `missing_langs` zh ko vi easy_ja, title in English | 17.5 s (translate 7.3 s) | the Vietnamese title after the poll |
| 2 | `t03` WeChat text (zh) | 5.8 s (extract 5.1 s) | 6.1 s, `missing_langs` ko vi easy_ja | 10.9 s (translate 5.0 s, ko vi easy_ja only) | first the English title with "Bản dịch sẽ có trong giây lát.", on the next poll "Cửa hàng tiện lợi trước Ga Musashi-Kosugi (武蔵小杉駅), đang mở cửa, còn nước" |
| 3 | `t02` again | 15.5 s, merge into step 1's card (extract 12.2 s, reconcile 2.9 s) | complete at once | 15.6 s, translate stage 0.1 s | no translate call in the server log: the complete merge target was left alone |

After each step the row in the database had no missing language. Deleted afterwards: the 2 cards, 3 source rows, 3 submissions, 0 storage objects, 3 device rows and the board. `pnpm typecheck`, `pnpm lint` and `pnpm build` clean.

**Decisions taken in this session, open for review**
- The card appears on a `cards` event sent before `done`, with `done` after translate, rather than `done` first and translate after it. The client already treats `done` as the end of the stream and removes the placeholder 2.5 seconds later, and the whole pipeline stays inside the uploader's open connection as the architecture says. The uploader sees the card at the same moment either way; the placeholder shows Translating for the remaining seconds.
- Fallback order English, then Japanese, for zh, ko and vi; Japanese first for やさしい日本語.
- The fill happens in the public and admin projections, so every reader gets complete records without touching their files; the stored row stays partial until translate writes it.
- Null in the schema rather than optional properties: the structured outputs documentation lists nullable types as supported and says nothing about optional properties.
- The sweep is capped at 3 older cards per drop-in, in the same call as the submission's own cards.
- `docs/EVAL.md` not updated from this branch; run `pnpm eval` after the merge to refresh its table (the header and columns changed).

**Needed a human**
- Review and merge the branch (Fable). Nothing new in Vercel; `TRANSLATE_MODEL` is optional.
- The Korean and Vietnamese card text now comes from the translate prompt, not from extract; the native speaker read on 11/05 reads that.
- `CardSheet`, `CardPage`, share and ask show English for a language that is not there yet without the "Translation coming soon." line; one line each with `shownLang` from `lib/cards/langs.ts` once their owners are done.

## 2026-11-04 (Wed), offline snapshot, peace-mode questions, eval refresh

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day5-offline`, cut from `main` at 1b8d659) while `day5-trust` worked on its own file list. No prompt, schema or model changed; the eval ran extract, translate and reconcile on `claude-opus-5-5`.

**Done**
- N9 offline snapshot. `public/sw.js`, plain JavaScript with no library (164 lines): network first with a cache fallback for `/b/<slug>`, `/b/<slug>/c/<id>` and its `/notice`, `/api/b/<slug>/cards` (the poll) and `/about`; cache first for `/_next/static/*` and `/samples/*`. Under `next dev` the worker is registered as `/sw.js?dev=1` and keeps static files network first, since dev chunks are not content hashed. Never touched: anything that is not GET, the React payload requests of client side navigations (`RSC` header or `_rsc`), `/api/process`, submissions, ask, admin, masked images, traces, the poster and the OG images. Only `ok`, same origin, not redirected responses are stored, each with its stored time in an `x-engawa-stored-at` header; a response answered from the cache carries `x-engawa-from-cache: 1`. Two caches, `engawa-pages-v1` (at most 60 entries) and `engawa-static-v1` (at most 200), oldest first beyond that. `VERSION` is a constant bumped by hand: activate deletes every other `engawa-*` cache, then claims the open pages; install calls `skipWaiting`.
- The first visit. The first page a reader opens loads before the worker exists, so none of its requests pass through it, and only the poll would have been kept. Once the worker is active, that page sends it its own URL and the build files it loaded (from Resource Timing) in an `engawa:warm` message; the worker stores the ones its rules allow and ignores the rest.
- `lib/offline.ts` and `components/offline/OfflineSupport.tsx`, mounted once in the root layout: registration in production and in development, only when `navigator.serviceWorker` exists; `useOnline` over the browser's online and offline events; `askServedFromCache`, a message over a `MessageChannel` asking the worker whether this page's HTML came from its cache and when that copy was stored.
- Board (`BoardView.tsx`): the banner "Offline. Showing the board as of 08:12." (16 px bold, dark amber on pale yellow, a live region, hidden in print; the date is added when the copy is not from today, Japan time) shows while the browser reports offline, or the last poll failed, or the poll was answered from the cache. The time is the `now` of the cards on screen, the server's clock when that cards response was made, which is the moment the worker stored it. A page opened offline or out of the cache polls at once instead of after 5 seconds; coming back online polls at once, and the banner goes when a poll reaches the server. A saved poll older than the cards already on screen is not applied. `DropIn` takes `offline`: the button is disabled and grey, with "Offline: drop-in works again once you are connected." above it.
- Card, notice and about pages: "Offline. Showing a saved copy from 08:12." from the layout, while the browser reports offline or when the worker says the page came out of its cache.
- Peace-mode suggested questions: `AskPanel` takes the board's `mode` (`peace` or `disaster`). A peace board suggests "When does garbage collection change next?", "Is a water outage planned?" and "Is there a notice from the building management?"; a disaster board keeps its three. The input's placeholder follows the mode too: it said "Where can I get water?" on every board. That is one key more than the brief.
- Seven keys at the top of the five message files: `offline.board_banner`, `offline.page_banner`, `offline.dropin_reason`, `ask.suggest_peace_1` to `_3`, `ask.placeholder_peace`. The Korean and Vietnamese lines are mine, for the native read.
- README: one line under How it works.

**Retention of the offline copy.** The worker keeps only what the public board already showed this reader in this browser: the board page, the card, notice and about pages they opened, the board's last poll, build files and the three sample inputs. No submission, original, masked image, trace, answer or admin page is ever stored, and nothing leaves the phone. The copy lives in the browser's Cache Storage until the browser evicts it, the reader clears the site's data, or `VERSION` changes; beyond 60 pages and 200 build files the oldest go first. It is not bound to `purge_after`: a card hidden or purged on the server stays in a reader's saved copy until their next load of that page reaches the network and replaces it. `docs/PRIVACY.md` belongs to `day5-trust` today, so this paragraph is the record until a line is added there.

**Acceptance** (production build, `pnpm start` on port 3460 behind a small switchable proxy on 3461; throwaway board `offline-acceptance`, a copy of the 武蔵小杉 row, with one card from the `t02` text through the real routes: extract, reconcile create, translate, 19 s; Chrome for Testing at 390 px through `playwright-core`; the live board was not touched).

Playwright's `context.setOffline(true)` blocks the page's own requests but not the service worker's `fetch`, and in this Chrome build neither it nor the CDP network override sets `navigator.onLine` to false. The first offline reload therefore came from the server through the worker. The run uses `setOffline` plus a proxy that closes its port, so the worker's fetch really fails, and the browser's offline signal is checked separately by firing the `offline` event with `navigator.onLine` reporting false. Under `next dev` an offline page does not hydrate at all (the dev client waits for its HMR socket), so the offline steps were run on the production build; online, the dev server registered the worker and kept the same three pages.

| step | what was checked | result |
|---|---|---|
| 1 | first visit online: worker controls the page; what is kept | board HTML, poll and card page in `engawa-pages-v1`, 11 build files in `engawa-static-v1`, nothing else; no banner; peace questions shown |
| 2 | network gone (proxy down, `setOffline`), reload the board | rendered from the cache with its card; banner "Offline. Showing the board as of 08:12."; drop-in disabled with its reason; poll answered `x-engawa-from-cache: 1`, stored 23:12:14 UTC |
| 3 | ask, offline | the suggestion tap shows "Could not get an answer. Please try again." as before; ask is never cached |
| 4 | card page offline, new tab | rendered from the cache, "Offline. Showing a saved copy from 08:12.", title and body in English |
| 5 | poster, never kept | `net::ERR_INTERNET_DISCONNECTED`, as without the worker |
| 6 | Wi-Fi without internet: browser online, server unreachable, fresh tabs | board and card page from the cache, both with the banner (from the worker's answer, then the poll answered from the cache); drop-in disabled |
| 7 | network back | banner gone 2.8 s later on the next poll, drop-in enabled, poll from the network |
| 8 | `offline` event with `navigator.onLine` false, then `online` | banner at once before any poll; gone 7 ms after `online` (the poll reached the server) |
| 9 | Japanese UI, server unreachable | "オフラインです。08:12 時点の掲示板を表示しています。", "オフラインのため投稿できません。つながると使えます。", the three peace questions in Japanese |

Deleted afterwards: 1 card, 1 source row, 2 submissions (one first sent without the JSON body `/api/process` now needs, so it stayed `received`), 0 storage objects, 2 device rows and the board. `pnpm typecheck`, `pnpm lint` and `pnpm build` clean.

**Eval refresh** (`pnpm eval`, then `pnpm eval --reconcile --now 2026-11-03T10:00:00+09:00`, both written into `docs/EVAL.md`; the notes below the markers are unchanged)

| | result |
|---|---|
| field accuracy | 100/100 (category 17/17, place 17/17, times 22/22, status 7/7, source 15/15, conditions 16/16, en 6/6) |
| PII leaks | 0 |
| invented facts | 0, missed 0 of 17 |
| risk flags as expected | 15/15 inputs |
| six languages after translate | 15/15 inputs |
| extract latency, time to the first card | median 8407 ms, p90 11031 ms, max 11191 ms |
| translate latency | median 9372 ms, min 5397 ms, max 15514 ms |
| reconcile chains | 11/11 steps (create 4/4, merge 6/6, update 1/1), 0 code overrides, reconcile median 2429 ms |

No score below 100/100 and no leak, so no prompt was touched.

**Decisions taken in this session, open for review**
- Network first has no timeout. On a network that hangs instead of failing, the reader waits for the browser's own timeout before the saved copy shows. A timeout of 5 to 8 seconds for page loads would show the copy sooner, at the cost of a stale page on a slow but working line.
- The banner also shows after a single failed poll while the browser says online, for the 5 seconds until the next one: the board really did not refresh.
- The board's banner time is the `now` of the cards on screen rather than the worker's stored time; the two differ by the length of the request. The stored time is what the card and about pages show.
- While offline, relative times and expiry on the cards are computed against the snapshot's time, consistent with "as of". A card that expired since still looks current against that time; the banner states the time.
- A page shown from the cache keeps its banner after the network returns, until it is reloaded, since its content is still the old copy. Only the board refreshes itself.
- Cache sizes 60 pages and 200 build files.
- The placeholder follows the mode as well as the suggestions.

**Needed a human**
- Review and merge. Nothing new in Vercel or the database.
- In `docs/PLAN.md` under 2026-11-05, "N9, N10, N12 only if the day is clear" becomes N9 done (this PR) with N10 and N12 still open. No line exists for the peace-mode questions or the eval refresh; one line each if wanted.
- After the deploy: open the live board once on a phone, switch to airplane mode, reload: the board and its banner should show. The worker takes over each open page on its next load after every deploy.
- `docs/PRIVACY.md` (owned by `day5-trust` today): one paragraph on the offline copy, from the retention paragraph above.
- The acceptance-run skill's curl for `/api/process/<id>` has no JSON body; the route answers 400 without `{"device_id": ...}`.

## 2026-11-04 (Wed), reader confirmations, shared ids, usage and placeholder checks

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day5-trust`) beside the `day5-offline` session, whose files were left alone.

**Done**
- **N6 reader confirmations.** Migration `0006_card_reactions.sql` (idempotent): table `card_reactions` (card, device id as uuid, `still_true` or `no_longer_true`, `created_at`, `purge_after` copied from the card, primary key on card and device, cascade on card delete, RLS on with no policies), an index on `(card_id, kind)`, a count function `card_reaction_counts(uuid[])` executable by the service role only, and a new cards trigger (below). `POST /api/cards/[id]/react` with `{device_id, kind}` upserts the device's reaction on a public card and answers with the card's new counts and nothing else; `DELETE` with `{device_id}` takes it back. 404 for an unknown, held or hidden card and for a malformed id, 400 for a bad kind or device id, 429 with `Retry-After: 3600` past 30 reactions per device per hour. `still_true` moves `last_confirmed_at` to now, the line readers already see as "Last confirmed". `listPublicCards` and `getPublicCard` carry `reactions: {still_true, no_longer_true}` from one count query per read (`lib/db/reactions.ts`); a database without the function logs and shows zeros instead of failing. UI: `components/board/CardReactions.tsx` in the card sheet and on the card page, two 44 px buttons with their counts and `aria-pressed`, the device's choice kept in its own browser (`lib/cards/reactions.ts`, `useSyncExternalStore`), counts updated from the route's answer, the card page refreshing after a tap. `CardItem` shows "Readers report this may no longer be true" when two or more devices said so; it is in the button's accessible name and never hides the card. Nine `react.*` keys appended at the end of the five message files. An update from reconcile clears the card's reactions; the purge job deletes reactions past their own `purge_after` besides the cascade; `docs/PRIVACY.md` has a retention row and principle 8 names the use of the device id.
- **One module for ids.** `lib/ids.ts` exports `UUID_RE` and `isUuid(value: unknown): value is string`, used by the trace, masked and admin routes, `lib/db/public-card.ts` and the new route. The admin copy was case-sensitive; all are case-insensitive now. `app/b/[slug]/c/[id]/page.tsx` had no copy of its own: it goes through `loadPublicCard`.
- **Usage for rejected responses.** `withUsage` now takes `(meter) => call(..., { onUsage: meter })`. Each wrapper (`extract`, `translate`, `reconcile`, `ask`, `maskBoxes` through `maskScreenshot`) reports the token counts right after the API returns, before it reads the stop reason or parses anything, and `withUsage` records every reported response in a `finally`. A refusal, output that is not JSON or a phone number in a translation now counts toward `DAILY_CLAUDE_CALL_CAP`, and the retry after it counts again. An API error before any response records nothing; `BusyError` comes from the cap check before the call, as before. Noted in `lib/claude/README.md`.
- **Reader taps and the confirmation line (review fix).** "Last confirmed" on the sheet and card page used to move only when a second source merged; it now also moves on a device's first "still true" on a card that has not expired. A toggle never re-bumps it, and an expired card keeps its outdated badge without a fresh confirmation beside it.
- **Placeholders survive translation.** In `validateTranslateResult`, every bracketed token (［…］, 〔…〕, [...]) in an item's Japanese or English source must appear in each target of that item, as often as in the source that has it most often. A language that loses one is dropped from that item only, title and body together, with a warning that carries counts and no text; it stays missing on the card (readers see the fallback) and the next sweep asks again. The rest of the batch is kept. `scripts/eval.ts` has no hook for translate checks, so `scripts/check-placeholders.ts` covers the rule on fixed strings without the API (`node --import=tsx scripts/check-placeholders.ts`, 17 checks). The translate prompt now says the rule is enforced.

**Why a reaction is a signal and not a vote.** A tap says what one reader saw at one moment from one anonymous browser id that costs nothing to replace. It carries no statement, no time range, no source, so it cannot be weighed the way reconcile weighs a notice against a chat message, and a few taps must never outrank an official notice. The board organizes what neighbours dropped in; only a new source through extract and reconcile changes what a card says. So a reaction changes nothing on the card: no hide, no conflict, no source count, no trust level. `still_true` moves the "Last confirmed" time, which is a fact about the reading, not the content. `no_longer_true` from two devices adds a hint line that sends the reader to check, with the counts beside the buttons for anyone who wants the numbers. That is also why the PLAN line's "or opens a conflict" was not built: a conflict is between two statements, and a tap is not one. Reactions describe the content as it was when tapped, so an update that replaces the content clears them, as it already resets the source count and the last confirmation, and a choice remembered in the browser from before the update stops showing as pressed.

**Acceptance** (dev server on port 3450 against the shared Supabase project after migration 0006; throwaway board `trust-acceptance`, a copy of the 武蔵小杉 row; drop-ins through the two routes the browser calls; Playwright 1.62 Chromium at 390 px with two separate browser contexts as two devices; the live board was not touched)

| step | what | result |
|---|---|---|
| 1 | `p02` water notice photo | `create`, 22 s to `done` (extract 7.5 s, reconcile 0.2 s), cards API shows `reactions` 0 and 0 |
| 2 | `p06` rumour text | held, 18 s |
| 3 | device A taps "Still true" in the sheet | count 1, `aria-pressed` true, `last_confirmed_at` null to now, `updated_at` unchanged, buttons 44 px |
| 4 | device A taps "No longer true" | counts 0 and 1, pressed moves (upsert), `last_confirmed_at` not moved again, no hint with one report |
| 5 | device B taps "No longer true" | counts 0 and 2; within one 5 s poll, without a reload, the card item shows the hint and its accessible name includes it; the card stays on the board; device B saw A's tap only as a count |
| 6 | device B on the card page | its choice shown as pressed with 2; a tap takes it back (DELETE): 1, unpressed, 1 after a reload; the hint is gone |
| 7 | device A reopens the sheet, a third context in Japanese | A's choice still pressed from its browser; この情報はまだ正しいですか？ with まだ正しい and もう違う |
| 8 | privacy | neither device id in the cards API or the card page HTML; the anon key is refused on the count function (42501) and sees 0 rows in the table |
| 9 | route errors | held card POST and DELETE 404, unknown uuid 404, malformed id 404, bad kind 400, bad device 400, no body 400, GET 405 |
| 10 | 429 | one device: 30 taps (POST and DELETE in turn) 200, the 31st 429 with `Retry-After: 3600`; a device with 30 reactions set this hour (seeded on 30 hidden cards of the throwaway board): its first tap 429; a fresh device 200 |
| 11 | rows | each reaction's `purge_after` equals the card's; `updated_at` unchanged through every confirmation of steps 3 to 10 |
| 12 | `p07` time change photo | `update` onto the same card, 24 s (extract 8.9 s, reconcile 3.6 s, translate 8.6 s); its 2 reactions cleared, `last_confirmed_at` reset; a choice stored before the update renders unpressed, one stored after renders pressed |
| 13 | delete the board | 32 cards, 3 sources, 3 submissions, 2 storage objects, 1 device removed; `card_reactions` 30 rows to 0 through the cascade |

Playwright: 24 of 24 checks after one test fix (a step read the list before its next poll). The Next dev overlay then showed two issues: `CardReactions` and `ReadAloud` were siblings with the same `key={card.id}`. Fixed with a key of its own; no console errors on the board or the card page afterwards.

**Other measurements**
- `scripts/check-placeholders.ts`: 17 of 17 (tokens, kept, bracket kind changed, brackets dropped, inside altered, one of two occurrences dropped, per-item and per-language drop, a phone number still fails the whole call).
- Usage: a one-off script against `usage_daily` (outside the repo, deleted): a response whose check threw added 1 call; an error before any response added nothing. That test call (0 tokens) is in today's counter.
- `pnpm eval --no-write` after the placeholder and prompt change: 100/100 fields, 0 PII leaks, 0 invented facts, risk flags 15/15, six languages on every fact 15/15 (no language dropped by the placeholder check), extract median 8383 ms, translate median 9410 ms.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

**Decisions taken in this session, open for review**
- Migration 0006 replaces the cards `updated_at` trigger: an update that changes nothing but `last_confirmed_at` keeps the row's `updated_at`. Reconcile and translate write under the `updated_at` they read; without this a reader's tap during a translate would make that write lose its guard. Every other update stamps `updated_at` as before.
- Two limits at 30 an hour: the durable one counts the device's rows set or changed in the last hour (across instances); a per-instance counter of every tap, take-backs included, stops toggling on one card (best effort, like the ask limit). A device repeating `still_true` without changing it does not move `last_confirmed_at` again.
- The hint needs two `no_longer_true` and ignores how many said `still_true`: it asks the reader to check, it does not decide.
- Reactions inherit the card's `purge_after` when set; the purge job deletes them on that date even if a later merge extended the card. A reaction made before the extension was about the card as it stood then.
- The device id must be a full uuid (`isUuid`), stricter than the submissions route's `/^[0-9a-f-]{36}$/`, because the column is `uuid`; ids from `crypto.randomUUID()` pass. The looser pattern in the submissions and ask routes and in `lib/device.ts` was left as it is.
- Placeholders match by what is inside the brackets with any of the three bracket kinds, width folded. Two edge cases stay open: a Japanese ［名前］ beside an English [name] would require both in every target, and an English title with an editorial bracket such as [Update] would count as a placeholder. Either keeps that language on its fallback; none of the fixtures or seed cards has one.
- Before hydration the buttons render unpressed (the server cannot read the browser's choice); the pressed state appears once the page hydrates.

**Files of the other session.** None edited. `BoardView` already passes polled cards to `CardItem` and the sheet, so counts and the hint arrive with its 5 second poll unchanged. The acceptance-run skill's curl line for `/api/process/<id>` lacks the `{"device_id"}` JSON body the route requires (the `day5-offline` note says the same).

**Needed a human**
- Migration 0006 was applied to the shared project by this session after the human allowed it (the first attempt was blocked by the permission check); nothing new in Vercel.
- Review and merge the PR. Tick in `docs/PLAN.md`: N6 in the nice-to-have list ("Done 2026-11-04") and "N6 reader confirmations" under 2026-11-05.
- The Korean and Vietnamese `react.*` strings are mine; add them to the native read on 11/05.

## 2026-11-04 (Wed), laptop layout and polish pass

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day5-laptop`) beside the `day5-broadcast` session, whose files (`DropIn.tsx`, `HeardInput.tsx`, the inbox, submissions and process routes, `lib/claude/**`, `lib/db/**`, migration 0007) were left alone.

**Done**
- **One source for the card content.** The body of `CardSheet` moved into `components/board/CardDetail.tsx` (title, body, read aloud, facts, sources, reader confirmations, earlier versions, share, how it was made, all languages, original, and the trace fetch). The phone sheet keeps its focus, Escape and close behaviour and renders `CardDetail`; the laptop panel renders the same component. `Statement` moved with it and is re-exported from `CardSheet`.
- **Laptop workspace, 1024 px and wider.** The top bar holds the board name, a mode badge (Everyday mode / Disaster mode), the drop-in as the primary button, share, text size and language on one line. Three columns under it, each scrolling on its own inside a viewport-high shell: the card list with the hidden duplicates drawer and the about link at its end; the centre panel (`components/board/layout/CardPanel.tsx`) with the selected card, or "Pick a card" with a one-line keyboard hint; the ask panel. The offline banner stays across the top. The drop-in opens as a 480 px drawer on the right, under the top bar, over the ask column, non-modal like before.
- **Tablet, 768 to 1023 px.** Two columns: the list, and the selected card stacked above the ask panel. The floating drop-in button and its bottom-sheet panel stay as on the phone (touch tablets).
- **Phone, under 768 px.** Laid out as before: ask panel above the list, cards open in the bottom sheet, floating drop-in.
- **Keyboard and URL.** Arrow keys, Home and End move focus through the cards of the list; Enter or Space opens the focused card in the panel and focus stays in the list, so the arrows keep working; Escape closes the panel (after the drop-in or the share panel, which close first) and hands focus back to the card when it was in the panel. The open card is kept in the hash as `#card-<id>` (the list item's own id) with `replaceState`, so a refresh or a copied link opens it again and the back button still leaves the board. The selected list item carries `aria-current` and an accent ring. When the drop-in closes with focus inside it, focus goes back to the button that opened it (top bar on a laptop, the floating button on a phone, where it used to drop to the page).
- **Ask placements share one thread.** The ask state moved into `components/ask/useAsk.ts`; `AskPanel` renders from it with ids from `useId`, so the phone, tablet and laptop placements (two hidden by CSS at any width) show the same thread and a resize loses nothing.
- **Polish pass** (board, card page, admin and about page at 390 and 1440 px, read as a first-time reader):
  - Empty states: an empty board says "No cards yet." with a one-line hint and, from 768 px, a "Drop in the first notice" button (on a phone the floating button sits right under the hint); a board with cards and nothing hidden says "No duplicate cards are hidden on this board."; an answer that cites no card offers "Drop in what you know", which opens the drop-in.
  - Dates show the month as a word in every locale (`formatDateTime`): "3 Nov, 07:29", "11月3日 07:29", "11월 3일 07:29", "07:29 3 thg 11". In en-GB the numeric "03/11" read as March to many readers. The printed notice keeps `formatFullDateTime`, unchanged. Relative times already come from `t()` in all five languages.
  - Hover and pressed states on laptop for the top bar controls, card list items, the card detail's buttons (read aloud, reactions, share actions, the two disclosures), ask chips, citations, submit and clear, the pending card's buttons and the card page links. A new token `--accent-hover` (#163f2c, white on it 11.8:1) for filled buttons.
  - Headings: on the card page the reactions, share and trace sections were h3 straight under the h1; `CardReactions`, `CardShare` and `CardTraceView` take `headingLevel` and are h2 there (h3 in the sheet and panel, under the card's h2).
  - Button labels: "Close card" in the panel, "Drop in the first notice", "Drop in what you know".
  - Checked without a change: the language switch already lists every language in its own script with a `lang` attribute; the text size toggle enlarges the panel (everything inside is in rem; checked in Japanese at 1440 px, large); no new transition, and the existing smooth scroll already honours reduced motion; the pending stepper shows in the list column while the laptop drawer closes on send.
  - Spacing and radius: the new layout keeps to 8 px steps (gaps 16 and 24, padding 16 and 24, column bottoms 32 and 96) and the existing radii (cards and inputs 12 px, panels and sheets 16 px, top bar controls 8 px, chips round). The 12 px paddings inside existing cards were left as they are to keep the look.
- Ten keys inserted at the TOP of the five message files (`layout.*`, `empty.*`).

**Screenshots** (Playwright 1.62 Chromium against the dev server on port 3480; the live board was only read, the drop-ins and questions ran on the throwaway board below; image files deleted afterwards)

| width | layout | what it shows |
|---|---|---|
| 390 | one column, as before | top bar on two rows (logo and board name, then share, text size, language); ask panel; Notices; floating "Drop in a notice". A card opens as the bottom sheet with focus on Close; the drop-in panel is the bottom sheet. Empty board: hint under "No cards yet." with the floating button. |
| 768 | two columns | top bar on one line with the mode badge; list column 322 px scrolling on its own; right column: the selected card ("Selected card", "Close card") above the ask panel; floating drop-in and bottom-sheet panel as on the phone. |
| 1024 | three columns | "+ Drop in a notice" leads the top bar; list 307 px, centre 373 px, ask 280 px. The close button moved to its own row above the title: beside it, a first version with fixed 340 and 300 px columns left a 288 px centre with the title one word a line. The drawer is 480 px wide from under the top bar to the bottom. |
| 1440 | three columns | list 432 px, centre 538 px, ask 374 px. Before a card is picked the centre shows "Pick a card" and the keyboard hint; after a question the right column holds the thread and the cited card opens in the centre. |

Other pages: the about page, the card page, the poster, the printed notice and the start page render at 390 and 1440 px without console errors. The poster and notice pages import nothing this branch changed; the about page gets the top bar's hover states only.

Measured on the board at all four widths with a card open (and the drawer open at 1024 and 1440): no visible text under 16 px, no control under 44 by 44 px. New colour pairs: badge text on beige 15.0:1, warn pair as before, muted on white 6.7:1 and on the page 6.4:1, accent on white 7.9:1 and on beige 6.9:1, white on the hover shade 11.8:1.

**Acceptance** (throwaway board `laptop-acceptance`, a copy of the 武蔵小杉 row; dev server on port 3480 against the shared Supabase project; Playwright 1.62 Chromium; the drop-ins went through the samples in the drawer, the same path a user's file or text takes)

| step | what | result |
|---|---|---|
| 1 | empty board at 1440 and 390 | list hint with the drop-in button (from 768 px), centre shows "Pick a card"; on the phone the hint sits above the floating button |
| 2 | paper notice sample (p01) through the top bar drawer | the drawer closes on send, the stepper runs in the list column, Done in 23.9 s, 1 card |
| 3 | text sample (p08) | Done in 11.8 s, 2 cards |
| 4 | Tab into the list, arrows, Enter at 1440 | the centre panel shows "Water distribution at Kosugi Elementary School (小杉小学校), short line now", hash `#card-4a20164f...`, the trace shown, focus still on the list item |
| 5 | "Is a water outage planned?" in the right column | answer in 3.8 s with 1 citation |
| 6 | the citation chip | opens the cited card in the centre and marks it in the list |
| 7 | "Is there a summer festival this weekend?" | first run: an answer without citations and no button (`noInfo` is set only for a board without cards); after the change, the "Drop in what you know" button (1.3 s) |
| 8 | that button, then Escape | the drawer opens with focus inside; Escape closes it; the card stays open; a second Escape closes the card |
| 9 | refresh | the same card open in the centre panel |
| 10 | keyboard script at 1440 (also on the pilot board, read only) | 26 of 26: Tab reaches the first card after 6 stops, ArrowDown, ArrowUp, End, Home, Enter, no sheet at this width, hash, `aria-current`, 3 px focus outline, refresh, Escape and hash cleared, drawer at the right edge under the top bar, focus into the drawer, `aria-expanded`, Escape order, focus back on the top bar button, the page itself does not scroll |
| 11 | phone and tablet script | 20 of 20: at 390 one ask panel, tap opens the bottom sheet with focus on Close, Escape and Close dismiss it, the drop-in is the bottom sheet, Escape closes it, the page scrolls; at 768 the card opens beside the list above the ask panel, Escape closes it |
| 12 | admin page at 390 and 1440 | renders; notes below |
| 13 | delete the board | 1 storage object, 2 card_sources, 2 cards, 2 submissions, 1 device removed |

No console errors on any run. Claude calls spent: 2 drop-ins (extract, reconcile, translate) and 3 questions. `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.

**Decisions taken in this session, open for review**
- `DropIn.tsx` belongs to the other session, so the laptop drives it from outside: BoardView wraps it in `[data-dropin-host]`, the top bar button calls `.click()` on DropIn's own `[data-dropin-button]` (hidden from 1024 px), and `app/globals.css` restyles DropIn's `section[role=dialog]` as the right drawer from 1024 px (`components/board/layout/dropInBridge.ts`). The `day5-broadcast` session was told which two hooks to keep. Props on DropIn would replace this (follow-ups below).
- The URL hash, not a search param: no server round trip, no new cache key for the offline worker, and the browser scrolls the list to `#card-<id>` on load. A phone refresh now reopens the sheet too.
- Arrow keys move focus and Enter opens, rather than opening on every arrow press, so a screen reader moving through the list is not interrupted by the centre changing. Every card stays in the Tab order (no roving tabindex), so nothing changes for a keyboard on a phone.
- The ask panel is rendered in three places with one shared thread instead of one element moved by the grid: a single element placed on the right by CSS would put the focus order out of line with the reading order on one of the layouts.
- Column widths are `clamp()` in px, not rem: the large text setting enlarges the text without squeezing the centre. The list is 432 px at 1440 and 460 px from 1534 px; at 1024 px it is 307 px so the centre keeps 373 px.
- An answer that cites no card counts as "nothing found" for the button; `lib/claude/ask.ts` keeps `noInfo` for an empty board only.
- Demo note: three windows side by side on a 1440 px screen are 480 px each, which is the phone layout. For the laptop view on camera one window needs at least 1024 px (for example one window at 1024 and two at phone width).

**Polish items left for files this session does not own**
- `components/board/DropIn.tsx`: take `open` and `onOpenChange` (or an imperative handle) and a `placement` ("sheet" or "drawer"), so BoardView stops clicking the hidden button and the drawer styles move out of `globals.css`; move focus into the panel on open (BoardView does it now); the top "Cancel" closes the panel while the text step's "Cancel" goes back to the choices, one label for two actions ("Close" for the first); the "Got it" and "Send" buttons have no hover state (`hover:bg-accent-hover` is available).
- Pipeline (`lib/claude/**`): `note_for_uploader` comes back in Japanese on an English board ("どのマンションのお知らせか、建物名を教えてください。" after the p01 sample); `facts.conditions` are shown as extracted, so a Japanese reader sees "5 packs per person" under 条件.
- `app/b/[slug]/admin/AdminView.tsx`: at 1440 px the page is a 672 px column (a laptop layout with the queue beside the public cards would use the space); "Hidden cards (0)" opens to nothing where "Waiting for a check" says "Nothing is waiting."; its buttons have no hover state; the long title "<board>: Board admin" pushes the controls onto a second row at 1440 px.
- `.claude/skills/acceptance-run/SKILL.md`: the curl line for `/api/process/<id>` still lacks the `{"device_id"}` body (noted by two earlier sessions).

**Needed a human**
- Review and merge the PR, then a look at the deployed board at 1440 px and on a phone.
- `docs/PLAN.md` has no line for this work; a line under 2026-11-05 (Thu) could read: "Laptop layout (three columns from 1024 px, two from 768) and polish pass (PR #N)".
- The ten new strings in Korean and Vietnamese are mine; add them to the native read.

## 2026-11-04 (Wed), loudspeaker broadcasts: heard input and official inbox

Model: `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (`day5-broadcast`), brief from the reviewing session. Pipeline models unchanged (extract, reconcile and translate on `claude-opus-5-5`).

Why: the 防災行政無線 loudspeakers broadcast in Japanese only, and outdoors they are often muffled. Foreign residents and hard of hearing Japanese residents miss them. Kawasaki publishes the text of each broadcast by email (メールニュースかわさき), in the かわさき防災アプリ and on a phone line; there is no feed or API. Two ways in, from both ends: a neighbour who heard the loudspeaker sends what they heard, and the city's own mail arrives through a forwarder and settles it.

**What was done**
- "I heard the loudspeaker", a fourth choice in the drop-in panel (`components/board/HeardInput.tsx`, wired in `DropIn.tsx`). The browser's speech recognition (`SpeechRecognition` or `webkitSpeechRecognition`, `continuous` and `interimResults` on, ja-JP by default, the five UI languages selectable) writes into an editable box: interim words muted under it, each final piece appended, restarted after a silence while the reader keeps listening. A 44 px start and stop button, a line that recognition can mishear names, numbers and times and that the text can be corrected before sending, a line that the browser's speech service does the transcription, and the same box without the mic button when recognition is missing. Availability is read through `useSyncExternalStore` after hydration, as ReadAloud does. Sending goes down the text path with `heard=1`, stored on the submission (`submissions.heard`, migration 0007).
- Extract channels (`lib/claude/extract.ts`, prompt rule 14, schema enum): the user turn says when the text was heard from the loudspeaker ("may contain recognition errors") or came through the official inbox. Rule 14: the opening formula (こちらは防災かわさきです) is not a fact, a misheard place resolves to a known place only when exactly one matches, otherwise `place_id` null with the heard spelling kept, nothing a typical broadcast would have said is filled in, a missing person broadcast is `sensitive_personal`. After validation `applyChannel` fixes in code what the model can only guess: a heard transcript is always `secondhand` on platform `loudspeaker`, an inbox mail always `official` on `city_mail`, and no other input can carry either platform.
- The pipeline moved from the process route into `lib/pipeline.ts` unchanged (same events, same order), so the inbox can run it synchronously. The process route refuses inbox submissions.
- `POST /api/b/[slug]/inbox` (docs/INBOX.md): JSON `{from, subject, text, received_at?}` with the board's bearer secret. 403 for a bad or missing secret, 413 over 20 KB, 400 for a malformed body, 403 `sender_not_allowed` (logged with the domain only), 429 over 60 accepted mails an hour, 503 over the daily cap. Code strips the signature and footer (`lib/inbox/clean.ts`), stores a text submission with `source_hint = 'official'` and device id `inbox`, runs extract, reconcile and translate, and answers with the card ids. `received_at` within the last 24 hours is extract's reference time.
- Admin section "Official inbox" (`components/admin/InboxAdmin.tsx`, `POST /api/b/[slug]/admin/inbox`): the address to post to, a secret generated and shown once (sha256 digest stored in `boards.inbox_secret_hash`, replacing takes a second tap), the allowed senders (`boards.inbox_senders`, lower case, at most ten), the last five accepted mails by time only.
- Merge, `lib/db/cards.ts`: when a stronger source raises a card's label, the card's platform moves with it, and a loudspeaker card takes the stronger source's title, body and place, so a recognition error does not outlive the city's text; translate then writes the other languages again.
- Source line: `sourceLabel` takes an optional platform. "Heard from the disaster radio" for a secondhand loudspeaker card, "From the city's broadcast mail" for an official inbox card, each with one line of explanation on the card page (`sourceExplanation`); share text, trace lines ("the disaster radio loudspeaker, as a neighbour heard it") and the printable notice use them too. 42 keys appended at the end of the five message files.
- `pnpm check:inbox` (`scripts/check-inbox.ts`): footer and signature stripping on the city's mail layout, sender parsing and normalization, the secret comparison, the channel rule. 23 of 23.
- docs/INBOX.md (request format, curl with placeholders, the Cloudflare Email Routing worker outline), docs/PRIVACY.md rows, lib/claude/README.md.

**Acceptance** on the throwaway board `broadcast-acceptance` (dev server on 3470, Playwright 1.62 Chromium at 390 px, deleted afterwards: 1 card, 2 card_sources, 61 submissions of which 59 were seeded rows for the rate limit, 1 device, 0 storage objects; live board untouched):

| step | what | result |
|---|---|---|
| 1 | open the panel | fourth choice "📢 I heard the loudspeaker"; headless Chromium has `webkitSpeechRecognition`, so the mic button shows (56 px); the misheard warning shows |
| 2 | a context without `SpeechRecognition` | typed fallback line, no mic button, same box |
| 3 | typed transcript こちらは防災かわさきです。小杉小学校で本日15時から給水を行います。容器をお持ちください。 | multipart with `kind=text` and `heard=1`, 201; `create` in 13.7 s to `done` (extract 4.6 s, reconcile 0.1 s with no candidates, translate 6.1 s); one card: water, `kosugi-es`, 15:00, `secondhand`, platform `loudspeaker`; the opening formula made no card |
| 4 | the card page | "Heard from the disaster radio · 1 source" with the explanation; body ends "Heard from the disaster radio loudspeaker (防災行政無線) and transcribed by speech recognition."; trace "Created from the disaster radio loudspeaker, as a neighbour heard it (heard from others)" |
| 5 | admin, Official inbox | no secret, generate: 43 character secret shown once; senders saved lower case; after a reload the secret is set and not shown; replacing asks for a second tap |
| 6 | refusals | wrong secret 403, no secret 403, sender off the list 403 `sender_not_allowed` (log: domain only), 24 KB body 413, not JSON 400 |
| 7 | the same fact as the city's mail (メールニュースかわさき layout with heading rule and footer) | 201 in 15.6 s, `merge` onto the heard card (reconcile 2.7 s, translate 5.9 s), still 1 card: `official`, platform `city_mail`, 2 sources, not confirmed; title and body now the city's wording ("From the city's broadcast mail (防災行政無線の放送内容)"), six languages present; card page "From the city's broadcast mail · 2 sources"; trace: created by the loudspeaker (heard from others), confirmed by the city's broadcast mail (official) with Claude's reason |
| 8 | 59 accepted mails seeded in the hour, then one more | 429 `rate_limited`; the admin lists the last five by time |

Playwright: 30 of 32 checks as run. The two misses were the test's: an exact text match on the card page's source label, which shares its line with the source count; the screenshots show both labels as in steps 4 and 7.

**Other measurements**
- `pnpm eval --no-write` after the prompt and schema change: 100/100 fields, 0 PII leaks, 0 invented facts, risk flags 15/15, six languages 15/15, extract median 8942 ms, translate median 9094 ms.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean; `pnpm guard --all` clean.

**Decisions taken in this session, open for review**
- Code, not the model, decides source type and platform for the two channels. Anyone can type into the heard box, so its facts are capped at `secondhand`; the inbox passed the secret and the sender list, so its facts are `official` (still unconfirmed). A text pasted the usual way that the model labels `loudspeaker` or `city_mail` becomes `other`.
- Reconcile chose `merge`, not `update`, for the same fact from the city: same place, same time. The merge path now carries the stronger source's platform and, for a loudspeaker card only, its wording. Other merges keep their wording as before.
- The admin section is mounted from `app/b/[slug]/admin/page.tsx`, after `AdminView`, so `AdminView.tsx` is unchanged (zero lines instead of the one line the brief allowed).
- `sourceLabel` gained an optional platform argument. The call sites in `CardItem.tsx`, `CardSheet.tsx`, `HiddenDrawer.tsx` and `AdminView.tsx` belong to the other session and were left as they are, so the board list and the sheet still say "Heard from others" or "Official notice (unconfirmed)" for these cards until each passes `card.facts.platform` as a fourth argument (one token per call). The card page, share text, notice and trace already use it.
- The printable notice names the card's own platform first (`card.facts.platform`), then the first source's: after an update or a raising merge it is where the current wording comes from.
- The rate limit counts accepted mails (submissions with `source_hint`), not refused requests. A mail that fails processing is not retried by the board; posting it again makes a new submission.
- Footer rule: cut at a `-- ` line, at the first 配信停止, 登録解除, 送信専用 or unsubscribe line after the broadcast, or at the last rule line when only links, addresses and the publisher follow it; other rule lines are dropped as decoration. Written against a layout modelled on the city's mail, not a real one: check it against the first real mail.
- Chrome sends the audio to Google's speech service, Safari to Apple's (or on the device). The panel says so in one line; docs/PRIVACY.md has the rows.

**Files of the other session.** None edited. The `sourceLabel` call sites above are the one place where this feature needs a token in their files. `PendingCard` needs nothing: the heard input goes through the same stages.

**Needed a human**
- Migration 0007 was applied to the shared project by this session after the human allowed it (the first attempt was blocked by the permission check). The deployed code does not read the new columns, so applying it before the merge is harmless.
- The Cloudflare wiring (docs/INBOX.md): an Email Routing address, the Email Worker with `postal-mime`, the secret from the board's admin page as a Worker secret, the inbox URL, a verified `COPY_TO` address while the subscription is confirmed.
- The メールニュースかわさき subscription with 防災行政無線 ticked, sent to that address; then read the real From address off the first mail and enter it in the admin list.
- A real phone test of the recognition (iPhone Safari, Android Chrome) next to a broadcast or a recording of one; headless Chromium cannot run it.
- Native read of the Korean and Vietnamese `heard.*`, `inbox.*` and `source.*` strings.
- `docs/PLAN.md` has no line for this work; the reviewing session decides where to record it.

### 2026-11-04 evening, the inbox wired for real (human with Fable)

The forwarder from `docs/INBOX.md` is live. `engawaboard.com` was bought on Cloudflare Registrar and is the production host (www redirects to it, the vercel.app host still answers). Email Routing on that domain sends `bousai-musashikosugi@engawaboard.com` to the Worker `engawa-inbox` (its project lives outside the repository, the secret set from a local file, never typed in chat). The chain was checked in order: a Gmail test reached the worker and the board answered 403 `sender_not_allowed`, with the stored secret accepted (a wrong one gives `forbidden`). The city's list registers by empty mail, which a receive-only address cannot send, so a Gmail sits in front: forwarding address confirmed through the worker log, a filter on `sg-p.jp`, the empty mail, then the registration form filled in the browser with 緊急情報 and 防災行政無線 only. The city's reply came through that path (`From: kawasaki@sg-p.jp` preserved), so the sender list now holds that address. Human steps: the domain purchase, Vercel domain and env, the DNS records (the wrangler OAuth token cannot write DNS), the Gmail clicks. Everything else ran from the session through the Cloudflare API and the board's admin API.

## 2026-11-04 (Wed), open in maps, place view, one ask panel, shared links in the reader's language

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day5-places`) beside the `day5-home` session, whose files (home page, brand assets, `app/layout.tsx`, `components/TopBar.tsx`, `lib/db/boards.ts`, the inbox admin, the react route) were left alone.

**Done**
- **N17 Open in maps.** `lib/cards/maps.ts` builds a Google Maps search URL (`https://www.google.com/maps/search/?api=1&query=`, the query through `encodeURIComponent`): for a known place its Japanese name, then its address with the board's city and ward in front ("川崎市立小杉小学校 川崎市中原区小杉町2-295-1"), or the name and the city when the place has no address (stations); for a card with only `place_text_ja`, that text and the board's area. The city comes from the board: `boardMunicipality` in `lib/geo` reads the first five digits of the board's area codes, the JIS code of the city and ward (14133 is 川崎市中原区). `components/board/MapsLink.tsx` renders it under the place in `CardDetail` (sheet and laptop panel) and on the card page, which has its own place row and does not use `CardDetail`. A plain link with `target="_blank"` and `rel="noopener noreferrer"`, 44 px tall, the global focus outline, a screen reader note that it opens a new tab. Nothing is fetched before the tap, no key, no coordinate. Not in the list rows.
- **N10 Place view.** A List / Places toggle beside the Notices heading (two `aria-pressed` buttons in a labelled group). Places (`components/board/PlacesView.tsx`, grouping in `lib/cards/places.ts`) groups the cards already loaded, so the 5 second poll keeps it current and it costs no request: one group per known place with cards, newest content first, each with the name in the reader's language and the Japanese name beside it (`lang="ja"`), the kind (shelter, water point, station, park, else "Place"), the address (`lang="ja"`), the count and the newest time; shelters add one line, the newest card of category shelter (status, title, age, outdated mark) or "No information yet". Cards whose place is not a known place go in a last group "Other places", sorted by place text so one spot sits together, cards without a place at the end. A group is a disclosure (`h3` with a button, `aria-expanded`); open, it lists the usual `CardItem` rows (their titles as `h4` there), so a card opens in the sheet on a phone and in the panel with `#card-<id>` on a laptop. Arrow keys, Home and End move through group headings and the cards of open groups; Right opens a group, Left closes it. A card opened from the hash or from a citation opens its group and scrolls to it. Pending drop-ins show above the groups.
- **The view in the URL.** `?view=places` (the list is the plain URL). The board page reads it on the server, so a shared link renders Places with no flash of the list. After hydration the URL wins, else the reader's last choice from localStorage (`engawa.view`, as the language), and the address bar is updated to match. The offline worker answers a board navigation that misses the cache with the stored copy under any query (`ignoreSearch`), so an offline reload of `?view=places` works from the plain URL's copy; the client then reads the view from the URL. `VERSION` was not bumped: what is stored did not change, and a bump would delete readers' saved copies.
- **One ask panel.** The board mounted `AskPanel` in three places and hid two with CSS. Now only the placement for the current width is mounted (`useMediaQuery`): above the list on a phone, under the open card from 768 px, its own column from 1024 px. The thread already lived in `useAsk` above the panel, so a resize across a breakpoint keeps it.
- `pnpm check:places` (`scripts/check-places.ts`): 24 checks on the seed board without a database (the city from the area codes, the query and its encoding for a known place, a place without an address, a place text, a stale place id, no place, characters such as `&`, `#` and `?`; the groups, their order, the shelter line, the other group's sort; the view parameter).
- 16 keys inserted at the TOP of the five message files (`maps.*`, `view.*`, `places.*`).

**Acceptance** on the throwaway board `places-acceptance` (copy of `musashikosugi`, dev server on 3490, Playwright 1.62 Chromium through the real drop-in panel at 390 px; deleted afterwards: 2 storage objects, 3 card_sources, 3 cards, 3 submissions, 3 devices; live board untouched):

| # | input | reconcile | first card / all languages | card |
|---|---|---|---|---|
| 1 | `public/samples/notice.jpg` (taken for the 小杉小学校 notice; it is the building water outage notice) | create, no candidates | 13.8 s / 23.3 s (translate 8.6 s) | daily notice, `place_text_ja` 当マンション（全住戸）, no place id |
| 2 | `fixtures/inputs/p02-water-distribution-notice.jpg` (water at 小杉小学校) | create, no candidates | 14.4 s / 24.5 s (translate 8.5 s) | water, `kosugi-es`, official, open |
| 3 | text 武蔵小杉駅前のコンビニ、営業中、水あり | create, no candidates | 7.4 s / 11.8 s (translate 4.6 s) | shops, `musashikosugi-sta`, firsthand, open |

| check | result |
|---|---|
| maps link of the 小杉小学校 card | `https://www.google.com/maps/search/?api=1&query=%E5%B7%9D...2-295-1`, decodes to 川崎市立小杉小学校 川崎市中原区小杉町2-295-1; `target=_blank`, `rel="noopener noreferrer"`, 44 px, solid 3 px outline on keyboard focus; in the sheet (390), the panel (1280) and on the card page (ja: 地図で開く) |
| station card | 武蔵小杉駅 川崎市中原区 |
| card with only `place_text_ja` | 当マンション（全住戸） 川崎市中原区 |
| Places at 390 | groups in order station, 小杉小学校, other places; 小杉小学校: "Kosugi Elementary School (川崎市立小杉小学校)", "Shelter · 小杉町2-295-1", "1 notice", "Latest: 4 min ago", "Shelter status: No information yet" (only a water card there); station: "Station", "1 notice", no shelter line; all closed at first; a group opens to its card, the card opens the sheet |
| Places in Japanese | 川崎市立小杉小学校 alone, 避難所, お知らせ 1件, 避難所の状況: まだ情報がありません |
| `?view=places` | written on toggle, stored in localStorage, survives a reload; a fresh browser opening the link gets Places; the server HTML already holds the groups; the plain board URL takes the remembered view and rewrites the URL; List removes the parameter |
| one ask panel | 1 in the DOM at 390 (also with the sheet open), 1 at 1280 (in the third column), 1 at 800 (under the open card), 1 in the server HTML |
| thread across a resize | one question at 1280 ("Where can I get water?", answered), then 390: the same single turn in the phone placement; then 800: still there |
| keyboard at 1280 | ArrowDown to the next group, ArrowRight opens it, ArrowDown into its card, Enter opens the panel with `?view=places#card-<id>` and `aria-current` on the row, Escape closes it and focus returns to the row, Home to the first group |
| shared `#card-<id>` in Places | the station group opens by itself and the panel shows the card |
| 5 second poll | a reader page in Places at 1280 while another device dropped input 3: the new station group appeared 2.9 s after the card reached the cards API, no reload |

Playwright: 47 checks, all passing in the end. Misses on the way were the test's: a programmatic focus after a mouse click does not match `:focus-visible` (redone with Tab), the raw fetch of the page had no `Accept-Language` and got the Japanese heading, and the Japanese group text starts with its icon. One real miss: the card page had no maps link, because it does not render `CardDetail`; fixed with the shared `MapsLink`. Claude calls in the run: 3 drop-ins, 1 question.

**Other measurements**
- `pnpm typecheck`, `pnpm lint` (the one existing warning, a missing `cardButton` dependency in `closePanel`, fixed), `pnpm guard --all`, `pnpm check:places` 28 of 28 (24 for places and maps, 4 for the `?lang=` helpers), `pnpm build` clean.

**Decisions taken in this session, open for review**
- The city. The board row has no city, and neither `area_names` (町丁目 names) nor `address_ja` (小杉町2-295-1) holds one, so the brief's "川崎市 comes from the board" is read as: from the board's area codes, through a one-line table in `lib/geo` (14133 川崎市中原区). The Shibuya board (N18) adds 13113 東京都渋谷区. Without a known city the board's Japanese name (武蔵小杉) narrows the search instead.
- "No information yet": no short key existed (`ask.no_info` is a whole sentence about the board), so `places.no_info` was added.
- Only places with cards get a group. In disaster mode, listing every shelter with "No information yet" would show at a glance which ones nobody has reported on; cheap to add, left out to keep peacetime boards short.
- A place text that only makes sense to its author makes a vague search: 当マンション（全住戸） (this building) searches the whole ward. Kept as specified; a follow-up could leave the link out for relative place texts (当, この, 本) or let extract mark them.
- One ask panel: the server and the hydration render take the phone placement (hidden by CSS from 768 px), so on a tablet or laptop the ask panel appears once the page is hydrated, not with the first HTML. Crossing a breakpoint remounts the panel: the thread and the typed question stay, the focus inside the question box does not.
- Group order is by newest content, not by kind; the other group always comes last.
- `public/samples/notice.jpg` (the N1 sample) is the building water outage notice, not the 小杉小学校 water notice the brief named; the run used `p02` for that, so it made three drop-ins instead of two.

**Item 4, shared links in the reader's language** (asked by the reviewing session after a card shared from the Chinese UI into WeChat previewed in English on the live board: the crawlers of WeChat and LINE send neither the language cookie nor Accept-Language)
- Copied and shared links end in `?lang=<reader's language>`: the card's "Copy link", "Copy text" and system share (`CardShare`), and the top bar's copy link and system share (`ShareButton`). The on-screen QR code keeps the plain URL, as do the printed poster and notice QR codes (both link to the board, not a card): whoever scans them stands next to the sharer with a phone in their own language.
- `proxy.ts` (Next 16's name for middleware; none existed) runs only on page requests that carry `lang` (a `has` query matcher, `api/` and `_next/` excluded) and passes a valid value on as the request header `x-engawa-link-lang`. `getRequestLang` reads it before the cookie and Accept-Language, so the layout's `<html lang>`, the provider's first language and every `generateMetadata` follow the link without touching `app/layout.tsx`. `getLinkLang` keeps the parameter on og:url for crawlers that follow it. `LANGS`, `isLang` and the helpers moved to `lib/i18n/langs.ts`, which imports no message file, so the proxy stays small; `lib/i18n/index.ts` re-exports them.
- `LangProvider` adopts a valid `?lang=` on first load as if the reader had picked it (state, localStorage, cookie), ahead of the stored preference, and removes the parameter from the address bar with `replaceState`, so a reload or a later switch is not overruled by the link. An invalid value is removed and ignored.
- Caching: the pages answer `Cache-Control: no-store` before and after; the language now also depends on the URL, which is its own cache key, and the offline worker stores pages by full URL.
- The OG image route was left as it is (the other session's file).

Acceptance on the throwaway board `lang-acceptance` (one text drop-in through the two routes, water at `kosugi-es`, 17 s to done; deleted afterwards: 1 card, 1 card_sources, 1 submission, 1 device, 0 storage objects; live board untouched):

| check | result |
|---|---|
| copy the card link from the zh UI (sheet) | `.../b/lang-acceptance/c/<id>?lang=zh`; "Copy text" ends with the same link; the top bar copy gives `.../b/lang-acceptance?lang=zh`; the on-screen QR encodes `.../b/lang-acceptance` |
| that link with curl, no cookie, no Accept-Language | `<html lang="zh">`, `<title>` 小杉小学（小杉小学校）体育馆前供水，今天18:00开始 \| 武藏小杉 ..., `og:description` 今天18:00起，在小杉小学（小杉小学校）体育馆前供水..., `og:locale` zh_CN, `og:url` ends `?lang=zh` |
| the same link without the parameter | no headers: Japanese (ja_JP); Accept-Language en: English (en_GB); cookie ko: Korean; og:url without the parameter |
| `?lang=vi` with cookie ko and Accept-Language en | Vietnamese: the link wins |
| `?lang=fr` with Accept-Language en | English: an unknown value is ignored |
| board `?lang=zh`, board `?view=places&lang=ko` | Chinese, Korean; og:url keeps `?lang=` |
| recipient in an English browser (cookie and localStorage en) opening the zh link | first HTML already Chinese; still Chinese after hydration; `?lang=` gone from the address bar; zh stored in localStorage and the cookie; a reload stays Chinese; switching to Korean then reloading stays Korean |
| cache headers | `Cache-Control: no-store`, before and after |

Playwright 10 of 10 after one fix to the test (the QR check first read the page text, which still held the share panel's `?lang=` link behind the QR screen; it now reads the QR's own label). One known limit: a client can send `x-engawa-link-lang` itself on a request without `?lang=` (the proxy does not run there to strip it); all it can do is pick one of the five languages for its own response. The acceptance skill's curl example for `/api/process/<id>` lacks the JSON body `{"device_id": ...}` the route requires (400 `bad_request` without it). Claude calls: 1 drop-in.

**Needed a human**
- Nothing during the session. Native read of the Korean and Vietnamese `maps.*`, `view.*` and `places.*` strings. `docs/PLAN.md` lines N17 and N10 are for the reviewing session to tick.

**Review fixes for PR #23 (Fable, reviewing session):** the maps query leaves an address alone when it already names a city, ward or prefecture (no doubled 川崎市); a place text that only makes sense from where the writer stood (当マンション, この建物, 本施設) gets no maps link; a Places group is ordered by its newest card still in force, so an expired notice cannot lift a stale shelter to the top; Vietnamese view label is "Chế độ xem". The read-only review found no privacy or correctness blockers; left as follow-ups: mirroring the view preference in a cookie to avoid the post-hydration flash, and running the proxy on every page request instead of only when `?lang=` is present.

## 2026-11-04 (Wed), home page, brand mark and icons, listed boards, inbox and reaction fixes

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day5-home`) beside the `day5-places` session, whose files (`components/board/**`, `lib/cards/**`) were left alone. Brief from the reviewing session (N19 home page, N20 logo and icons, four small fixes). No pipeline or prompt change.

**N20 brand mark.** Sketched as inline SVG on a 32 unit grid in a scratch page (outside the repository) and judged at 16, 20, 32 and 64 px, in a mock browser tab, in green on the paper background and in the paper colour on a dark one, and on the accent tile. The criteria from the brief: readable at 16 px, one colour on light and on dark, no text inside the mark, no generic AI gradient blob, at home on the warm paper (`--background` #fbfaf7) with the accent (`--accent` #1f5c3f).

A first round was thrown away before the three finalists: a side section of the veranda (eave, post, floor, stepping stone) read as the letter F or E at 16 px, a roof over a rounded card read as the archive box icon of mail apps, and a roof over a stepping stone read as the kanji 亠.

| sketch | idea | path (viewBox 0 0 32 32, even-odd) | verdict |
|---|---|---|---|
| eave and plank | the veranda as a bench under a roof, seen from the garden | `M8 4h16l6 6H2z M4 19h24v4H4z M6 23h3v5H6z M23 23h3v5h-3z` | rejected: at 16 px a table under a roof, and close enough to a torii, the map symbol for a shrine, to send a reader the wrong way |
| two under the eave | two neighbours sitting on the plank under the roof | `M8 3h16l6 6H2z M2 21h28v4H2z M8 15.5a3.5 3.5 0 0 1 7 0V21H8z M17 15.5a3.5 3.5 0 0 1 7 0V21h-7z` | rejected: the figures merge into two columns at 16 px and the whole reads as a bank or temple front |
| **roofed speech bubble** (chosen) | the eave of the veranda over a speech bubble that holds two lines of a notice: where neighbours talk, and the notice they talk about | `M8 2h16l6 6H2z M7 10h18a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H14l-6 6v-6H7a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z M8 14v2h16v-2z M8 18v2h10v-2z` | chosen: the only silhouette that stays distinct at 16 px (a wide eave over a rounded block with a tail), reads as neither a letter nor a stock icon, and says both halves of the product |

Every edge of the chosen mark sits on an even unit, so at 16 px it lands on whole pixels; the eave overhangs the bubble by one pixel on each side, like a real eave; the two lines are holes, so the mark stays one colour.

*Follow-up, same night:* the roofed bubble was replaced by candidate 04, Tatami edges (四畳半の畳縁), which the user chose from `docs/brand/candidates.html`: a four-and-a-half mat room drawn by its mats, the gaps between them being the mat edges. 04 says the name twice, since 畳縁 and 縁側 share the 縁 (the edge, and the bond between people), and a 四畳半 is the smallest room where people sit down together; it has no curve and lands on whole pixels at 16 px, where the bubble's tail and lines were the first parts to blur. The mark now lives in `components/brand/Mark.tsx` as two variants (`solid` and `edges`) behind one switch, `MARK_VARIANT`; `app/icon.svg` and `app/favicon.ico` are written from it by `pnpm brand:icons`. Details in the entry "mark 04 Tatami edges" at the end of this file.

**Done**
- Brand files: `app/icon.svg` (the mark alone, green, the paper colour under `prefers-color-scheme: dark`), `app/icon.tsx` (32 px PNG, the mark on a rounded accent tile), `app/apple-icon.tsx` (180 px, square, iOS rounds it), `app/icons/[size]/route.tsx` (one handler, 192 and 512 built at build time with `generateStaticParams`, anything else 404), `app/manifest.ts` (`name` Engawa, `short_name` 縁側 Engawa, standalone, start_url `/`, theme the accent, background the paper, 192 and 512 any plus 512 maskable: the mark sits inside the maskable circle), all PNGs from one `iconResponse` in `components/brand/icon-image.tsx`. `app/favicon.ico` from the create-next-app scaffold replaced by an ICO that wraps the 32 px PNG, so a client that asks for `/favicon.ico` gets the mark too. The five template files in `public/` deleted (nothing referenced them).
- `app/layout.tsx`: `generateMetadata` with `metadataBase` from `appBase()` (the root preview image gets an absolute URL on every host), `icons` listed explicitly (SVG first, then the PNG, then the apple icon), `appleWebApp` (title 縁側 Engawa, capable), `viewport.themeColor` the accent, and the one-line description.
- Top bar: the mark (1.25rem, the size of the 縁 glyph it replaces, in the accent) before the wordmark; the link and its 44 px target unchanged. A `home` width so the bar lines up with the home page's 1024 px column; the other pages keep theirs.
- Link previews: `app/opengraph-image.tsx` (mark, 縁側 Engawa, the description in Japanese and English, the six language chips); the board's preview keeps its layout with the mark in place of the 縁 glyph on its tile.
- N19 home page (`app/page.tsx`, `components/home/HomeView.tsx`, `components/home/BoardSummary.tsx`): the mark, 縁側 Engawa, one sentence on what it is, one line for whom; the boards as cards with the name in the reader's language and the Japanese name, the card count, the newest card's age (`timeAgo`, the board's own helper, with the server's `now` so both renders agree), the area folded from 町丁目 to towns (小杉町、小杉陣屋町、小杉御殿町 and 12 more), the six languages each in its own script, and one "Open the board" link; three steps in the board's own words (drop in; organized and checked, with the stage words "checks it against other cards" and "translates"; read and ask); a line on trying a sample whose button and heading names are the drop-in panel's own strings (`dropin.button`, `sample.heading`) passed in, so they never drift; a footer with About Engawa, Privacy and retention (`/about#about-data`), Built with Claude Code, and the existing "An entry for Built with Claude: Japan 2026". Client component like the about page, so the language switch applies at once. Japanese inside other languages carries `lang="ja"`. Title 縁側 Engawa with the description and Open Graph tags in the reader's language.
- `listBoardsWithStats` in `lib/db/boards.ts`: one round trip for every board, the count and the newest public card as two filtered embeds of `cards` (an aggregate and a one-row ordered embed). Only `listed` boards; when the column is unknown (Postgres 42703 naming `listed`) the same query runs without the filter and a warning is logged, so the page never breaks before 0008.
- Migration `0008_boards_listed.sql`: `boards.listed boolean not null default true`. `scripts/throwaway-board.ts` creates with `listed = false`, and when the column is missing creates the board anyway and prints that it is listed until 0008 is applied. Boards stay reachable by URL either way: only the index reads the column.
- `POST /api/b/[slug]/inbox`: an unknown slug answers 403 `forbidden`, the same body as a wrong or missing secret, so the route no longer tells which boards exist.
- `InboxAdmin.tsx`: more than ten distinct addresses show "At most 10 addresses can be saved. You entered 11: remove 1 and save again." (an alert, five languages) and nothing is sent. Before, the eleventh address came back from the server as "These are not email addresses: ...", which was wrong, and more than fifty lines as the generic error.
- `POST|DELETE /api/cards/[id]/react`: 60 taps per client address per hour on top of the per-device limits, checked before any database read, answered 429 `{"error":"rate_limited","scope":"ip","limit_per_hour":60}` with Retry-After 3600; the device limit now says `scope: "device"`. The card's existing 429 message covers both.
- 22 keys appended at the end of the five message files (`home.*`, `inbox.senders_too_many`).

**Acceptance** (dev server on port 3497 against the shared Supabase project; built-in browser for the home page, headless Chrome over the DevTools protocol for the manifest, the tab icon and the admin page; throwaway board `home-acceptance`, deleted afterwards; the live board was only read)

| check | result |
|---|---|
| home page, 390 px, en, ja, vi | one column: mark, 縁側 Engawa, sentence, for whom; Musashi-Kosugi 武蔵小杉 card with "4 cards on the board", "Newest card: 2 d ago" (the pilot board's real numbers), area, six language tags, Open the board; steps; sample line; footer. No text under 16 px, no control under 44 by 44 px, no sideways scroll, in all three |
| home page, 1280 px, en, ja, vi | intro left and boards right in a 1024 px column, the top bar aligned with it (both start at 128 px), steps in three columns; same measurements, all clean |
| language switch on the page | ko chosen in the top bar: headings, count (카드 4개), newest (최신 카드: 2일 전), area (외 12곳) and the sample line change without a reload |
| favicon | Chrome's tab icon is `/icon.svg` on `/` and on `/b/musashikosugi` |
| manifest | Chrome `Page.getAppManifest`: no errors; `Page.getInstallabilityErrors`: none |
| icons | `/icons/192` 192x192, `/icons/512` 512x512, `/apple-icon` 180x180, `/icon` 32x32 PNG; `/icon.svg` SVG; `/favicon.ico` 32x32; `/icons/64` 404 |
| preview images | `/opengraph-image` and `/b/musashikosugi/opengraph-image` render (1200x630 PNG), the board's with the mark on its tile |
| throwaway board, 0008 not applied | migration 0008 is not applied to the shared database (the human's step), so the fallback was proven: the script created the board and printed that it is listed until 0008; the home page logged the missing column and listed both boards; `/b/home-acceptance` answered 200. The unlisted path waits for 0008 (see below) |
| inbox, unknown slug | `{"error":"forbidden"}` 403, the same as a wrong secret on an existing board and as no secret |
| eleven senders | en: "At most 10 addresses can be saved. You entered 11: remove 1 and save again." as an alert, nothing saved; ja: 「保存できるアドレスは10件までです。11件入力されています。1件消してから、もう一度保存してください。」; ten addresses save and are there after a reload |
| reactions | one text drop-in (fixture t02: create in 21 s, extract 10.1 s, reconcile 0.3 s, translate 8.4 s) for a public card; 61 taps from one address with 61 fresh device ids: 60 answered 200, the 61st 429 with scope ip and Retry-After 3600; a tap from another address still 200 |
| cleanup | `board:throwaway delete`: 1 card, 1 card_sources, 1 submission, 1 device, 0 storage objects; the 61 reactions went with the card (0 left); only `musashikosugi` remains |

Claude calls spent: one drop-in (extract, reconcile, translate). `pnpm typecheck`, `pnpm lint` (one existing warning in `BoardView.tsx`, not this branch), `pnpm guard --all` and `pnpm build` clean.

Seen during the run: the `day5-places` session's throwaway board `places-acceptance` appeared on this branch's home page while it existed (the fallback listing every board), which is the leak 0008 closes; that session deleted it itself. In the built-in browser pane the offline worker's registration fails with "An unknown error occurred when fetching the script" on every page, `/about` included, so it is not from this branch; headless Chrome was used for the checks that need a clean browser.

**Decisions taken in this session, open for review**
- Icons are listed in `metadata.icons` because Next drops the file-based icon tags as soon as the layout sets `icons` (`resolve-metadata.js`): the explicit list keeps the order (SVG, PNG, apple). The files still serve the routes.
- `short_name` is 縁側 Engawa, as the brief and `appleWebApp.title` have it; `name` is Engawa. Theme colour is the accent, in the manifest and in `viewport`, so a standalone window and Android's address bar are green.
- The per-address reaction limit is a sliding window in memory on each server instance, the pattern of the ask limit and of the existing per-device tap limit. There is no table that counts by address, and adding one would store a new kind of identifier about readers (even hashed), against the privacy rules; the durable limit stays the per-device row count. The window holds an address only while it has taps in the last hour and never logs it. On Vercel `x-forwarded-for` is set by the platform, so a client cannot choose its own key.
- The privacy link goes to the about page's data section (`/about#about-data`): there is no `/privacy` route, and `docs/PRIVACY.md` lives in the repository, which is private until submission. Built with Claude Code links to claude.com/claude-code.
- The sample line invites a reader to try a sample on the board, as N1 intended for judges on the deployed URL; on the live board that adds a fictional card each time.
- `index.pick` is no longer read (the heading reuses `index.title`); the key stays so the message files are not edited in the middle.

**Files of the other session.** None edited.

**Needed a human**
- Apply migration 0008 (`pnpm db:migrate` from the main checkout) before the merge. Additive and harmless to the deployed code. Afterwards `pnpm board:throwaway create <slug>` prints `unlisted` and the home page leaves that board out, which is the half of the acceptance this session could not run.
- Review and merge the PR. `docs/PLAN.md` has no line for N19 and N20; the reviewing session decides where to record them.
- Native read of the Korean and Vietnamese `home.*` and `inbox.senders_too_many` strings.
- A look at the home page and the home screen icon on a real phone after the deploy.

### 2026-11-04 evening, home page map of Japan and the language switch (same session, same PR)

Two additions the user asked for through the reviewing session after the PR was opened.

**Map of Japan.** The home page's main visual is now all 47 prefectures as inline SVG paths (`components/home/JapanMap.tsx`), land in a quiet neutral (`--map-land` #e2ded5, borders in the page colour), the prefectures with a listed board in the accent with the board count on a badge. On a phone the map sits between the intro and the board list at full width; from 1024 px it sits beside the intro (416 by 468 px at 1280) and the board cards follow below in two columns. No external fetch, no tiles.
- Source and licence: the brief suggested geolonia's japanese-prefectures or `@svg-maps/japan` as MIT. Neither is: geolonia's README says GFDL (the map is derived from the Wikipedia map of Japan), and `@svg-maps/japan` is CC BY 4.0 from 1.0.1 on (Victor Cazanave, itself based on the MapSVG map of Japan, also CC BY 4.0). CC BY 4.0 only asks for attribution with a link to the licence and a note of changes, so `@svg-maps/japan` 2.0.0 was used: the credit and the licence link are under the map in five languages, and the generated file says the same.
- `scripts/japan-map.ts` reads the package as data (never imported or run) and writes `components/home/japan-map-paths.ts`: outlines simplified (Ramer-Douglas-Peucker at 0.45 units), islands under 2 square units dropped, coordinates rounded to one decimal, a label point inside each prefecture's largest island. Okinawa is moved into a framed inset in the empty sea at the top left and enlarged 1.5 times, as Japanese maps usually do; the script refuses to write when any other land crosses the inset frame (1.6 times reached Hokkaido). The view box is cropped to the land (347 by 390 instead of 438 by 516), so the map is a quarter larger at the same width. 64 KB of source paths became 21 KB.
- `components/home/prefectures.ts`: the 47 prefectures with their JIS code and names in the five languages, kept out of the message files as reference data.
- Which prefecture a board is in: the first two digits of its 町丁目 codes, taken through `boardAreas` (`lib/geo`) on the server. The live pilot row still has `code: null` on every area (the seed with codes was never re-run on it), and `boardAreas` fills the codes from the bundled e-Stat polygons by name, so the board lands on 神奈川県. A board without codes stays in the list and off the map.
- Interaction: a prefecture with a board is a `role="button"` group with `aria-label` "神奈川県: 掲示板 1 件" (in the reader's language), Tab stop, Enter and Space, pointer. It moves focus to the first board card of that prefecture and scrolls it into view (smooth unless reduced motion; focus first, because a `focus()` after a smooth `scrollIntoView` cancels the scroll in Chrome); the card shows a 3 px accent outline. Prefectures without a board are plain paths with their name in a `<title>`. The badge digits are 16.5 px and the invisible hit circle 45 px across at a 390 px phone, larger on wider maps; keyboard focus draws a round accent ring around the badge (the site-wide square outline is turned off for the map button only, in `globals.css`). Nothing depends on hover. Badges that would overlap (Tokyo next to Kanagawa, once N18 lands) are moved apart to the east.

**Language switch** (`components/LanguageSwitch.tsx`): `appearance-none`, a 16 px chevron 12 px from the right edge, 40 px right padding so the text never runs under it, same 44 px height and focus ring.

**Checks**

| check | result |
|---|---|
| map at 390 px, en, ja, vi | between intro and boards; 47 outlines, one button (神奈川県 / Kanagawa: 1 board / Kanagawa: 1 bảng tin), 46 inert outlines with titles; no text under 16 px, no target under 44 px (the map button measured by its hit circle, 45 by 45), no sideways scroll |
| map at 1280 px, en, ja | beside the intro (intro at x 152, map at x 712); same measurements |
| tap on the badge | focus on the Musashi-Kosugi card, scrolled to 96 px from the top (under the top bar), 3 px outline |
| keyboard | Tab reaches the map button after the three top bar controls; round focus ring, no square outline; Enter and Space both move focus to the card |
| language switch, Chrome at 390 px | select 128 by 44, chevron 16 px wide and 12 px from the right edge |
| language switch and map, Safari | macOS Safari 18.6 (WebKit), the page framed at 390 px (media queries follow the frame): the chevron sits inside the select near the edge, the same height as the text size button, text clear of it; the map, the inset and the board card render as in Chrome. Real iPhone Safari not checked (no simulator on this Mac) |

`pnpm typecheck`, `pnpm lint` (the same existing warning in `BoardView.tsx`), `pnpm guard --all`, `pnpm build` clean. No Claude calls. Seven more keys appended at the end of the five message files (`home.map_*`).

Seen while building: the dev server's file watcher missed one edit to `app/globals.css` (written by a script) and kept serving the old CSS until it was restarted; `touch` did not help.

**Needed a human**
- The licence differs from the brief (CC BY 4.0, not MIT); the credit under the map is how it is met. If a credit on the home page is not wanted, the alternative is drawing our own outlines.
- Native read of the Korean and Vietnamese prefecture names and `home.map_*` strings.
- A look on a real iPhone: the select's chevron and the map's tap target.

### 2026-11-04 night, the accent turns from green to deep rose (same session, same PR)

The user chose a deep rose over the green before the mark is final. The accent is a token, so one change in `app/globals.css` reaches every button, link, ring and badge; the brand files that carry a hex value (`components/brand/Mark.tsx` `BRAND.accent`, `app/icon.svg`, the board preview image, which now reads `BRAND.accent`) changed with it, and `app/favicon.ico` was rebuilt from the new 32 px PNG. The icons, the manifest theme colour, `viewport.themeColor` and the root preview image follow `BRAND`.

| token | value | pair | contrast |
|---|---|---|---|
| `--accent` | #ad235d | white text on it | 6.61:1 |
| | | it on the page (#fbfaf7), as 16 px text and as a focus ring | 6.34:1 |
| | | it on white (#ffffff) | 6.61:1 |
| | | it on `--accent-soft` | 5.67:1 |
| | | it on the held grey (#f3efe6) | 5.76:1 |
| | | it on the map's land (#e2ded5) | 4.93:1 |
| `--accent-hover` | #861846 | white text on it | 9.41:1 |
| `--accent-soft` | #fbe9f0 | ink (#1b1b1b) on it | 14.78:1 |
| | | muted (#5c5c5c) on it | 5.74:1 |
| | | control borders (#87837a) on it | 3.24:1 |
| | | warn ink (#5a3d00) on it | 8.57:1 |

Candidates across the requested range, white on them and them on the page: #b42a63 6.08 and 5.83, #b02660 6.38 and 6.11, #ad235d 6.61 and 6.34, #a8205a 6.96 and 6.66. #ad235d keeps the rose hue clearly pink rather than wine and clears every pair with room, including accent text on the soft tint.

Where the soft tint went: the top bar band on every page (it was white at 95 %, there was no mint band in the code), and the pressed reaction chips ("Still true", "No longer true"), which were a full accent fill and are now the tint with an accent border and accent text. The text size toggle, which lives inside the band, shows its pressed state as an accent border and accent text on white, because the tint on the tint band disappeared. The active List / Places toggle is in PR #23 (`day5-places`), not on this branch; there it is `bg-accent text-accent-ink` and after this merge it would be a full rose fill. For the soft look it needs one class change at the merge: `pressed ? "bg-accent-soft text-accent border-accent"`.

Unchanged on purpose: the paper background, the amber `--warn-*` (disaster mode badge, may be outdated, warnings), the held grey, and the pink masking boxes in chat screenshots (`lib/image/mask.ts`). There is no red in the interface today (danger cards carry the ⚠️ icon and disaster mode is amber), so there was nothing to move to the orange-red the brief named; a future danger colour should be about #c2410c (4.96:1 on the page, white on it 5.18:1), well apart from the rose.

**Looked at, 390 px:** home (band, mark, map badge), board (band, share and text size on it, ask chips, the disabled Ask button which is dimmed as before, "Confirmed official" in rose, the floating drop-in button), the card sheet (sources, reactions with the pressed tint applied in the page only, nothing written, share, trace), the about page and the admin page (pilot board, opened read only in headless Chrome through the entry link, no click). A sweep of every visible text node against its background found nothing under 4.5:1 and nothing under 16 px on the about and admin pages; the home measurements above still hold. The rebuilt icons, the favicon and both preview images were checked as images.

Seen during the run: the dev server again missed an edit and served the old class for the text size toggle until a restart, which showed as a hydration warning; after the restart the server HTML and the client script carry the same class. A board `mode-acceptance` from another session existed on the shared database at the time and showed on the home page through the 0008 fallback; it is not this session's and was left alone.

**Review fixes for PR #24 (Fable, reviewing session, on the integration branch):** the map label and hint no longer name a colour in any of the five languages (they said green after the accent moved to rose); the map's badge font and hit radius are 17 and 24 map units so the 16 px and 44 px floors hold at 360 px; `docs/INBOX.md` says the 403 also covers an unknown board; `docs/PRIVACY.md` says the ask and reaction routes hold client addresses in memory for one hour only; the language select and the text size toggle use `border-line-strong` on the tint band (3.24:1). Left as follow-ups: one shared sliding-window helper for the ask and reaction routes, and the Korean quotation marks in `home.try` for the native read. Migration 0008 was applied by the human before this merge.

## 2026-11-04 (Wed), N21 disaster mode as a real state: switch, trigger, layout

Model: `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (`day5-mode`, cut from the PR #23 branch `day5-places`), brief from the reviewing session (Fable). Pipeline models unchanged.

Why: until today a board's `mode` was set only in the database. It fed one line of the extract prompt, `mode_at_creation`, the ask suggestions and the badge, and nothing switched it. A board that serves building notices in normal times has to turn into the shelter and water board by itself the moment the city orders an evacuation, and turn back when it is over.

**What was done**
- State: migration `0009_board_mode_state.sql` adds `boards.mode_reason` (`admin`, `auto_return`, `inbox:<submission id>`, checked by a constraint) beside `mode_changed_at`, which 0001 already had and nothing wrote. `lib/db/mode.ts` holds every read and write: each change is one update conditional on the mode it replaces (and for the auto return on the `mode_changed_at` it read), so two writers racing change the board once, and each logs one line with the board slug, the direction and the kind of reason. Without 0009 the reads return no reason and the writes store mode and time only (`42703` and `PGRST204` are taken as "column missing").
- Admin switch: section "Board mode" at the top of the admin page (`components/admin/ModeAdmin.tsx`, mounted in `AdminView.tsx`): what disaster mode does, the current mode, "Last changed <time> (<ago>), <reason>", one button to the other mode and an inline second button to confirm (no browser dialog). `POST /api/b/[slug]/admin` takes `{action: "set_mode", mode}`, cookie-gated like every admin action; it names the mode wanted, so a second tap or a stale page changes nothing.
- Trigger: `lib/cards/mode.ts` `switchesToDisaster`, called from `lib/pipeline.ts` right after an inbox submission's cards are written (`switchOnFromInbox`). A fact switches a peace board when it is `official` on platform `city_mail` (only `applyChannel` sets that, for the inbox), went onto a public card as written content (create, merge or update; not conflict, not held), is `danger`, `official_notice` or `shelter`, and its Japanese title, body or excerpt names one of 避難指示, 避難命令, 緊急安全確保, 警戒レベル4/5, 津波警報, 特別警報, 震度5弱 or stronger, after NFKC and without whitespace. A title with 解除 or 訓練 never switches. The inbox answer carries `switched_to_disaster` (docs/INBOX.md).
- Auto return: on the board page's server load (`modeForReaders(board, {autoReturn: true})`). A peace board costs no extra query; a disaster board reads its mode row, and only when `mode_changed_at` is more than 7 days old one count of public official `danger`, `official_notice` or `shelter` cards created in the last 7 days runs; zero returns it to peace with `auto_return`. The poll does not run it.
- Layout in disaster: a full-width orange-red strip under the top bar (`components/board/ModeStrip.tsx`; `--danger` #b8360f and `--danger-ink` white appended to `app/globals.css`, 5.9:1): "Disaster mode since <date, time> (<ago>)", who switched it in plain words when that is on record, and the list order. The list is sorted official first, then danger, water, shelter, medical, food, supplies, the rest, newest within each, pinned still first (`disasterOrder`). The drop-in panel offers "I heard the loudspeaker" first. The badge uses the danger colours. Places is unchanged. Peace is unchanged. `data-board-mode` stays on the badge and is now also on the board root, the strip and the admin section.
- Poll: `/api/b/[slug]/cards` carries `mode: {mode, since, reason}` (the kind of reason only, never the submission id). BoardView keeps the mode in state from the page and every poll, so the strip, the order, the drop-in order and the ask suggestions follow a switch without a reload.
- `pnpm check:mode` (`scripts/check-mode.ts`): 34 checks on the word list (full-width digits, 津波の心配はありません, 震度4, 警戒レベル3, heat and smog alerts, 解除, 訓練), who may switch, the reason projection, the auto return guard and the order.
- 20 i18n keys at the top of the five message files (`mode.*`, `admin.mode_*`). docs/PRIVACY.md row for the mode change, docs/INBOX.md paragraph.

**Acceptance** on the throwaway board `mode-acceptance` (dev server on 3521, Playwright 1.62 Chromium; deleted afterwards: 3 cards, 5 card_sources, 5 submissions, 1 device, 0 storage objects; live board untouched). Migration 0009 was not applied on the shared project (migrations are the human's step), so every row ran on the fallback path: the reason is not stored, the admin page says "reason not recorded", the strip shows no reason sentence. Mode, time, the conditional writes, the trigger, the auto return and the layout do not depend on the column.

| step | what | result |
|---|---|---|
| 1 | admin API without the cookie, with mode `chaos`, to disaster twice, back to peace | 403 `forbidden`, 400 `bad_mode`, `changed: true` then `changed: false` (same `since`), `changed: true`; log `mode mode-acceptance: peace to disaster (admin)` after the missing column warning |
| 2 | city mail: water at 上丸子山王町 応急給水拠点, board in peace | 201 in 31.4 s, `create`, water, official, `city_mail`, `switched_to_disaster: false`, board stays peace |
| 3 | heard drop-in (secondhand, loudspeaker): 警戒レベル4、避難指示 ... 小杉小学校へ避難, board in peace | 18 s to done (extract 5.9 s, reconcile 0.4 s, translate 9.3 s), `create`, category `shelter`, `switched_to_disaster: false`, board stays peace |
| 4 | city mail: 中原区に警戒レベル4、避難指示 ... 小杉町1丁目から3丁目 ... 小杉小学校へ避難, rule as briefed (danger, official notice) | 201 in 33.2 s, `merge` onto the heard card (now official, `city_mail`, 2 sources) but category `shelter`: no switch. The rule missed the case it exists for (decision below) |
| 5 | the same mail again, `shelter` added to the rule | 201 in 13.5 s, `merge`, `switched_to_disaster: true`; log `mode mode-acceptance: peace to disaster (inbox, 避難指示)` |
| 6 | firsthand text drop-in (food at 中原区役所) in disaster | `create`, `mode_at_creation` disaster, no switch |
| 7 | board at 390 px and 1280 px in disaster | strip full width right under the top bar, rgb(184, 54, 15) with white, "Disaster mode since 4 Nov, 21:44 (Just now)" and the order line; list official water, official shelter, firsthand food (server order: food, shelter, water); drop-in choices loudspeaker, photo, image, text; disaster suggested questions; 20 of 20 |
| 8 | the same in peace | no strip, server order, loudspeaker last of the four; 8 of 8. Places groups identical in both modes (ward office, 小杉小学校, 応急給水拠点) |
| 9 | an open reader at 390 px while the admin API switches | to peace in 5.5 s, back to disaster in 3.2 s (strip, order and suggested questions with it) |
| 10 | admin page at 390 px and 1280 px | mode, "Last changed 4 Nov, 21:43 (Just now), reason not recorded."; the first tap only shows the confirm step; the second switches and shows "Switched."; no browser dialog opened |
| 11 | disaster, `mode_changed_at` set 8 days back, today's official shelter card public | page load: one count, stays disaster; the poll does not check |
| 12 | the shelter card hidden, page load | peace, `mode_changed_at` now, log `disaster to peace (auto_return)`; the next load writes nothing |

Playwright: 2 misses on the first run were the test's (a case-sensitive "just now" against "Just now"); all rows pass as listed. Claude calls: 5 pipeline runs (3 inbox mails, 2 drop-ins), about 12 calls.

**After migration 0009** (applied by the human the same evening), the three rows that store a reason were run again on a second throwaway board, `mode-reason` (dev server on 3522; deleted afterwards: 1 card, 1 card_sources, 1 submission, 0 devices, 0 storage objects; live board untouched). Pages read as server-rendered HTML with curl; the layout itself was covered above.

| step | what | result |
|---|---|---|
| A | admin API to disaster, then back to peace (board never changed before: admin page "Not changed since the board was set up.") | `mode_reason` `admin` both times; strip "Switched on by the board admin."; admin page "Last changed 4 Nov, 21:49 (Just now), by the admin."; poll `reason: "admin"`; no strip in peace |
| B | the evacuation order mail (as step 4) on the peace board | 201 in 23.0 s, `create` (category `shelter` again), `switched_to_disaster: true`; `mode_reason` `inbox:<submission id>`; poll and page carry `reason: "inbox"` only, no id; strip "Switched on by the city's broadcast mail." (ja: 市の防災無線メールを受けて切り替わりました。); admin page "by an emergency in the city's broadcast mail"; log `peace to disaster (inbox, 避難指示)` |
| C | `mode_changed_at` 8 days back: page load with the card public, then with it hidden | first load: stays disaster, reason unchanged; second: peace, `mode_reason` `auto_return`; admin page "automatically, after 7 days without an official danger, notice or shelter card."; log `disaster to peace (auto_return)` |

Claude calls for the re-run: 1 inbox mail (extract and translate; no reconcile candidates).

**Measurements**: `pnpm check:mode` 34 of 34, `pnpm typecheck`, `pnpm lint`, `pnpm guard --all` clean; `pnpm build` at the end (PR description).

**Decisions taken in this session, open for review**
- `shelter` joins `danger` and `official_notice`, for the trigger and for the auto return count. Extract filed an evacuation order that names where to go as `shelter`, both the neighbour's transcript and the city's mail that merged onto it (step 4). The word list is still required in every category, so a shelter opening without an order does not switch.
- The word list is required for `danger` too, not only for `official_notice`: the loudspeakers carry heat alerts, photochemical smog advisories, scam warnings and missing person broadcasts most weeks, and the model may file those as `danger`. A layout that flips for a smog advisory teaches readers to ignore it.
- 津波警報 (which includes 大津波警報), not bare 津波: every earthquake report ends with 津波の心配はありません. 津波注意報 is left out. 緊急安全確保 and 特別警報 were added to the briefed words; 弾道ミサイル (J-ALERT) is not in the list.
- Conflict and held cards never switch; a merge or update counts, because the board then shows the city's statement.
- `mode_changed_at` null with mode disaster (set in the database by hand) never returns by itself: when it was set is unknown.
- In disaster the evacuation order filed as `shelter` sorts after an official water card (water comes before shelter in the briefed order). Pinning it, or ranking the card that switched the board first, would put the order on top; left as briefed.
- English reads "(Just now)" with a capital inside the strip's brackets, from the shared `card.just_now` string.
- No category filter chips exist on the board, so there was nothing to reorder. The trace line was not written: `card_sources.reason` is shown to readers as Claude's reason, and a separate mark would need a column.

**Files of the other session.** None edited. `app/globals.css` only got the appended block at its end.

**Needed a human**
- Migration 0009 was applied by the human on the shared project after the first run; the reason rows were then run again (table above).
- Native read of the Korean and Vietnamese `mode.*` and `admin.mode_*` strings.
- `docs/PLAN.md` still lists the peace/disaster mode switch under "Not this week"; the reviewing session decides how to record N21 there.

**Review fixes for PR #25 (Fable, reviewing session):** the auto return never ends a disaster mode the admin set by hand (reason `admin`), only the automatic switch from the city's mail; the quiet-week count includes cards created or updated in the window, since a city mail that merges onto the first evacuation card writes no new row; the intro on the admin page says so in five languages; 想定 (a scenario) joins 解除 and 訓練 as words that never switch the board on; the confirm button takes focus when it appears and its note is a status, not an alert; the migration comment names `lib/db/mode.ts`; Korean uses 대피 지시 and 알림 띠. Left for later: testing the body for 訓練 as well as the title.

## 2026-11-04 (Wed) night, N18 second board: Shibuya (data, polygons, seed)

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day6-shibuya`, cut from `main` at `075f2a9`) while another session worked on the home page footer, the about page and brand candidates. No Claude API call was added or changed. The database was neither read nor written: the integrator seeds after review.

**The board.** Slug `shibuya`; name 渋谷, Shibuya, 涩谷, 시부야, Shibuya; mode `peace`. The 11 町丁目 of the brief (渋谷1丁目 to 4丁目, 道玄坂1丁目 and 2丁目, 宇田川町, 桜丘町, 神南1丁目 and 2丁目, 神宮前6丁目) are one e-Stat small area each, none split, so the list stands as briefed. Codes and the source list per place are in `docs/BOARDS.md`.

**Sources, all read 2026-11-04**

| source | as of | used for |
|---|---|---|
| 渋谷区地域防災計画（令和5年度修正）資料編, 資料5 避難所一覧 (PDF from https://www.city.shibuya.tokyo.jp/bosai/bosai/bosai-plan/bosai_plan.html, page updated 2026-06-05) | 令和5年度修正 | the areas each shelter serves (収容地区) |
| 避難所・自主避難施設一覧, https://www.city.shibuya.tokyo.jp/bosai/bosai/hinan/itiran.html | updated 2026-07-03 | names, addresses, closures and substitutes |
| 一時集合場所・避難場所・地区内残留地区一覧, https://www.city.shibuya.tokyo.jp/bosai/bosai/hinan/basyo.html | updated 2026-07-17 | 神宮通公園, 金王八幡神社; the 地区内残留地区 note |
| 渋谷区防災ポータル 帰宅困難者受入施設一覧 (the page's JSON) | data updated 2026-07-21 | seven shelters for stranded commuters |
| 東京都水道局渋谷営業所, 渋谷水道ミニ情報 (https://www.waterworks.metro.tokyo.lg.jp/documents/d/waterworks/105017-shibuya-r709) | 令和7年9月号 | 都立代々木公園 災害時給水ステーション |
| JR East and Tokyo Metro station pages (read in the browser pane; curl gets 403) | read 2026-11-04 | 渋谷駅, its address and lines |
| しぶや安全・安心メール, 防災行政無線, 渋谷区防災アプリ pages and the portal's 防災行政無線放送内容 feed | 2024-04-23, 2026-07-09, 2023-11-01, feed 2026-10-16 | `docs/BOARDS.md` only |

No PDF text tool (poppler) is installed on this machine, so a ten-line Swift script with PDFKit, kept outside the repository, extracted the plan's text. The downloads went into their own scratch folders and were deleted.

**Known places, 19, all verified on the pages above.** Eight shelters: 商工会館・消費者センター, 文化総合センター大和田, 神南小学校, 松濤中学校, 渋谷区立小中学校 青山キャンパス, 日本アムウェイ本社ビル, 常磐松小学校, 神宮前小学校; the 代々木公園 water station; 渋谷駅; 渋谷区役所; seven 帰宅困難者受入施設 at the station; 神宮通公園. Decisions, open for review:
- 神南小学校 (closed since 2026-08-06) and 松濤中学校 (since 2025-08-14) stay as known places with the closure in `notes_ja`: neighbours will still name them, and the card should land on the place. 青山キャンパス, the substitute for both, carries the union of their two 収容地区 lists; that union is derived, not printed by the ward.
- Seven of the 21 帰宅困難者受入施設 inside the board's 町丁目: the ones at or over the station, plus 金王八幡宮 (also a 一時集合場所). The other 14 are listed in `docs/BOARDS.md` to add the same way if wanted. A new place kind `commuter_shelter` (label in five languages, 🏢) keeps them apart from 避難所: the ward tells commuters to wait at these, not at the shelters.
- 渋谷駅 has no bare "渋谷" alias, which is also the ward and the 町丁目 name. Its area is 道玄坂1丁目, JR East's address; the ハチ公口 point falls in 道玄坂2丁目, as the ハチ公前広場 does.
- 渋谷区役所 has kind `office`, which reads "Place" in the Places view.

**Code**
- **Polygons per board.** `lib/geo/index.ts` imported the pilot polygons and is imported by client components (`CardItem`, `CardDetail`, `CardPage`, `DropIn`), so every board page shipped them; a second file would have shipped both. Now `lib/geo/polygons.ts` imports every board file on the server only. The board page passes `boardPolygons(board)` through `BoardView` to `DropIn` as `areaPolygons`; `resolveArea` takes the polygons as an argument. Lookup is by area code across all files, so a throwaway copy of a board under another slug keeps its area control. The fill for rows seeded before the polygons (`code: null`, still the live pilot row) moved from `boardAreas` to `withAreaCodes`, applied in `lib/db/boards.ts` to every board read, the board's own file first since 町丁目 names repeat across cities. After `pnpm build`, neither board's area codes appear in any file under `.next/static`; they appear only in server chunks.
- `MUNICIPALITY_JA` gets `13113` 東京都渋谷区, so a map search for a Shibuya place reads "商工会館・消費者センター 東京都渋谷区渋谷1-12-5".
- **Seed.** `scripts/seed.ts` seeds every board or `--board <slug>`, and `--dry-run` prints both outcomes per board without connecting. Fixed on the way: an existing board got its `mode` overwritten with the seed's `peace`, which would have taken a board out of disaster mode; `--reset-cards` deleted the cards of every board in the loop (it now needs `--board`); sample cards were inserted into any existing board with no cards (now only into a board created in that run). An existing board gets `name`, `area_names` and `known_places` and nothing else. A created board is inserted with `listed: true`.
- `scripts/geo/build.ts` writes the city code instead of 川崎市中原区 into every file's note. `scripts/geo/README.md` covers any ward.
- `pnpm check:boards` (`scripts/check-boards.ts`): per board, every area has a code and a polygon with the seed's name, one city and ward, the municipality, the home page prefecture, one landmark, far away resolves to nothing, null codes come back on read, a throwaway copy finds the same polygons, unique place ids; and no polygon is shared between boards.

**Acceptance**

| check | result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm guard --all` | clean |
| `pnpm build` | compiled in 4.8 s, 12 static pages; no area code in `.next/static` |
| `pnpm check:boards` | 25 of 25 |
| `pnpm check:places`, `check:mode`, `check:inbox`, `check:placeholders` | pass |
| `lib/geo/shibuya.json` | 11 features, 8,038 bytes |
| ハチ公口 (35.6590, 139.7005) through `resolveArea` | `13113013002` 道玄坂2丁目 |
| home page prefecture: `prefectureOfBoard` in `components/home/prefectures.ts` counts the first two digits of the area codes | `13` (東京都) for shibuya, `14` for musashikosugi |
| `pnpm db:seed --reset-cards` without `--board` | refused before any connection, exit 1 |
| `pnpm db:seed --dry-run --board nowhere` | refused, exit 1 |
| local `pnpm dev` | not run: the board is not seeded and the production database must not be written |

`pnpm db:seed --dry-run --board shibuya`:

```
dry run: nothing is written and the database is not read, so each board shows both outcomes.

board shibuya
  if absent:  insert slug, name, mode peace, listed true, area_names, known_places, a new admin token; 0 sample cards
  if present: update name, area_names, known_places; mode, listing, token and cards unchanged
  name: 渋谷 / Shibuya / 涩谷 / 시부야 / Shibuya
  area_names: 11, 11 with an e-Stat code
    13113010001  渋谷1丁目
    13113010002  渋谷2丁目
    13113010003  渋谷3丁目
    13113010004  渋谷4丁目
    13113013001  道玄坂1丁目
    13113013002  道玄坂2丁目
    131130180  宇田川町
    131130110  桜丘町
    13113019001  神南1丁目
    13113019002  神南2丁目
    13113032006  神宮前6丁目
  known_places: 19 (shelter 8, water_point 1, station 1, office 1, commuter_shelter 7, park 1), verified 19
    shoko-kaikan  shelter  商工会館・消費者センター  渋谷1-12-5
    owada  shelter  文化総合センター大和田  桜丘町23-21
    jinnan-es  shelter  神南小学校  宇田川町5-1
    shoto-jhs  shelter  松濤中学校  松濤1-20-4
    aoyama-campus  shelter  渋谷区立小中学校 青山キャンパス  神宮前5-53-18
    amway-hq  shelter  日本アムウェイ本社ビル  宇田川町7-1
    tokiwamatsu-es  shelter  常磐松小学校  東1-7-10
    jingumae-es  shelter  神宮前小学校  神宮前4-20-12
    yoyogi-park  water_point  都立代々木公園  代々木神園町2-1
    shibuya-sta  station  渋谷駅
    shibuya-city-office  office  渋谷区役所  宇田川町1-1
    hikarie  commuter_shelter  渋谷ヒカリエ  渋谷2-21-1
    scramble-square  commuter_shelter  渋谷スクランブルスクエア  渋谷2-24-12
    shibuya-stream  commuter_shelter  渋谷ストリーム  渋谷3-21-3
    fukuras  commuter_shelter  渋谷フクラス  道玄坂1-2-3
    sakura-stage  commuter_shelter  渋谷サクラステージ
    miyashita-park  commuter_shelter  MIYASHITA PARK  神宮前6-20-10
    konno-hachimangu  commuter_shelter  金王八幡宮  渋谷3-5-12
    jingudori-park  park  神宮通公園  神宮前6-22-8
```

**City mail.** `docs/BOARDS.md` (new): Shibuya publishes every broadcast as text and audio in six languages (no Vietnamese, no やさしい日本語) on its 防災ポータル, read from a JSON feed; しぶや安全・安心メール (empty mail to `login@shibuya.mailio.jp`, sent from `info@shibuya.tokyo`) has a 防災行政情報 category whose content the page does not describe. Whether it carries the broadcast text is the first thing to check after subscribing.

**For the integrator.** After the merge has deployed: `pnpm db:seed --board shibuya --token-file .env.admin-token.local` (creates the board listed, writes its admin token to that file). Optional: `pnpm db:seed --board musashikosugi` puts the e-Stat codes into the live pilot row (name, areas and known places only; mode, token and cards untouched; it replaces any known place edited by hand in the database). Seeding before the deploy also works, but until then the Shibuya page would have no area control and map searches without 東京都渋谷区.

**Files of the other session.** None edited (`components/home/prefectures.ts` is only imported by the check script).

**Needed a human**
- Native read of the Korean and Vietnamese place names and the `places.kind.commuter_shelter` label.
- The inbox for Shibuya: the two Gmail steps in `docs/BOARDS.md`, and whether the Worker becomes one per board or a map of address to board.
- Whether to ask 渋谷区防災課 about reading the portal's broadcast feed.

## 2026-11-04 (Wed) late, home footer credit, map credit moved, mark candidates

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day6-home-polish`, cut from `main` after PR #27), brief from the reviewing session (Fable). The day6-shibuya session worked on the second board at the same time; none of its files (`supabase/seed/boards.json`, `lib/geo/**`, `scripts/geo/**`, `scripts/seed.ts`) were touched. No pipeline, prompt or database change.

**Done**
- Footer credit (`components/home/HomeView.tsx`): a fourth footer link, after "Built with Claude Code", to https://www.yanwensworld.com/ in a new tab with `rel="me noopener noreferrer"`, the same 44 px link style as the other three, and the shared screen reader hint `maps.new_tab` ("(opens in a new tab)"). Words through `home.made_by`: Made by Yanwen, 制作: Yanwen, 作者：Yanwen, 만든 사람: Yanwen, Thực hiện: Yanwen. The about page has no footer of its own (it ends with the back link), so it got none.
- Map credit: the full CC BY 4.0 attribution moved from under the home page map to a Credits section at the end of the about page (`#credits`, `components/about/AboutView.tsx`): one paragraph in five languages (svg-maps by Victor Cazanave, based on the MapSVG map of Japan, simplified for Engawa, small islands dropped, coordinates rounded, used under CC BY 4.0) and three 44 px links: svg-maps (the GitHub repository), MapSVG (its Japan map page) and CC BY 4.0 (the licence). Under the map only "Map credits" remains (`home.map_credits_link`, 16 px, muted, 44 px target) linking to `/about#credits`, so the attribution stays one tap from the map. The section has `scroll-mt-32` so the sticky top bar never covers its heading. `home.map_credit` and `home.map_licence` were used nowhere else and are removed; the comment in `components/home/japan-map-paths.ts` and the generator that writes it (`scripts/japan-map.ts`) say where the credit lives now.
- Four keys appended at the end of the five message files (`home.made_by`, `home.map_credits_link`, `about.credits_heading`, `about.credits_map`), two removed.
- Mark candidates: `docs/brand/candidates/01.svg` to `08.svg` and `docs/brand/candidates.html`. Each candidate is one even-odd path on a 64 unit grid in `currentColor`, no text, no gradient, so the chosen one drops into `MARK_PATH` (with `MARK_VIEWBOX` changed from 32 to 64 units). The page is self-contained (inline SVG and CSS, no request of any kind) and shows each candidate as a numbered row with a two line rationale: at 16, 32, 64 and 180 px in the rose `#ad235d` on the paper `#fbfaf7` and on white; in a mock of the top bar; as the home heading lockup; in a browser tab; and as the app icon (white on a rounded rose tile at 180 px and at the 32 px favicon size). Today's mark is the last row, only for comparison. The live mark, icons and preview images are unchanged.

**The eight candidates**

| # | name | idea | note |
|---|---|---|---|
| 01 | Sitting on the edge (縁に腰掛ける) | A neighbour sits on the veranda's edge, legs over the side; the two lines are the floor and the ground. | The most literal engawa and the warmest; at 16 px it can pass for a person at a desk or a priority seat. |
| 02 | Bubble on the plank (縁側の話) | A speech bubble at the end of the veranda plank, its tail hanging over the edge like a neighbour's legs. | Talk and place in two shapes, solid at 16 px; today's idea without the roof and the lines. |
| 03 | Folded notice (貼り紙) | A paper notice with a folded corner and two lines of text: the thing people actually drop in. | Clear at every size, but it is the generic document icon, so it says board more than engawa. |
| 04 | Tatami edges (四畳半の畳縁) | A four-and-a-half mat room drawn by its tatami edges (畳縁, the same 縁): four mats around a half mat. | A room where people sit together; every edge lands on the pixel grid, the crispest at 16 px. |
| 05 | Petal on the plank (縁側に花びら) | One sakura petal falling onto the veranda plank: the season and the street coming in. | Soft and plainly Japanese, but at 16 px the notch is gone, and sakura is a crowded motif. |
| 06 | Lantern (提灯) | A paper lantern, the light at a festival gate or a shop door: where neighbours gather after dark. | Reads at once at any size, but in rose it can suggest a red-lantern izakaya. |
| 07 | Knot (結び) | Two square links passing over and under each other: 縁 as the bond between people, like the 組み角 crest. | Ownable and on the pixel grid; at 16 px it can be taken for the copy icon. |
| 08 | Sun on the plank (日向) | A round community split by the veranda plank, or the sun low over the engawa (日向ぼっこ). | The boldest silhouette, but close to a sunset weather icon, and a bar across a disc recalls a no-entry sign. |

The brief's ninth idea, a roof over an open floor, was not drawn again: three roof sketches were rejected on 11/04 (table or torii, bank or temple front, the kanji 亠, see the home page entry above), and today's mark already carries a roof.

How they were made: one list in a scratch script outside the repository writes both the SVG files and the page, so the two cannot drift apart. Each candidate was judged at 1x in headless Chrome and as a 16 px raster blown up pixelated. Three were redrawn on the way: the knot was first two square U hooks, which read as a barcode at 16 px, and became two interlocked square links; the petal's notch was too wide and read as a bite out of a heart, so it got a narrow V, straighter sides and a 40 degree tilt; the notice's first text line sat on a half pixel and moved onto the grid.

**Ranking (my top three, the user decides)**
1. **04 Tatami edges.** The only candidate with no curve, every edge on a 4 unit (one pixel at 16 px) line, so it is the sharpest in the tab and on the 32 px tile. It reads as no letter and no stock icon. It carries 縁 a second time (畳縁 is the cloth edge of a mat, the same character as 縁側), and a four-and-a-half mat room is the smallest room where people sit down together. Calm enough to stay on the page in disaster mode.
2. **02 Bubble on the plank.** It says the product (neighbours talking) and the place (the plank) in two shapes and stays one silhouette at 16 px. It keeps the idea behind today's mark in half the parts, so the change is easiest to explain.
3. **07 Knot.** 縁 in its main sense, the bond between people, drawn like the 組み角 family crest: Japanese without sakura or lanterns, and on the pixel grid. The risk is the copy icon at 16 px; at 32 px and up the over and under is clear.

**Acceptance** (dev server on port 3533 against the shared Supabase project, read only, nothing created; headless Chrome over the DevTools protocol from a helper outside the repository)

| check | result |
|---|---|
| footer, 390 px, en and ja | four links in two lines of two: About Engawa, Privacy and retention / Built with Claude Code, Made by Yanwen (ja: Engawa について, プライバシーと保存期間 / Claude Code で開発, 制作: Yanwen); every link 44 px tall, 16 px text; the new link has href https://www.yanwensworld.com/, target _blank, rel `me noopener noreferrer` and the hidden "(opens in a new tab)" / （新しいタブで開きます）; no sideways scroll |
| footer, 1280 px, en and ja | the four links on one line in the 1024 px column, same measurements |
| under the map, 390 and 1280 px, en and ja | only "Map credits" / 地図のクレジット under the hint, 16 px, #5c5c5c, 44 px tall; "Victor Cazanave" no longer appears on the home page |
| anchor from the map link | tapped on the home page (client navigation), 390 and 1280 px, en and ja: URL `/about#credits`, the page scrolled to its end (Credits is the last section), the heading Credits / クレジット visible below the sticky top bar (its top at 492 px under a bar ending at 113 px at 390; 600 under 61 at 1280); a direct load of `/about#credits` lands the same; the three credit links are 44 px |
| `docs/brand/candidates.html` from the file system | opened as a `file://` URL in headless Chrome at 1280 px and at 390 px: nine rows (eight candidates and today's mark), 13 SVGs each, every path painted, at 16, 32, 64 and 180 px (and 20, 40, 16 in the bar, the heading and the tab, 126 and 22 inside the tiles); no link, script, img or iframe element; no sideways scroll at 390 px (the size swatches wrap) |

**Measurements**: `pnpm typecheck`, `pnpm lint`, `pnpm guard --all` clean; `pnpm build` at the end (PR description).

**Decisions taken in this session, open for review**
- The brief called the top bar wordmark "縁 Engawa". The live bar reads the mark and "Engawa", and the home heading "縁側 Engawa", so the mock shows the bar as it is live and the heading lockup under it.
- The about page has no list of data sources: the residents' figures name their sources inside the text (`about.numbers_body`). Credits therefore holds the map attribution only.
- The link labels svg-maps, MapSVG and CC BY 4.0 are names, the same in every language, so they live in a constant beside their URLs in `AboutView.tsx` rather than in the message files.
- Not checked here: whether the footer's privacy link (`/about#about-data`) also lands under the sticky top bar; the same `scroll-mt-32` would fix it if so.

**Needed a human**
- Pick a mark from `docs/brand/candidates.html`. The follow-up replaces `MARK_PATH` and `MARK_VIEWBOX` in `components/brand/Mark.tsx`, `app/icon.svg` and `app/favicon.ico`, and checks the icons and preview images built from them.
- Native read of the Korean and Vietnamese credit and footer strings.

### Same PR, later: the home page raised to an awards-site bar

Scope added by the reviewing session on the user's behalf, about two hours, same model and worktree. Board page and other sessions' files untouched; `components/TopBar.tsx` changed only in its `home` branch (width), which only the home page uses.

**What changed**
- Layout (`components/home/HomeView.tsx`): from 1024 px two columns, 7 to 5, in a 1152 px column (the top bar's `home` width follows, so the bar and the page share their left edge): the hero, then the boards resting on the plank, on the left; the map on the right, sticky under the top bar while the boards scroll past. On a phone: hero, boards, map. Steps in three columns only from 1024 px (they were cramped at 768), one per row below.
- Hero: 縁側 Engawa is now the dominant element, fluid from 40 to 56 px (`clamp(2.5rem, 1.75rem + 3vw, 3.5rem)`), the kanji tracked at 0.08em and set in Japanese (`lang="ja"`, so Chinese readers see the Japanese glyphs), the Latin word at -0.01em, 16 px apart on one baseline. The 64 px mark above it is gone: it was larger than the name, and the top bar already carries the mark. The description at 20 px with a 60ch measure (about 60 Latin or 34 Japanese characters per line), the tagline at 18 px semibold, for whom at 17 px muted.
- Plank: two hairlines in the line colour with the paper between (8 px), under the Boards heading with the cards resting under it, and again as the footer's top rule.
- Tagline (`components/home/Tagline.tsx`): `app.tagline` in ja, en, zh, ko, vi and the new `home.tagline_easy_ja` (きんじょの じょうほうを、みんなの ことばで。, the same in all five files for key parity). All six sit in one grid cell with their own `lang`, so the line is as tall as the tallest and never moves the layout; it starts in the reader's language, steps through the other five every 4 s and stops back on the reader's language. The outgoing line fades out (300 ms) before the next fades in, so two scripts never overlap. Screen readers get the reader's language only. Static under reduced motion.
- Map (`components/home/JapanMap.tsx`): land `--map-land` #ebe7de (a step darker than the paper, warm like it; was #e2ded5), 1 px borders in the line colour (non-scaling), no box. Okinawa stays in its inset, now a dotted 1 px frame in `--line-strong` with the prefecture's name in the reader's language (16 px at phone width) and its islands outlined so they show. Prefectures with a board: rose tint `--map-active` with a 1 px accent outline (5.4:1 on the land), a step deeper (`--map-active-hover`) on hover and keyboard focus, eased 150 ms, and the prefecture's name in a small label above the badge (HTML, kept inside the map near its edges, hidden from screen readers, which already hear "Kanagawa: 1 board"). Badge in the accent with a soft halo; badges are spaced so halos never overlap (Tokyo next to Kanagawa once the Shibuya board lands).
- Motion (`app/globals.css`, appended): `home-rise`, opacity and an 8 px rise in 360 ms, staggered 60 ms through the hero lines, the Boards heading and plank, each card and the map; `home-pop`, the badge scaling in once from 0.6 in 400 ms. Transforms only. Board cards lift 2 px with a deeper shadow on hover and settle on press (the link's target now covers the whole card); footer links draw their underline from the left on hover and keyboard focus (200 ms). Nothing loops, nothing bounces; the existing reduced motion block turns all of it off and leaves the end state.
- Type and rhythm: hero 40 to 56 px, section titles 20 px, body 17 px (`1.0625rem`, so the text size toggle still scales it), muted 16 px minimum; spacing on the 8 px grid, sections 56 px apart on phones and 96 px on desktop.
- Colour: the accent only on the badge, the board's link, focus, links on hover and the prefectures with a board; the step numbers are ink now. The top bar's rose band is shared with the board page and was left as it is.
- Footer: Made by Yanwen, Source on GitHub (`home.source`, https://github.com/AdeDeepFishing/engawa, new tab, `rel="noopener noreferrer"`), Built with Claude Code, About, Privacy.

**Self-review rounds** (dev server on port 3533, headless Chrome over the DevTools protocol; full-page captures at 390, 768 and 1280 px in ja and en, plus zh at 1787 px, the width the user saw)

| round | seen | changed |
|---|---|---|
| before | an empty-looking rounded box at the map's top left (Okinawa's islands are specks in it); grey land in a cold tone against the paper; the 64 px mark larger than the name; two short text lines over a long map column; credit text under the map | everything above |
| 1 | 1280 en: the name leads, plank and warm map read well, but the description wrapped at 47 characters (a 456 px column), the Boards heading floated between the plank and the card, the land was a touch pale. 768 en: the map ran 720 px wide and dominated; the three step cards were cramped; Privacy wrapped alone onto a second footer line. 390 ja: order hero, boards, map, all clean | 1152 px column with 7:5 columns (the description now 2 lines of about 60 characters), Boards heading sitting on the plank with the card under it, land #ebe7de, map capped at 30rem below 1024 px, steps in three columns only from 1024 px, footer gaps 24 px, the plank as the footer rule |
| 2 | 1280 en: balanced, the top bar aligned with the column; 768 ja: map capped, steps one per row, the Japanese measure about 35 characters; 390 en: the English and Vietnamese taglines wrap to two lines on a phone, which the stack holds at a fixed height | nothing; behaviour checked next |
| 3 | hover on Kanagawa: tint deepens, label 神奈川県 above the badge; hover on the card: lifted, deeper shadow, the button darkens. Tagline pass en, zh, ko, vi, やさしい日本語, ja, back to en; height fixed at 56 px; layout shift 0; footer never moved. Reduced motion: no animation, tagline static in the reader's language, shift 0. At 1787 px zh a capture caught the tagline mid crossfade with zh and ko overlapping | the tagline fades out, then in (never two lines visible at once, measured over a switch) |

**Measurements** (all on the final state)
- Every text pair: ink on paper 16.5:1, on white 17.2, on the beige 15.0; muted on paper 6.4, on white 6.7; white on the accent 6.6, on its hover shade 9.4; the accent on paper 6.3; ink on the top bar 14.8. Non-text: the inset's dotted frame 3.6:1 on the paper, the active prefecture's outline 5.4:1 on the land.
- At 390 (ja, en), 768 (ja), 1280 (en) and 1787 px (zh): no text under 16 px (SVG labels measured at their drawn size), no link or button under 44 by 44 px, no sideways scroll, and keyboard focus on a prefecture shows the ring and its name inside the map.
- `pnpm typecheck`, `pnpm lint`, `pnpm guard --all` clean; `pnpm build` at the end.

**Decisions open for review**
- The tagline makes one pass and stops instead of cycling for ever: the brief also says nothing loops, and WCAG 2.2.2 asks for a pause control on content that updates by itself for more than 5 seconds. The pass still takes 24 seconds, so a pause button or a shorter pass may be wanted.
- "The board cards resting on the plank": the Boards heading stands on the plank and the cards sit right under it; the plank is the divider between the hero and the boards.
- The hero mark was removed rather than shrunk; the chosen mark from `docs/brand/candidates.html` can come back there at the size of the name's cap height.
- The map is sticky within the two-column row only, so with one board it travels about 150 px before it scrolls away with the cards.

**Review fixes for PR #29 (Fable, reviewing session, on the integration branch):** the six-language tagline now pauses while the pointer rests on it and stops for good, back on the reader's language, at the first tap, key, wheel, touch move or scroll (WCAG 2.2.2 asks for a way to pause or stop content that updates by itself); the Okinawa inset name is 16.5 map units so it stays at or above 16 px down to 375 px; card shadows come from three tokens derived from the ink colour instead of hardcoded rgb values; the Built with Claude Code link opens in a new tab with the same hint as the other external links. Left as follow-ups: a deeper hover tint on prefectures with boards, a change listener on the reduced-motion query, the badge label offset in percent of the map height.

**Review fixes for PR #28 (Fable, reviewing session, on the integration branch):** a known place's official note (`notes_ja`: a shelter closed for rebuilding and its substitute, a substitute reserved for 要配慮者) now reaches Claude in the board context and is shown under the place in the Places view, so a closed school is never offered as an open shelter; the `office` kind has a label in five languages and an icon; Chinese reads 无法回家人员临时安置设施 for the commuter shelters and the Chinese and Korean place names use a middle dot instead of the katakana dot; the vendor intrusion note in `docs/BOARDS.md` moved under Not confirmed since its URL was not kept; the seed header says what `--rotate-token` does without `--board`. The pilot board has three places with notes, so its extract context grew by those lines; the eval was re-run on the integration branch (result below). Left for later: `server-only` on the polygon loader once that package is a dependency.
Eval on the integration branch with the pilot's place notes in the context (`pnpm eval --no-write`, 16 inputs): 105/105 fields, 0 PII leaks, 0 invented facts, risk flags 16/16, six languages 16/16, extract median 9.3 s (p90 10.8 s), translate median 10.1 s.

## 2026-11-04 (Wed) night, Shibuya portal poller: ward broadcasts into the board inbox

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day6-poller`, cut from `main` at `1b0db05`) while another session worked on the brand files. Fable (the reviewing session) wrote the brief and integrates. No Claude API call was added or changed. The database was not touched and nothing was posted to the live inbox: the tests run on fixtures, and the portal was read once by hand (the list and the October file, one request each) to check the brief's shape before writing them.

**What it is.** `workers/shibuya-portal/`, the Cloudflare Worker `engawa-shibuya-portal`: a cron trigger every 5 minutes, KV binding `STATE`, `workers_dev = false`, no secret and no account id in the repository. A run reads the month list and the newest month of the 渋谷区防災ポータル 防災行政無線 feed, sorts the broadcasts oldest first and posts each one after the stored `last_update_at` to `/api/b/shibuya/inbox` as `{from: PORTAL_SENDER, subject: the Japanese title, text: the Japanese message, received_at: update_at read as +09:00}`, storing each `update_at` after its 201 and stopping at the first answer that is not 201. The first run stores the newest `update_at` and posts nothing. Pure functions in `src/feed.ts`, the run in `src/run.ts` with fetch, KV, the clock and the log passed in, `src/index.ts` wires the bindings. The README has the deploy steps, the first run, re-posting one broadcast by hand and the free plan limits. The worker has its own `package.json`, lockfile, `tsconfig.json` and pnpm root (`pnpm-workspace.yaml` in its folder), so the app's install on Vercel never pulls wrangler; `workers/` is excluded from the app's `tsconfig.json` and eslint ignores.

**The feed as read** (2026-11-04): both files served as `application/json`; the list names 7 months, newest first, and only months that had a broadcast (202610, 202608, 202607, 202602, ...); 202610 holds one broadcast, `update_at` `2026/10/16 12:40`, `important` 0, messages ending in a newline, all six `multi_lang` entries with an mp3 attachment. The fixtures copy that shape; only the 緊急地震速報 entry's title and Japanese and English messages are the feed's, the rest is written for the tests (`test/fixtures/README.md`).

**Decisions open for review** (where the brief was read or extended)
- **The inbox post waits up to 310 s, not 15 s.** The inbox answers after its whole pipeline (15 to 30 s, at most the route's 300 s) and finishes the run when the caller hangs up, so a 15 s timeout would count a broadcast the board took as failed and post it again next run. The portal fetches keep the 15 s.
- **Retries are bounded.** On 500 (and 400, 413, 422, a 504, a network error, a timeout) nothing is stored as posted, the error code is logged and the run stops; the next run tries again. After 3 failed attempts in a row on one broadcast the next run passes it over and goes on. Without a bound a broadcast the pipeline refuses (`pii_leak`, `refusal`) would be posted 288 times a day, each spending Claude calls toward the daily cap, and would hold back every broadcast after it, an evacuation order included. The README shows how to re-post it by hand. 429, 503 and 403 stop the run without counting an attempt.
- **A broadcast older than 24 hours at its turn is passed over.** The inbox ignores a `received_at` that old and reads 本日 against the time of the request, so a stale alert would come out as today's and could switch the board to disaster mode.
- **The key is `update_at` plus an FNV-1a hash of the Japanese title and message.** Two broadcasts in the same minute are both posted; the 20 keys in KV are checked before every post, so a run that read an old state still posts nothing twice.
- **A lease key in KV while a run posts**, an 8 minute budget and at most 5 posts per run, so a slow run and the next cron run never post the same broadcast and a run ends inside the 15 minutes a cron run may take. A run with nothing new reads one key and writes nothing.
- **The month before is also read** when the newest month's oldest broadcast is after the stored time (a broadcast late in a month, or a poller that was down), as well as when the newest month is empty.
- **"English differs materially"** is read as: the English is real English (more Latin letters than Japanese characters, not a copy) and carries a number other than zero or a link the Japanese lacks. A 12 hour time beside 15時 counts as a difference and adds one harmless line.
- Dependencies pinned to releases about two weeks old: wrangler 4.151.3 (2026-10-20), `@cloudflare/workers-types` 5.20261019.1; TypeScript 5.9.3 and tsx 4.23.15 as in the app. A `typecheck` script beside `deploy`, `tail` and `test` checks the worker against the Workers types and the tests against the Node types.

**Follow-ups, not done here**
- Cards from the poller read "From the city's broadcast mail": `applyChannel` sets platform `city_mail` for every inbox post. A `city_portal` platform with its own source line in the five message files would say where the text came from.
- The ward's consent to polling the feed (`docs/BOARDS.md`) comes before the deploy.
- The feed's `important` flag is not used (0 on the one broadcast read).

**Tests** (`pnpm test` in `workers/shibuya-portal`, `node --import=tsx --test test/*.test.ts`, durations cut)

```
✔ JST conversion: update_at is read as +09:00
✔ first run stores the newest update_at and posts nothing
✔ a new entry after the stored time is posted once
✔ two new entries post oldest first, the English line only where it adds a fact
✔ a failure stops the sequence and the next run retries from it
✔ 429 and 503 stop the run without counting an attempt, 403 points at the setup
✔ a broadcast that fails three times is passed over on the fourth run
✔ a duplicate key is skipped even when the stored time is behind
✔ two broadcasts in the same minute are both posted
✔ the month before is read when the newest month has no broadcast
✔ a broadcast older than 24 hours is passed over, not posted
✔ a run holding the lease keeps the next one from posting
✔ without the secret nothing is posted and nothing is stored
✔ a portal error stops the run before anything is posted
✔ log lines carry counts, statuses and times, never broadcast text
✔ the English line: only a real English text with a number or link the Japanese lacks
✔ month files: newest first, anything else dropped
✔ the inbox's answer: 201 counts cards, error codes are kept short
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

**Acceptance**

| check | result |
|---|---|
| `node --test` (`pnpm test` in the worker folder) | 18 of 18 pass |
| the tests catch a broken order and a missing key guard | sorting newest first fails 5 tests; skipping the key check fails 5 |
| `pnpm typecheck` in the worker folder (Workers types for `src`, Node types for `test`) | clean |
| `wrangler deploy --dry-run` in the worker folder, no login | built, 14.29 KiB (4.76 KiB gzip); bindings `STATE` (placeholder id), `ENGAWA_INBOX_URL`, `PORTAL_SENDER` |
| `pnpm typecheck` at the root, `workers/` excluded | clean |
| `pnpm lint` at the root, `workers/**` ignored | clean |
| `pnpm guard --all` | clean |
| `pnpm build` | compiled, 12 static pages; no worker code in `.next` |

## 2026-11-04 (Wed) night, mark 04 Tatami edges: solid and edges variants

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day6-mark`, cut from `main` after PR #30), brief from the reviewing session (Fable). Another session worked at the same time under `workers/**`, `docs/BOARDS.md`, `docs/INBOX.md`, `.gitignore`, `tsconfig.json` and `eslint.config.*`; none of those were touched. No pipeline, prompt, database or message file change.

**Done**
- `components/brand/Mark.tsx`: the five mats as one table of rectangles on the 64 unit grid (`MATS`), and both variants derived from it as path constants in `MARK_PATHS`: `solid` (filled blocks, the edges as gaps, as `docs/brand/candidates/04.svg`) and `edges` (each mat a rounded outline, mats hollow). `MARK_VARIANT: "solid" | "edges"` is the one switch; `MARK_PATH` follows it, and so does every consumer. `MARK_VIEWBOX` is now `0 0 64 64`. `markSvg` and `markDataUrl` take an optional variant for the preview script.
- `components/brand/icon-image.tsx`: the mark for every `next/og` image goes through it: `MarkImage` (the mark as an `<img>`), `MarkTile` (white mark on the accent tile, sized by the margin around the drawn mark) and `iconResponse`, with the margins in one place (`ICON_MARGIN`). `app/icon.tsx`, `app/apple-icon.tsx`, `app/icons/[size]/route.tsx`, `app/opengraph-image.tsx` and `app/b/[slug]/opengraph-image.tsx` use them; none keeps a path or a data URL of its own. The board preview's tile, which repeated the tile markup, is now `MarkTile`.
- Tiles: the mark is white on the accent (it was the paper colour). Margins between the drawn mark and each side: apple icon 18 %; manifest icons 22 %, because they double as maskable and the mark is a square with filled corners, so it may span at most 80 % / sqrt(2) (56.6 %) of the side to stay inside Android's safe circle; the 32 px favicon tile 17 %, which keeps the mark's grid at 24 px as before.
- `scripts/brand/icons.ts` (`pnpm brand:icons`, `--check` to only compare): writes `app/icon.svg` (the mark alone in the accent, the paper colour under `prefers-color-scheme: dark`, as before) and `app/favicon.ico` (an ICO around the 32 px PNG of `app/icon.tsx`) from `Mark.tsx`, so the two static files cannot drift. The output is byte for byte stable, so `--check` can run anywhere.
- `docs/brand/mark-04-variants.html`, written by `scripts/brand/variants-page.tsx` (`pnpm brand:preview`) from the same constants: two columns (solid, edges), each at 16, 32, 64 and 180 px on the paper and on white; the 16 px tab, 20 px top bar and 32 px tile as the pixels a 1x screen gets (PNG from `next/og`, the renderer of the real icons, enlarged 6 times); the top bar at 390 px with "Engawa" and the 縁側 Engawa lockup; the iOS tile, the Android circle mask and the favicon tile; the favicon in a light and a dark browser tab; one line under each with my pick. Self-contained (inline SVG through `<symbol>`, CSS, PNG data URLs).
- `docs/brand/candidates.html`: the last row, "Today's mark", is now "Previous mark" and the intro says 04 replaced it; its path stays as the comparison. Nothing in `app`, `components` or `public` carries the bubble any more (grep for its path data and for "bubble": only that row and candidate 02, "Bubble on the plank", which is a different candidate).

**Geometry**
- `solid`: candidate 04 was already right and is unchanged: every gap 4 units (1 px at 16 px); every mat 16 wide and the half mat 16 by 16; a full mat 36 long, two half mats plus one gap, so with half a gap around each a full mat is 40 by 20 and the half mat 20 by 20, exactly 2:1 and half, as with real tatami whose edges belong to the mat. The pinwheel maps onto itself under a quarter turn about the centre, so it is centred optically as well as geometrically, 4 units from every side; the drawn extent (56 of 64) is the bubble's (28 of 32), so nothing around the mark moves.
- `edges`: the brief's stroke of about 5 units was drawn first and judged as 16 px rasters: 5 units is 1.25 px, the lines blur, and the half mat's hole (1.5 px) fills in, so the mats read as pink blocks with darker borders, a muddy copy of `solid`. A thicker stroke (6 with a 3 unit gap) closes the holes further. Stroke 4 is exactly 1 px at 16 px and 2 px at 32 px: five crisp outlines with 2 px holes and 1 px gaps, so the variant uses 4, with the same 4 unit gap and footprint as `solid`. Corners: outer radius 5, inner 1 (a 4 unit stroke around a 3 unit centre radius); at 180 px radii of 6 and up turned the long mats into pills and the half mat into the letter o. A simplification was also drawn, a floor plan with shared lines (one frame and the four inner edges, as a 間取り draws a 四畳半): crisp and very much a room, but it reads as the layout icon of UI kits and is not each mat's own edge, so it was not shipped.

**Acceptance** (production build, `pnpm start` on port 3611; images fetched with curl and looked at; headless Chrome over the DevTools protocol for the top bar and the preview page; the live site was only read)

| check | result |
|---|---|
| `/icon.svg` | 200 `image/svg+xml`, the five mats; computed fill #ad235d with `prefers-color-scheme: light` and #fbfaf7 with dark (emulated) |
| `/icon` | 200 PNG 32x32: the white mark on the rounded accent tile |
| `/favicon.ico` | 200 ICO, 32x32 PNG inside, the same image |
| `/apple-icon` | 200 PNG 180x180, square, the mark 18 % from each side |
| `/icons/192`, `/icons/512` | 200 PNG, the mark 22 % from each side; the 512 under an 80 % circle mask keeps the whole mark; `/icons/64` still 404 |
| `/opengraph-image` | 200 PNG 1200x630: the mark in the accent at 168 px before 縁側 Engawa |
| `/b/musashikosugi/opengraph-image` | 200 PNG 1200x630: the white mark on the 96 px accent tile before Engawa / 縁側, then 武蔵小杉 |
| top bar, 390 px, home and board | engawaboard.com (the bubble, `main`) against this build: the mark's box 20 by 20 at (16, 20), its drawn part 17.5 px at (17.25, 21.25), centre at y 30 like the centre of the "Engawa" text, the link 86.38 by 44 at (16, 8): the same numbers on both, on both pages |
| `edges` through the routes | `MARK_VARIANT` set to `edges` in the working tree and the six route functions called directly (icon, apple icon, icons 192 and 512, both preview images): all render the outlines; `pnpm brand:icons --check` then reports both static files stale, as it should; set back to `solid`, check clean |
| `docs/brand/mark-04-variants.html` from `file://` | 1280 px: two columns; 390 px: one column, no sideways scroll (scroll width 390), 30 marks painted, 6 PNGs decoded, no link, script or iframe element |

`pnpm typecheck`, `pnpm lint`, `pnpm guard --all` and `pnpm build` clean.

**Decisions taken in this session, open for review**
- `edges` uses a 4 unit stroke instead of about 5, for the 16 px reason above.
- My pick is `solid`, and it is what the build ships until the user says otherwise: it keeps the most colour at 16 to 32 px, where the mark is seen most (tab, top bar, small tile), and it matches the bold wordmark; `edges` is lighter and closer to the word 畳縁, at its best from 64 px.
- `app/icon.svg` keeps its dark mode rule: in a dark tab strip the rose would be 1.8:1 on #35363a and 2.4:1 on #202124, the paper colour 11.6:1 and 15.4:1. In light mode it is the accent, as the brief asks.
- The top bar takes `Mark` from `Mark.tsx` directly; only the image consumers go through `icon-image.tsx`, which imports `next/og` and has no place in the client bundle.
- The preview's top bar mock reads "Engawa", as the live bar does (the brief said 縁 Engawa); the 縁側 Engawa lockup of the preview image is shown under it.
- Two scripts in `package.json`: `brand:icons` and `brand:preview`.

**Needed a human**
- Pick `solid` or `edges` in `docs/brand/mark-04-variants.html`. To ship `edges`: set `MARK_VARIANT = "edges"` in `components/brand/Mark.tsx`, run `pnpm brand:icons`, commit the two static files with it.
- After the deploy, a look at the home screen icon on a real phone. Browsers cache favicons hard: an old tab can keep the bubble until a hard reload.

**Review fixes for PR #31 (Fable, reviewing session, on the integration branch):** the run reads the KV state again under its lease before posting, so a run that finished meanwhile cannot make it post the same broadcast (KV propagation lag remains the one gap, worth one merged duplicate at most); only a coded answer from the pipeline counts toward the three attempts, an outage, a timeout or an uncoded 5xx never passes an evacuation order over; an empty `ENGAWA_INBOX_URL` or `PORTAL_SENDER` stops the run with `no_config` instead of burning attempts; the README says the repository commits the KV namespace id and that a broadcast the ward edits is posted again and merged by reconcile. The STATE namespace was created on the account and its id committed; 18 of 18 tests pass with the updated log expectation.
The human picked the solid variant of mark 04 (2026-11-05 00:45 JST), which is the default; `MARK_VARIANT` stays `solid` and the committed `app/icon.svg` and `app/favicon.ico` already match it.

## 2026-11-05 (Thu), two more boards: 溝の口 (高津区) and 上野 (台東区)

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day7-boards-kanto`, cut from `main` at `d89e1b3`), brief from the reviewing session (Fable), while another session built 札幌 and 福岡 in the same files (placement agreed: my boards at the end of `boards.json`, my lines at the top of `MUNICIPALITY_JA`, `BY_SLUG` and `EXPECT`, my sections right after Shibuya's). No Claude API call was added or changed. The database was neither read nor written. The session stopped once at the usage limit during research and resumed from its notes.

**The boards.** Both follow `docs/BOARDS.md`, "Checklist for a new city", and its Shibuya section as the model; the area tables, the evacuation rule per district, every known place with its source, what was left out and the broadcast channels are in `docs/BOARDS.md`.
- `mizonokuchi`: 溝の口, Mizonokuchi, 沟之口, 미조노쿠치, Mizonokuchi; mode `peace`. 14 町丁目 of 川崎市高津区 (`14134`): 溝口1丁目 to 6丁目, 久本1丁目 to 3丁目, 坂戸1丁目 to 3丁目, 下作延1丁目 and 2丁目. 20 known places: nine shelters, two water points, the station, the ward office, six 一時滞在施設 at the station, 緑ケ丘霊園.
- `ueno`: 上野, Ueno, 上野, 우에노, Ueno; mode `peace`. 17 町丁目 of 台東区 (`13106`): 上野1丁目 to 7丁目, 東上野1丁目 to 6丁目, 上野公園, 上野桜木1丁目 and 2丁目, 池之端1丁目. 18 known places: eight shelters, the 上野恩賜公園 water station, 上野恩賜公園 and 谷中墓地 as 避難場所, the station, the ward office, five 一時滞在施設.

**Sources, all read 2026-11-05**

| source | as of | used for |
|---|---|---|
| 川崎市地域防災計画 資料編, https://www.city.kawasaki.jp/601/page/0000140630.html (page updated 2026-08-13): 2-06, 2-04, 2-18, 2-28, 2-10, 2-05, 2-07 | 令和7年4月1日 (2-06, 2-18), 令和7年5月1日 (2-28), 令和4年8月25日 (2-10) | 溝の口: shelters with 対象町丁, water points, 一時滞在施設, 広域避難場所 |
| 台東区地域防災計画（令和6年度修正）資料編 (PDF from https://www.city.taito.lg.jp/bosai/houshin/bosaikaigi/chikibou_r6.html, page updated 2024-08-26): 資料第126, 127, 128, 129, 110 | 令和6年4月 (126), 令和6年7月 (127), 平成30年6月 (128), 令和5年4月 (110) | 上野: shelters per 町会, 避難場所 per 町丁目, 地区内残留地区, 一時滞在施設 |
| 台東区 町会区域一覧表, https://www.city.taito.lg.jp/kurashi/kyodo/tyoukai/choukaikuikiichiran.html | 令和8年3月修正 (page 2026-03-09) | 町会 to 町丁目, hence each shelter's target areas |
| 東京都水道局 災害時給水ステーション一覧, https://www.waterworks.metro.tokyo.lg.jp/kurashi/shinsai/ichiran | 令和7年11月1日 | 上野恩賜公園 給水 |
| 台東区 震災時の避難, 帰宅困難者対策, 防災行政無線, 放送内容の確認, たいとう防災気象情報メール pages and the two mail archives | 2026-07-30, 2026-09-03, 2024-01-05, 2021-07-06, 2024-10-29; archives as of 2026-11-04 | evacuation rule, candidate facilities, broadcast channels |
| 東急, JR East (武蔵溝ノ口 and 上野), Tokyo Metro and 京成 station pages, read in the browser pane | 2026-11-05 | stations, addresses, lines |

The plans' tables have merged cells that the extracted text scrambles, so every table used was read from the PDF page rendered as an image (a PDFKit script outside the repository, as for Shibuya). The downloads went into scratch folders and were deleted.

**Decisions, open for review**
- 溝の口: "下作延 near the station" is 下作延1丁目 and 2丁目 (centres about 0.4 km from the station; 3丁目 to 7丁目 are 0.7 to 1.3 km away). 二子 stays out, as briefed. The station's `area_name_ja` is 溝口2丁目 (東急's address, 溝口2-1-1); the station point of the check falls in 溝口1丁目, as JR's side of the station does.
- 溝の口: the ward office is kind `office` (the brief names it apart), with its 応急給水拠点 in `notes_ja`; the pilot board files 中原区役所 as `water_point`. The two 100 m3 tanks at 高津小学校 and 久本小学校 are notes on those shelters, not separate places. Six of the eleven 一時滞在施設 of the 武蔵溝ノ口駅 group are in, the ones at the station; the rest are listed in `docs/BOARDS.md`.
- 上野: 台東区 assigns shelters per 町会. Target areas come from joining 資料第127 (町会 per shelter) with the 町会区域一覧表 (町丁目 and 番地 per 町会), with "の一部" where a 町丁目 is split. Two inconsistencies between 資料第126 and 127 are written down in `docs/BOARDS.md` (仲御徒町中町会, 長者町一丁目 and 上野南大門町).
- 上野: no 一時集合場所 in the seed: the ward re-checked them with every 町会 for the 防災地図 of 2026-05, which was not read, so the 2024 list may be stale. 上野恩賜公園 is two places, the 避難場所 (park, no address) and the water station (上野公園8-51), with aliases that do not overlap. 京成上野 is an alias of 上野駅 as briefed, its own address in `notes_ja`.
- `supabase/seed/boards.json`'s `_note` names the sources of the first two boards only; it is one line that both board sessions would edit, so it was left as it is and `docs/BOARDS.md` carries the sources.

**Code**
- `supabase/seed/boards.json`: the two boards appended at the end; nothing else in the file changed (the diff is insertions only).
- `lib/geo/mizonokuchi.json` (14 features, 11,588 bytes) and `lib/geo/ueno.json` (17 features, 12,080 bytes) by `scripts/geo/build.ts --board <slug>` from the e-Stat 2020 Shapefiles `code=14134` (zip 70 KB, `r2ka14134.shp`, 75 small areas) and `code=13106` (zip 46 KB, `r2ka13106.shp`, 108 small areas); every name matched one record; 30% simplification. The Shapefiles were deleted.
- `lib/geo/polygons.ts`: one import and one `BY_SLUG` line per board (checklist step 4; the brief's file list did not name this file, but the board has no polygons without it). `lib/geo/index.ts`: `14134` 川崎市高津区 and `13106` 東京都台東区 in `MUNICIPALITY_JA`.
- `scripts/check-boards.ts`: expectations for both boards (溝の口駅 35.5996, 139.6106 in 溝口1丁目; 上野駅 35.7141, 139.7774 in 上野7丁目). The cross-board block compared only the first two boards; it now checks every pair for shared polygons and each board's landmark against every other board.
- Found on the way, not fixed (outside this PR's files): `scripts/geo/build.ts --write-seed` replaces the one-line form `{ "code": null, "name_ja": <name> }`, but `boards.json` is now laid out one field per line, so it reported "0 area codes filled". The codes were filled from the generated polygon files instead (same codes, by name). A follow-up can make the script parse the JSON.

## 2026-11-05 (Thu), boards: 札幌 大通 and 博多 (data, polygons, seed)

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day7-boards-west`, cut from `main` at `d89e1b3`) while another session built the 高津区 and 上野 boards in the same files. Two research subagents (same model), one per city, read the official pages and wrote their findings outside the repository; four of the key pages were then read again by hand (Sapporo's 中央区 shelter list and 一時滞在施設 list, Fukuoka's shelter list and 防災メール page) and matched. No Claude API call was added or changed. The database was neither read nor written: the integrator seeds after review. A usage limit stopped the session once midway; the work resumed from its local commit.

**The boards**

| slug | name (ja, en, zh, ko, vi) | areas | polygons | landmark |
|---|---|---|---|---|
| `sapporo` | 札幌 大通, Sapporo Odori, 札幌 大通, 삿포로 오도리, Sapporo Odori | 45 条丁目 of 札幌市中央区 (`01101`) | `lib/geo/sapporo.json`, 12,820 bytes | 大通駅 (43.0607, 141.3538): 大通西2丁目 |
| `hakata` | 博多, Hakata, 博多, 하카타, Hakata | 13 町丁目 of 福岡市博多区 (`40132`) | `lib/geo/hakata.json`, 9,252 bytes | 博多駅 (33.5897, 130.4207): 博多駅中央街 |

Both mode `peace`. Codes, the source of every place and what was left out are in `docs/BOARDS.md`.

**Decisions, open for review**
- **Sapporo has 45 areas, not 10 to 16.** The brief expected e-Stat to group blocks; it does not: every 条丁目 block is its own small area (990 in 中央区). The brief's list (北一条西 to 北五条西, 大通西, 南一条西 to 南三条西, each 1丁目 to 5丁目) is kept whole: 12.8 KB of polygons, and the board is 0.9 km by 1.4 km, smaller than 博多's 13 町丁目 (1.9 km by 1.9 km). The narrower choice would be 西2丁目 to 西4丁目 only (27 areas). Area names follow e-Stat with the last numeral as a digit (北一条西1丁目), which is what `scripts/geo/build.ts` matches; the home page folds them to 北一条西, 北二条西 and so on.
- **Sapporo shelters.** The city's 中央区 list gives name and address only and assigns no area, and no 指定避難所 or 指定緊急避難場所 lies inside the 45 blocks. The seed carries the two nearest 基幹避難所 (資生館小学校 south west, 中央中学校 east of 創成川) without `target_areas_ja`, the 一時避難場所 赤レンガ庁舎前庭 next to the board, and 大通公園 with `verified: false` (the city designates "every park" and never names it). The winter rule is not a per-shelter closure: earthquake sites must be indoors because of "寒さ・積雪等の冬季条件", and the city tells people in a winter earthquake to go quickly to a designated 小中学校; that sentence is in the notes of both shelters and both parks.
- **Sapporo water.** No 応急給水 point lies inside the board; the 藻岩第1緊急時給水管路 runs under 西6丁目, one block west, with an outlet at almost every block. Four outlets are seeded (北5条, 北1条, 大通, 南3条); the others are listed.
- **Sapporo stations.** 札幌駅 is one place for JR and the subway's さっぽろ駅 (南北線 N06, 東豊線 H07), without an address and without JR line aliases: neither JR北海道 nor the 交通局 publishes either in text. The JR building is in 北区, so the one-ward rule keeps it off the board's polygons; the subway concourse (北4条西4丁目) and the station's south side are inside. The two concourses are also seeded as `commuter_shelter` places, since the city lists them as 一時滞在施設.
- **Hakata target areas come from the school zones.** 福岡市 says it opens whichever shelters are safe and assigns none. `target_areas_ja` follows the 通学区域 list (令和8年4月1日現在): 堅粕小 for 博多駅前2丁目, 博多駅中央街, 博多駅東 and most of 博多駅前1丁目; 博多小 for the rest of 1丁目; 東住吉小 and 東住吉中 for 博多駅前3丁目, 4丁目 and 博多駅南; 住吉小・中 for 住吉. Each shelter's notes say the mapping is ours. The per-hazard notes are the city's own (堅粕小学校 浸水時は使用不可, 東住吉中学校 2階以上, and so on), and 東光中学校 is seeded because it is the nearest indoor site that stays usable in a flood for the 堅粕小 zone.
- **Hakata water.** The 水道局 names no walk-up supply point; water comes at opened shelters (仮設水槽, 応急給水栓) or by truck. The one named facility near the station is the 給水基地 at the 水道局本庁舎 (博多駅前1丁目28-15), where trucks are filled; it is seeded as `water_point` with notes that say exactly that. Leaving it out is the alternative.
- **Hakata station aliases** carry the bare line names 鹿児島本線, 山陽新幹線, 九州新幹線, 地下鉄空港線 and 地下鉄七隈線, as briefed: a notice about a line's suspension then lands on the station. JR line names come from maps, not from JR's pages (JR九州's page lists none, JR西日本's returned 404), as with 東急 and 京王 for 渋谷.
- 福岡市役所 is in 中央区, so its `address_ja` is the full 福岡市中央区天神1丁目8番1号, which the map search uses as it is instead of putting 福岡市博多区 in front.

**Sources, all read 2026-11-05**

| city | source | as of | used for |
|---|---|---|---|
| 札幌 | 避難場所等（中央区） https://www.city.sapporo.jp/kikikanri/higoro/hinan/cyuuou.html | 更新日 2026-06-30 | shelters, types, hazard flags |
| 札幌 | 一時滞在施設 https://www.city.sapporo.jp/kikikanri/torikumi/itizitaizaishisetsu.html | 更新日 2026-03-06, list 令和6年8月現在 | nine 一時滞在施設 |
| 札幌 | 水道局 拠点給水施設 https://www.city.sapporo.jp/suido/riyosya/saigai/torikumi/oukyu/index.html | 更新日 2024-06-14 | 給水口 No.6, 8, 10, 13 |
| 札幌 | 避難場所基本計画 (PDF) and 避難の心得 https://www.city.sapporo.jp/kikikanri/higoro/iza/kokorohe.html | 令和元年改定; 更新日 2024-02-13 | the winter rule |
| 札幌 | 交通局 timetable pages; JR北海道 station CSV | 2026-08-01 and 2016-07-25; Last-Modified 2026-11-02 | station numbers and lines |
| 札幌 | portal JSON, city RSS, LINE, そなえ, X pages | see `docs/BOARDS.md` | broadcast channels and feeds |
| 福岡 | 指定緊急避難場所及び指定避難所一覧 https://www.city.fukuoka.lg.jp/bousai/shiteihinannbasyooyobishiteihinannjyoitirann.html and its 博多区 PDF | 更新日 2024-08-28; PDF R5.5.1現在 | shelters, parks, per-hazard notes |
| 福岡 | 通学区域 https://www.city.fukuoka.lg.jp/kyoiku-iinkai/tsuugaku/ed/area/tsugaku.html | 更新日 2026-10-27, lists 令和8年4月1日現在 | target areas |
| 福岡 | 帰宅困難者対策について https://www.city.fukuoka.lg.jp/bousai/bousaibooklist_2.html and the 一時滞在施設 agreements PDF | 更新日 2026-07-23; 令和8年3月末時点 | six 一時滞在施設 |
| 福岡 | 水道局 災害時の対応 https://www.city.fukuoka.lg.jp/mizu/h_chosei/life/0043_2_2.html; 市議会 document 2024-03-14 | 更新日 2026-07-24 | the 給水基地 |
| 福岡 | 地下鉄 博多駅 https://subway.city.fukuoka.lg.jp/eki/stations/hakata.php; 博多区役所 access page | none shown; 更新日 2026-09-01 | station, ward office |
| 福岡 | 防災メール https://www.city.fukuoka.lg.jp/shimin/b_suishin/bousai/bousaimail.html, LINE, ツナガル+, 防災気象情報, 福岡県 防災行政無線 table | 更新日 2026-02-24 and others | broadcast channels and feed |

The PDFs were downloaded into their own scratch folders, read there and deleted.

**Code**
- `lib/geo/polygons.ts`: one import and one `BY_SLUG` line per board, after `shibuya` (not in the brief's file list, but without it neither board has polygons and `check:boards` fails). `MUNICIPALITY_JA`: `01101` 札幌市中央区 and `40132` 福岡市博多区 at the bottom.
- `scripts/check-boards.ts`: `EXPECT` entries for both boards at the end (prefectures `01` and `40`), and a per-board check that the landmark resolves to nothing on every other board. The 高津区 and 上野 session is replacing the bottom "first and second share no polygon" block with an all-pairs version plus the same landmark check, so whichever PR merges second can drop the in-loop one.
- No new place kind and no new message key: the six kinds cover both boards.

**Acceptance**

| check | result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm guard --all` | clean |
| `pnpm check:boards` | 58 of 58 (4 boards; 溝の口駅 resolves to `14134401101` 溝口1丁目 and 上野駅 to `13106004007` 上野7丁目, each in no other board; no two boards share a polygon) |
| `pnpm check:places`, `check:mode`, `check:inbox`, `check:placeholders` | 28 of 28, 34 of 34, 23 of 23, 17 of 17 |
| `pnpm build` | compiled in 3.5 s, 12 static pages; no area code of the new boards in `.next/static`, only in server chunks |
| `lib/geo/mizonokuchi.json` | 14 features, 11,588 bytes |
| `lib/geo/ueno.json` | 17 features, 12,080 bytes |
| local `pnpm dev` | not run: the boards are not seeded and the production database must not be written |

`pnpm db:seed --dry-run --board mizonokuchi`:

| `pnpm check:boards` | 53 of 53 (four boards) |
| `pnpm check:places`, `check:mode`, `check:inbox`, `check:placeholders` | pass |
| `pnpm build` (once) | compiled in 3.3 s, 12 static pages; no area code of either board in `.next/static`, only in server chunks |
| `lib/geo/sapporo.json` | 45 features, 12,820 bytes |
| `lib/geo/hakata.json` | 13 features, 9,252 bytes |
| 大通駅 (43.0607, 141.3538) through `resolveArea` | `01101210002` 大通西2丁目; no other board |
| 博多駅 (33.5897, 130.4207) through `resolveArea` | `401320020` 博多駅中央街; no other board |
| `pnpm db:seed --dry-run --board sapporo` and `--board hakata` | below |
| local `pnpm dev` | not run: neither board is seeded and the production database must not be written |

`pnpm db:seed --dry-run --board sapporo`:

```
dry run: nothing is written and the database is not read, so each board shows both outcomes.

board mizonokuchi
  if absent:  insert slug, name, mode peace, listed true, area_names, known_places, a new admin token; 0 sample cards
  if present: update name, area_names, known_places; mode, listing, token and cards unchanged
  name: 溝の口 / Mizonokuchi / 沟之口 / 미조노쿠치 / Mizonokuchi
  area_names: 14, 14 with an e-Stat code
    14134401101  溝口1丁目
    14134401102  溝口2丁目
    14134401103  溝口3丁目
    14134401104  溝口4丁目
    14134401105  溝口5丁目
    14134401106  溝口6丁目
    14134411001  久本1丁目
    14134411002  久本2丁目
    14134411003  久本3丁目
    14134410001  坂戸1丁目
    14134410002  坂戸2丁目
    14134410003  坂戸3丁目
    14134412101  下作延1丁目
    14134412102  下作延2丁目
  known_places: 20 (shelter 9, water_point 2, station 1, office 1, commuter_shelter 6, park 1), verified 20
    takatsu-es  shelter  川崎市立高津小学校  溝口4-19-1
    nishitakatsu-jhs  shelter  川崎市立西高津中学校  久地1-10-1
    shimosakunobe-es  shelter  川崎市立下作延小学校  下作延5-19-1
    takatsu-jhs  shelter  川崎市立高津中学校  久本3-11-2
    hisamoto-es  shelter  川崎市立久本小学校  久本3-11-3
    takatsu-hs  shelter  川崎市立高津高等学校  久本3-11-1
    higashitakatsu-jhs  shelter  川崎市立東高津中学校  末長4-1-1
    sakado-es  shelter  川崎市立坂戸小学校  坂戸1-18-1
    nishikajigaya-es  shelter  川崎市立西梶ヶ谷小学校  梶ヶ谷2-14-1
    mizonokuchi1-water  water_point  溝口1丁目 応急給水拠点  溝口1-6-7
    mizonokuchi5-water  water_point  溝口5丁目 応急給水拠点  溝口5-24
    mizonokuchi-sta  station  溝の口駅
    takatsu-ward-office  office  高津区役所  下作延2-8-1
    takatsu-shiminkan  commuter_shelter  川崎市高津市民館  溝口1-4-1
    nocty1  commuter_shelter  ノクティ１ビル  溝口1-3-1
    hotel-mets-mizonokuchi  commuter_shelter  ホテルメッツ溝ノ口  溝口1-1-5
    tecno-kawasaki  commuter_shelter  川崎市生活文化会館（てくのかわさき）  溝口1-6-10
    scrum21  commuter_shelter  川崎市男女共同参画センター（すくらむ２１）  溝口2-20-1
    kawasaki-daiichi-hotel  commuter_shelter  川崎第一ホテル溝ノ口  溝口2-3-12
    midorigaoka-cemetery  park  緑ケ丘霊園
```

`pnpm db:seed --dry-run --board ueno`:

board sapporo
  if absent:  insert slug, name, mode peace, listed true, area_names, known_places, a new admin token; 0 sample cards
  if present: update name, area_names, known_places; mode, listing, token and cards unchanged
  name: 札幌 大通 / Sapporo Odori / 札幌 大通 / 삿포로 오도리 / Sapporo Odori
  area_names: 45, 45 with an e-Stat code
    01101790501  北五条西1丁目
    01101790502  北五条西2丁目
    01101790503  北五条西3丁目
    01101790504  北五条西4丁目
    01101790505  北五条西5丁目
    01101790401  北四条西1丁目
    01101790402  北四条西2丁目
    01101790403  北四条西3丁目
    01101790404  北四条西4丁目
    01101790405  北四条西5丁目
    01101790301  北三条西1丁目
    01101790302  北三条西2丁目
    01101790303  北三条西3丁目
    01101790304  北三条西4丁目
    01101790305  北三条西5丁目
    01101790201  北二条西1丁目
    01101790202  北二条西2丁目
    01101790203  北二条西3丁目
    01101790204  北二条西4丁目
    01101790205  北二条西5丁目
    01101790101  北一条西1丁目
    01101790102  北一条西2丁目
    01101790103  北一条西3丁目
    01101790104  北一条西4丁目
    01101790105  北一条西5丁目
    01101210001  大通西1丁目
    01101210002  大通西2丁目
    01101210003  大通西3丁目
    01101210004  大通西4丁目
    01101210005  大通西5丁目
    01101690101  南一条西1丁目
    01101690102  南一条西2丁目
    01101690103  南一条西3丁目
    01101690104  南一条西4丁目
    01101690105  南一条西5丁目
    01101690201  南二条西1丁目
    01101690202  南二条西2丁目
    01101690203  南二条西3丁目
    01101690204  南二条西4丁目
    01101690205  南二条西5丁目
    01101690301  南三条西1丁目
    01101690302  南三条西2丁目
    01101690303  南三条西3丁目
    01101690304  南三条西4丁目
    01101690305  南三条西5丁目
  known_places: 21 (shelter 2, park 2, water_point 4, station 2, office 2, commuter_shelter 9), verified 20
    shiseikan-es  shelter  資生館小学校  南3条西7丁目1-1
    chuo-jhs  shelter  中央中学校  北4条東3丁目
    akarenga-garden  park  赤レンガ庁舎前庭  北3条西6丁目
    odori-park  park (unverified)  大通公園  大通西1丁目～12丁目
    water-n5w6  water_point  緊急時給水管路 給水口No.13  北5条西6丁目
    water-n1w6  water_point  緊急時給水管路 給水口No.10  北1条西6丁目
    water-odori-w6  water_point  緊急時給水管路 給水口No.8  大通西6丁目
    water-s3w6  water_point  緊急時給水管路 給水口No.6  南3条西6丁目
    odori-sta  station  大通駅
    sapporo-sta  station  札幌駅
    sapporo-city-hall  office  札幌市役所  北1条西2丁目
    chuo-ward-office  office  中央区役所  南3条西11丁目
    odori-concourse  commuter_shelter  地下鉄大通駅コンコース  大通西4丁目
    sapporo-concourse  commuter_shelter  地下鉄さっぽろ駅コンコース  北4条西4丁目
    chikaho  commuter_shelter  札幌駅前通地下歩行空間  北3条西3丁目～大通西3丁目
    aurora-town  commuter_shelter  さっぽろ地下街オーロラタウン  大通西1丁目～3丁目
    pole-town  commuter_shelter  さっぽろ地下街ポールタウン  南1条西3丁目～南4条西3丁目
    apia  commuter_shelter  アピア  北5条西3丁目～4丁目
    stellar-place  commuter_shelter  札幌ステラプレイス  北5条西2丁目
    tv-tower  commuter_shelter  さっぽろテレビ塔  大通西1丁目
    sapporo-community-plaza  commuter_shelter  札幌市民交流プラザ  北1条西1丁目
```

`pnpm db:seed --dry-run --board hakata`:

```
dry run: nothing is written and the database is not read, so each board shows both outcomes.

board ueno
  if absent:  insert slug, name, mode peace, listed true, area_names, known_places, a new admin token; 0 sample cards
  if present: update name, area_names, known_places; mode, listing, token and cards unchanged
  name: 上野 / Ueno / 上野 / 우에노 / Ueno
  area_names: 17, 17 with an e-Stat code
    13106004001  上野1丁目
    13106004002  上野2丁目
    13106004003  上野3丁目
    13106004004  上野4丁目
    13106004005  上野5丁目
    13106004006  上野6丁目
    13106004007  上野7丁目
    13106003001  東上野1丁目
    13106003002  東上野2丁目
    13106003003  東上野3丁目
    13106003004  東上野4丁目
    13106003005  東上野5丁目
    13106003006  東上野6丁目
    131060060  上野公園
    13106013001  上野桜木1丁目
    13106013002  上野桜木2丁目
    13106005001  池之端1丁目
  known_places: 18 (shelter 8, water_point 1, park 2, station 1, office 1, commuter_shelter 5), verified 18
    kuromon-es  shelter  黒門小学校  上野1-16-20
    okachimachi-taito-jhs  shelter  御徒町台東中学校  台東4-13-16
    ueno-es  shelter  上野小学校  東上野6-16-8
    taito-rojin-center  shelter  老人福祉センター  東上野2-25-14
    higashiueno-kuminkan  shelter  東上野区民館  東上野3-24-6
    shinobugaoka-jhs  shelter  忍岡中学校  上野公園18-20
    ueno-jhs  shelter  上野中学校  上野桜木1-14-55
    shinobugaoka-es  shelter  忍岡小学校  池之端2-1-22
    ueno-park-water  water_point  上野恩賜公園 災害時給水ステーション  上野公園8-51
    ueno-park  park  上野恩賜公園
    yanaka-cemetery  park  谷中墓地
    ueno-sta  station  上野駅
    taito-city-office  office  台東区役所  東上野4-5-6
    tokyo-bunka-kaikan  commuter_shelter  東京文化会館  上野公園5-45
    tobikan  commuter_shelter  東京都美術館  上野公園8-36
    ueno-green-salon  commuter_shelter  上野グリーンサロン  上野公園7-47
    ueno-hs  commuter_shelter  都立上野高等学校  上野公園10-14
    ueno-chuo-parking  commuter_shelter  上野中央通り地下駐車場  上野2-13先
```

**For the integrator.** After the merge has deployed: `pnpm db:seed --board mizonokuchi --token-file .env.admin-token.local` and `pnpm db:seed --board ueno --token-file .env.admin-token.local` (each creates its board listed and writes its admin token to that file; no other board is touched). Then the inbox: the Email Worker `engawa-inbox` posts each Kawasaki mail to both 武蔵小杉 and 溝の口, and learns `bousai-ueno@engawaboard.com` for 上野 (`docs/BOARDS.md` has the steps and the human parts).

**Needed a human**
- Native read of the Chinese, Korean and Vietnamese place names of both boards.
- 溝の口 inbox: generate the secret on `/b/mizonokuchi/admin` and set the allowed sender `kawasaki@sg-p.jp`; decide whether a mail about one ward may switch the other ward's board to disaster mode.
- 上野 inbox: the two Gmail steps for たいとう防災気象情報メール, then the sender from the first mail.

board hakata
  if absent:  insert slug, name, mode peace, listed true, area_names, known_places, a new admin token; 0 sample cards
  if present: update name, area_names, known_places; mode, listing, token and cards unchanged
  name: 博多 / Hakata / 博多 / 하카타 / Hakata
  area_names: 13, 13 with an e-Stat code
    40132001001  博多駅前1丁目
    40132001002  博多駅前2丁目
    40132001003  博多駅前3丁目
    40132001004  博多駅前4丁目
    401320020  博多駅中央街
    40132003001  博多駅東1丁目
    40132003002  博多駅東2丁目
    40132003003  博多駅東3丁目
    40132004001  博多駅南1丁目
    40132004002  博多駅南2丁目
    40132008001  住吉1丁目
    40132008002  住吉2丁目
    40132008003  住吉3丁目
  known_places: 26 (shelter 9, park 7, water_point 1, station 1, office 2, commuter_shelter 6), verified 26
    katakasu-es  shelter  堅粕小学校  博多駅東1丁目8-1
    katakasu-kominkan  shelter  堅粕公民館・老人いこいの家  博多駅東1丁目8-2
    toko-jhs  shelter  東光中学校  東光2丁目15-1
    higashisumiyoshi-es  shelter  東住吉小学校  博多駅南2丁目6-1
    higashisumiyoshi-jhs  shelter  東住吉中学校  博多駅南2丁目5-1
    higashisumiyoshi-kominkan  shelter  東住吉公民館・老人いこいの家  博多駅前4丁目11-12
    sumiyoshi-school  shelter  住吉小学校・中学校  美野島3丁目22-7
    sumiyoshi-kominkan  shelter  住吉公民館  住吉5丁目6-1
    hakata-es  shelter  博多小学校  奈良屋町1-38
    dekimachi-park  park  出来町公園  博多駅前1丁目
    fujita-park  park  藤田公園  博多駅前2丁目
    meiji-park  park  明治公園  博多駅前3丁目
    toryo-park  park  東領公園  博多駅前4丁目
    ninjin-park  park  人参公園  博多駅前4丁目
    nakahie-park  park  中比恵公園  博多駅東2丁目
    otowa-park  park  音羽公園  博多駅南1丁目
    waterworks-hq  water_point  福岡市水道局本庁舎（給水基地）  博多駅前1丁目28-15
    hakata-sta  station  博多駅  博多駅中央街
    hakata-ward-office  office  博多区役所  博多駅前2丁目8-1
    fukuoka-city-hall  office  福岡市役所  福岡市中央区天神1丁目8番1号
    hakata-underground  commuter_shelter  博多駅地下街  博多駅中央街1-1
    jrjp-hakata  commuter_shelter  JRJP博多ビル  博多駅中央街8-1
    kitte-hakata  commuter_shelter  KITTE博多  博多駅中央街9-1
    kamiyo-hakata-chuo  commuter_shelter  紙与博多中央ビル  博多駅中央街7-21
    connect-square  commuter_shelter  コネクトスクエア博多  博多駅東1丁目17-1
    hakata-east-terrace  commuter_shelter  博多イーストテラス  博多駅東1丁目18-33
```

**Broadcasts.** Neither city has 同報系 loudspeakers with published text (Sapporo's 防災行政無線 is a 260 MHz link between offices and shelters; 福岡県's table lists only a 移動系 system for 福岡市). `docs/BOARDS.md` has each city's channels:
- **Hakata** has the easy route: 福岡市防災メール registers by empty mail to `t-fukuoka-city@sg-p.jp`, the same delivery service as Kawasaki's, so the Gmail and Worker steps of `docs/INBOX.md` apply as they are.
- **Sapporo** has no mail service at all. Its portal runs on undocumented JSON lists (`emergency.json`, `evacorder.json` and others) whose shape is written down for a generalized poller: one list per file, a numeric id, a last-updated time.

**For the integrator.** After the merge has deployed:

    pnpm db:seed --board sapporo --token-file .env.admin-token.local
    pnpm db:seed --board hakata --token-file .env.admin-token.local

Each creates its board listed, with no sample cards, and writes its admin token to that file. No other board is touched.

**Needed a human**
- Whether Sapporo keeps all 45 blocks or narrows to 西2丁目 to 西4丁目.
- Whether Hakata's school-zone `target_areas_ja` and the 水道局 給水基地 as a `water_point` stay.
- Native read of the Korean and Vietnamese place names (Sapporo's water outlets read "Kita 5 Nishi 6" in Latin letters).
- Hakata inbox: subscribe the Gmail to 福岡市防災メール with 緊急情報 only, forward to `bousai-hakata@engawaboard.com`, take the allowed sender from the first mail.
- Sapporo inbox: whether to ask 札幌市危機管理局 about polling the portal's `emergency.json` and `evacorder.json`.

**Review fixes for PRs #37 and #38 (Fable, reviewing session, on the boards integration branch):** `boards.json` was rebuilt from both branches since git interleaved the two appended board objects; the Ueno candidate facility that may not open says so in its `notes_ja`; the 溝の口 section marks the city mail's ward coverage and the unread 高津区 closure page as not confirmed; `docs/INBOX.md` says one forwarder address may fan a mail out to several boards of one city, each with its own secret; the Hakata 水道局本庁舎 is an `office`, not a water point, with the bare 水道局 aliases dropped so a 断水 notice is never pinned to the truck base; five Sapporo addresses give one 丁目 instead of a range; the duplicated in-loop landmark check is gone in favour of the all-pairs block (93 checks); undated footer sources say so; the seed note points at `docs/BOARDS.md`.

## 2026-11-05 (Thu) early morning, README final, README.ja, about maintenance model, review follow-ups

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day7-readme`, cut from `main` after PR #33), brief from the reviewing session (Fable). Another session worked on web push at the same time; none of its files (`public/sw.js`, `app/api/push/**`, `lib/push/**`, `components/board/PushOptIn.tsx`, migration 0010, `lib/db/cards.ts`, `lib/pipeline.ts`, `components/board/BoardView.tsx`) were touched. No prompt, schema or model changed. Claude calls spent: one text drop-in (extract and translate; reconcile had no candidates). The 42 questions of the ask check went to boards without cards, which the route answers in code.

**Done**
- `README.md` rewritten against the live site: who it is for, the two boards, a two minute walk through the live board, the demo with disaster mode and the places view, the pipeline and what code validates, the three ways the city's broadcasts come in, disaster mode, which model did what with the measurement behind each choice (from this log and `docs/EVAL.md`), the Claude Code setup, the latest eval, what needed a human, privacy in six lines, local setup (migrations 0001 to 0009, the seed per board, the throwaway board script), documents, test material, and the two-layer model after the event. 124 lines.
- `README.ja.md`: the same for a Japanese judge, written in Japanese rather than translated line by line, with the UI's own Japanese labels (お知らせを入れる, サンプルで試す, 一覧 and 場所別, 6言語のお知らせを印刷, 情報源 3件). Ranges use から, as the UI does, not the wave dash. Each README links to the other at the top.
- About page, "After the event": five paragraphs in five languages instead of one. The two layers (a platform operator who creates boards, wires each city's broadcasts once, runs the migrations and keeps the shared rules; a local owner per board, such as a 自治会, a building manager or a ward office desk, holding that board's admin link to confirm, hide and switch the mode), what a new city costs (data, not code; `docs/BOARDS.md`), and what is not there yet (one operator, one admin token for every board, per-board admin links next). `about.after_body` rewritten in place, four keys appended at the end of the five message files.
- Follow-up (a), view cookie: `useBoardView` mirrors the List or Places choice in the `engawa_view` cookie next to localStorage, and copies a choice stored before the cookie existed. The board page renders `?view=` first, then the cookie, then the list (`boardViewFor` in `lib/cards/places.ts`, three checks in `pnpm check:places`, 31 of 31).
- Follow-up (b), proxy: `proxy.ts` runs on every page request (API routes, `_next/` and paths with a file extension excepted), so a client-sent `x-engawa-link-lang` is always dropped and only a valid `?lang=` sets it. No API route reads the header (grep of `getRequestLang` and `getLinkLang`).
- Follow-up (c), one limiter: `lib/rate-limit.ts` (`slidingWindow`, `overAny`, `clientIp`, `rateLimited`) replaces the two copies in the ask and reaction routes. Reactions keep 30 taps a device and 60 an address per hour. Ask keeps 6 a minute and adds 20 an hour, keyed by the device id (now `isUuid` and lower case) or by the address without one; a refused question uses up neither window. Every in-memory 429 is `{error: "rate_limited", scope, limit_per_minute | limit_per_hour}` with `Retry-After` set to the window. `useAsk` shows `limit.ask_hour` (appended to the five files) for the hourly one. `docs/PRIVACY.md` says which counters exist.
- Follow-up (d), mode rule: `emergencyTerm` tests the Japanese body and the source excerpt for 訓練 and 想定 as well as the title, except where a real order uses them: 訓練ではありません, 洪水浸水想定区域, 浸水が想定される, 想定最大規模, 想定を超える. 解除 stays a title word, since an order can say 解除されるまで. Seven checks in `pnpm check:mode`, 41 of 41; `docs/INBOX.md` updated.

**Acceptance** (dev server on port 3741 against the shared Supabase project; throwaway boards `readme-acceptance` and `readme-view`, both deleted afterwards: 1 card, 1 card_sources, 1 submission, 1 device, 0 storage objects in all; the live boards were only read)

| check | result |
|---|---|
| README links | 18 relative links and 18 backticked paths in each README resolve in the repository; the four engawaboard.com URLs answer 200; read back in full |
| README.ja.md | read back; UI labels checked against `ja.json` (thirteen corrected from the first draft, such as 文章としてコピー and 情報源 3件) |
| about page, 390 px and 1280 px, ja and en | five paragraphs at 16 px, no text under 16 px on the page, no sideways scroll (scroll width 390 and 1280), a 640 px column at 1280; zh, ko and vi server HTML carry the five paragraphs |
| view cookie | built-in browser on `readme-view` (one `t02` card, create in 17 s): Places tapped, `document.cookie` holds `engawa_view=places`, localStorage `places`, URL `?view=places`. Fresh curl of the plain URL with that cookie: `aria-pressed="true"` on Places, `false` on List, the place group in the server HTML; without the cookie List is pressed; `?view=list` with the cookie renders List |
| proxy | no `?lang=`, `x-engawa-link-lang: vi`, Accept-Language en: `<html lang="en">` (before this change the header won); `?lang=zh` with the header vi: zh; `?lang=fr`: en; the home page drops the header too; `/icon.svg` 200 untouched |
| ask, 21 questions from one device | sent 10.5 s apart so the minute window never filled: 20 answered 200, the 21st 429 `{"error":"rate_limited","scope":"device","limit_per_hour":20}` with `Retry-After: 3600`; another device right after: 200 |
| ask, the board's message | the browser's own device id given 20 questions by curl, then a suggested question tapped on the board: "You have asked many questions in the last hour. Please try again later. You can still read every card." |
| reactions after the refactor | one device, 31 taps alternating POST and DELETE: 30 times 200, the 31st 429 `{"error":"rate_limited","scope":"device","limit_per_hour":30}` with `Retry-After: 3600` and `Cache-Control: no-store`; a malformed card id 404 |
| `pnpm check:mode`, `check:places` | 41 of 41, 31 of 31 |
| `pnpm typecheck`, `lint`, `guard --all`, `build` | clean (build once at the end) |

**Decisions taken in this session, open for review**
- `VIEW_COOKIE` sits in `lib/cards/places.ts` beside `parseBoardView`, which the server page and the client hook already share, rather than in `lib/i18n/server.ts`: the client writes it, and it is not about language. The page reads it with `cookies()`. A reader whose choice is only in localStorage still sees one switch after hydration on the first visit after the deploy; the cookie is written then.
- Ask has no per-address limit beyond the fallback key: phones on a carrier's shared address would block each other, and the browser always sends a device id. A script that rotates device ids still meets the daily Claude call cap.
- The ask minute 429 now carries `scope` and `limit_per_minute` where it carried `error` only; the client reads the status and `limit_per_hour`.
- The mode exceptions: without them, a real Kawasaki evacuation order naming 多摩川の洪水浸水想定区域 would never switch the board.
- README: the Shibuya poller is described as built and tested with the ward's consent first, not as live; the guard hook is described by what it does. This session started outside the worktree, so Claude Code did not load the worktree's hook settings; `pnpm guard` ran by hand on every file written.
- The about page heading stays "After the event".

**Needed a human**
- Review and merge (Fable). Nothing new in Vercel or the database.
- `docs/PLAN.md` line "README final ... README.ja.md; the about page's two-layer maintenance model" under 11/05 is for the reviewing session to tick.
- The Korean and Vietnamese `about.after_*` and `limit.ask_hour` strings are mine, for the 11/06 read.

## 2026-11-05 (Thu), web push for official and danger cards

Model: `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (`day7-push`, cut from `main` after PR #33), brief from the reviewing session (Fable). Pipeline models unchanged. Another session worked at the same time on the READMEs, `components/about/**`, `proxy.ts`, `lib/rate-limit.ts`, the ask route, `useBoardView.ts` and `lib/cards/mode.ts`; none of those were touched.

Why: a board only helps a reader who opens it. After a quake or an evacuation order the reader should not have to keep reloading: the city's notices and danger reports should reach the phone, in the reader's language, the moment they are on the board.

**What was done**
- Table: migration `0010_push_subscriptions.sql`, one row per board and browser (`board_id`, `device_id`, `endpoint`, `p256dh`, `auth`, `lang`, `created_at`, `last_used_at`, `purge_after` 90 days after the last use), RLS on with no policies, cascade with the board. The only index is the unique `(board_id, endpoint)`, which serves every query. `lib/db/push.ts` reads and writes it; without the table every call answers "missing" and nothing throws (`42P01`, `PGRST205`). A count with `head: true` on a missing table answers 204 with no error at all, so nothing there counts with `head`. The purge job deletes rows past `purge_after` and treats a missing table as nothing to purge. The human applied 0010 to the shared database during this session.
- Rules (`lib/push/rules.ts`, pure): a card alerts when it is public and either `official` in `danger`, `official_notice`, `shelter` or `water`, or `danger` from the loudspeaker input or the official inbox (platform `loudspeaker` or `city_mail`). It alerts on a new version only: a create, an update, or a merge that raised the card's source (a neighbour's card the city now confirms, a loudspeaker transcript replaced by the city's text, flagged by `mergeIntoCard` as `raised`). A plain merge, a conflict or a hold sends nothing, so a second photo of the same notice never alerts twice. The payload is the title in the subscriber's language with the board's fallback (English, then Japanese, while translate is still running), the first line of the body cut at 160 characters, `/b/<slug>/c/<id>?lang=<lang>`, tag `card-<id>`, the 192 icon and a BCP 47 `lang` so Chinese and Japanese get their own glyphs. The route accepts endpoints of the four browser push services only (FCM, Mozilla, Apple, WNS; https, no port, no credentials), because the server posts to every stored endpoint; and only a 65 byte P-256 point and a 16 byte secret as keys. `pnpm check:push`: 52 checks.
- Sending (`lib/push/send.ts`, `web-push` 3.6.7): VAPID from `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`lib/push/config.ts`; all three present and well formed, or push is off and nothing is sent or stored). Ten messages in flight at a time, a 10 second timeout, TTL 12 hours, urgency high, a Topic header per card so the push service replaces an undelivered earlier version. 404 and 410 delete the row; a delivery moves `last_used_at` and `purge_after`. One log line per send with counts only.
- Pipeline: the send starts right after reconcile, before the masked copy, the finish and translate, and runs beside them; `runPipeline` waits for it in its `finally`, after the last event, so the function stays alive until the push services answered without moving `done`. Cards written before a later step fails still alert.
- Mode: `lib/db/mode.ts` sends "Disaster mode on <board>" (`push.mode_title`, `push.mode_body`, tag `mode-<board id>`, link to the board with `?lang=`) when the admin or the inbox switches a board to disaster, from the request that won the conditional update, through `after()` with the promise already running. The return to peace sends nothing.
- Routes: `POST /api/b/[slug]/push` `{device_id, lang, subscription}` and `DELETE` `{device_id, endpoint}`, rate limited like the react route (30 an hour per address, 20 per device, in memory; the window limiter is copied from the react route because `lib/rate-limit.ts` belongs to the other session), at most 5000 subscriptions per board (409 `board_full`), 404 `not_configured` when keys or the table are missing. `GET /api/b/[slug]/push/key` gives the public key or 404 `not_configured`, so no build bundles it.
- Board: `components/board/PushOptIn.tsx` under the cards heading of the list column: one 44 px "Get alerts" toggle with `aria-pressed` and a one line note (what it sends, how to turn it off, or "blocked in the browser's settings"). It renders nothing unless the browser has a service worker, `PushManager` and `Notification`, the page is online and the key route answers. A tap asks permission inside the gesture, subscribes through the offline worker and posts; a second tap deletes this board's row and drops the browser's subscription only when no other board in this browser still uses it (one subscription per site, one row per board). While on, it posts again when the reader's language changes and at most once a day, which keeps the row from expiring for a reader who visits. `public/sw.js` (VERSION 2) gains `push` (always shows a notification, `renotify` with the tag) and `notificationclick` (same origin only; focuses an open tab on that page or opens one).
- Admin page: an "Alerts" section with the count of devices per board, or "Alerts are off" when push is not configured. Nothing else about subscriptions leaves the server.
- 11 i18n keys at the top of the five message files (`push.*`, `admin.push_*`). `docs/PRIVACY.md`: an "Alerts (web push)" section and the retention row.

**Acceptance** (throwaway board `push-acceptance`, dev server on port 3127, a throwaway VAPID pair in the worktree's `.env.local`, removed after the run; Google Chrome 156 in a throwaway profile driven over the DevTools protocol; the built-in pane is Electron and has no push service)

| step | what | result |
|---|---|---|
| 1 | key route with keys set | 200 `{key}`; unknown board 404 `board_not_found` |
| 2 | tap in headless Chrome | headless denies the permission prompt by itself: the note says notifications are blocked, no subscription, no row |
| 3 | tap in headful Chrome (profile preferences allow notifications; the DevTools grant had no effect in this version) | subscription on fcm.googleapis.com, POST 200, one row, `purge_after` = `last_used_at` + 90 days, toggle pressed |
| 4 | reader switches to Japanese (`?lang=ja`) | one more POST, the same row now `ja`, no second row |
| 5 | the sample paper notice (`public/samples/notice.jpg`) | created an `official` `daily_notice` card (a planned building water stoppage): not an alert category, no send, no notification |
| 6 | `p02` water distribution notice | created `official` `water`; push started at reconcile, 1 delivered in 269 ms during the 9.0 s translate. Notification in Chrome: title 小杉小学校 体育館前（校庭側）で給水、本日14:00から16:00, body the card's first line, url `/b/push-acceptance/c/<id>?lang=ja`, tag `card-<id>`, lang `ja-JP`, icon `/icons/192`; `last_used_at` moved |
| 7 | `t03` secondhand WeChat text about a konbini | `secondhand` `shops` card: no send, no notification |
| 8 | admin route, disaster | the admin answer came first, then 1 delivered in 653 ms; notification 武蔵小杉（テスト push-acceptance）が災害時モードになりました, url `/b/push-acceptance?lang=ja`, tag `mode-<board id>` |
| 9 | admin route, back to peace | no send, no notification |
| 10 | admin page | "1 device gets alerts from this board." and nothing else about subscriptions |
| 11 | second tap | DELETE 200, row gone, browser subscription removed, toggle off |
| 12 | `p09` shelter rules notice | `official` `shelter` card, no subscription left: no send, no notification |
| 13 | gone endpoints: a local HTTPS mock push service answering 410 (row inserted directly, since the route refuses any host but the four push services) and the FCM endpoint unsubscribed in step 11 | admin switch to disaster: 2 subscriptions, 0 delivered, 2 gone in 234 ms, both rows deleted. The mock received TTL 43200, Urgency high, a 32 character Topic, `aes128gcm`, a VAPID authorization, 357 bytes |
| 14 | VAPID variables removed, server restarted | key route and POST 404 `not_configured`; the board page renders no control |
| 15 | board deleted | 4 storage objects, 5 card_sources, 5 cards, 5 submissions, 5 devices; 0 rows left in `push_subscriptions` |

Pipeline time with and without push (ms, from the process POST; "outside Claude" is the total minus extract, reconcile and translate):

| run | keys | subscriptions | total | extract | reconcile | translate | outside Claude | done to stream close |
|---|---|---|---|---|---|---|---|---|
| 5 `notice.jpg` | set | 1 (not an alert) | 21416 | 10490 | 167 | 8807 | 1952 | 0 |
| 6 `p02` | set | 1, sent | 19168 | 8442 | 273 | 9009 | 1444 | 0 |
| 7 `t03` text | set | 1 (not an alert) | 16272 | 9147 | 156 | 6564 | 405 | 1 |
| 12 `p09` | set | 0 | 23275 | 9265 | 151 | 12883 | 976 | 1 |
| 14 `p10` | unset | n/a | 20373 | 7070 | 146 | 11122 | 2035 | 0 |

The two runs right after a server start (5 and 14) carry about 2 s of route compiling in their stripping stage, with keys set and unset alike; the rest of the spread is Claude's own. The send never sat on the path to `done`: it ran during translate, and `done` to stream close stayed at 0 or 1 ms. 5 drop-ins, 10 Claude calls (no reconcile call: every card had no candidates).

Not exercised: tapping a notification (it is system UI; the handler is same origin only and was read, not driven), the inbox path of the mode notification (same `after()` call as the admin path, one line in `switchOnFromInbox`), and the Mozilla, Apple and Microsoft push services.

`pnpm check:push` 52 of 52, `pnpm typecheck`, `pnpm lint`, `pnpm guard --all` and `pnpm build` clean.

**Decisions taken in this session, open for review**
- Unique per `(board_id, endpoint)`, not `endpoint` alone as the brief said: a browser has one push subscription for the whole site, so with `endpoint` unique, turning alerts on for Shibuya would silently take them off Musashi-Kosugi.
- The endpoint allowlist: without it the server would POST to any URL a script registers, every time an official card lands.
- A merge that raised the card's source counts as a new version and alerts; a plain merge does not.
- Under the cards heading rather than inside the drop-in, which is a floating button on a phone and a drawer on a laptop; the control takes no space where push is off.
- The page refreshes an alert that is on once a day, so `purge_after` follows the reader's visits as well as deliveries; a reader who neither visits nor gets an alert for 90 days loses the row.
- `renotify` with the tag: an update to an alerted card alerts again rather than replacing the old one silently.
- The sample paper notice does not alert (step 5). Planned building water stoppages are `daily_notice`, and the brief's categories leave them out; worth a human look if the demo should show an alert from the sample.

**Needed a human**
- Migration 0010 (applied during this session).
- Before the merge: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (for example `mailto:` and a contact address) in the Vercel project, from `npx web-push generate-vapid-keys`. Without them the deploy behaves as today.

**Review fixes for PR #35 (Fable, reviewing session, on the integration branch):** the push send no longer holds the process stream or the inbox answer open: the pipeline hands it to `after()` and it runs on past the response within a 60 second budget, after which the remaining jobs are logged as not sent instead of crossing the function limit; `DELETE` removes a subscription by board, endpoint and the caller's device id, as the brief said; the board page passes a server-side `pushConfigured` flag so the alerts control asks for the public key only where the server holds VAPID keys (no extra request on every board load otherwise); the DEVLOG key count reads 11. Left as follow-ups: rows of other boards after a key rotation, one shared limiter for the push route, a comment on the count-then-upsert cap.

**Review fixes for PR #34 (Fable, reviewing session, on the integration branch):** the body rule for drills now matches the phrases that announce a drill or a scenario (訓練放送, 訓練です, 訓練を実施, 訓練のお知らせ, を想定し, 想定した訓練, 【訓練】) instead of a bare 訓練 or 想定 minus exceptions, which had turned real orders off (訓練ではございません, 訓練放送ではありません, 浸水が想定されている地域, 想定以上の降雨, a cancelled drill mentioned in passing); eight such cases are in `pnpm check:mode`, 49 of 49; the README's share sentence says the preview follows the sharer's language; the emergency word list in both READMEs names 避難命令; the migrations line no longer names a last number; the view preference falls back to the cookie when localStorage is unavailable so the URL still gets `?view=places`. Left as follow-ups: a hard cap on the limiter's key count, rows of other boards after a push key rotation.

## 2026-11-05 (Thu), home page: map highlights and callouts, language menu, leaner board cards

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day7-home-polish`), from a brief the reviewing session (Fable) wrote after the user looked at the home page with six boards. No pipeline, prompt or database change, no Claude calls.

**1. Every prefecture with a board highlighted the same way.** The old tint `--map-active` #f6dce7 was 1.04:1 against the land #ebe7de, so only 北海道, large enough for the eye to add it up, read as highlighted; 東京, 神奈川 and 福岡 did not. Now `--map-active` is #e2b1c5 (35 % accent on white), 1.50:1 on the land, with a 1.5 px accent outline (3.6:1 on the tint, 5.4:1 on the land), and `--map-active-hover` #d691ae (half the accent, 2.00:1 on the land) while the pointer rests on the prefecture or its callout, or the callout has keyboard focus. Inert prefectures are unchanged. The deeper tint is driven by state set from pointer events of a mouse or pen only (a touch has no hover) and cleared on leave, cancel, blur and on every selection, because the page scrolls away under a resting pointer and the browser then sends no leave.

**2. Callouts that never overlap** (`components/home/map-callouts.ts`, new; `components/home/JapanMap.tsx`). The callouts are HTML buttons over the SVG now, sized in rem, so their 16 px text and 44 px targets hold at every map width and follow the text size toggle; the outlines stay SVG and scale. For each prefecture with a board, the room around its label point (the distance to the nearest edge of its outline, worked out from the generated path) decides: room for the 24 px disc with 4 px clearance gives the round count badge there, as before; otherwise a pill with the prefecture's name in the reader's language (from `prefectures.ts`) and the count on a small accent disc, joined by a 1 px `--line-strong` leader to an accent dot at the label point. The placement routine tries right, then left, then above, then below, and takes the first spot inside the map that covers no badge, no other pill (8 px apart), no Okinawa inset and no highlighted prefecture's main island; a pill that meets another on the same side stacks under it, and where that is taken it slides along the side half a pill at a time before the next side is tried. Stacks are lined up on their near edge, or their far edge where the near one does not fit. The map measures itself and every pill (in a hidden layer, so the widths are those of the reader's language and text size) with a `ResizeObserver` and places again on any change; the server render assumes a 390 px phone. Only 北海道 has room for the badge (22.5 map units around its label point; 東京 1.5, 神奈川 2.7, 福岡 3.3). A pill carries the same `aria-label` as the badge ("東京都: 掲示板 2 件") and is a real `<button>`, so Enter and Space work; callouts follow the prefecture codes, which is north to south and the tab order. The outlines take a click too. The badge pop in is unchanged and pills pop in the same way, once; nothing moves under reduced motion. The old `[data-map-pref]` focus rule is gone: the site-wide ring now draws round the round buttons.

**3. Language switch as a menu** (`components/LanguageSwitch.tsx`). A button with the current language and a chevron, the same border (`--line-strong`), white fill, 8 px radius and 44 px height as the text size toggle beside it, `aria-haspopup="menu"`, `aria-expanded`, `aria-controls` while open; its name reads "言語: 日本語". The menu under it is `role="menu"` labelled by the button, five `menuitemradio` rows of 44 px, each in its own language with `lang`, the current one checked with a tick and `aria-checked`. Opening (click, Enter, Space, Down or Up) moves focus to the current language; Up and Down wrap, Home and End jump, Enter or Space picks, Escape closes, and both return focus to the button; Tab closes and moves on; a press outside closes. On opening the menu is moved back inside the viewport when it would cross an edge and scrolls when the window is too short. The choice still goes through `useLang().setLang`, which writes the cookie. The focused row draws its ring inside itself (a rule in `globals.css`, because the site-wide unlayered ring outranks a utility class); the menu fades in over 140 ms, not under reduced motion.

**4. Leaner board cards** (`components/home/BoardSummary.tsx`). The "In 6 languages" line and its six chips are gone (`home.languages` removed from the five message files, no other user). The area runs inline after its label, the button is pinned to the bottom of the card, cards in a row share their height, and the Japanese name never breaks inside itself. From 1024 px the cards sit two to a row in the left column (`components/home/HomeView.tsx`): with six boards in one column the left column was four times the map's height.

| card heights, en | before (live site) | after |
|---|---|---|
| 390 px, one column | 331 to 407 px, left column 2773 px | 218 to 269 px, 2022 px |
| 1280 px | one column, 331 to 356 px, left column 2482 px beside a 611 px map | two columns, 244 to 301 px, left column 1214 px beside the 611 px sticky map |

**Acceptance** (dev server on port 3541, headless Chrome over the DevTools protocol with `--force-prefers-reduced-motion`; screenshots kept outside the repository)

| check | result |
|---|---|
| 390 px ja | 北海道 badge in the prefecture; 東京都 2 and 神奈川県 2 pills stacked to the right of Kanto, lined up, leaders from the two dots; 福岡県 1 to the right of Kyushu; the four prefectures in the same rose with the same outline; cards with name, count, area and button only |
| 390 px en | the same, the Kanagawa pill (132 px) lined up on the right edge under Tokyo's because it is too wide to line up on the left |
| 1280 px ja and en | map beside two columns of cards; the same four highlights; Tokyo and Kanagawa stacked right over the sea, Fukuoka right |
| menu open, 390 ja and 1280 en | under the button, right aligned, inside the viewport (390: x 239 to 374), 日本語 ticked in rose on the soft tint |
| no overlap, inside the map | 390 ja, en; 375 en; 768 zh; 1280 en; large text at 390 en, 390 ko, 360 vi and 1280 ko: no callout overlaps another, none leaves the map, no sideways scroll, no text under 16 px, no control under 44 by 44 px. Routine alone, 300 to 480 px maps in 4 px steps, both text sizes, five languages: no overlap and nothing outside in 460 layouts |
| keyboard, map | Tab: logo, text size, language, the six board links, then 北海道, 東京都, 神奈川県, 福岡県, map credits. Focus on the Tokyo pill: 3 px ring, Tokyo alone in the deeper tint; Enter: focus on the 渋谷 card at 96 px, tint back to normal |
| pointer, map | hover on the Tokyo pill, the Fukuoka outline, the Hokkaido badge: that prefecture alone deeper (the pill turns soft rose, the badge shows 北海道's name); pointer away: back; click on the pill without moving the pointer afterwards: focus on the card, nothing left tinted. Phone tap on the Tokyo pill: card focused, nothing tinted |
| keyboard, menu | Enter opens on 日本語; Down to English, four more Downs wrap to 日本語; Up to Tiếng Việt; Home, End; Escape closes, focus on the button; Down opens; End, Space picks Tiếng Việt: menu closed, focus on the button ("Ngôn ngữ: Tiếng Việt"), `html lang="vi"`, cookie `engawa_lang=vi`; Tab from the open menu closes it and moves on |
| pointer, menu | click opens with focus on the current row, click outside closes, a second click on the button closes, at 320 by 640, 844 by 390 and 1280 by 900; in a 600 by 250 window the menu is cut to 182 px and scrolls, End brings the last row into view; on a board page (three controls in the bar) it opens over the content |

`pnpm typecheck`, `pnpm lint`, `pnpm guard --all` and `pnpm build` clean.

**Limits, open for review**
- On a map narrower than about 324 px (a phone under about 356 px) with large text in English, Korean or Vietnamese, no side has room for Fukuoka's pill and it falls back to its badge at the label point: no overlap, same button, smaller than the outline. A dense region with several boards (a hypothetical 11 prefectures with four in Kansai) does not fit as pills at phone width, and the badge fallback then overlaps; a list beside the map or one callout per region would be the next step.
- Pills cover land and sea alike (the brief allows both) and may cover some of Tokyo's Izu islands, which are not counted as obstacles so that the islands do not block the sea south of Kanto.
- Positions are first rendered for a 390 px phone and corrected after the first measurement, before the entrance animation shows the map; under reduced motion, on a slow phone, the pills can move once after hydration.
- The Okinawa inset's name stays in map units and is 15.6 px on a 360 px phone (15.3 px with large text, whose gutters are wider), 16 px from a 369 px phone up, as before.
- The menu opens on the current language rather than the first item; it is the one the reader usually wants to move away from, and both are allowed for a menu button.

**Integration notes for PR #40 (Fable, reviewing session, on the branch):** after seeing the page with six boards the user asked for two more changes: a prefecture with boards no longer fills with rose (北海道 read as a single highlighted blob next to three small ones), the fill is a faint tint and the accent outline plus the badge or pill carry the marking, with a slightly deeper tint on hover; and on phones the map now sits between the intro and the board list (hero, map, boards), the left column using `display: contents` below lg so the sections take a flex order while the two-column layout from lg stays as it was.

**Review fixes for PR #40 (Fable, reviewing session, on the branch):** the language menu no longer closes itself on Tab inside keydown (the blur handler closes it once focus has landed, so no browser jumps focus to the document start), and it closes on a resize or rotation since its placement no longer holds; the map's focus handler guards `:focus-visible` for older Safari. Left as follow-ups: the literal colon after the screen reader labels of both top bar toggles, and six unreferenced message keys from earlier work (`index.pick`, `board.updated`, `sheet.category`, `area.self_reported`, `dropin.done_cards_one`, `dropin.done_cards_other`) for a cleanup PR.

Follow-up the same morning: the user wants no resting highlight at all, 北海道 read as a special shape among grey ones; a prefecture with boards now looks like every other at rest (land fill, hairline border) and the badge or pill alone marks it, with the tint on hover and focus only; the map label and hint say numbered badge instead of colour in five languages.

### Same PR, later: boards as pins instead of marked prefectures (`claude-opus-5-5`, same worktree)

The user found the prefecture marking unbalanced (北海道 a quarter of the map, 東京 and 福岡 specks), so every prefecture is now the same quiet land with its hairline border (no tint, no hover, no click), and each board is a pin at its real position. On the server (`app/page.tsx`) a board's position is the area-weighted centroid of its 町丁目 polygons (`centroidOf` in `lib/geo/polygons.ts`), projected into the map's view box by `projectToMap` (`components/home/map-pins.ts`); `groupPins` there joins boards closer than 14 map units into one pin, and the page passes the pins to the map, so the server render and the browser agree.

**The projection.** The outline file turned out to be a Mercator map: an affine fit in longitude and the Mercator y of the latitude puts nine capes at the extremes of their prefecture's main island (宗谷岬, 納沙布岬, 白神岬, 大間崎, 魹ヶ埼, 犬吠埼, 潮岬, 足摺岬, 佐多岬) within 0.15 units of the matching extreme point of the outline (0.08 RMS); a plain latitude fit missed by up to 3.7. The six constants are written down with that derivation. `pnpm check:boards` now repeats the nine capes (each within 0.5 units) and checks every board's pin: on its own prefecture's outline, or within 0.5 units of it and on no other (the outlines are simplified at 0.45 units, and both Kawasaki boards fall 0.2 to 0.3 units into the gap between the simplified 東京 and 神奈川 outlines, inside neither), and within 1 unit of its landmark's projection (0.0 to 0.1 for all six). 114 of 114 checks pass.

**Grouping, a decision for review.** The brief's examples (渋谷・上野, 武蔵小杉・溝の口) and its 14 unit rule disagree: the four Kanto boards are all within 3 units of one another, so the rule alone gives one pin for four boards, with a label too long for a phone and one tap target for four places. Pins therefore group within 14 units *and* within one prefecture, which gives the brief's two pins. They are 3 units apart, so on screen pins closer than half a pin share one dot, each keeping its own pill and leader. The names follow the order of the cards (溝の口・武蔵小杉, since the list is alphabetical by slug).

**Pins and pills** (`components/home/JapanMap.tsx`, `components/home/map-callouts.ts`). Every pin is the same: a 10 px accent dot with a 2 px white ring and the 9 px halo the badge had, inside a 44 px target, popping in once as before. Every pin has a pill with its boards' names in the reader's language (`board.name[lang]`, the Japanese name with `lang="ja"` where a language has none), joined by `home.map_names_sep` (・ in Japanese, · in Chinese and Korean, " · " in English and Vietnamese, as the place names elsewhere), with the count on the accent disc for a pin of several boards; a pill wraps between names, never inside one, from 12 rem. The pill is the button, with `aria-label` "渋谷・上野: 掲示板 2 件" (`home.map_pin_one`, `home.map_pin_other`, which replace `home.map_pref_*`); the dot takes a click too. Pins run north to south, which is the tab order. Activation focuses and scrolls to the group's first card, as before. Mouse, pen and keyboard focus deepen the dot and tint the pill; a touch has no hover. `--map-active` and `--map-active-hover` are gone. `home.map_label` and `home.map_hint` say that each board is a pin and that a pin or its name opens the board, in five languages.

Placement keeps the routine's order (right, left, above, below, stacking on a shared side) with what the narrow screens needed: the pill takes the free place nearest its pin along a side (8 px steps, above and below also stepping away), the first side with a near place wins (level with the pin or one pill off), otherwise the side with the shortest leader, never longer than 7.5 rem; pills may cover the dotted frame of the Okinawa inset but not the 8 px inside it; and where north to south leaves a pin unlabelled, widest first and south to north are tried too. Measured pill sizes in all five languages at both text sizes, run through the routine for maps from 288 to 480 px wide: 970 layouts, no pill over another pill or a pin, none outside the map, longest leader 91 px. At the default text size every pin is labelled at every width (so on a 320 px phone too). With large text a pin can stay unlabelled (still a labelled button, the dot alone on screen) on maps under 330 px in English and Vietnamese (phones under about 368 px), 316 px in Korean, 292 px in Japanese, 290 px in Chinese.

**Checked** (headless Chrome, reduced motion forced): 390 px ja (札幌 大通 right of Sapporo, 渋谷・上野 right and 溝の口・武蔵小杉 left of the shared Kanto dot, 博多 right), 390 px en (all four right, the two Kanto pills stacked), 1280 px ja and en (all right, the Kanto pills stacked by the Pacific), 375 en, 360 vi, 320 en, 768 zh, large text at 390 ko and 414 en: no text under 16 px, no control under 44 by 44 px, no sideways scroll, nothing overlapping or outside the map. Keyboard at 390 ja and 1280 en: after the six board links, 札幌 大通, 渋谷・上野, 溝の口・武蔵小杉, 博多, then the map credits; focus on a pill shows the 3 px ring and deepens its dot; Enter focuses the 渋谷 (or 溝の口) card at 96 px with nothing left tinted. Pointer at 1280: hover on a pill or a dot tints that pair only and clears on leave; a click on the 札幌 dot focuses its card with nothing left tinted; a phone tap on the 博多 pill focuses its card. `pnpm typecheck`, `pnpm lint`, `pnpm guard --all`, `pnpm check:boards` and `pnpm build` clean.

Seen in passing, not changed: on phones the map now sits above the board list visually (`order` in `HomeView.tsx`), while the tab order still goes through the board links before the map.

**Later, the leaders** (the reviewing session, `claude-fable-5-1`). In the screenshots every leader stopped at the edge of its pin's halo, so the pill looked adrift of its pin: the line was in the map's svg, under the HTML pins, and the halo (14 % accent over the land) hid the thin grey line. The leaders are now a second svg over the pins and under the pills, each drawn from the outside of the pin's white ring to the pill's edge, so it crosses the halo and meets the ring. The two Kanto pills on one dot stay as they are (one pill of four names would be the widest thing on the map and one target for four places), and a click still goes to the board card without zooming the map: the outlines have no detail below the prefecture, so a zoom would show the same two dots larger.

## 2026-11-05 (Thu), area names in the reader's language

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day8-area-names`, cut from `main` at `6601fe3`), brief from the reviewing session. One new Claude call, in a seed script only (`scripts/area-names.ts`, six calls in all, about 11,300 output tokens); no pipeline call changed. The database was read by a local dev server and not written.

**Why.** A Korean reader saw the board title as 우에노 上野 but the area line as 上野、東上野、上野公園 and the self-reported area as 小杉町2丁目: the 町丁目 names were Japanese in every language. Known places already show the localized name with the Japanese after it; areas now do the same.

**The names** (`supabase/seed/boards.json`). Every one of the 123 areas (23, 11, 14, 17, 45 and 13; the brief said 114, which is the number of `check:boards` checks) gains `name_en`, `name_zh`, `name_ko` and `name_vi`; `code` and `name_ja` are unchanged. `scripts/area-names.ts` asked `claude-opus-5-5` (effort high, structured output, prompt `lib/claude/prompts/area-names.system.md`, schema `lib/claude/schemas/area-names.schema.json`) once per board; code checks the count, the order and the Japanese, and copies the English into Vietnamese. Then every name was read against Japan Post's postcode kana for all 45 towns (zipcloud API, 2026-11-05):
- 小杉町 is ｺｽｷﾞﾏﾁ, so "Kosugi-machi 1-chome", 고스기마치 1초메, not the brief's "Kosugi-cho" (the model followed the brief's example); 今井仲町 ｲﾏｲﾅｶﾏﾁ and 今井西町 ｲﾏｲﾆｼﾏﾁ likewise "-machi" and 마치. 新丸子町 ｼﾝﾏﾙｺﾏﾁ the model had right; every other 町 on the boards is ちょう.
- 博多駅中央街 is 하카타에키추오가이: the model wrote 주오가이, the word-initial form, inside the word.
- Everything else matched the kana and the rules: Hepburn without macrons, the suffix hyphenated (Kosugijinya-cho, Maruko-dori, Ueno-koen, Hakata-ekimae), a leading direction set off (Higashi-Ueno), a trailing one in lower case (Shinmaruko-higashi), Sapporo as the city writes it (Kita 5-jo Nishi 1-chome, Odori Nishi 1-chome); zh in simplified characters (涩谷, 樱丘町, 东上野, 小杉阵屋町, 坂户, 市之坪); ko with 초메 after a space (기타5조니시 1초메, 하카타에키마에 1초메).
The prompt's examples were corrected the same way, so a run for a new board starts from the right readings. The script stays for the next board (`docs/BOARDS.md`, checklist step 3).

**Code**
- `lib/types.ts`: `BoardAreaName`, the four names optional, so a row seeded before them still reads.
- `lib/cards/display.ts`: `areaName(area, lang)` beside `knownPlaceName`, same shape (`{ text, ja }`); `areaParts(card, board, lang)` for a card's area code; `townName` and `townsOf(areas, lang)`, which fold on the Japanese name and strip the localized 丁目 with one pattern per language (" 1-chome", " 1초메", "1丁目"). `lib/geo/index.ts`: board areas keep their names, and `boardArea(board, code)` replaces the Japanese-only `areaName(board, code)`; `resolveArea` returns the board's entry. `lib/cards/maps.ts` is untouched and searches in Japanese.
- `components/board/AreaName.tsx`: the localized name, then the Japanese in parentheses with `lang="ja"`, as `CardItem` prints places; a name with no localized form is marked `lang="ja"` itself. `WithAreaName` puts it into a message's `{area}` through `tAround` (`lib/i18n`), so "Self-reported area: …" and "Your area: …" keep their wording in five languages. Used by the card badge, the card sheet and card page, and the drop-in line (which now keeps the resolved board area, not its Japanese name, so a language switch updates it). The badge's accessible name is "… (小杉町2丁目)" as plain text.
- Home card (`components/home/BoardSummary.tsx`): the towns in the reader's language alone, each one unbreakable (Korean broke 기타3조니시 between syllables on a phone), joined by the new `home.area_sep` (、 in ja and zh, ", " in en, ko and vi), appended at the end of the five message files.
- `scripts/check-boards.ts`: per board, all four names in their form (`scripts/area-name-rules.ts`: en and vi ASCII letters, digits, spaces and the hyphen, vi equal to en, zh Han and digits, ko Hangul, digits and spaces, the same 丁目 at the end), every 丁目 of a town folding to one town in five languages, the landmark's area read in Korean with the Japanese after it; then the badge in vi and the drop-in line in ko rendered with `react-dom/server`, the Japanese reader's badge, a row without names, and the 上野 towns in Korean. 137 of 137. Each new rule was also run against a bad name (an en dash, a macron, Latin in zh or ko, a missing name, a wrong 丁目, vi not en) and fails it.
- `scripts/geo/build.ts --write-seed` replaced one-line `{ "code": null, "name_ja": … }` text, which the seed has not had since the Kawasaki and Tokyo boards (the 溝の口 session's follow-up). It now reads and writes the seed as JSON (the file round-trips byte for byte through `JSON.stringify(…, null, 2)`), fills only missing codes, and has `--dry-run`. Checked on the Shibuya Shapefile: the dry run matches 11 of 11 and writes nothing; with Shibuya's codes blanked, `--write-seed` fills 11 and the seed and `lib/geo/shibuya.json` come back identical. The download was deleted.
- `scripts/seed.ts --dry-run` prints the names after each area: 23, 11, 14, 17, 45 and 13 areas, each with a code and all four names.

**Checked**
- `pnpm typecheck`, `pnpm lint`, `pnpm guard --all`, `pnpm check:boards` (137 of 137), `pnpm build`.
- Seed-only dev server (`SUPABASE_URL` empty), the home page in five languages: ko 고스기마치, 고스기진야초, 고스기고텐초 외 12곳 and 우에노, 히가시우에노, 우에노코엔 외 2곳; vi Kosugi-machi, Kosugijinya-cho, Kosugigoten-cho và 12 nơi khác; zh 博多站前、博多站中央街、博多站东 等2处; en Kita 5-jo Nishi, Kita 4-jo Nishi, Kita 3-jo Nishi and 6 more; ja unchanged. At 320 px, both text sizes, five languages: no town past its card's edge, town text 17 px (20 px large).
- Dev server on the live database, read-only, before any reseed: the home cards show the Japanese towns, each `lang="ja"`, with the reader's separator; on the pilot board, the drop-in panel with the position stubbed inside 小杉町2丁目 shows "내 구역: 小杉町2丁目" with the name marked `lang="ja"`. Nothing was sent; the panel was closed.

**Open for review**
- Chinese 駅 is 站 (博多站前1丁目), as Chinese writes Japanese station names; a strict character mapping would give 驿.
- No city's own English district list was read except the Sapporo grid form the brief gave; 東上野 Higashi-Ueno and the one-word compounds (Kamimarukohachiman-cho, Uenosakuragi) follow the board-wide rule.
- The live boards show the Japanese until reseeded: `pnpm db:seed --board <slug> --token-file .env.admin-token.local` for the six boards after the merge. `pnpm board:throwaway` copies the live pilot row, so acceptance runs show Japanese area names until then too.
- Seen in passing, not changed: at 320 px with large text in Chinese the map pill 武藏小杉·沟之口 ends 3.6 px past the viewport, so the page scrolls sideways by 3 px (PR #40's placement).

**Review** (the reviewing session, `claude-fable-5-1`, with the read-only reviewer): merge, three edge cases for future boards fixed on the branch. Two Japanese towns that read the same in a language (仲町 and 中町 as Naka-machi) would have shared a React key on the home card and passed the fold check: `townsOf` now carries the Japanese town, the card keys on it, and `pnpm check:boards` fails a board where two towns fold to one name. The 丁目 pattern is one constant (`CHOME_JA` in `lib/cards/display.ts`, ASCII digits) shared by the display and the format rules, which now refuse a full-width digit in `name_ja`. `scripts/area-names.ts` asks for the boards one at a time, so the calls after the first read the cached system block.

## 2026-11-05 (Thu), sample cards for the five newer boards

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day8-demo-content`, cut from `main` at `6601fe3`), from a brief by the reviewing session (Fable). Pipeline models unchanged: `claude-opus-5-5` for extract, mask, reconcile and translate; no prompt or schema change. Another session was editing `supabase/seed/boards.json` and the checklist in `docs/BOARDS.md` in its own worktree; `boards.json` was not touched and BOARDS only got the new last section.

Why: 渋谷, 上野, 溝の口, 札幌 大通 and 博多 were live and empty. An empty board shows nothing of what the product does, and the demo is recorded on 11/07. The cards had to come from the real pipeline, not be written by hand, and land in the seed so that `pnpm db:seed --board <slug> --reset-cards` puts them on the live boards after review.

**What was done**
- Inputs, `fixtures/demo/<board>/` with `fixtures/demo/README.md` (one line each: what it imitates, which language): five notice photos rendered from `fixtures/tools/demo-specs.mjs`, one LINE-style chat screenshot with a planted name and phone number, and ten texts. Fictional associations (みずき町会, こもれび町会, ひばり町内会, すずらん町内会, なぎさ町内会, unnamed 商店会 and 管理組合), real public places from each board's known places, peacetime events from 11/08 to 11/21, local where it fits (夜回り in the 火災予防運動 week in 渋谷, 上野恩賜公園 and its 給水ステーション, 高津小学校 and 溝の口駅 北口, snow volunteers, winter shoes and the bicycle parking closure in 札幌, 東住吉公民館 and 藤田公園 in 博多).
- `fixtures/tools/render.mjs --demo` reads the demo specs and writes into `fixtures/demo/<board>/`, without masking files, expected checks or the contact sheet. `stamp: false` on a notice spec drops the 訓練用・想定シナリオ stamp (decision 2 below).
- `pnpm board:throwaway create <slug>-demo --from <slug>`: `--from` already existed, so `scripts/throwaway-board.ts` is unchanged.
- `scripts/export-samples.ts` (`pnpm export:samples --board <throwaway> --as <slug> [--dry-run]`): public cards of the throwaway copy into `supabase/seed/sample_cards.json`, `minutes_ago` from 4320 for the oldest to 40 for the newest on a geometric scale, `exported_from` naming the throwaway board so a second export replaces the first in place (checked: the second export of `ueno-demo` replaced its 4 entries). It refuses a card with a missing language, a risk flag, an unknown place or a dash. It writes the file in the seed file's own style; re-serialising the old file gave it back byte for byte, and the diff of the export is insertions only.
- Seed (`lib/db/local.ts`, `scripts/seed.ts`): an entry may carry absolute `valid_from` and `valid_until`, kept as they are (decision 1); `--dry-run` lists each board's sample cards. Entries without those keys (the two 武蔵小杉 cards) behave as before.
- `docs/BOARDS.md`, new last section "Sample cards": what they are and the six steps to remake a board's samples.

**The cards** (all `daily_notice`; oldest first as seeded)

| board | input | kind, language | 日本語 title | place | source type |
|---|---|---|---|---|---|
| shibuya | sh1 | notice photo, ja | 神宮通公園入口集合、夜回り 11月9日から13日 毎日19:00から19:40 | `jingudori-park` | official |
| shibuya | sh2 | pasted text, ja | 防災まち歩き、11月14日（土）13:30 渋谷区役所正面入口前集合 | `shibuya-city-office` | official |
| shibuya | sh3 | LINE-style screenshot, ja | 道玄坂の歩道清掃、11月21日(土) 8時から9時、集合は渋谷駅(ハチ公前広場) | `shibuya-sta` | secondhand |
| ueno | ue1 | notice photo, ja | 上野恩賜公園 給水ステーション前で給水訓練、11月15日（日）10:00から11:00 | `ueno-park-water` | official |
| ueno | ue3 | pasted chat message, zh | 東上野区民館で防災講座、11月19日（木）14:00から15:30 | `higashiueno-kuminkan` | secondhand |
| ueno | ue4 | pasted 回覧板 text, ja | 資源の集団回収、11月から朝8時30分までに。次回は11月18日（水） | none (各集積所) | official |
| ueno | ue2 | heard (loudspeaker), ja | 上野恩賜公園 たけのだい広場で地域合同防災訓練、11月14日（土）10時から12時 | `ueno-park` | secondhand, platform loudspeaker |
| mizonokuchi | mz1 | notice photo, ja | 高津小学校（川崎市立高津小学校）体育館で避難所開設訓練、11月21日（土）9:00〜11:30 | `takatsu-es` | official |
| mizonokuchi | mz2 | pasted post, vi | 溝の口駅近くの建物、11月12日（木）9時から12時まで断水 | `mizonokuchi-sta` | secondhand |
| mizonokuchi | mz3 | pasted text, ja | 溝の口駅北口の広場周辺で落ち葉清掃、11月15日（日）8時から9時 | `mizonokuchi-sta` | firsthand |
| sapporo | sp1 | notice photo, ja | 資生館小学校 体育館で冬の避難所体験会、11月21日（土）10:00から12:00 | `shiseikan-es` | official |
| sapporo | sp2 | pasted post, en | 大通公園（大通西6丁目側）で除雪ボランティア説明会とスコップ配布、11月14日10時から11時 | `odori-park` | unknown |
| sapporo | sp3 | pasted text, ja | 駐輪場、11月20日（金）から冬期閉鎖 | none (駐輪場) | official |
| hakata | hk1 | notice photo, ja | 建物全体で断水、11月17日（火）10:00から14:00 | none (建物全体) | official |
| hakata | hk2 | pasted chat message, ko | 東住吉公民館で外国人住民向け防災教室、11月15日(日) 10:00から12:00 | `higashisumiyoshi-kominkan` | secondhand |
| hakata | hk3 | pasted text, ja | 藤田公園、防災倉庫の点検と消火器体験、11月14日（土）10時から10時30分 | `fujita-park` | official |

Every card was read in all six languages through `GET /api/b/<slug>-demo/cards`. Every place came out right on the first run, including たけのだい広場 resolved to 上野恩賜公園 and ハチ公前広場 to 渋谷駅. Two inputs were fixed and dropped in again after their first card was removed from the throwaway board: ue2 and hk3 stated no end time (hk3 said 30分ほど), so both cards took the `daily_notice` default of 30 days and would have stayed current until mid December; each input now states its end. None of the planted name or phone number of sh3 reached any field; the masking call drew 12 boxes, and the original screenshot was deleted at the end of processing as usual.

**Pipeline timings** (local dev server on port 3171 against the shared project, curl-like Node driver on the two drop-in routes, one throwaway copy per board, 2026-11-05 afternoon; times in seconds; card is from the process request to the `cards` event, total to `done`; the final run of each input)

| input | extract | reconcile | card | translate | total |
|---|---|---|---|---|---|
| sh1 photo | 9.7 | 0.8 | 12.4 | 10.6 | 23.0 |
| sh2 text | 6.5 | 0.2 | 7.3 | 10.1 | 17.4 |
| sh3 chat (mask 5.7 beside reconcile) | 7.3 | 0.2 | 16.2 | 8.8 | 25.0 |
| ue1 photo | 8.7 | 0.2 | 9.9 | 10.9 | 20.9 |
| ue2 heard | 6.4 | 2.7 | 9.5 | 9.2 | 18.7 |
| ue3 zh | 6.8 | 0.2 | 7.7 | 7.0 | 14.7 |
| ue4 text | 5.6 | 0.1 | 6.4 | 7.6 | 13.9 |
| mz1 photo | 7.5 | 0.2 | 8.7 | 12.5 | 21.2 |
| mz2 vi | 7.0 | 0.1 | 7.7 | 7.2 | 14.9 |
| mz3 text | 5.7 | 3.0 | 9.1 | 7.8 | 17.0 |
| sp1 photo | 7.9 | 0.1 | 9.1 | 11.3 | 20.4 |
| sp2 en | 6.3 | 0.2 | 7.1 | 8.7 | 15.8 |
| sp3 text | 5.3 | 0.1 | 5.9 | 8.1 | 14.1 |
| hk1 photo | 7.9 | 0.2 | 9.3 | 10.6 | 19.9 |
| hk2 ko | 7.0 | 15.9 | 23.4 | 9.0 | 32.4 |
| hk3 text | 5.3 | 3.0 | 9.0 | 7.8 | 16.8 |

Medians: extract 6.9 s, card 9.0 s, translate 8.9 s, total 18.0 s. Reconcile called Claude only where a candidate existed (a card of the same category with the same place or no place): five calls, all `create`, 2.4 to 3.1 s, except one for hk2 at 15.6 s with a cold cache write (6,460 tokens); an API outlier, not repeated. The 18 drop-ins made 42 Claude calls (18 extract, 18 translate, 5 reconcile, 1 mask); the shared daily counter went from 40 to 82 of 400.

**Decisions, open for review**
1. **Absolute event times in the seed.** With `valid_hours` alone, an export on 11/05 seeded on 11/06 or 11/07 would end every card a day or two after the date its own title names, and `valid_from` would show the posting time instead of the start. Exported entries therefore carry the card's `valid_from` and `valid_until`, and the seed keeps them; `created_at` stays relative. A board seeded after 11/21 shows these cards as outdated, which is true. Dropping the two keys from the entries gives back the purely relative behaviour.
2. **No 訓練用 stamp on the demo notices.** The fixture stamp ends up in the card text (`docs/EVAL.md` noted "（訓練用）" in card bodies), which reads wrong on a 町会 notice about a real drill. The notices are of fictional associations, not shelter or official notices, and still have no crest, logo or phone number.
3. **All 16 cards are `daily_notice`.** That is what the extract prompt says for drills, events and building notices in peacetime, and the category filter on these boards shows one category. Another category would need another kind of input (a flu shot clinic as `medical`, a supplies handout), which a real resident could act on more readily than a drill.
4. **The loudspeaker card** is heard text, so it says it came from the 防災行政無線 of a real ward, about a fictional drill. The text has no opening formula (no こちらは…です) so it names no sender; the brief asked for it.
5. **Real places, fictional events.** A real resident could walk to 神宮通公園 on 11/9 and find no patrol. The brief accepted this for peacetime events; nothing here asks anyone to bring money, give data or avoid a place. A "sample" label on seeded cards would remove the doubt and is not built.
6. **Two building notices name no building** (hk1, mz2), as such notices often do; the hk1 card says so in its body. 町会 and 管理組合 notices come back `official` (the prompt's rule 7 counts building management among official bodies), sp2 `unknown`.
7. Seeded cards carry no image and no `card_sources` row, so "How this card was made" lists no step and names no model, as for the two 武蔵小杉 samples.

Seen in passing: from a Chinese input, extract wrote the Japanese title as 東上野区民館（東上野区民館）, the place name twice, and three Chinese texts had 道玄坂（道玄坂）; rule 4 of the extract prompt (keep the Japanese name in parentheses) was applied where the name was already Japanese. The four seed entries were corrected by hand before the merge; the prompt is unchanged.

**Checks**

| check | result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm guard --all` | clean, the new fixtures and JSON included (run after staging them) |
| `pnpm check:boards` | 114 of 114 |
| `pnpm db:seed --board <slug> --reset-cards --dry-run`, five boards | 3, 4, 3, 3, 3 sample cards listed with their times |
| `pnpm db:seed --board musashikosugi --dry-run` | "cards unchanged", its two samples listed as before |
| `pnpm build` | compiled, 12 static pages; `.next` removed afterwards |
| live boards after the run | 渋谷, 上野, 溝の口, 札幌 大通, 博多 0 cards each, 武蔵小杉 7, as before |

**Cleanup.** `pnpm board:throwaway delete` for the five copies: `shibuya-demo` 2 storage objects (the notice photo and the masked copy), 3 card_sources, 3 cards, 3 submissions, 1 device; `ueno-demo` 1, 4, 4, 5, 2; `mizonokuchi-demo` 1, 3, 3, 3, 1; `sapporo-demo` 1, 3, 3, 3, 1; `hakata-demo` 1, 3, 3, 4, 2 (the extra submission and device on 上野 and 博多 are the second runs of ue2 and hk3). The dev server on 3171 was stopped. No seed was run without `--dry-run`: the reviewing session seeds the five boards after the merge.

**Review** (the reviewing session, `claude-fable-5-1`, with the read-only reviewer): merge, three of five findings fixed on the branch. The 落ち葉清掃 card (mz3) was set for 11月8日（日）, the morning after the submission deadline, so the judges would have met it as an outdated card; the input, the six titles and bodies and the table above now say 11月15日（日）. The 断水 card near 溝の口駅 (mz2) was pinned to the station, so the place view read as the station without water; it now carries no place, its text unchanged. `scripts/export-samples.ts` replaced entries by the throwaway board's name, so an export from a copy under another name would have doubled a board's samples; it now replaces the target board's earlier exported entries and leaves hand-written ones alone. Kept, with the 武蔵小杉 samples as the precedent: the loudspeaker card names no sender and the two building notices name no building. Decisions 1 to 3 stand.

**Merged and seeded** (the reviewing session, 11/05 22:30 JST). #41, #42 and #43 in that order; #43 took a merge of `main` into its branch, since both it and #42 had appended an entry here. `pnpm db:seed` refreshed the six boards' area names on the live database, and `--reset-cards` put 3, 4, 3, 3 and 3 samples on 渋谷, 上野, 溝の口, 札幌 大通 and 博多, each empty until then; 武蔵小杉 was not touched. Seen on engawaboard.com afterwards: the home page in Korean lists 고스기마치, 고스기진야초, 고스기고텐초 외 12곳 and 하카타에키마에, 하카타에키추오가이, 하카타에키히가시 외 2곳, and each board page shows its cards with their source labels.

## 2026-11-06 (Fri), the mission in one sentence

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day9-mission-copy`, cut from `main` at `9f626eb`), from a brief by the reviewing session (Fable) after a talk with the user. Copy only: no pipeline, prompt, schema or database change, no Claude calls.

**Why.** The home page said what the board is (a neighbourhood board that turns notices into cards in six languages) but not why it exists: after an earthquake, the information about water, shelters, food and closed roads is scattered across LINE, WeChat, Facebook, paper notices and word of mouth, each community in its own language. Everyday use (garbage days, building notices, events) is how residents find the board before they need it, so that it is already in their hands when it matters. One sentence says both, with no redesign.

**The sentence**, the same in every language, two short sentences each:
- ja: ふだんはご近所の掲示板。災害のときは、水、避難所、配給の情報が、同じ場所に、自分の言葉で届きます。
- en: On ordinary days, a neighbourhood board. In a disaster, the information about water, shelters and supplies reaches the same place, in your own language.
- zh: 平时是社区公告板。发生灾害时，供水、避难所和物资发放的信息会集中到同一个地方，用你自己的语言送到你手里。
- ko: 평소에는 동네 게시판입니다. 재해가 나면 물, 대피소, 물자 배급 정보가 한곳에 모여 자기 언어로 전해집니다.
- vi: Ngày thường, đây là bảng tin khu phố. Khi có thiên tai, thông tin về nước, nơi lánh nạn và nhu yếu phẩm đến với bạn ở cùng một nơi, bằng ngôn ngữ của bạn.

The Japanese and English are the brief's masters. The other three use the board's own category words (供水, 避难所, 物资; 물, 대피소, 물자; nước, nơi lánh nạn, nhu yếu phẩm); zh and ko follow the Japanese 配給 (物资发放, 물자 배급), vi follows the English "supplies".

**What changed**
- `home.mission` and `about.mission` in the five message files, the same text under both keys.
- Home hero (`components/home/HomeView.tsx`): a paragraph between `home.lead` and the six-language tagline, in the lead's style (text-xl, 60ch). It takes the 120 ms entrance slot; the tagline, `home.for_whom`, the boards heading and plank, the map and the board cards each move one 60 ms slot later, so the order is unchanged.
- About page (`components/about/AboutView.tsx`): a second paragraph right under `about.lead`. A separate key rather than appended to `about.lead`, because `about.lead` is also the page's meta description. The Maria, 佐藤さん and チェンさん paragraphs are unchanged.
- `README.md` and `README.ja.md`: the sentence after the first one, which says what Engawa is, without its first half ("On ordinary days, a neighbourhood board.", ふだんはご近所の掲示板。), since the first sentence already says that (review on PR #45).
- The home page meta description is built from `home.lead` alone and was left as it is.

**On a phone** (375 by 812, dev server, the paragraph hidden and shown): the sentence is 3 lines in Japanese and Korean, 4 in Chinese and 5 in English and Vietnamese at text-xl, so the map heading moves down by 178 px in English (from 526 to 704 px). It is still on the first screen, but the map itself is now below it. That is more than the one extra line the brief allowed for; the text size the brief asked for was kept, and the reviewer decides.

**Checks**

| check | result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm guard --all` (no dashes, key parity across the five files) | clean |
| home and about on the dev server | 200; the sentence rendered on the home page in English and Korean, all five measured at 375 px |

There is no `pnpm test` script in `package.json`; the key parity check is `pnpm guard`.

## 2026-11-06 (Fri), footer, sample cards and a conflict fixture before the freeze

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day9-demo-prep`, cut from `main` at `9f626eb`), from a brief by the reviewing session after the video script pass. No pipeline, prompt, schema or database change, no Claude calls. Five small things the demo recordings need before the 20:00 freeze, and two home page details the reviewing session added afterwards (6 and 7).

**1. Home footer** (`components/home/HomeView.tsx`). The five links sat in one left-aligned row, which looked unbalanced under the map. From 1024 px the footer is now a two-column grid in the same `max-w-6xl` width as the sections above (the plank and the steps both run from 88 to 1192 px at 1280): the four product links (Source on GitHub, Built with Claude Code, About Engawa, Privacy and retention) on the left with the event line under them in muted text, Made by Yanwen alone on the right. Below 1024 px the links stack in one column (two from 640 px), then Made by Yanwen, then the event line. `FooterLink`, the `rel="me"` on the maker link, the keys and the new-tab text for screen readers are unchanged; the maker link left the list and stands in its own paragraph, so the list now has four items.

**2. The 断水 sample on 武蔵小杉** (`supabase/seed/sample_cards.json`). It still printed 11月〔X〕日 and Nov X. It now names 11月16日（月）10:00〜15:00 in the original text and in all six titles (November 16 (Mon), 11月16日（周一）, 11월 16일(월), ngày 16/11 (Thứ Hai)), with `valid_from` 2026-11-16T01:00Z and `valid_until` 2026-11-16T06:00Z, so it is an upcoming card through the judging. Its status moved from `open` to `planned`, like the other dated notices, and `valid_until_stated` is true. `check-placeholders` keeps its own copy of the 〔X〕 strings and is unaffected.

**3. A garbage-day sample on 武蔵小杉**, the peacetime card the board lacked: a fictional management-company notice that 資源ごみ (bottles, cans, PET bottles) moves from Tuesdays to Wednesdays from 11月25日（水）, out by 8:00 on the day, not the night before. `daily_notice`, `official`, not confirmed, no place id (`place_text_ja` 〇〇マンション 1階のごみ置き場, as the 断水 notice names no building), six languages, easy Japanese spaced like the 断水 card. Valid from 11/25 00:00 JST for a month (`valid_until_stated` false). No phone number, no real building. The seed note now says that hand-written entries naming a date carry absolute times too. `pnpm db:seed --board musashikosugi --reset-cards --dry-run` lists three samples.

**4. Fixture p13** (`fixtures/inputs/p13-water-cancelled-heard.txt`): an English chat message that a neighbour said the 14:00 water distribution at 小杉小学校 today was cancelled, secondhand and unseen, for the conflict beat of the video against p02. Listed in `fixtures/README.md`; no expected file, like the other text fixtures; `docs/EVAL.md` untouched.

**5. Drop-in consent wording** (`dropin.purpose`). "Removed automatically" promised more than detection can. Now:
- ja: この掲示板で近所の情報を共有するために使います。スクリーンショットの中の名前や連絡先は Claude が検出し、見つかった範囲で隠します。すべてを検出できるとは限りません。
- en: This is used to share information about this neighbourhood on this board. Claude detects names and contact details in screenshots and masks what it finds; not everything may be caught.
- zh: 用于在这个公告板上分享本社区的信息。截图中的姓名和联系方式由 Claude 识别，识别到的部分会被遮盖。可能无法全部识别。
- ko: 이 게시판에서 이 동네의 정보를 공유하기 위해 사용됩니다. 스크린샷 속 이름과 연락처는 Claude가 감지하여 찾은 부분을 가립니다. 모두 감지하지 못할 수도 있습니다.
- vi: Dùng để chia sẻ thông tin về khu phố này trên bảng tin này. Claude phát hiện tên và thông tin liên lạc trong ảnh chụp màn hình và che những gì tìm thấy; có thể không phát hiện được hết.

**6. No plank under the Boards heading.** The two hairlines between the heading and the board cards are gone; the card grid sits 20 px under the heading (`mt-5`, was `mt-4` below the plank).

**7. The footer rule.** The footer's plank became one hairline across the footer's width, broken in the middle by the mark (`Mark` from `components/brand/Mark`, the configured `solid` variant, 20 px, `aria-hidden`) in `--line-strong` (#87837a), so it reads as part of the rule. `Mark` already draws in `currentColor`, so `Mark.tsx` is unchanged. The mark's own inset is 1.25 px at 20 px, so the 16 px gap reads as about 17 px either side, close to the mark's drawn width of 17.5 px; measured symmetric at 1280, 375 and 320 px. The site has no dark theme, so there is nothing more to check.

**Checked in a browser** (dev server on 3191, stopped afterwards). The footer in five languages at 1280, 1024, 768, 375 and 320 px: nothing past the viewport, every link 44 px tall, the footer's edges equal to the steps section's. At 1024 px in Vietnamese the fourth link wraps to a second line of the left group, which is fine. The consent sheet on the pilot board (read-only, with the main checkout's `.env.local`, removed afterwards; the sheet was closed without consenting, nothing sent) at 375 by 812 and 320 by 640: 261 to 285 px tall in the five languages, no scroll inside it.

**Checks**

| check | result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm guard --all` (no dashes, key parity across the five files) | clean |
| `pnpm check:boards`, `check:places`, `check:placeholders`, `check:mode`, `check:inbox`, `check:push` | 143, 31, 17, 49, 23 and 52 checks, all pass |
| `pnpm db:seed --board musashikosugi --reset-cards --dry-run` | three samples with their times |

**For the reviewing session.** Merges together with #44 and #45, which also append to this file. After the merge, `pnpm db:seed --board musashikosugi --reset-cards` puts the two cards on the live pilot board; it deletes the cards there now, including any made during rehearsals.

## 2026-11-06 (Fri), freeze review fixes

**Model:** `claude-opus-5-5` in Claude Code, implementation role, in its own worktree (branch `day9-freeze-fixes`, cut from `origin/day9-freeze-fixes` at `7000ebc`, which already carries the 03:10 eval refresh in `docs/EVAL.md`), from a brief by the reviewing session (Fable). The source is three read-only review reports kept outside the repository: `code-review.md`, `i18n-ko-zh-vi.md` and `easy-ja-vs-booklet.md`. This is the one batch of fixes before the demo video is recorded against the live site. The full eval was not re-run.

**Code (from `code-review.md`)**

| # | finding | fix |
|---|---|---|
| 1 | A client disconnect killed the drop-in mid-run: the next `enqueue` threw inside `runPipeline`, the catch marked the submission `failed`, and its own `emit("failed")` threw again. A finished card could flip back to failed, and a retry of a text drop-in failed for good | `app/api/process/[id]/route.ts`: `send` is a no-op once the stream is closed or cancelled and never throws; the run is detached from the socket with `after()` (the same pattern as `inBackground` in `lib/push/send.ts`), so extract, write and translate finish without a reader; `cancel()` closes the gate; the stream is closed only if it is still open |
| 2 | Phone numbers could pass the code-side check: `fact.conditions` was never checked, and `PHONE_RE` only knew ASCII digits and hyphens | `lib/claude/extract.ts`: `containsContact` matches against `normalize("NFKC")` with the hyphen look-alikes (U+2010 to U+2015, U+2212, the katakana long vowel mark) mapped to `-`; separators may be hyphens, spaces or parentheses, with an optional `+81`; a mobile number with one separator missing is caught too. Conditions that contain a contact are filtered out rather than failing the drop-in; title, body, `original_excerpt` and `place_text_ja` use the same `containsContact` and still fail closed. Translate and reconcile reasons already called it and get the wider check for free |
| 3 | One script with a fresh `device_id` per request could spend the site-wide daily Claude cap through ask | `app/api/b/[slug]/ask/route.ts`: a third window, 60 asks an hour per client address, always applied next to the two device windows; a 429 from it says scope `ip` |
| 4 | Masking failed open when the model returned a box code could not draw | `maskWithoutBlocking` in `lib/pipeline.ts` returns null when any box was dropped, so the card is published without the image |
| 5 | The stuck watchdog counted from creation, so a retry of an older submission could be failed and claimed twice while still running | `STUCK_AFTER_MS` 330000, above the 300 second `maxDuration`. The proper fix (a claim timestamp) waits until after the freeze |
| 6 | Readers got columns they do not need | `toPublicCard` removes `held_reason`, `risk_flags`, `purge_after` and the `submission_id` of every conflict statement. A grep of the client code found two readers, both on the admin page (`AdminView.tsx`), which reads its own query (`listCardsForAdmin`) and keeps them; `risk_flags` and `submission_id` became optional in `lib/types.ts` |
| 7 | Purge can remove a masked image a sibling card still uses | skipped, as briefed: it cannot happen inside the judging window |
| 8 | A non-UUID id on the process route reached Postgres and returned 500; photos over 8 MB were refused before downscaling | 404 before any database read; the browser pre-check in `lib/image/browser.ts` goes from 8 MB to 40 MB, the server's 8 MB limit on the prepared upload stays |
| a11y | `TextSizeToggle` put its state in the name and also in `aria-pressed` | a fixed `aria-label` (`nav.text_size`), `aria-pressed` means large |
| i18n | Six keys present but unused | removed from all five files: `area.self_reported` (unused, checked with grep, so the language report's change to its text was moot), `board.updated`, `dropin.done_cards_one`, `dropin.done_cards_other`, `index.pick`, `sheet.category`. The toggle fix left `text_size.normal` and `text_size.large` unused, so those two went as well: 418 keys per file |

`scripts/check-contact.ts` (`pnpm check:contact`) pins the phone check, since the repository has no test runner: 21 formats that must be caught (full-width digits and hyphens, U+2010, U+2011, U+2212, the long vowel mark, spaces, ideographic spaces, three placements of parentheses, full-width parentheses, `+81` with hyphens, spaces, `(0)` and in full width, a mobile number with one hyphen, two emails), 10 strings from real notices that must not be (a date and time range, an ISO date, a time range with hyphens, a Sapporo and a Kawasaki postal code, a price, 1日3L, a block address, katakana with long vowels, a weekday in parentheses), and two validator cases (a condition with a phone number dropped, the others kept; a spaced number in the body still fails the call). Before writing it, every string in the 19 sample cards and in `fixtures/expected/*.json` went through the new check: the only hits were the two phone numbers in the `must_not_contain` lists of p03 and p04, which is what they are there for.

**Prompt (from `easy-ja-vs-booklet.md`).** The easy_ja rule in `lib/claude/prompts/translate.system.md` gains the one recommended sentence and its two examples: a disaster or official term the reader has to act on keeps its reading and is explained in easy words in the next short sentence (避難所（ひなんじょ）に 行って ください。避難所は 逃げる ところです。), and a 避難情報 level keeps its name in 「」 followed by what to do (「避難指示（ひなんしじ）」です。危ないです。逃げて ください。). Nothing else in the prompt changed. On a made-up 避難指示 notice in the smoke test below, the easy_ja body came back with 「避難指示（ひなんしじ）」が 出ました。…危ないです。逃げて ください。 and 避難所は 逃げる ところです。

**Translations (from `i18n-ko-zh-vi.md`).** Every listed fix in `ko.json`, `zh.json`, `vi.json` and the zh, ko and vi fields of `supabase/seed/sample_cards.json`, with the report's replacement text; keys and placeholders unchanged (checked against `ja.json`). The four that change meaning:
- vi card 16: 前日までに is now "chậm nhất trong ngày hôm trước" (it read "before the day before"); vi card 15: "chậm nhất đến hết ngày 19/11 (Thứ Năm)" (it read "first of all"), and 管理組合 is ban quản trị as in card 16.
- zh card 1 body: 发帖人是否亲眼所见不明 (未经本人确认 read as "not confirmed by me").
- ko `limit.busy`: the limit is on Engawa reading new notices in, not on the reader.
- ko trace lines: particle-free (같은 내용 확인: {input}({source}), 읽기: {model}), so a vowel-final input or model name no longer produces 이 or 으로 after it.

None of the fixes contradicted the Japanese or English master. A few small choices beyond the list, for consistency with it: ko `heard.listening` now names the renamed stop button ('듣기 멈추기'를 누르세요), ko `home.step1_body` uses 올리다 like the other drop-in strings, ko card 17 puts the kanji in parentheses (주민회(町内会)) like the others, zh `offline.dropin_reason` and `poster.community` use 发布 like the other drop-in strings, and the zh quotes around [姓名] are the file's own “ ”.

**Checks**

| check | result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm guard --all` (no dashes, key parity across the five files) | clean |
| `pnpm check:boards`, `check:places`, `check:placeholders`, `check:mode`, `check:inbox`, `check:push`, `check:contact` | 143, 31, 17, 49, 23, 52 and 33 checks, all pass |
| `pnpm db:seed --board musashikosugi --reset-cards --dry-run` | parses; three samples on the pilot board |
| `pnpm eval --only p02,p03,p05 --no-write` (03:30 JST) | 3 inputs (p05 has no expected file, so the eval skips it): field accuracy 21/21, PII leaks 0, invented facts 0, six languages 3/3, errors 0 |
| `pnpm eval --only p04 --no-write` (03:31 JST, in place of p05: the LINE screenshot with a phone number in `must_not_contain`) | field accuracy 6/6, PII leaks 0, invented facts 0, six languages 1/1, errors 0 |

**The disconnect, on a throwaway board.** `pnpm board:throwaway create freeze-smoke` (the repository's tool for this: an unlisted copy of the pilot board that refuses the six real slugs), dev server on port 3127, then a node script that drops in `t02-water-distribution-notice-ja.txt` as text, opens the process stream and aborts the fetch right after the first event.

| step | time | result |
|---|---:|---|
| submission | 2.4 s | 201, received |
| process stream | 3.6 s | 200, first event `stage: extracting`, then the client aborted |
| cards poll | 20.4 s | one `water` card, `missing_langs` empty, no `held_reason`, `risk_flags` or `purge_after` in the JSON |
| process again on the same id | 20.5 s | 200, `done` with the card id |
| process with a non-UUID id | | 404 |

The server log shows reconcile (create) and translate (zh, ko, vi, easy_ja in 6535 ms) finishing after the client left, and no TypeError or unhandled error. A second drop-in read to the end (the made-up 避難指示 notice above) streamed stage, cards, stage and done and closed normally. `pnpm board:throwaway delete freeze-smoke` removed 2 cards, 2 card_sources, 2 submissions and 2 devices, which is what the two runs created; the six real boards were not touched. The dev server was stopped.

**Docs.** `docs/PLAN.md` (architecture, client-driven processing) and `CLAUDE.md` (architecture rules) said a disconnect leaves the submission in `processing` and the watchdog fires at 120 seconds; both now say the run finishes with `after()` and the watchdog fires at 330 seconds.

**For the reviewing session.** The IP window counts every ask from one address, so a venue where many judges share one network could reach 60 an hour together; each sees the usual rate-limited message. After the merge, `pnpm db:seed --board <slug> --reset-cards` puts the corrected sample cards on the live boards; it deletes the cards there now, including any made during rehearsals.
