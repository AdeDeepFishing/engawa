-- How a card was made (N4), written 2026-11-04 during the event.
-- Additive only: the deployed code keeps working against this schema.

-- Why reconcile linked this source to the card: the decision's one-sentence
-- reason from the model, shown to readers in the card sheet. Null on a
-- `created` row (nothing was compared) and on rows written before today.
alter table card_sources add column if not exists reason text;

-- Model id that produced the row: the extract model on a `created` row, the
-- reconcile model on `confirmed`, `updated` and `conflict` rows. Null on rows
-- written before today; readers then see no model named for that row.
alter table card_sources add column if not exists model text;
