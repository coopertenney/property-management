-- Migration 002 — add the 'cancelled' status + cancelled_at column.
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run)
-- on any project that already ran the original schema.sql. Fresh installs get this
-- from schema.sql directly and don't need to run it.
--
-- Why a migration: `create table if not exists` in schema.sql does NOT alter an
-- existing table, so the live table keeps the old CHECK constraint until this runs.
-- Until then, the sync's cancellation write fails the constraint (by design — loudly).

alter table reservations
  drop constraint if exists reservations_status_check;

alter table reservations
  add constraint reservations_status_check
  check (status in ('new', 'sent_to_resort', 'confirmed', 'cancelled'));

alter table reservations
  add column if not exists cancelled_at timestamptz;
