# lib/claude

Everything that talks to Claude lives here. Prompts are Markdown files loaded at build time. Schemas are JSON Schema files passed as the structured output format. Code in this folder never writes to the database; it returns validated objects that `lib/db` applies.

Before writing or changing a call, read the `claude-api` skill for the exact SDK shapes (structured output format, citations, cache_control, effort). Do not rely on memory.

## Calls

### extract (`extract.ts`)

- Model: `claude-opus-5-5` (measure; `claude-sonnet-5-5` is the fallback for latency).
- System: `prompts/extract.system.md`, marked for prompt caching.
- Then the board context block, also cached: board name, mode, `now` as an ISO string in JST, and the known places list (id, name_ja, aliases, names).
- Then the user content: the image (base64 JPEG or PNG after server stripping, long edge at most 1568px) and or the text, last.
- Output format: `schemas/extract.schema.json`. Low effort. Max output tokens around 6000 (six languages for several facts).
- After the call: `bump_usage` with the token counts; reject the whole result if any planted PII pattern appears in any string (the eval does this; production does a cheap regex pass for phone numbers and emails).
- If latency is over 20 seconds on the fixtures: use a derived schema with only `ja` and `en` in `multilingual` (generated in code from the full schema), publish the card, then call `translate` and patch the card.

### translate (`translate.ts`, only if extract is split)

- System: `prompts/translate.system.md`.
- Input: a numbered list of items with `title.ja`, `title.en`, `body.ja`, `body.en`.
- Output format: `schemas/translate.schema.json`.

### reconcile (`reconcile.ts`)

- Candidates are selected by code: same board, same category, `visibility = 'public'`, and either `valid_until` is null or in the future or `created_at` within the last 24 hours, and `place_id` equal to the new fact's or null. At most 20, most recent first. Compact each candidate to: id, place_id, place_text_ja, status, valid_from, valid_until, conditions, source_type, official_confirmed, source_count, title.ja, created_at, updated_at.
- System: `prompts/reconcile.system.md`. User content: the board `now`, the new fact, the candidate list as JSON.
- Output format: `schemas/reconcile.schema.json`.
- Code validates: `target_card_id` is in the candidate list when the action is not `create`; `create` has a null target. Anything else is treated as `create` and logged.
- Applying decisions (in `lib/db`):
  - `create`: insert the card with `source_count = 1`, a `card_sources` row with relation `created`.
  - `merge`: `source_count + 1`, `card_sources` row `confirmed`, `last confirmed` timestamp; if `fill_missing`, set null fields from the new fact.
  - `update`: replace title, body, facts, valid_from, valid_until, status with the new fact's values; keep the id and sources; `card_sources` row `updated`; keep the previous statement inside `conflict` history as the superseded value for display.
  - `conflict`: do not change the card content; set `conflict` to both statements (existing and new, with source types and times); `card_sources` row `conflict`.
  - `hold`: insert the card with `visibility = 'held'` and `held_reason`.
- Facts with any risk flag skip reconcile and are inserted as `held`.

### ask (`ask.ts`)

- Model: `claude-sonnet-5-5` first (speed); switch to Opus if answers are weaker on the fixtures.
- System: `prompts/ask.system.md`, cached.
- Documents: one per public, non-hidden card, ordered by id for a stable cache prefix. Document title: the card title in the reader's language. Document content: the body in the reader's language, the Japanese title, source type, official_confirmed, source_count, created_at, valid_until, and "possibly outdated" if expired. Citations enabled on every document.
- User content: the reader's interface language and the question.
- Response: text blocks with citations. Map each citation's document index back to the card id and render it as a chip. Non-streaming first.
- Questions are never stored. Only the usage counter is updated.

## Budget guard

Every call goes through `withUsage()` which checks `usage_daily` for today against `DAILY_CLAUDE_CALL_CAP` before calling and increments after. Over the cap, the caller returns a "busy" status and the UI shows the message in the user's language.
