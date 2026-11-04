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
