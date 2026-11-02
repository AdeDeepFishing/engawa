-- Reconcile and admin, written 2026-11-04 during the event.
-- Additive only: the deployed day 1 code keeps working against this schema.

-- Why a card is held: risk flags joined by commas, or "reconcile: <reason>".
alter table cards add column if not exists held_reason text;

-- When another source last confirmed the card (reconcile merge).
alter table cards add column if not exists last_confirmed_at timestamptz;

-- Atomic increment used by reconcile merge, so two neighbours confirming
-- the same card at the same moment both count. Returns the new count.
create or replace function bump_card_source(p_card uuid)
returns integer language sql as $$
  update cards
     set source_count = source_count + 1,
         last_confirmed_at = now()
   where id = p_card
  returning source_count;
$$;
