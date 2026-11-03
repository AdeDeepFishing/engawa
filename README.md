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

## Test material

`fixtures/` holds test inputs for the pipeline and the eval: paper notices, chat screenshots and pasted messages made during the event. Every person, name, handle, phone number and room number in them is fictional; only public places near 武蔵小杉 are real, so that place matching can be tested. They are test material, not part of the product. Provenance is in [fixtures/README.md](fixtures/README.md).
