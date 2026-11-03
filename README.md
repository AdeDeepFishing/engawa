# Engawa (縁側)

A multilingual neighbourhood board for Japan.

Drop in what you already have: a photo of a paper notice, a chat screenshot, a pasted message. Claude reads it, removes personal information, turns it into sourced and time-stamped cards, merges duplicates, and writes every card in Japanese, English, Chinese, Korean, Vietnamese and やさしい日本語. Neighbours read and ask questions in their own language. Answers cite the cards, and say "no information yet" when the board has none.

In normal times the board carries building notices and the 回覧板. After a quake, the same button turns it into the neighbourhood's information desk.

**Status:** in development for Built with Claude: Japan 2026 (Nov 2 to 8, 2026). Everything in this repository was written during the event. Japanese README (README.ja.md) follows before submission.

## The demo, in two paragraphs

After an earthquake near 武蔵小杉, 佐藤さん photographs the water distribution notice taped to the entrance of 小杉小学校, the shelter for her block, and drops it into the board. Within about 20 seconds the same card is on three phones in Japanese, English and Chinese: the place, 14:00 to 16:00, bring your own container, marked "official notice (unconfirmed)". チェンさん drops in a WeChat screenshot saying the convenience store in front of the station is open and has water; 佐藤さん sees it in Japanese, tagged "heard from others". Then someone drops a LINE screenshot and a Vietnamese Facebook post about the same water point. No new card appears: the original card now says "3 sources".

Maria asks in English where she can get water and whether she can bring her cat to the shelter. The answer cites the water cards, and for the cat it says the board has no information about that yet. Someone drops in a rumour ("M8 aftershock in 2 hours"); the uploader sees "not public yet, it needs checking first" and nothing reaches the board until a person with the admin link looks at it. Maria photographs the queue and writes "The line is short now, about 10 people"; 佐藤さん reads it in Japanese, tagged "seen firsthand". When a later notice moves the start to 15:00, the card changes and shows the old time as "previously", instead of a second card appearing next to it.

## How it works

1. **Drop in.** The browser re-encodes the photo (EXIF gone) and posts it to the server, which strips metadata again before storing it. Text is posted as is.
2. **Extract** (`lib/claude/extract.ts`, Claude Opus 5.5, structured outputs). Facts, category, place normalized to the board's known places, times, source type, risk flags, and the card text in six languages. Personal information is replaced with placeholders; code rejects any result in which a phone number or email survives.
3. **Reconcile** (`lib/claude/reconcile.ts`, structured outputs). Code picks the candidate cards (same board, category and place, still valid); Claude proposes create, merge, update, conflict or hold; code checks the answer and enforces the trust order (official, then firsthand, then secondhand), so a weaker source never overwrites a stronger one. Anything with a risk flag is held for a human.
4. **Cards** show their source type, how many sources back them, when they changed, the previous version after an update, both statements when sources disagree, and "may be outdated" once they expire.
5. **Admin** (`/b/<slug>/admin`, entered once through `/api/b/<slug>/admin/enter?token=...`, which sets a 12 hour HttpOnly cookie and redirects to the clean URL): the held queue with publish and hide, confirm official, hide any card.

Claude proposes; code decides. The full architecture is in [docs/PLAN.md](docs/PLAN.md).

## Built with Claude Code

Claude Code wrote every line in this repository during the event. The human created the accounts and the Supabase and Vercel projects, kept the secrets in `.env.local` and the Vercel settings, ran the migrations, photographed and reviewed, decided every merge, and talked to the sessions in Chinese. `docs/DEVLOG.md` has one entry per working session with the model, what it did, the measurements and what needed a human; this section is the short version.

**How the sessions were organized.** One planning and reviewing session on `claude-fable-5-1` wrote `CLAUDE.md`, `docs/PLAN.md`, the prompts and the JSON schemas on the kickoff evening, and since then has written the brief for every implementation session, reviewed every pull request with a read-only review subagent (privacy first: what a route exposes, whether a Claude output is treated as data, whether every string goes through `t()`), integrated branches and merged after the human approved. Implementation ran as pairs of sessions in parallel, each in its own git worktree on its own branch, with disjoint file ownership written into the brief (day 1 alone; the day 2 reconcile and admin session beside the day 3 ask, share and eval session; the G2 area badge and G3 poster session beside the G1 masking session; the day 4 polish session beside the day 4 judge-facing session; two more pairs on day 4), so the branches merged without conflicts and each PR could be reviewed on its own. The plan said implementation would run on `claude-opus-5-5`; in practice the sessions from the night of 11/03 to 10:00 JST on 11/04 ran on `claude-fable-5-1` while the weekly budget allowed, and each DEVLOG entry says which it was. Before any Claude call was written or changed, the session read the `claude-api` skill for the exact SDK shapes (structured outputs through `output_config.format`, `cache_control` on the system blocks, `effort`) instead of relying on memory. The 16 fixture images in `fixtures/inputs/` (paper notices, chat and social screenshots with fictional people) were rendered by Claude Code with Playwright on 11/03, and the eval that scores them was written the same day, so every model decision since then has a measurement behind it.

**Which model does what at runtime, and why.** The numbers are from `docs/EVAL.md` and `docs/DEVLOG.md`; the extract rows are over the 15 fixture inputs with expected files.

| Call | Model | Why | Measured |
|---|---|---|---|
| extract: a photo or text to facts in six languages | `claude-opus-5-5`, vision, structured outputs, effort low | Quality decides, not three seconds of latency: Sonnet split one shelter notice into five cards, and the placeholder card covers the wait | Opus 100/100 fields, 0 PII leaks, 0 invented facts, median 14.0 s, p90 18.5 s (11/04). Sonnet 5.5 (11/03, before two prompt rules): 97/100, 4 invented facts, median 11.5 s |
| reconcile: create, merge, update, conflict or hold against candidates code selected | `claude-opus-5-5`, structured outputs, effort low | Same decisions as Sonnet on the acceptance cases, and a wrong merge silently removes a card from the board, which is worse than a second of waiting | 11 of 11 chain steps (6 merges, 1 update, 4 creates), median 2.7 s per call, 0 code overrides. Sonnet 5.5: 2.0 s with the same decisions on four cases |
| ask: a question answered with citations | `claude-sonnet-5-5`, Citations, adaptive thinking, effort low | A person is waiting for the answer, and citations cannot be combined with structured outputs, so the answer is text and code maps each citation back to a card | 1.8 to 3.4 s with the cached prefix on the live board; thinking off was not faster because answer length dominates |
| masking: boxes over names and avatars in a screenshot | `claude-opus-5-5`, vision, structured outputs, effort medium | The ship rule was 100 percent coverage on every masking fixture; effort low and high returned the same boxes as medium | 50 of 50 boxes on five screenshots, 0 extra boxes, median 4.8 to 6.7 s across runs; the first prompt reached 40 of 50 and two rounds of prompt and padding changes closed the gap |

Prompt caching is on every call: the system prompt and the board context (known places with their aliases) are cached blocks and the time and the input come last in the user turn, so from the second call on about 7,000 tokens of extract input are read from cache per call. Claude proposes and code decides: every output is validated against its schema, an unknown place id becomes null, a surviving phone number or email rejects the whole extraction, a merge target must be one of the candidates code offered, and the trust order (official, then firsthand, then secondhand) is enforced in code so a weaker source never overwrites a stronger one.

**Fable 5.1 against Opus 5.5 for extract (11/04).** Same fixtures, prompt and effort: `claude-fable-5-1` scored 99/100 (one category miss, a chat about a convenience store that is open and has water came back as `water` instead of `shops`), 0 PII leaks, 0 invented facts, median 22.6 s and p90 26.7 s against 14.0 s and 18.5 s on Opus, with about 45 percent more output tokens per call at two and a half times the price. Opus stays for extract. The tables are in `docs/EVAL.md`.

**Where the Claude Code setup lives.** `.claude/settings.json` registers a `PostToolUse` hook on `Edit|Write` that runs `scripts/guard.ts` on the file just written: it rejects an em dash or an en dash and a key set that differs between the five message files, the two rules a reviewer should never have to spend attention on. `.claude/skills/acceptance-run/SKILL.md` is the acceptance procedure every implementation session had been re-inventing: a throwaway copy of the pilot board (`scripts/throwaway-board.ts`), a dev server on a free port, the real drop-in routes, then deletion of every object and row the run created, never the live board. `.claude/agents/reviewer.md` is the read-only review subagent with the checklist above and the output the reviews use: ranked findings with file and line, then a verdict. `CLAUDE.md` holds the non-negotiables every session starts from.

## Run it locally

Requirements: Node.js 20 or later, pnpm 10, a Supabase project, an Anthropic API key.

```bash
pnpm install
cp .env.example .env.local   # fill in the keys; see the comments in the file
pnpm db:migrate              # apply supabase/migrations
pnpm db:seed                 # demo board 武蔵小杉, known places, two sample cards
pnpm dev                     # then open http://localhost:3000/b/musashikosugi
```

Without `SUPABASE_URL` the board still renders read-only from the seed files, which is enough to work on the UI. `ADMIN_TOKEN` (generate it with `openssl rand -hex 16`) enables the admin page: open `/api/b/<slug>/admin/enter?token=<ADMIN_TOKEN>` once and the browser keeps a cookie for 12 hours, scoped to that board's admin page and API. Leave it empty and there is no admin at all.

Checks: `pnpm typecheck`, `pnpm lint`, and `pnpm eval` for the fixture evaluation.

## Documents

- Plan, scope and architecture: [docs/PLAN.md](docs/PLAN.md)
- Privacy and retention: [docs/PRIVACY.md](docs/PRIVACY.md)
- Daily log, including which model did what: [docs/DEVLOG.md](docs/DEVLOG.md)
- Claude calls, prompts and schemas: [lib/claude/README.md](lib/claude/README.md)
- Fixture eval, model comparisons and masking coverage: [docs/EVAL.md](docs/EVAL.md)
- Who the board is for and what happens to the data, for readers: `/about` on the deployed site

## Test material

`fixtures/` holds test inputs for the pipeline and the eval: paper notices, chat screenshots and pasted messages made during the event. Every person, name, handle, phone number and room number in them is fictional; only public places near 武蔵小杉 are real, so that place matching can be tested. They are test material, not part of the product. Provenance is in [fixtures/README.md](fixtures/README.md).
