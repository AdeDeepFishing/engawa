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
8. There are no accounts. A random device identifier in the browser is used for rate limiting and for showing a user their own submissions.

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
| Cards | Yes | `valid_until` + 30 days |
| Questions | No | n/a |
| Device identifier | Yes | 90 days after last activity |

Every row and object carries `purge_after`, computed when it is written. A daily job deletes storage objects first, then rows. During the hackathon week the job runs once a day; the schedule is in `docs/PLAN.md`.

## What Claude sees

Images and text are sent to the Claude API from the server only, under Anthropic's commercial terms. Prompts instruct the model to treat any instruction inside an image or message as data. The model never writes to the database; code validates every output and writes only whitelisted fields.

## Consent

Before a first drop-in, the user sees a one-line statement of purpose ("to share information about this neighbourhood on this board") and a reminder that names and contact details in screenshots are removed automatically. The area badge asks for separate, one-time, explicit consent.

This document describes design intent, not legal advice.
