# Shibuya portal poller

A Cloudflare Worker, `engawa-shibuya-portal`, that runs every 5 minutes, reads the 防災行政無線 feed of the 渋谷区防災ポータル (https://bosai.city.shibuya.tokyo.jp/musen/index.html) and posts each new broadcast to the `shibuya` board's official inbox (`docs/INBOX.md`). It is the third way into an inbox, beside a mail forwarder and a direct POST. It lives apart from the Next app: its own `package.json`, lockfile, `tsconfig.json` and pnpm root, excluded from the app's typecheck, lint and build.

- `src/feed.ts`: pure functions (feed parsing, order, what is due, the inbox body, the inbox's answer).
- `src/run.ts`: one run, with fetch, KV, the clock and the log passed in.
- `src/index.ts`: the `scheduled` handler that wires the Worker's bindings into `runOnce`.
- `test/feed.test.ts`: `node --test` through tsx, fixtures in `test/fixtures`, no network.

## What one run does

1. Fetches the month list (`get_json.php?file=renkei_73_bosai_radio_list.js`) and the newest month file. It also reads the month before when the newest has no broadcast, or when even the newest month's oldest broadcast is after the stored time (a broadcast late in the previous month may still be waiting). The portal serves JSON; the body is parsed as text in case the content type changes. Every portal fetch has a 15 second timeout and a User-Agent naming the project and its address.
2. Sorts the broadcasts by `update_at`, oldest first. Each broadcast has a key: its `update_at` plus a short hash of the Japanese title and message, so two broadcasts in one minute stay apart.
3. **First run ever** (no `state` in KV): stores the newest broadcast's `update_at` (and the keys of that minute) and posts nothing, so the broadcasts already on the portal never become cards.
4. Otherwise posts each broadcast at or after the stored `last_update_at` whose key is not among the last 20 posted keys, oldest first, at most 5 per run. After each 201 it stores that broadcast's `update_at` and key at once. It stops at the first post that does not answer 201, so a later broadcast is never posted before an earlier one.
5. The post: `from` is `PORTAL_SENDER`, `subject` the Japanese title, `text` the Japanese message (the title when the message is empty), `received_at` the `update_at` read as Japan time (`2026/10/16 12:40` becomes `2026-10-16T12:40:00+09:00`). One line `英語: <English message>` is added only when the English carries a number or a link the Japanese lacks; a plain translation is left out, since the board writes its own six languages.

Log lines carry counts, statuses, inbox error codes and `update_at` values only, never a title or a message:

```
shibuya-portal: 7 broadcasts read, none new since 2026/10/16 12:40
shibuya-portal: 8 broadcasts read, 1 new since 2026/10/16 12:40
shibuya-portal: posted 2026/11/05 10:00: 201, 1 card
shibuya-portal: stopped at 2026/11/05 10:00: 503 busy, retried next run
```

## When a post fails

| inbox answer | the run | the broadcast |
|---|---|---|
| 201 | goes on to the next | stored as posted |
| 429 `rate_limited`, 503 `busy` | stops | tried again next run, no attempt counted |
| 403 `forbidden`, `sender_not_allowed` | stops, the log says to check the secret and the sender list | tried again next run, no attempt counted |
| anything else (500 with the pipeline's code, 400, 413, 422, a 504 from Vercel, a network error, a timeout) | stops, logs the status and the error code | nothing stored as posted; tried again next run; the attempt is counted |

- After 3 failed attempts in a row with a coded answer from the pipeline (an outage, a timeout or an uncoded 5xx is not counted), the next run passes the broadcast over (logged as `given up after 3 failed posts`) and goes on with the next. A broadcast the pipeline cannot handle (`pii_leak`, `refusal`) would otherwise be posted every 5 minutes, spend Claude calls each time and hold back every broadcast after it. Re-post it by hand once the cause is fixed (below).
- A broadcast whose turn comes more than 24 hours after its `update_at` is passed over, not posted: the inbox ignores a `received_at` older than 24 hours and would read 本日 in an old alert as today.
- The inbox answers only after its whole pipeline ran (15 to 30 s, at most 300 s), and it finishes the run even when the caller hangs up. So the post's timeout is 310 s, not 15 s: a shorter one would count a broadcast the board did take as failed and post it again.
- No new post starts after 8 minutes into a run, and a run holds a `lease` key in KV while it posts, and reads the state again under that lease, so a slow run and the next cron run almost never post the same broadcast; the one case left is KV propagation lag, which costs one duplicate mail that reconcile merges.

- A broadcast the ward edits after publishing keeps its `update_at` but gets a new key (the key hashes title and message), so it is posted again as a fresh mail; reconcile merges or updates the card, so a second card there is not a bug.

## Deploy

From this folder, with the account that runs the mail worker:

```bash
pnpm install
pnpm test
pnpm exec wrangler login
pnpm exec wrangler kv namespace create STATE
```

Put the printed id into `wrangler.toml` in place of `REPLACE_WITH_STATE_NAMESPACE_ID` (the id is not a secret, and this repository commits it). Then:

```bash
pnpm exec wrangler secret put ENGAWA_INBOX_SECRET
pnpm run deploy
```

`secret put` asks for the value: the shibuya board's inbox secret from `/b/shibuya/admin` (section "Official inbox"; it is shown once). If the Worker does not exist yet, wrangler offers to create it; answer yes. `pnpm exec wrangler deploy --dry-run` builds without logging in.

Before the first deploy, on `/b/shibuya/admin`: generate the inbox secret, and add `portal@bosai.city.shibuya.tokyo.jp` to the allowed senders (the poller sends that as `from`; the route refuses any other). `docs/BOARDS.md` notes that the feed is the portal's own endpoint, not a published API, and that polling it needs the ward's consent first. The load is one list request and one or two month requests every 5 minutes.

## The first run

Within 5 minutes of the deploy the first cron run stores the state and posts nothing. Check it:

```bash
pnpm exec wrangler kv key get state --binding STATE --remote
```

```json
{"last_update_at":"2026/10/16 12:40","posted":["2026/10/16 12:40#1a2b3c4d"]}
```

`pnpm tail` follows the log live; the Cloudflare dashboard keeps the log of past runs too (Workers Logs, `[observability]` in `wrangler.toml`). From then on, each new broadcast reaches the board within about 5 minutes plus the pipeline's 15 to 30 seconds.

## Re-post one broadcast by hand

For a broadcast that was passed over (failed 3 times, or older than 24 hours when its turn came), or one whose card was removed by mistake:

1. Read the state: `pnpm exec wrangler kv key get state --binding STATE --remote`, and check there is no run posting right now: `pnpm exec wrangler kv key get lease --binding STATE --remote` answers that the value was not found.
2. Write it back with `last_update_at` set to that broadcast's `update_at` (as the portal writes it, for example `2026/11/05 10:00`), its key (it starts with the same `update_at` and a `#`) removed from `posted`, and `failing` removed. Leave the other keys in `posted`: they keep the broadcasts after it from going out again.

   ```bash
   pnpm exec wrangler kv key put state '{"last_update_at":"2026/11/05 10:00","posted":["<the other keys>"]}' --binding STATE --remote
   ```

3. The next run posts it, and any later broadcast whose key is not in `posted`. A broadcast older than 24 hours is passed over again; post that one directly instead, with the board's secret and the curl in `docs/INBOX.md`, its text from the portal page and `"from": "portal@bosai.city.shibuya.tokyo.jp"`.

To start over from the portal's current newest broadcast, delete the state (`pnpm exec wrangler kv key delete state --binding STATE --remote`): the next run seeds it again and posts nothing.

## Free plan limits

- CPU: a run parses a few KB of JSON; far under the 10 ms per invocation.
- Subrequests: at most 3 portal fetches and 5 posts, under 50.
- KV: a run with nothing new reads one key and writes nothing. A run that posts writes the lease, the state once per broadcast, and deletes the lease, well under 1,000 writes a day.
- A cron run may take 15 minutes; the 8 minute budget plus one post's 310 s timeout stays inside it.
