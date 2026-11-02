-- Engawa initial schema. Written 2026-11-02 during the event.
-- All tables have RLS enabled with no policies: the anon key reads nothing.
-- The server uses the service role key, which bypasses RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- boards: one board per neighbourhood (a group of 町丁目)
-- ---------------------------------------------------------------------------
create table boards (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name             jsonb not null,                  -- {ja,en,zh,ko,vi}
  area_codes       text[] not null default '{}',    -- 町丁目 codes (e-Stat), may be empty until G2
  area_names       jsonb not null default '[]',     -- [{code, name_ja}] for display
  known_places     jsonb not null default '[]',     -- see seed/boards.json for the shape
  mode             text not null default 'peace' check (mode in ('peace', 'disaster')),
  mode_changed_at  timestamptz,
  admin_token_hash text not null,                   -- sha256 hex of the admin token
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- devices: anonymous browser identities (rate limiting, "my submissions")
-- ---------------------------------------------------------------------------
create table devices (
  device_id    text primary key,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  consented_at timestamptz,
  purge_after  timestamptz not null default now() + interval '90 days'
);

-- ---------------------------------------------------------------------------
-- submissions: the raw thing someone dropped in
-- ---------------------------------------------------------------------------
create table submissions (
  id                uuid primary key default gen_random_uuid(),
  board_id          uuid not null references boards(id) on delete cascade,
  device_id         text not null,
  input_kind        text not null check (input_kind in ('image', 'text')),
  text_raw          text,                           -- cleared after processing
  image_path        text,                           -- storage object path, private bucket
  image_deleted_at  timestamptz,
  detected_platform text check (detected_platform in
                      ('line', 'wechat', 'x', 'xiaohongshu', 'facebook', 'paper', 'other', 'unknown')),
  uploader_area_code text,                          -- G2, optional
  status            text not null default 'received'
                    check (status in ('received', 'processing', 'done', 'held', 'failed')),
  stage             text,                           -- stripping | extracting | reconciling | translating | done
  held_reason       text,
  error             text,
  card_ids          uuid[] not null default '{}',   -- cards this submission created or touched
  purge_after       timestamptz,
  created_at        timestamptz not null default now(),
  processed_at      timestamptz
);

create index submissions_board_created_idx on submissions (board_id, created_at desc);
create index submissions_device_created_idx on submissions (device_id, created_at desc);
create index submissions_purge_idx on submissions (purge_after);

-- ---------------------------------------------------------------------------
-- cards: one actionable fact, in six languages
-- ---------------------------------------------------------------------------
create table cards (
  id                 uuid primary key default gen_random_uuid(),
  board_id           uuid not null references boards(id) on delete cascade,
  category           text not null check (category in
                       ('water', 'food', 'supplies', 'shelter', 'medical', 'power_comms',
                        'shops', 'transport', 'danger', 'official_notice', 'daily_notice', 'other')),
  place_id           text,                          -- id from boards.known_places, null if unknown
  place_text_ja      text,                          -- place as written, Japanese preferred
  area_code          text,
  title              jsonb not null,                -- {ja,en,zh,ko,vi,easy_ja}
  body               jsonb not null,                -- {ja,en,zh,ko,vi,easy_ja}
  facts              jsonb not null default '{}',   -- {status, conditions[], valid_from, valid_until, ...}
  original_text      text,                          -- PII stripped, source language
  original_lang      text,
  source_type        text not null check (source_type in ('official', 'firsthand', 'secondhand', 'unknown')),
  official_confirmed boolean not null default false, -- set only by the admin route
  source_count       integer not null default 1,
  risk_flags         text[] not null default '{}',
  visibility         text not null default 'public' check (visibility in ('public', 'held', 'hidden')),
  conflict           jsonb,                         -- {statements: [{text, source_type, submission_id, at}]}
  valid_from         timestamptz,
  valid_until        timestamptz,
  pinned             boolean not null default false,
  mode_at_creation   text not null default 'peace',
  purge_after        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index cards_board_public_idx on cards (board_id, visibility, valid_until desc);
create index cards_board_category_place_idx on cards (board_id, category, place_id);
create index cards_purge_idx on cards (purge_after);

-- ---------------------------------------------------------------------------
-- card_sources: which submissions back which card
-- ---------------------------------------------------------------------------
create table card_sources (
  id                 uuid primary key default gen_random_uuid(),
  card_id            uuid not null references cards(id) on delete cascade,
  submission_id      uuid not null references submissions(id) on delete cascade,
  relation           text not null check (relation in ('created', 'confirmed', 'updated', 'conflict')),
  source_type        text not null,
  platform           text,
  uploader_area_code text,
  created_at         timestamptz not null default now()
);

create index card_sources_card_idx on card_sources (card_id, created_at);

-- ---------------------------------------------------------------------------
-- usage_daily: Claude call counter for the daily cap
-- ---------------------------------------------------------------------------
create table usage_daily (
  day           date primary key,
  claude_calls  integer not null default 0,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0
);

-- Atomic increment used by the budget guard. Returns the new count.
create or replace function bump_usage(p_day date, p_in bigint, p_out bigint)
returns integer language sql as $$
  insert into usage_daily (day, claude_calls, input_tokens, output_tokens)
  values (p_day, 1, p_in, p_out)
  on conflict (day) do update
    set claude_calls = usage_daily.claude_calls + 1,
        input_tokens = usage_daily.input_tokens + excluded.input_tokens,
        output_tokens = usage_daily.output_tokens + excluded.output_tokens
  returning claude_calls;
$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger for cards
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cards_set_updated_at before update on cards
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: enabled everywhere, no policies. Only the service role can read or write.
-- ---------------------------------------------------------------------------
alter table boards       enable row level security;
alter table devices      enable row level security;
alter table submissions  enable row level security;
alter table cards        enable row level security;
alter table card_sources enable row level security;
alter table usage_daily  enable row level security;

-- ---------------------------------------------------------------------------
-- Storage: one private bucket for uploads. Signed upload URLs only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
