-- Web push for official and danger cards, written 2026-11-05 during the event.
-- Additive only: the deployed code keeps working against this schema, and the
-- new code tolerates the table being absent (the board then hides "Get
-- alerts" and the pipeline sends nothing). Safe to run twice.

-- One row per board a browser asked to be alerted for. `endpoint` is the push
-- service URL the browser gave (Chrome's, Firefox's, Apple's or Microsoft's;
-- the route accepts nothing else), and `p256dh` and `auth` are the browser's
-- keys that encrypt each message for it. The push service cannot read the
-- messages; the server only ever sends them, and no row reaches any other
-- device or the admin page, which gets the count per board.
--
-- One browser has one endpoint for the whole site, so following two boards is
-- two rows with the same endpoint: unique per board, not per endpoint alone.
--
-- Retention: `purge_after` is 90 days after `last_used_at`, and both move on
-- every delivery the push service accepted and every time the board page
-- confirms a subscription that is still on (at most once a day per board).
-- The daily purge job deletes rows past it (lib/db/purge.ts). A row is also
-- deleted at once when the reader turns alerts off, when its board is
-- deleted (cascade), and when the push service answers 404 or 410 (the
-- browser dropped the subscription).
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references boards(id) on delete cascade,
  device_id    uuid not null,
  endpoint     text not null check (length(endpoint) <= 1024),
  p256dh       text not null check (length(p256dh) <= 128),
  auth         text not null check (length(auth) <= 64),
  lang         text not null check (lang in ('ja', 'en', 'zh', 'ko', 'vi')),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  purge_after  timestamptz not null,
  unique (board_id, endpoint)
);

-- The unique index above serves every query: a board's rows for a send and
-- for the admin count (board_id leads), and the upsert and the delete of one
-- browser's row. The purge reads purge_after once a day over a table of a few
-- thousand rows at most, so it has no index of its own.

alter table push_subscriptions enable row level security;
