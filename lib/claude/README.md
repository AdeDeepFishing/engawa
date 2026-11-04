# lib/claude

Everything that talks to Claude lives here. Prompts are Markdown files loaded at build time. Schemas are JSON Schema files passed as the structured output format. Code in this folder never writes to the database; it returns validated objects that `lib/db` applies.

Before writing or changing a call, read the `claude-api` skill for the exact SDK shapes (structured output format, citations, cache_control, effort). Do not rely on memory.

## Calls

### extract (`extract.ts`)

- Model: `claude-opus-5-5` (measure; `claude-sonnet-5-5` is the fallback for latency).
- System: `prompts/extract.system.md`, marked for prompt caching.
- Then the board context block, also cached: board name, mode and the known places list (id, kind, name_ja, address_ja, aliases, names). Nothing in it changes between calls, so the cache hits.
- Then the user content, last: `now` as an ISO string in JST (it changes every call, so it must not sit inside a cached block), then the image (base64 JPEG or PNG after server stripping, long edge at most 1568px) and or the text.
- Output format: `schemas/extract.schema.json`. Low effort. Max output tokens 6000.
- Languages, since 2026-11-04: `title` and `body` carry Japanese, English and the input's own language when it is Chinese, Korean or Vietnamese; the other languages are `null` in the schema and absent after validation (`PartialMultilingual`). The translate call below writes the rest after the card is on the board, so the first card shows in about 9 seconds instead of 13 (measurement in `docs/DEVLOG.md`, 2026-11-04 split entry).
- After the call: `bump_usage` with the token counts, also when the checks below reject the output (see Budget guard). Code then validates: enums, Japanese and English present and non-empty, `place_id` must be on the board (unknown ids become null and are logged), and a regex pass for phone numbers and emails over every text field rejects the whole result (`ExtractError("pii_leak")`). The eval additionally checks the planted names from `fixtures/expected`.
- A `refusal` stop reason fails the submission with a clear error; no fallbacks beta this week.

### translate (`translate.ts`)

- Model: `claude-opus-5-5` (default), `TRANSLATE_MODEL` switches it. Effort low, non-streaming, max output 8000 tokens.
- System: `prompts/translate.system.md` plus the same board context block as extract (known places with their names in each language, so translations use the seed's spellings), both marked for caching. User content: the languages to write and the items as JSON (`index`, `title_ja`, `title_en`, `body_ja`, `body_en`).
- Output format: `schemas/translate.schema.json`, cut down in code to the languages asked for (a Chinese input already has Chinese), so the model writes exactly those. One schema variant per language subset.
- Code validates: one entry per item, every asked-for language a non-empty string, no phone number or email in any of them (`TranslateError("pii_leak")`). Since 2026-11-04 it also checks placeholders: every bracketed token (［…］, 〔…〕, [...]) in an item's Japanese or English source must appear in each target of that item, as often, with any of the three bracket kinds (`lostPlaceholders`). A language that loses one is dropped for that item only, title and body together, with a warning that carries counts and no text; it stays missing on the card and the next sweep asks again. `node --import=tsx scripts/check-placeholders.ts` covers the rule on fixed strings without the API.
- In the pipeline (`app/api/process/[id]/route.ts`) the call runs after the submission is finished and the `cards` event is sent: `lib/db/translate.ts` reads the written cards (and up to 3 older cards of the board still missing a language), makes one call for all of them, and writes only the languages each card lacked, under the `updated_at` the row had when it was read. A merge target that already has six languages is read, found complete and left alone; with nothing missing there is no call. A failed call is tried once more; after that the cards keep their fallback (readers see English or Japanese, marked as such, through `lib/cards/langs.ts`) and the next drop-in on the board fills them. Conflict statements written from a fresh fact are filled the same way.
- Scripts: `pnpm eval` runs translate after extract and scores six languages on the result; `pnpm latency` prints extract and translate times side by side.

### reconcile (`reconcile.ts`)

- Model: `claude-opus-5-5` (default), `RECONCILE_MODEL=claude-sonnet-5-5` switches it. Effort low, non-streaming, max output 4000 tokens. Measured on 2026-11-04 in `docs/DEVLOG.md`.
- Candidates are selected by code (`listReconcileCandidates` in `lib/db/cards.ts`): same board, same category, `visibility = 'public'`, and either `valid_until` is null or in the future or `created_at` within the last 24 hours, and `place_id` equal to the new fact's or null (a fact with no place only sees cards with no place). At most 20, most recent first. Compact each candidate to: id, place_id, place_text_ja, status, valid_from, valid_until, conditions, source_type, official_confirmed, source_count, title.ja, created_at, updated_at. Times go to the model in JST.
- No candidates: no call. The fact becomes a new card.
- System: `prompts/reconcile.system.md` plus the same board context block as extract (known places with aliases, needed to match places written differently), both marked for caching (about 4000 tokens, read from cache from the second call on). User content: the board `now`, the new fact, the candidate list as JSON.
- Output format: `schemas/reconcile.schema.json`.
- Code validates (`checkDecision`): `target_card_id` is in the candidate list when the action is not `create`; `create` has a null target. An unknown target, an invalid output or a refusal becomes `create` and is logged. The trust order is enforced in code, not left to the prompt: an `update` from a source weaker than the card (confirmed official, then official, firsthand, secondhand, unknown) becomes a `conflict`, so an old official statement is never overwritten by a new secondhand one.
- The call goes through `withUsage()`. If it throws (API error, daily cap), the fact still becomes its own card: a duplicate is better than losing what a neighbour sent.
- Applying decisions (`applyDecision` in `lib/db/cards.ts`):
  - `create`: insert the card with `source_count = 1`, a `card_sources` row with relation `created`.
  - `merge`: `card_sources` row `confirmed`, then `bump_card_source()` increments `source_count` and sets `last_confirmed_at` atomically. A stronger source raises the card's `source_type` (never `official_confirmed`). If `fill_missing`, null fields are filled from the new fact, and a default end time (`facts.valid_until_stated = false`) is replaced by a stated one.
  - `update`: replace title, body, facts, valid_from, valid_until, status and source type with the new fact's values; keep the id and the source rows; `card_sources` row `updated`. The previous content goes into `conflict.statements` with `kind: "superseded"` (all six languages, times, source type, source count) so readers see "previously: ...". `source_count` starts again at 1 and `official_confirmed` and `last_confirmed_at` are reset, because they described the old content. Open conflicts are dropped: the update settles them.
  - `conflict`: card content unchanged; `conflict.statements` gets the card's current statement and the new one, each with `kind: "conflict"`, source type and time; `card_sources` row `conflict`; `source_count` unchanged.
  - `hold`: insert the card with `visibility = 'held'` and `held_reason = "reconcile: <reason>"`.
- Update and conflict are read-modify-write guarded by `updated_at`, with one retry on a lost race.
- Every `card_sources` row records how it came about (migration 0005): `confirmed`, `updated` and `conflict` rows carry the decision's `reason` (the model's one sentence, at most 500 characters) and `model` (the reconcile model id, set by code from the outcome, never by the model); a `created` row has no reason and names the extract model. `getPublicCardTrace` in `lib/db/cards.ts` returns these rows for a public card (relation, source type, platform, time, reason, model; nothing from the submission) through `GET /api/cards/[id]/trace`, and the card sheet shows them as "How this card was made". The footer names only the models the rows record; a row from before 0005 names none, and no configured default stands in.
- Facts with any risk flag skip reconcile and are inserted as `held` with the flags in `held_reason`.

### ask (`ask.ts`)

- Model: `claude-sonnet-5-5` first (speed); switch to Opus if answers are weaker on the fixtures.
- System: `prompts/ask.system.md`, cached.
- Documents: one per public, non-hidden card, ordered by id for a stable cache prefix. Document title: the card title in the reader's language. Document content: the body in the reader's language, the Japanese title, source type, official_confirmed, source_count, created_at, valid_until, and "possibly outdated" if expired. Citations enabled on every document.
- User content: the reader's interface language and the question.
- Response: text blocks with citations. Map each citation's document index back to the card id and render it as a chip. Non-streaming first.
- Questions are never stored. Only the usage counter is updated.

### mask (`mask.ts`)

- Purpose: find every avatar, display name, handle, phone number and room number in a chat or social screenshot so that code can paint pink rounded rectangles over them (docs/PLAN.md G1). The model returns boxes; it never returns the text of the conversation.
- Model: `claude-opus-5-5` (default), `MASK_MODEL` switches it. Effort medium (the `effort` option; low and high were tried on the fixtures with the same boxes). Non-streaming, max output 4000 tokens.
- Input: the screenshot shrunk by code to a long edge of at most 1568 px (`lib/image/raster.ts`, box filter, re-encoded as JPEG 85 for the call) and the user text stating that exact pixel size. The model and the code therefore agree on the frame; `lib/image/mask-pipeline.ts` scales the boxes back to the stored image. If the model still reports another frame size, code rescales the boxes into the given one and logs it.
- System: `prompts/mask.system.md`, marked for caching. Output format: `schemas/mask.schema.json` (width, height, boxes with kind, label, x, y, w, h).
- Code validates (`validateMaskResult`): at most 60 boxes or the whole answer is rejected (`MaskError("too_many_boxes")`), every coordinate numeric, boxes clipped to the image, boxes entirely outside dropped and counted. A refusal, non-JSON or truncated answer is a `MaskError` too.
- Drawing (`lib/image/mask.ts`, pure JavaScript with `pngjs` and `jpeg-js`): fill `#f5a3c7`, corner radius 8 px, avatar boxes padded by 4 px, text boxes by 10 px, and numbers inside running text (room, phone, handle) by one extra text height sideways, because the model's left edge on such a run can land one character late. PNG stays PNG, JPEG is written at quality 85.
- In the pipeline (`app/api/process/[id]/route.ts`) the call runs beside reconcile for images whose `source_platform` is a chat or social platform (`CHAT_PLATFORMS` in `lib/types.ts`), through `withUsage()`. Any failure is logged by kind and the card continues without a masked copy: nothing is stored. The masked copy goes to the `submissions` bucket under `masked/<board>/<submission>` and its path onto `cards.masked_image_path`; the original is deleted as before. `MASKING_ENABLED=0` turns the stage off.
- Eval: `pnpm eval:mask` scores coverage of the ground truth boxes in `fixtures/masking` (a box counts as covered at 95 percent of its area under the padded predictions) and writes the table to `docs/EVAL.md`. The ship rule is 100 percent on every sidecar.

## Budget guard

Every call goes through `withUsage()` which checks `usage_daily` for today against `DAILY_CLAUDE_CALL_CAP` before calling and increments after. Over the cap, the caller returns a "busy" status and the UI shows the message in the user's language.

Since 2026-11-04 the counting does not depend on the answer being usable. `withUsage((onUsage) => extract(board, input, { onUsage }))`: each wrapper in this folder (`extract`, `translate`, `reconcile`, `ask`, `maskBoxes` through `maskScreenshot`) calls `onUsage` with the token counts as soon as `messages.create` (or the extract stream) returns, before it checks the stop reason or parses anything, and `withUsage` records every reported response in a `finally`. A response that validation then rejects (a refusal, output that is not JSON, a phone number in a translation) counts as a call with its tokens, and the retry after it counts again; before this change both went uncounted. An API error before any response reports nothing and records nothing. `BusyError` is unchanged: it is thrown by the cap check before `fn` runs, so nothing is recorded for it.
