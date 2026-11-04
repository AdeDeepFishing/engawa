-- Listed boards, written 2026-11-04 during the event. The home page lists
-- only boards marked listed; throwaway boards from acceptance runs
-- (scripts/throwaway-board.ts) are created unlisted, so a run that forgets
-- its cleanup no longer shows on the index. Every board stays reachable by
-- its URL either way: only the index reads this column.
-- Additive only: the deployed code keeps working against this schema, and
-- the new home page falls back to listing every board until it is applied.
-- Safe to run twice.

alter table boards add column if not exists listed boolean not null default true;
