# Official inbox

The 防災行政無線 loudspeakers broadcast in Japanese only, and outdoors they are often hard to make out. Kawasaki publishes the text of each broadcast by email (メールニュースかわさき, with 防災行政無線 ticked as a topic), in the かわさき防災アプリ and on a phone line; there is no feed or API. The official inbox takes the email: a mail forwarder posts each message to the board, and the board turns it into an `official` card in six languages. A card a neighbour already made from what they heard ("I heard the loudspeaker" in the drop-in panel) is merged or updated by reconcile, not repeated.

A feed poller is the third way in, beside mail forwarding and a direct POST: where a city publishes its broadcasts as a feed, a Worker reads it and posts each new broadcast here (Shibuya: `workers/shibuya-portal/`, `docs/BOARDS.md`).

## Request

```
POST /api/b/<slug>/inbox
Authorization: Bearer <inbox secret>
Content-Type: application/json

{
  "from": "\"メールニュースかわさき\" <sender@example.jp>",
  "subject": "【防災行政無線】放送内容",
  "text": "こちらは、防災かわさきです。...",
  "received_at": "2026-11-04T14:05:00+09:00"
}
```

- `from`: the From header, with or without a display name. Its address must be on the board's list of allowed senders (case does not matter).
- `subject`, `text`: the subject and the plain text body. Code removes the signature (after a `-- ` line) and the footer (from the first 配信停止, 登録解除, 送信専用 or unsubscribe line after the broadcast, or from the last rule line when only links, addresses and the publisher follow it) before Claude reads the mail; `lib/inbox/clean.ts`, checked by `pnpm check:inbox`.
- `received_at`, optional: when the mail arrived, ISO 8601. It is the reference for 本日 and 15時 in the text. A value older than 24 hours or in the future is ignored and the time of the request is used.

The route runs the whole pipeline before it answers (extract, reconcile, translate), usually 15 to 30 seconds:

| Status | Body | When |
|---|---|---|
| 201 | `{submission_id, status, card_ids, public_count, held_count, actions, switched_to_disaster}` | Processed. `actions` has one reconcile action per fact: `create`, `merge`, `update`, `conflict`, `hold`. `switched_to_disaster` is true when this mail switched the board from peace to disaster (below). |
| 403 | `{error: "forbidden"}` | No such board, no secret on the board, or a wrong one. |
| 413 | `{error: "too_large"}` | Body over 20 KB. |
| 400 | `{error: "bad_request"}` | Not JSON, or `from`, `subject` or `text` missing. |
| 403 | `{error: "sender_not_allowed"}` | The From address is not on the list. Logged with the sender's domain only. |
| 429 | `{error: "rate_limited"}` | 60 accepted mails on this board in the last hour. `Retry-After: 3600`. |
| 503 | `{error: "busy"}` | The daily Claude call cap is reached. |
| 422 | `{error: "empty"}` | Nothing left after the footer was removed. |
| 500 | `{error: <code>, submission_id}` | The pipeline failed (for example `pii_leak`, `refusal`). The submission is marked failed; posting the mail again makes a new one. |

What the board does with it: the submission is a text submission with `source_hint = 'official'` and the device id `inbox`. Extract is told in the user turn that the text came through the official inbox, and code sets every fact to `official` with platform `city_mail` whatever the model answered (`applyChannel` in `lib/claude/extract.ts`). Risk flags still hold a fact for the admin. `official_confirmed` stays a human's step on the admin page. Readers see "From the city's broadcast mail" as the source line. The raw text is cleared when processing ends, as for every submission.

Disaster mode: when a mail's fact goes onto a public card (create, merge or update) in category `danger`, `official_notice` or `shelter` (extract files an evacuation order that names where to go as `shelter`) and its Japanese title, body or excerpt names an emergency (避難指示, 避難命令, 緊急安全確保, 警戒レベル4 or 5, 津波警報, 特別警報, 震度5弱 or stronger; not when the title says 解除 or 訓練), a board in peace switches to disaster with the reason `inbox:<submission id>`. The list and its reasons are in `lib/cards/mode.ts` (`pnpm check:mode`). Only this route can do it: a neighbour's text or the "I heard the loudspeaker" input never switches the mode, whatever it says. The board returns to peace by itself 7 days after the switch once no public official `danger`, `official_notice` or `shelter` card has been created for 7 days, or when the admin switches it back on the admin page.

```bash
curl -s -X POST "https://<host>/api/b/<slug>/inbox" \
  -H "Authorization: Bearer <inbox secret>" \
  -H "Content-Type: application/json" \
  --data '{"from":"<allowed sender address>","subject":"<subject>","text":"<broadcast text>"}'
```

## Setting up a board

1. On the board's admin page, section "Official inbox": generate a secret and copy it at once (it is shown once; only its sha256 digest is stored). Replacing it later stops the old one immediately.
2. Enter the allowed sender addresses, one per line, at most ten: the From address the city's mail actually uses. Read it from a mail you received, do not guess it.
3. Deploy the forwarder below with the secret and the inbox URL the admin page shows.
4. Subscribe the forwarder's address to メールニュースかわさき and tick 防災行政無線. The confirmation mail goes through the forwarder too, which is why the outline keeps a copy for you.

The admin page lists when the last five mails were accepted, by time only.

### When the list registers by empty mail

メールニュースかわさき registers whichever address sends it an empty mail, and an Email Routing address can only receive: sending to an arbitrary recipient from a Worker needs the paid Workers plan. The free route puts a mailbox that can send in front of the forwarder:

1. In that mailbox (a Gmail works), add the forwarder address as a forwarding address. Gmail's confirmation mail arrives through the worker; read its link from `wrangler tail` while a setup-only `console.log` of refused mails is in place, then remove that line.
2. Add a filter for the list's sending domain (for Kawasaki `sg-p.jp`) that forwards to the forwarder address. Gmail keeps the original From header, so the sender list still names the city's address, `kawasaki@sg-p.jp`.
3. Send the empty mail from that mailbox, open the registration link from the reply, tick the topics (防災行政無線 and 緊急情報 for the pilot board; the defaults add a dozen weather warnings, which would only cost Claude calls) and register.

Done this way for the pilot board on 2026-11-04. A later board with its own domain on the paid plan can drop the mailbox and send the empty mail from a Worker.

## Forwarder: Cloudflare Email Routing worker

A custom address on a domain with Cloudflare Email Routing (for example `bousai-<board>@<your domain>`), routed to an Email Worker. The worker parses the message with [postal-mime](https://www.npmjs.com/package/postal-mime) and posts the From header address, the subject and the plain text body:

```js
import PostalMime from "postal-mime";

export default {
  async email(message, env, ctx) {
    ctx.waitUntil(message.forward(env.COPY_TO)); // a copy to your own verified address
    const mail = await PostalMime.parse(message.raw);
    const res = await fetch(env.ENGAWA_INBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.ENGAWA_INBOX_SECRET}` },
      body: JSON.stringify({ from: mail.from?.address ?? message.from, subject: mail.subject ?? "", text: mail.text ?? "", received_at: new Date().toISOString() }),
    });
    console.log(`engawa inbox: ${res.status}`);
  },
};
```

- `ENGAWA_INBOX_SECRET` is a Worker secret (`wrangler secret put ENGAWA_INBOX_SECRET`), never a plain variable and never in the repository. `ENGAWA_INBOX_URL` is the address from the admin page. `COPY_TO` must be a verified destination address in Email Routing; drop that line once the subscription is confirmed and you trust the route.
- The From header is used rather than the envelope sender: list services often send from a bounce address that changes per message.
- The worker does not reject the mail when the board refuses it. A rejection would bounce back to the city's list, which may unsubscribe the address after a few bounces. Read refusals in the worker log (`wrangler tail`) and the board's server log.
- Anyone who learns the routing address can send to it with a forged From header, so the address is not published anywhere; the bearer secret is the gate that matters, the sender list a second one, and every card stays unconfirmed until the admin confirms it.
- The route does not watch for the forwarder hanging up, so a long pipeline run still finishes.

## Limits that are deliberate

- One board per secret. A second board gets its own secret; one forwarder address may fan a mail out to several boards of the same city (Kawasaki's mail goes to 武蔵小杉 and 溝の口), each posted with that board's own secret.
- The inbox accepts only text. Attachments and HTML parts are ignored by the outline above (postal-mime's `text` is the plain text part).
- No automatic retries: a mail that failed processing is not run again by itself. Its submission shows the error code, and the admin can post the copy again.
