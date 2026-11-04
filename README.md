# Engawa (縁側)

[日本語の README はこちら](README.ja.md)

A neighbourhood board for Japan that everyone can read in their own language. In a 武蔵小杉 apartment block the notice about the water outage is taped up in Japanese only, the rest of the news lives in closed LINE and WeChat groups, and after an earthquake the 防災行政無線 loudspeaker announces where to get water in Japanese that is hard to make out outdoors. The resident who reads no Japanese, and the one who cannot hear the loudspeaker, are in none of those places. On Engawa anyone drops in what they already have (a photo of the paper notice, a chat screenshot, a few lines of text, what they heard the loudspeaker say) and the city's own broadcast text comes in by itself. Claude reads it, removes personal information, merges the same fact from different sources into one card and writes every card in Japanese, English, Chinese, Korean, Vietnamese and やさしい日本語. Readers ask questions in their language and get answers that cite the cards, or "no information yet".

**Live:** https://engawaboard.com, with two boards: [武蔵小杉](https://engawaboard.com/b/musashikosugi) (川崎市中原区, 23 町丁目, 14 known places from the city's shelter and water point lists) and [渋谷](https://engawaboard.com/b/shibuya) (渋谷区, 11 町丁目, 19 known places from the ward's lists). Built by Claude Code during Built with Claude: Japan 2026 (Nov 2 to 8, 2026); everything in this repository was written during the event.

## Try it in two minutes

1. Open the [武蔵小杉 board](https://engawaboard.com/b/musashikosugi) and pick your language at the top right.
2. Tap **Drop in a notice**, then under **Try with a sample** pick the photo of a paper notice, the chat screenshot or the pasted text. They are fictional test inputs (made-up names and numbers, real public places). A waiting card shows the real pipeline steps; the card appears in about 10 to 15 seconds in Japanese, English and the input's language, and the other languages follow a few seconds later. The sample adds a test card to the live board.
3. In **Ask this board**, ask "Where can I get water?". The answer cites cards; tap a citation to open the card. Ask "Can I bring my cat to the shelter?" and it says the board has no information about that yet.
4. Open a card and **Share this card**: **Copy link** or **Copy as text**. The link carries your language (`?lang=`), so the preview in LINE or WeChat shows the card in your language, not the sharer's.
5. Switch **List** to **Places**: cards grouped by known place, with the address, the latest shelter status and **Open in maps**.
6. From the same share panel, **Print as a notice (six languages)**: an A4 notice with the board's QR code, made to be taped up next to the Japanese original. The whole board has a poster too: [/b/musashikosugi/poster](https://engawaboard.com/b/musashikosugi/poster).

## The demo, in two paragraphs

An evacuation order goes out over the loudspeakers near 武蔵小杉. The city's broadcast mail reaches the board's official inbox, becomes an official card in six languages, and the board switches itself to disaster mode: a red strip under the top bar, official and danger cards first, then water, shelter and medical, and "I heard the loudspeaker" first in the drop-in panel. 佐藤さん photographs the water distribution notice taped to the entrance of 小杉小学校, the shelter for that block, and drops it in. About ten seconds later the card is on three phones, in Japanese and English at once and in Chinese a few seconds after: the place, 14:00 to 16:00, bring your own container, marked "official notice (unconfirmed)". チェンさん drops in a WeChat screenshot saying the convenience store in front of the station is open and has water; 佐藤さん reads it in Japanese, tagged "heard from others", with the names in the screenshot replaced. Then someone drops a LINE screenshot and a Vietnamese Facebook post about the same water point. No new card appears: the first card now says "3 sources".

Maria asks in English where she can get water and whether she can bring her cat to the shelter. The answer cites the water cards and says the board has no information about the cat yet. Someone drops in a rumour ("M8 aftershock in 2 hours"); the uploader sees "not public yet, it needs checking first", and nothing reaches the board until a person with the admin link looks at it. Maria photographs the queue and writes "The line is short now, about 10 people"; 佐藤さん reads it in Japanese, tagged "seen firsthand". When a later notice moves the start to 15:00, the card changes and shows the old time as "previously" instead of a second card appearing. In **Places**, 小杉小学校 gathers every card about the school with its address and the shelter's latest status, and **Open in maps** takes Maria there.

## How it works

**The pipeline.** Claude proposes; code decides.

1. **Drop in.** The browser re-encodes a photo (EXIF gone) and posts it to a route handler, which strips metadata again before storing it. The browser holds no database key at all.
2. **Extract** (`lib/claude/extract.ts`, `claude-opus-5-5`, vision, structured outputs). Facts, category, place normalized to the board's known places, times, source type, risk flags, the card in Japanese, English and the input's language. Personal information becomes placeholders such as ［名前］. Chat screenshots also get their names and avatars painted over (`lib/claude/mask.ts`) and the original is deleted.
3. **Reconcile** (`lib/claude/reconcile.ts`, `claude-opus-5-5`, structured outputs). Code selects the candidate cards (same board and category, same place or none, still valid, at most 20); Claude proposes create, merge, update, conflict or hold; code applies it.
4. **Translate** (`lib/claude/translate.ts`, `claude-opus-5-5`, structured outputs) fills the other languages after the card is already on the board.
5. **Ask** (`lib/claude/ask.ts`, `claude-sonnet-5-5`, Citations). One document per public card in the reader's language; code maps each citation back to its card. An empty board is answered in code without a call. Questions are not stored.

What code checks, every time: each output against its JSON schema (`lib/claude/schemas/`); a place id that is not on the board becomes null; a phone number or email that survives anywhere rejects the whole extraction or translation; every placeholder in the source must survive in each translation, or that language is dropped and asked for again; a merge or update target must be one of the candidates code offered; the trust order (official, then firsthand, then secondhand) is enforced in code, so a weaker source turns an update into a conflict that shows both statements; a fact with a risk flag (rumour, sensitive personal information) is held for the admin; only whitelisted fields are written; `official_confirmed` is set only from the admin route. Instructions inside an image or message are data. Every card shows its source type, how many sources back it, when it changed, the previous version, conflicting statements, readers' "still true" and "no longer true" counts, and how it was made (each source, Claude's reconcile decision and reason, and the admin's confirmation). The board keeps working offline from the last copy the phone saw (`public/sw.js`).

**The city's broadcasts, three ways in.** The 防災行政無線 is Japanese only and hard to hear outdoors, but cities publish its text. All three ways end at `POST /api/b/<slug>/inbox` with the board's bearer secret and an allowlist of senders ([docs/INBOX.md](docs/INBOX.md)); code labels every fact from there `official` on platform `city_mail`, still unconfirmed until the admin confirms it.

- **Mail relay** (Kawasaki, live since 11/04): メールニュースかわさき, subscribed to 防災行政無線 and 緊急情報, reaches a Gmail that forwards it to a Cloudflare Email Routing address, and an Email Worker posts it to the board.
- **Portal poller** (Shibuya): `workers/shibuya-portal/`, a Cloudflare cron Worker, reads the ward portal's broadcast feed every 5 minutes and posts each new broadcast to the board, oldest first (18 tests). The ward's consent to the polling comes first ([docs/BOARDS.md](docs/BOARDS.md)).
- **Direct POST** from any system that has the text: JSON `{from, subject, text, received_at}`.

A neighbour can also tap **I heard the loudspeaker** and send what the browser's speech recognition wrote down, after correcting it; that is always `secondhand`, and when the city's text arrives reconcile merges it and the card takes the city's wording.

**Disaster mode** is a board state (migration 0009, `lib/cards/mode.ts`, `pnpm check:mode`). The admin can switch it with the reason recorded. The inbox switches a board in peace mode on when an official city mail lands on a public card in category danger, official notice or shelter and names an emergency (避難指示, 緊急安全確保, 警戒レベル4 or 5, 津波警報, 特別警報, 震度5弱 or stronger), but never for 解除, 訓練 or 想定. A neighbour's text never switches it. An automatic switch returns to peace after 7 days without a new official emergency card; a switch the admin made stays until the admin changes it.

The architecture and the reasons behind it are in [docs/PLAN.md](docs/PLAN.md).

## Built with Claude Code

Claude Code wrote every line in this repository. [docs/DEVLOG.md](docs/DEVLOG.md) has one entry per session with its model, what it did, the measurements and what needed a human; this is the short version.

**Who did what.** One planning and reviewing session on `claude-fable-5-1` wrote `CLAUDE.md`, `docs/PLAN.md`, the prompts and the JSON schemas on the kickoff evening, and since then has written the brief for every implementation session, reviewed every pull request, fixed what the review found on an integration branch and merged after the human approved. Implementation ran on `claude-opus-5-5` in the two sessions of the small hours of 11/03 (reconcile and admin; ask, share and eval), in the second half of day 1 after a `/model` switch, and in every session from 11/04 10:00 JST on (offline snapshot, reader confirmations, laptop layout, loudspeaker broadcasts, places and maps, home page, disaster mode, the Shibuya board, the portal poller, the mark, this README). In between, the first half of day 1, the G items and the 11/04 morning features ran on `claude-fable-5-1` while the weekly budget allowed. Each DEVLOG entry names its model.

**Parallel sessions, integrated through review.** Implementation ran as two or three sessions at the same time, each in its own git worktree and branch, with disjoint file lists written into the brief, so branches merged without conflicts and each pull request could be reviewed on its own. Every pull request was reviewed before `main` by the reviewing session with a read-only review subagent, whose checklist became `.claude/agents/reviewer.md` on 11/04; the review fixes landed on integration branches (PRs 3, 7, 11, 15, 18, 21, 26, 27, 30 and 33). 33 pull requests before this one in four days, 32 merged and one superseded.

**Which model does what at runtime, and the measurement behind it** (fixture eval in [docs/EVAL.md](docs/EVAL.md); details in the DEVLOG):

| Call | Model | Why |
|---|---|---|
| extract | `claude-opus-5-5`, effort low | Against Sonnet 5.5 (11/03): Opus 98/100 fields, 0 invented facts; Sonnet 97/100 and 4 invented facts (one shelter notice split into five cards), 3 s faster. Against Fable 5.1 (11/04): Opus 100/100, median 14.0 s; Fable 99/100, median 22.6 s, 45 percent more output tokens at two and a half times the price |
| translate | `claude-opus-5-5`, effort low | Split from extract on 11/04 so the card shows first: first card at a median 8.3 s instead of 13.0 s over 23 inputs. Sonnet scored the same 100/100 and was about 2 s faster, but the card is already on the board while translate runs |
| reconcile | `claude-opus-5-5`, effort low | Same decisions as Sonnet on the acceptance cases, about 1 s slower (median 3.0 s against 2.0 s); a wrong merge silently removes a card, which costs more than a second |
| ask | `claude-sonnet-5-5`, Citations, effort low | A person is waiting; 1.8 to 3.4 s on the live board. Citations cannot be combined with structured outputs, so code maps the cited text back to cards |
| masking | `claude-opus-5-5`, vision, effort medium | Ship rule 100 percent of names and avatars covered: 50 of 50 boxes on five screenshots after two rounds of prompt and padding changes (40 of 50 at first) |

Every call caches the system prompt and the board context (known places with their aliases) and puts the time and the input last, so from the second call on about 5,700 tokens per extract are read from cache. Before any Claude call was written or changed, the session read the `claude-api` skill for the exact SDK shapes instead of relying on memory.

**The eval, latest numbers.** `pnpm eval` over the fixtures on 11/04, after the Shibuya place notes joined the board context: 105 of 105 fields on 16 inputs, 0 personal information leaks, 0 invented facts, risk flags 16 of 16, all six languages 16 of 16, first card at a median 9.3 s (p90 10.8 s). `pnpm eval --reconcile`: 11 of 11 chain steps (create 4, merge 6, update 1), 0 code overrides. `pnpm eval:mask`: 50 of 50 boxes. Every model decision since 11/03 has one of these runs behind it.

**The Claude Code setup in this repository.**
- `.claude/settings.json`: a `PostToolUse` hook on `Edit|Write` runs `scripts/guard.ts` on the file just written and fails with exit 2, so the finding goes straight back to the session, when the file holds an em dash or an en dash or when the five message files stop having the same keys. Those are the two rules a reviewer should never spend attention on. `pnpm guard --all` runs it over the repository.
- `.claude/skills/acceptance-run/SKILL.md`: the acceptance procedure every implementation session had been rebuilding: a throwaway copy of the pilot board (`pnpm board:throwaway create|delete`), a dev server on a free port, the real drop-in routes, a table for the DEVLOG, and deletion of everything the run created. The live board never receives a test input.
- `.claude/agents/reviewer.md`: the read-only review subagent run before every merge, privacy first (what a route exposes, Claude output treated as data, every string through `t()`, 16 px text and 44 px targets), with ranked findings by file and line and a verdict.
- Visual checks ran in the Claude desktop app's built-in browser and in headless Chromium through Playwright, at 390 px and 1280 px, with the contrast and size measurements in the DEVLOG.

**What needed a human.** Accounts and secrets (Anthropic, Supabase, Vercel), buying engawaboard.com and its DNS records, the Gmail relay and the city's mail subscription, applying most migrations, the product decisions on the kickoff evening (name, hosting, pilot board, no alert features, reconcile as one call instead of an agent loop), the accent colour and the mark, and the approval before every merge. The human talked to the sessions in Chinese.

## Privacy and safety

- Exact location never leaves the phone; an opt-in sends only the 町丁目 code, shown as "self-reported area".
- Names, phone numbers, room numbers, chat IDs and plates become placeholders; raw chat screenshots are never shown and are deleted after processing.
- Every row and object has a `purge_after` and a daily job deletes it; questions are not stored.
- No accounts and no search indexing; a random device id in the browser counts limits and reactions.
- Claude output is data: schemas, candidate checks and the trust order are enforced in code, and risky facts are held for a person.
- The full retention table and principles: [docs/PRIVACY.md](docs/PRIVACY.md).

## Run it locally

Requirements: Node.js 20 or later, pnpm 10, a Supabase project, an Anthropic API key.

```bash
pnpm install
cp .env.example .env.local      # fill in the keys; the comments say what each is for
pnpm db:migrate                 # applies supabase/migrations 0001 to 0009 through the session pooler
pnpm db:seed --token-file .env.admin-token.local   # both boards, their known places, sample cards
pnpm dev                        # http://localhost:3000/b/musashikosugi
```

- `pnpm db:seed --board shibuya` seeds one board; `--dry-run` prints what would be written without connecting. Boards come from `supabase/seed/boards.json`, polygons from `lib/geo/<slug>.json`.
- Admin: set `ADMIN_TOKEN` (`openssl rand -hex 16`), open `/api/b/<slug>/admin/enter?token=<ADMIN_TOKEN>` once, and the browser keeps a 12 hour HttpOnly cookie for that board's admin page. Without it there is no admin at all.
- Without `SUPABASE_URL` the board renders read-only from the seed files, enough to work on the UI.
- A throwaway copy of the pilot board for tests: `pnpm board:throwaway create <slug>`, then `pnpm board:throwaway delete <slug>`. It refuses the seeded slugs.
- Checks: `pnpm typecheck`, `pnpm lint`, `pnpm guard --all`, `pnpm check:mode`, `check:places`, `check:inbox`, `check:boards`, `check:placeholders` (no API), and `pnpm eval`, `pnpm eval --reconcile --now 2026-11-03T10:00:00+09:00`, `pnpm eval:mask` (API).
- Inbox by hand: the curl in [docs/INBOX.md](docs/INBOX.md).

## Documents

- Plan, scope and architecture: [docs/PLAN.md](docs/PLAN.md)
- Daily log, with which model did what: [docs/DEVLOG.md](docs/DEVLOG.md)
- Eval tables and model comparisons: [docs/EVAL.md](docs/EVAL.md)
- Privacy and retention: [docs/PRIVACY.md](docs/PRIVACY.md)
- Official inbox and the mail relay: [docs/INBOX.md](docs/INBOX.md)
- Boards, their sources and the checklist for a new city: [docs/BOARDS.md](docs/BOARDS.md)
- Claude calls, prompts and schemas: [lib/claude/README.md](lib/claude/README.md)
- Shibuya portal poller: [workers/shibuya-portal/README.md](workers/shibuya-portal/README.md)
- For readers, who the board is for and what happens to their data: [/about](https://engawaboard.com/about) on the live site

## Test material

`fixtures/` holds the inputs for the pipeline and the eval: paper notices, chat and social screenshots and texts, rendered by Claude Code with Playwright on 11/03 with `expected/` files and masking boxes. Every person, name, handle, phone number and room number in them is fictional and every paper notice carries a 訓練用・想定シナリオ stamp; only public places near 武蔵小杉 are real, so place matching can be tested. Three of them are the board's samples under `public/samples/`. Provenance: [fixtures/README.md](fixtures/README.md).

## After the event

Engawa is meant to run in two layers. One platform operator creates boards, wires each city's broadcasts into its board once and runs the migrations. Each board has a local owner who already puts up the notices (a 自治会, a building manager, a ward office desk) and holds that board's admin link to confirm official cards, hide what does not belong and switch disaster mode. A new city is data, not code: the checklist in [docs/BOARDS.md](docs/BOARDS.md). Today there is one operator and one admin token for every board; a separate admin link per board is the next step. The [about page](https://engawaboard.com/about) says the same for readers in five languages.
