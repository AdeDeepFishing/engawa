# lib/claude

Everything that talks to Claude lives here. Prompts are Markdown files loaded at build time. Schemas are JSON Schema files passed as the structured output format. Code in this folder never writes to the database; it returns validated objects that `lib/db` applies.

Before writing or changing a call, read the `claude-api` skill for the exact SDK shapes (structured output format, citations, cache_control, effort). Do not rely on memory.

## Calls

### extract (`extract.ts`)

- Model: `claude-opus-5-5` (measure; `claude-sonnet-5-5` is the fallback for latency).
- System: `prompts/extract.system.md`, marked for prompt caching.
- Then the board context block, also cached: board name, mode and the known places list (id, kind, name_ja, address_ja, aliases, names). Nothing in it changes between calls, so the cache hits.
- Then the user content, last: `now` as an ISO string in JST (it changes every call, so it must not sit inside a cached block), then the image (base64 JPEG or PNG after server stripping, long edge at most 1568px) and or the text.
- Output format: `schemas/extract.schema.json`. Low effort. Max output tokens around 6000 (six languages for several facts).
- After the call: `bump_usage` with the token counts. Code then validates: enums, six languages present, `place_id` must be on the board (unknown ids become null and are logged), and a regex pass for phone numbers and emails over every text field rejects the whole result (`ExtractError("pii_leak")`). The eval additionally checks the planted names from `fixtures/expected`.
- A `refusal` stop reason fails the submission with a clear error; no fallbacks beta this week.
- If latency is over 20 seconds on the fixtures: use a derived schema with only `ja` and `en` in `multilingual` (generated in code from the full schema), publish the card, then call `translate` and patch the card.

### translate (`translate.ts`, only if extract is split)

- System: `prompts/translate.system.md`.
- Input: a numbered list of items with `title.ja`, `title.en`, `body.ja`, `body.en`.
- Output format: `schemas/translate.schema.json`.

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
- Every `card_sources` row records how it came about (migration 0005): `confirmed`, `updated` and `conflict` rows carry the decision's `reason` (the model's one sentence, at most 500 characters) and `model` (the reconcile model id, set by code from the outcome, never by the model); a `created` row has no reason and names the extract model. `getPublicCardTrace` in `lib/db/cards.ts` returns these rows for a public card (relation, source type, platform, time, reason, model; nothing from the submission) through `GET /api/cards/[id]/trace`, and the card sheet shows them as "How this card was made".
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
