-- Board mode as a real state (N21), written 2026-11-04 during the event: who
-- or what last switched a board between peace and disaster, and when.
-- Additive only: the deployed code keeps working against this schema, and the
-- new code tolerates the column being absent (it then writes the mode and the
-- time without the reason). Safe to run twice.

-- When the mode last changed. Already in 0001_init.sql, repeated here so the
-- state reads as one unit; nothing wrote it before this change, so existing
-- boards have null ("not changed since the board was created").
alter table boards add column if not exists mode_changed_at timestamptz;

-- Why the mode last changed:
--   'admin'              the admin switched it on the admin page
--   'inbox:<submission>' an emergency card from the city's broadcast mail
--                        switched a peace board to disaster (lib/board-mode.ts)
--   'auto_return'        a disaster board went back to peace after 7 days
--                        without a public official danger or notice card
-- Null on boards whose mode was never changed through the app.
alter table boards add column if not exists mode_reason text;
alter table boards drop constraint if exists boards_mode_reason_check;
alter table boards add constraint boards_mode_reason_check
  check (
    mode_reason is null
    or mode_reason in ('admin', 'auto_return')
    or mode_reason ~ '^inbox:[0-9a-f-]{36}$'
  );
