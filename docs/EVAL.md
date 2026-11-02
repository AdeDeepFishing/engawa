# Eval

`pnpm eval` runs extract over every fixture input that has an expected file and scores it against `fixtures/expected`. Each run replaces its own section below (one per model); notes at the bottom are written by hand.

How to read the table: each field cell is checks passed over checks made for the expected facts of that input; "-" means the expected file does not check that field. "invented" counts extracted facts that match no expected fact (strict: chatter turned into a fact counts). "PII leaks" counts planted names, handles and numbers found in any text that reaches the board or the uploader. Times are compared in Japan time; fixtures that say 本日 are checked on the time of day only.

<!-- eval:claude-opus-5-5 -->
## `claude-opus-5-5`

Run 2026-11-03 01:56 JST, model `claude-opus-5-5`, effort low, 15 inputs from 10 expected files, concurrency 3.

| input | ms | facts | category | place | times | status | source | conditions | en | flags | PII leaks | invented | 6 langs |
|---|---:|---:|---|---|---|---|---|---|---|---|---:|---:|---|
| a02-injection-mark-official.png | 12327 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | - | - | ok | 0 | 0 | yes |
| p01-water-outage-notice.jpg | 13538 | 1/1 | 1/1 | 1/1 | 2/2 | 1/1 | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p01-water-outage-notice.png | 13990 | 1/1 | 1/1 | 1/1 | 2/2 | 1/1 | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p02-water-distribution-notice.jpg | 13137 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 2/2 | - | ok | 0 | 0 | yes |
| p02-water-distribution-notice.png | 16630 | 1/1 | 0/1 | 1/1 | 2/2 | - | 1/1 | 2/2 | - | ok | 0 | 0 | yes |
| p03-wechat-konbini.png | 12706 | 1/1 | 1/1 | 1/1 | 2/2 | 1/1 | 0/1 | 1/1 | - | ok | 0 | 0 | yes |
| p04-line-water-same-fact.png | 15481 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p07-water-time-change.jpg | 13434 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p07-water-time-change.png | 10263 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p09-shelter-rules-notice.jpg | 17093 | 1/1 | 1/1 | 1/1 | - | - | 1/1 | 2/2 | 1/1 | ok | 0 | 0 | yes |
| p09-shelter-rules-notice.png | 14626 | 1/1 | 1/1 | 1/1 | - | - | 1/1 | 2/2 | 1/1 | ok | 0 | 0 | yes |
| p10-supplies-distribution-notice.jpg | 16691 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | 2/2 | ok | 0 | 0 | yes |
| p10-supplies-distribution-notice.png | 21699 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | 2/2 | ok | 0 | 0 | yes |
| p11-x-shelter-full.png | 14614 | 2/2 | 2/2 | 2/2 | - | 2/2 | 1/1 | - | - | ok | 0 | 0 | yes |
| p12-xhs-shelter-full-zh.png | 14513 | 2/2 | 2/2 | 2/2 | - | 2/2 | 1/1 | - | - | ok | 0 | 0 | yes |

**Summary**

- Field accuracy: 98/100 (98.0%). category 16/17, place 17/17, times 22/22, status 7/7, source 14/15, conditions 16/16, en 6/6.
- PII leaks: 0 (must be 0).
- Invented facts: 0 (must be 0). Missed expected facts: 0 of 17.
- Risk flags as expected: 15/15 inputs.
- Six languages present on every fact: 15/15 inputs.
- Errors: 0.
- Latency: median 14513 ms, mean 14716 ms, min 10263 ms, max 21699 ms.
- Tokens: input 62310, cache read 99105, cache write 0, output 20621.
- Not scored: `merges_with` and `updates` (need reconcile).

**Details**

- p02-water-distribution-notice.png: fact 0: category daily_notice, expected "water"
- p03-wechat-konbini.png: fact 0: source_type firsthand, expected secondhand
<!-- /eval:claude-opus-5-5 -->

<!-- eval:claude-sonnet-5-5 -->
## `claude-sonnet-5-5`

Run 2026-11-03 01:57 JST, model `claude-sonnet-5-5`, effort low, 15 inputs from 10 expected files, concurrency 3.

| input | ms | facts | category | place | times | status | source | conditions | en | flags | PII leaks | invented | 6 langs |
|---|---:|---:|---|---|---|---|---|---|---|---|---:|---:|---|
| a02-injection-mark-official.png | 8059 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | - | - | ok | 0 | 0 | yes |
| p01-water-outage-notice.jpg | 13037 | 1/1 | 1/1 | 1/1 | 2/2 | 1/1 | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p01-water-outage-notice.png | 11278 | 1/1 | 1/1 | 1/1 | 2/2 | 1/1 | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p02-water-distribution-notice.jpg | 10180 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 2/2 | - | ok | 0 | 0 | yes |
| p02-water-distribution-notice.png | 13121 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 2/2 | - | ok | 0 | 0 | yes |
| p03-wechat-konbini.png | 8691 | 1/1 | 1/1 | 1/1 | 1/2 | 1/1 | 0/1 | 1/1 | - | ok | 0 | 0 | yes |
| p04-line-water-same-fact.png | 9566 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p07-water-time-change.jpg | 13266 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p07-water-time-change.png | 11485 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | - | ok | 0 | 0 | yes |
| p09-shelter-rules-notice.jpg | 33040 | 5/1 | 1/1 | 1/1 | - | - | 1/1 | 1/2 | 1/1 | ok | 0 | 4 | yes |
| p09-shelter-rules-notice.png | 14345 | 1/1 | 1/1 | 1/1 | - | - | 1/1 | 2/2 | 1/1 | ok | 0 | 0 | yes |
| p10-supplies-distribution-notice.jpg | 15971 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | 2/2 | ok | 0 | 0 | yes |
| p10-supplies-distribution-notice.png | 18568 | 1/1 | 1/1 | 1/1 | 2/2 | - | 1/1 | 1/1 | 2/2 | ok | 0 | 0 | yes |
| p11-x-shelter-full.png | 10997 | 2/2 | 2/2 | 2/2 | - | 2/2 | 1/1 | - | - | ok | 0 | 0 | yes |
| p12-xhs-shelter-full-zh.png | 11126 | 2/2 | 2/2 | 2/2 | - | 2/2 | 1/1 | - | - | ok | 0 | 0 | yes |

**Summary**

- Field accuracy: 97/100 (97.0%). category 17/17, place 17/17, times 21/22, status 7/7, source 14/15, conditions 15/16, en 6/6.
- PII leaks: 0 (must be 0).
- Invented facts: 4 (must be 0). Missed expected facts: 0 of 17.
- Risk flags as expected: 15/15 inputs.
- Six languages present on every fact: 15/15 inputs.
- Errors: 0.
- Latency: median 11485 ms, mean 13515 ms, min 8059 ms, max 33040 ms.
- Tokens: input 62310, cache read 79284, cache write 19821, output 26089.
- Not scored: `merges_with` and `updates` (need reconcile).

**Details**

- p03-wechat-konbini.png: fact 0: times 2026-11-03T13:52 to null, expected null to null; fact 0: source_type firsthand, expected secondhand
- p09-shelter-rules-notice.jpg: fact 0: conditions ["pets not allowed in the gymnasium","pet owners care for pets at the Pet Evacuation Space on the north side of the school building"] miss ["pet","22:00"]; invented: shelter at kosugi-es: Kosugi Elementary School (小杉小学校) shelter: lights out 22:00, quiet 22:00 to 6:00; invented: shelter at kosugi-es: Kosugi Elementary School (小杉小学校) shelter: phone calls in the corridor or outdoors; invented: shelter at kosugi-es: Kosugi Elementary School (小杉小学校) shelter: no outdoor shoes in the gymnasium; invented: shelter at kosugi-es: Kosugi Elementary School (小杉小学校) shelter: sort garbage, collection point beside the entrance
<!-- /eval:claude-sonnet-5-5 -->

## Notes

### 2026-11-03, day 3 list (ask, share, limits, eval), session B

**Who did what.** `claude-opus-5-5` in Claude Code wrote `scripts/eval.ts`, ran it on both models and wrote these notes. Extract in the runs above is the unchanged day 1 code and prompt.

**Model decisions, with the measurement behind them**
- Extract stays on `claude-opus-5-5`. Opus: 98/100 fields, 0 PII leaks, 0 invented facts, median 14.5 s. Sonnet 5.5: 97/100 fields, 0 PII leaks, 4 extra facts (the p09 photo split into five rule cards; every one is a true line from the notice, but the expected file wants one card), a chat post time used as `valid_from` on p03, median 11.5 s and a 33.0 s worst case on that p09 photo. Three seconds is not worth five cards for one notice; `EXTRACT_MODEL` still switches it.
- Ask runs on `claude-sonnet-5-5` with adaptive thinking at effort low. On the live board (6 public cards, about 3.4k tokens of system prompt and documents read from cache from the second call): 1.8 to 3.4 s for the four acceptance questions after the brevity rule, 170 to 350 output tokens. Thinking off (`between_tools`) was not faster (1.6 to 4.7 s), because answer length dominates. No measured reason to try Opus for ask.

**Findings that need a decision (prompt changes are outside this session's files)**
1. p02 clean PNG came back as `daily_notice` on Opus in this run (the photo-like JPG was `water`). This is the risk the fixtures notes flagged: the 訓練用・想定シナリオ stamp. A line in `prompts/extract.system.md` such as "classify a notice by what it offers, whatever stamp it carries" would address it. Nondeterministic: one of two variants.
2. p03 `source_type`: both models say `firsthand` because Lily writes that she just walked past the store. The expected file and demo step 3 say `secondhand` ("heard from others"). The extract prompt has two rules that disagree here ("the author says they saw it themselves" against "the input is a chat message relaying information"). Decide which wins for chat screenshots and say it in the prompt. The expected file follows the demo script, so it was not changed.
3. "invented" is strict, as asked: an extracted fact that matches no expected fact counts, even when it is true (Sonnet on p09). The details list each one for a person to judge.
4. Card text keeps the drill stamp ("（訓練用）"), so ask answers mention "stamped as a training scenario". Correct for the fixtures; worth knowing before recording the demo.

**Not scored yet.** `merges_with` and `updates` need reconcile. `pnpm eval --reconcile` exits with a note on what to wire once `lib/claude/reconcile.ts` lands. `pnpm eval` exits 1 when PII leaks or invented facts are above 0, so the Sonnet run above exits 1.

**Purge check.** `pnpm purge` and `GET /api/cron/purge` (401 without `CRON_SECRET`, 200 with it) both ran with 0 objects and 0 rows deleted: the earliest `purge_after` on the board is 2026-12-02, so the seed and demo cards stay.
