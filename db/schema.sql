-- Property Management Platform — reservations table
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).

create table if not exists reservations (
  -- Airbnb reservation code (e.g. "HMNEXT0003"), or the iCal UID for blocks. Stable per booking.
  code            text primary key,

  -- true = real guest booking; false = owner/manual calendar block.
  is_booking      boolean not null default true,

  -- Stay dates (from the Airbnb iCal feed).
  check_in        date not null,
  check_out       date not null,
  nights          integer not null,

  -- From the feed when present.
  phone_last4     text,
  reservation_url text,

  -- HUMAN-OWNED fields. The sync never overwrites these — the calendar feed
  -- has no guest name, so you fill it in; status tracks the resort handoff.
  guest_name      text,
  status          text not null default 'new'
                    check (status in ('new', 'sent_to_resort', 'confirmed')),
  -- When the registration email was sent to the resort (set by the dashboard).
  sent_to_resort_at timestamptz,

  -- Bookkeeping.
  first_seen_at   timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Handy for the dashboard: list upcoming stays soonest-first.
create index if not exists reservations_check_in_idx on reservations (check_in);

-- NOTE ON SECURITY: Row Level Security is intentionally NOT enabled yet, so the
-- publishable/anon key can read+write during MVP development. Before this goes
-- anywhere real (and when we add dashboard auth in a later slice), we enable RLS
-- and add policies. Until then, keep the project private.
