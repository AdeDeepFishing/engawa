---
name: acceptance-run
description: Acceptance check of a board or pipeline change on a throwaway copy of the pilot board, against the shared Supabase project, through the real drop-in routes, then deletion of everything the run created. Use before claiming a change works. Never on the live musashikosugi board.
---

# Acceptance run on a throwaway board

Every implementation session this week rebuilt the same procedure by hand. The shape is always the same: a copy of the pilot board so the live board is never touched, a dev server on a free port, the real drop-in flow (the two routes the browser calls), a table of what happened for the DEVLOG, then cleanup. Follow it in this order.

## 0. Before you start

- `.env.local` holds `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the secret key, not the publishable one) and `ANTHROPIC_API_KEY`. Never print a value from it, in a command, a log or a message.
- `pnpm install` done, `pnpm typecheck` clean. Migrations are the human's step (`pnpm db:migrate`); a missing column shows up as a PostgREST error in the dev server log, so read that log when a route fails.
- Choose a slug for this run: `<topic>-acceptance`, lowercase letters, digits and hyphens, new for this run (`g2-acceptance`, `polish-pending`, `judge-review` were used before). The slug names the board on the shared database while it exists, so keep it recognisable as a test.

## 1. Create the board

```bash
pnpm board:throwaway create <slug>
```

`scripts/throwaway-board.ts` copies the `musashikosugi` row (mode, areas, known places) without `id` and `created_at`, gives it a test name in every UI language and a fresh admin token hash that nothing reads, and prints the new id and `/b/<slug>`. It refuses every slug in `supabase/seed/boards.json`. The admin page of the new board opens with the same `ADMIN_TOKEN` as every board.

## 2. Dev server on a free port

Other sessions may have servers up, so never assume 3000. Pick a port, check it is free, start the server in the background with its output in a log file under the scratchpad, and wait for the `Ready` line before the first request:

```bash
PORT=3110; lsof -ti:$PORT >/dev/null && echo "busy, pick another" || pnpm dev --port $PORT
```

## 3. Drive the real drop-in flow

Prefer the browser against `http://localhost:$PORT/b/<slug>`: accept the purpose notice, drop a fixture in through the panel (file input or pasted text), watch the pending card go through the stages, open the card sheet, read it in two languages. That exercises browser compression, the upload, the strip on the server, the SSE stream and polling, the same path a neighbour takes.

When a browser is not available, call the same two routes the browser calls. One random device id per run, so step 5 can remove the device row:

```bash
DEVICE=$(uuidgen | tr "A-Z" "a-z")
# text
curl -s -F kind=text -F device_id=$DEVICE -F consent=1 \
  -F "text=<fixtures/inputs/t02-water-distribution-notice-ja.txt" \
  http://localhost:$PORT/api/b/<slug>/submissions
# -> {"id":"<submission id>","status":"received"}
curl -s -N -X POST http://localhost:$PORT/api/process/<submission id>
# -> server-sent events: stage (stripping, extracting, masking, reconciling), then done or failed
# image
curl -s -F kind=image -F device_id=$DEVICE -F consent=1 \
  -F image=@fixtures/inputs/p04-line-water-same-fact.png \
  http://localhost:$PORT/api/b/<slug>/submissions
# what readers get
curl -s http://localhost:$PORT/api/b/<slug>/cards
```

Use the fixtures for the claim you are making (`fixtures/README.md` lists them): `t02` or `p02` for a create, `p04`, `p05`, `s02` for merges onto it (the LINE screenshot also exercises masking and deletion of the original), `p07` for an update, `p10` for a card that must stay separate, `p06` for a held card and the admin queue, `p08` for firsthand text, `a02` for prompt injection inside a message. Only fixtures: every person in them is fictional. Never a real screenshot, never the live board.

Admin, when the change touches it: open `/api/b/<slug>/admin/enter?token=<ADMIN_TOKEN>` once in the browser; the value comes from `.env.local` and goes nowhere else. The clean admin URL then works for 12 hours.

## 4. What to record

A table in the DEVLOG entry, one row per drop-in: order, input, reconcile action (`create`, `merge`, `update`, `conflict`, `hold`), Claude time per stage from the dev log or the SSE events, total time to card, and what the board shows afterwards (cards, source counts, badges). Plus, as applies:

- PII: none of the `must_not_contain` strings of the fixture's expected file appear in the card as the cards API returns it, including `original_text`.
- Chat screenshots: `image_deleted_at` set on the submission and the original gone from storage; a masked copy present only when a card needs one.
- Every new row carries `purge_after`.
- Anything the uploader saw that a reader should not, and anything that took longer than the pipeline usually does (10 to 20 seconds).

## 5. Clean up, always, including after a failed run

```bash
pnpm board:throwaway delete <slug>
```

It removes the storage objects (originals and masked copies, referenced paths plus the board's folders), `card_sources`, `cards`, `submissions`, the device rows that only this board's submissions used, then the board row, and prints the counts. Check them against what you created. Then stop the dev server (`lsof -ti:$PORT | xargs kill`), delete screenshots, PDFs and temp files you wrote, and when the worktree is finished remove its `.next` and `node_modules` (the pnpm store keeps the packages). Say in the hand-over note that the board was deleted and the live board untouched.

## Rules that do not bend

- The live board `musashikosugi` never receives a test input. The script refuses the slug; in the browser you have to refuse it yourself.
- Every Claude call in a run counts against `DAILY_CLAUDE_CALL_CAP`. A long run spends the demo's budget; keep runs to the inputs the claim needs.
- Nothing from `.env.local` in a message, a log or a note. Ids, counts, times and card text are what the table holds.
