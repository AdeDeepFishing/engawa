# Privacy and data retention

Engawa is built for a moment when people share screenshots of other people's messages and photos of other people's notices. The design assumes every input may contain personal information that must not reach the board.

## Principles

1. Exact coordinates never leave the phone. If a user opts in to the area badge, the browser maps the position to a 町丁目 area code locally and sends only that code. The badge is self-reported and can be faked; it is a trust signal, not a verification.
2. Photos are re-encoded in the browser before upload, which removes EXIF (including GPS). The server strips metadata again before storing or sending anything to Claude.
3. Private names, phone numbers, room numbers, chat IDs and plates are replaced with placeholders such as ［名前］ and ［電話番号］ during extraction. The board shows only the stripped text.
4. Raw chat screenshots are never displayed and are deleted as soon as processing finishes.
5. Questions typed into the ask box are not stored.
6. Anything that could identify a person's health condition or a specific person's situation is held and not published.
7. Boards are not indexed by search engines (`noindex`) and there is no public search.
8. There are no accounts. A random device identifier in the browser is used for rate limiting, for showing a user their own submissions, and for keeping reader confirmations to one per card per device. The ask route counts questions per device identifier, or per client address when a request carries none, over one minute and one hour; the reaction route also counts taps per client address for one hour. Those counters (`lib/rate-limit.ts`) are held in the server's memory for their window only, never stored and never logged. Readers see only the counts of "still true" and "no longer true", never which devices; the device's own choice is remembered in its own browser.
9. The admin page is opened once through a link that carries the admin token. That request sets an HttpOnly cookie holding a digest of the token (never the token itself) with a 12 hour expiry, scoped to that board's admin page and admin API, and redirects to the clean admin URL. After that one request the token appears in no page URL, Referer or browser history entry.

## Area badge

The drop-in panel has an opt-in box, "Add my area (self-reported)", off by default and remembered only in the uploader's own browser. When it is on, the browser asks the phone for its position, matches it against this board's simplified 町丁目 polygons (a few KB bundled with the page, built from e-Stat census boundaries), and shows the resolved area name before anything is sent. The submission then carries that one area code and nothing else about location: no coordinates, no accuracy, no timestamp of the fix, and nothing is logged. A denied, unavailable or unresolved position sends no area at all and the drop-in goes ahead as usual. The server accepts only codes that belong to the board, stores the code on the submission and copies it to the card (and, for a merge, to that source row) as "self-reported area", which readers see as a badge. It is a trust signal the uploader chose to add, never a verification, and it is deleted with the card.

## Loudspeaker broadcasts

"I heard the loudspeaker" in the drop-in panel uses the browser's own speech recognition (the Web Speech API). The sound goes to the speech service the browser uses (in Chrome, Google's; in Safari, Apple's, on the phone or on their servers), never to Engawa. What reaches the board is the text the uploader chose to send, after they could read and correct it, down the same path as pasted text: same consent, same rate limits, same deletion of the raw text after processing. A heard transcript is always labelled secondhand.

The official inbox (docs/INBOX.md) receives the city's broadcast mail through a forwarder the board admin runs. The sender address is compared with the board's list and not stored; a refused mail is logged with the sender's domain only. The mail text is stored like pasted text and cleared when processing ends. The inbox secret is stored only as its sha256 digest.

## Alerts (web push)

"Get alerts" on a board is off until the reader taps it, and the browser asks for permission first. The browser then creates a push subscription with its own push service (Google's for Chrome and Android, Mozilla's for Firefox, Apple's for Safari, Microsoft's for Edge on Windows), and the board stores that subscription for that board only: the push service URL, the browser's two encryption keys, the device identifier, and the reader's language so the alert comes in it. The server accepts push service URLs of those four services and nothing else. Each alert is encrypted for that browser before it leaves the server, so the push service carries it without being able to read it; it sees that the board sent a message, when, its size, and a topic made of the card's id (an opaque id that is in every card link anyway). Alerts carry what the public board already shows: a card's title and the first line of its text, or "Disaster mode on" and the board's name. No subscription data ever reaches another device; the admin page shows only how many devices get alerts from the board. The server log of a send has counts only.

## Retention

| Data | Stored? | Deleted when |
|---|---|---|
| Exact GPS coordinates | Never sent | n/a |
| EXIF in photos | Removed in the browser and again on the server | n/a |
| Uploader area code (町丁目) | Yes, if opted in | With the card |
| Original image: paper notice | Yes, private bucket, served by signed URL | `valid_until` of its cards + 30 days |
| Original image: chat screenshot | Temporarily | Right after processing, at most 24 hours if processing fails |
| Masked screenshot (only if the masking feature ships) | Only if it passed the second check | With the card |
| Pasted raw text | Cleared after processing | Immediately; only the stripped text remains |
| Heard input audio | Never sent to Engawa; the browser's speech service turns it into text | n/a |
| Heard input transcript | Like pasted text, with a flag that it was heard | Immediately after processing; only the stripped text remains |
| Official inbox mail: sender address | Checked against the board's list, not stored; refusals logged with the domain only | n/a |
| Official inbox mail: subject and text | Like pasted text, after code removed the signature and footer | Immediately after processing; only the stripped text remains |
| Inbox secret | Only its sha256 digest, on the board row; the secret is shown to the admin once | When the admin replaces it |
| Allowed sender addresses of the inbox | On the board row (the city's sending addresses) | When the admin edits the list |
| Board mode change (time and reason: `admin`, `auto_return` or `inbox:<submission id>`) | On the board row; readers and the admin page get the kind of reason only, never the id; the server log names the board slug only | Replaced by the next change |
| Cards | Yes | `valid_until` + 30 days |
| Questions | No | n/a |
| Device identifier | Yes | 90 days after last activity |
| Web push subscription (board, push service URL, the browser's two encryption keys, device identifier, language) | Yes, only after the reader turned alerts on; never shown, the admin page gets the count per board | At once when the reader turns alerts off, when the push service answers that the browser dropped it, or with the board; otherwise 90 days after its last use (a delivered alert, or the board page confirming it, at most once a day) |
| Reader confirmation (card, device identifier, "still true" or "no longer true", time) | Yes; readers see counts only | With the card, or at the card's purge date as it stood when the reaction was set, whichever comes first; all of a card's reactions are cleared when an update replaces its content |
| Admin session cookie | Only in the admin's browser: HttpOnly, a digest of the token with its expiry | 12 hours after the admin link was opened |

Every row and object carries `purge_after`, computed when it is written. A daily job deletes storage objects first, then rows. During the hackathon week the job runs once a day; the schedule is in `docs/PLAN.md`.

## What Claude sees

Images and text are sent to the Claude API from the server only, under Anthropic's commercial terms. Prompts instruct the model to treat any instruction inside an image or message as data. The model never writes to the database; code validates every output and writes only whitelisted fields.

## Consent

Before a first drop-in, the user sees a one-line statement of purpose ("to share information about this neighbourhood on this board") and a reminder that names and contact details in screenshots are removed automatically. The area badge asks for separate, one-time, explicit consent.

This document describes design intent, not legal advice.
