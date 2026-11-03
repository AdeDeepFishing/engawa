-- Masked chat screenshots (G1), written 2026-11-03 during the event.
-- Additive only: the deployed code keeps working against this schema.

-- Storage path of the masked copy of a chat screenshot (names, avatars,
-- handles, phone and room numbers painted over) in the submissions bucket
-- under masked/. Null for paper photos, text, and cards whose masking
-- failed. The object is deleted with the card by the purge job.
alter table cards add column if not exists masked_image_path text;
