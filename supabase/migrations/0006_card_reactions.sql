-- Reader confirmations (N6), written 2026-11-04 during the event.
-- Additive only: the deployed code keeps working against this schema.
-- Safe to run twice.

-- One reaction per card per device: "still true" or "no longer true". A
-- device that changes its mind overwrites its row; `created_at` is when the
-- device last set it. Rows go with their card (cascade) and carry the card's
-- purge_after from the moment they were written. Readers only ever get the
-- counts; device ids never leave the server.
create table if not exists card_reactions (
  card_id     uuid not null references cards(id) on delete cascade,
  device_id   uuid not null,
  kind        text not null check (kind in ('still_true', 'no_longer_true')),
  created_at  timestamptz not null default now(),
  purge_after timestamptz not null,
  primary key (card_id, device_id)
);

create index if not exists card_reactions_card_kind_idx on card_reactions (card_id, kind);
-- Rate limit: a device's reactions in the last hour.
create index if not exists card_reactions_device_created_idx on card_reactions (device_id, created_at desc);
create index if not exists card_reactions_purge_idx on card_reactions (purge_after);

alter table card_reactions enable row level security;

-- Counts per card for the public reads, one round trip for a whole board.
-- Runs with the caller's rights, so RLS keeps it empty for anyone but the
-- service role; execute is granted to the service role only.
create or replace function card_reaction_counts(p_card_ids uuid[])
returns table (card_id uuid, still_true integer, no_longer_true integer)
language sql stable as $$
  select r.card_id,
         (count(*) filter (where r.kind = 'still_true'))::integer,
         (count(*) filter (where r.kind = 'no_longer_true'))::integer
    from card_reactions r
   where r.card_id = any(p_card_ids)
   group by r.card_id;
$$;

revoke all on function card_reaction_counts(uuid[]) from public, anon, authenticated;
grant execute on function card_reaction_counts(uuid[]) to service_role;

-- A reader's "still true" bumps cards.last_confirmed_at, which is not a
-- change of what the card says. updated_at guards the read-modify-write of
-- reconcile and translate (lib/db/cards.ts, lib/db/translate.ts), so a tap
-- must not move it: an update that touches nothing but last_confirmed_at
-- keeps the row's updated_at. Every other update stamps it as before.
create or replace function set_card_updated_at() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'last_confirmed_at' - 'updated_at') = (to_jsonb(old) - 'last_confirmed_at' - 'updated_at') then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists cards_set_updated_at on cards;
create trigger cards_set_updated_at before update on cards
  for each row execute function set_card_updated_at();
