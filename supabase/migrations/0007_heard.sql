-- Loudspeaker broadcasts, written 2026-11-04 during the event: the heard
-- input (a neighbour's transcript of the 防災行政無線 loudspeaker) and the
-- official inbox (the city's broadcast mail, forwarded to the board).
-- Additive only: the deployed code keeps working against this schema.
-- Safe to run twice.

-- A submission typed or transcribed from the loudspeaker ("I heard the
-- loudspeaker" in the drop-in panel). Null on every other submission.
alter table submissions add column if not exists heard boolean;

-- How the server itself vouches for a submission. 'official': it arrived
-- through the board's official inbox with the board's inbox secret, from an
-- allowed sender. Null for everything a browser sends.
alter table submissions add column if not exists source_hint text;
alter table submissions drop constraint if exists submissions_source_hint_check;
alter table submissions add constraint submissions_source_hint_check
  check (source_hint in ('official'));

-- Two platforms that only code sets, from the channel the text came through.
alter table submissions drop constraint if exists submissions_detected_platform_check;
alter table submissions add constraint submissions_detected_platform_check
  check (detected_platform in
    ('line', 'wechat', 'x', 'xiaohongshu', 'facebook', 'paper', 'other', 'unknown', 'loudspeaker', 'city_mail'));

-- The official inbox of a board: sha256 hex of the bearer secret (the secret
-- itself is shown to the admin once and stored nowhere), and the sender
-- addresses the route accepts, lower case. No secret means no inbox.
alter table boards add column if not exists inbox_secret_hash text;
alter table boards add column if not exists inbox_senders text[] not null default '{}';

-- The inbox rate limit and the admin's "last accepted mails" read this.
create index if not exists submissions_board_hint_created_idx
  on submissions (board_id, created_at desc) where source_hint is not null;
