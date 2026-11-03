-- Hidden duplicates (N3), written 2026-11-04 during the event.
-- Additive only: the deployed code keeps working against this schema.

-- The card a hidden card duplicates. Set by the admin action "hide as a
-- duplicate of"; null for cards hidden for any other reason. A hidden card
-- with duplicate_of set stays readable on request in the board's hidden
-- duplicates drawer; a plain hidden card never leaves the server.
-- The reference is cleared when the original is purged, so the purge job
-- never fails on a duplicate that outlives its original.
alter table cards add column if not exists duplicate_of uuid references cards(id) on delete set null;

create index if not exists cards_board_visibility_duplicate_idx on cards (board_id, visibility, duplicate_of);
