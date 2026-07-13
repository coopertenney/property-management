# Property Management Platform

Automates the coordination a property manager currently does: reads bookings from an
Airbnb listing and relays guest + date info to **Everline Resort** so the hotel can set
up key access.

## Status

- **Slice 1 — iCal reader** ✅ — parse a feed and print upcoming reservations.
- **Slice 2 — Supabase sync** ✅ — upsert reservations into a Postgres table, preserving human-entered guest names and status.
- **Slice 3 — Dashboard** ✅ — Next.js + shadcn/ui app in `web/` (Everline lodge theme) with a live card list backed by Supabase.
- **Slice 4 — Send to Everline** ✅ — per-reservation action that opens a pre-filled registration email (guest + dates for key access) and logs the handoff (`status`, `sent_to_resort_at`). Set `NEXT_PUBLIC_EVERLINE_EMAIL` in `web/.env.local` to pre-fill the recipient.
- **Slice 5 — Auto guest names** ✅ — parse Airbnb "Reservation confirmed" emails and fill `guest_name` automatically, matched by confirmation code, instead of typing it by hand.

### Sync CLI (repo root)
```bash
npm install
cp .env.example .env      # then fill in SUPABASE_URL / SUPABASE_ANON_KEY (+ AIRBNB_ICAL_URL when you have it)

npm run read              # Slice 1: print upcoming reservations (no DB needed)
npm run sync              # Slice 2: sync feed → Supabase (uses sample-calendar.ics by default)
npm run sync -- "https://www.airbnb.com/calendar/ical/12345.ics?s=SECRET"   # real feed

npm run names             # Slice 5: fill guest_name from booking emails (uses sample-emails/ by default)
npm run names -- ./my-airbnb-emails   # a folder of exported .eml files (or a single email file)
```

### Dashboard (web/)
```bash
cd web
npm install
# web/.env.local holds NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev               # http://localhost:3000
```

### Database
`db/schema.sql` defines the `reservations` table. Run it once in the Supabase SQL editor
(or via the Management API). The calendar sync **never overwrites** `guest_name` or
`status` — it owns dates/code/phone. `guest_name` is filled from booking emails
(`npm run names`, **fill-only** — a name already present is never clobbered); `status` is
the resort-handoff state you own.

Existing projects must also apply **`db/002_add_cancelled_status.sql`** (adds the
`cancelled` status + `cancelled_at`) before reconciliation can run; fresh installs get it
from `schema.sql`.

**Reconciliation:** beyond upserting, each sync reconciles current/future rows against the
feed (past stays are left alone — they age out of the feed, they aren't cancellations):
- a **block** or a still-`new` **booking** that dropped from the feed → deleted
- a booking that dropped **after** being sent/confirmed → marked `cancelled` (kept visible
  so you can have the resort revoke key access), `cancelled_at` stamped
- a `cancelled` code that **reappears** (rebooking) → revived to `new`
- an **empty feed** (likely a bad fetch) → sync skips upsert *and* reconciliation entirely

### What Airbnb's iCal feed gives us
- ✅ Booked/blocked **dates**, **reservation code**, guest **phone last-4**, reservation URL
- ❌ **No guest name** — that comes from Airbnb "Reservation confirmed" emails instead.
  `npm run names` parses those emails and fills `guest_name`, matched on the confirmation
  code (the same `HM…` code the feed carries). Point it at a folder of exported emails via
  `AIRBNB_EMAILS_DIR` or a CLI arg; it defaults to the bundled `sample-emails/`. Live Gmail
  ingestion (feeding real emails into the scheduled sync) is the remaining piece — the
  parse + fill half is done.

## Files
- `src/airbnb-ical.ts` — reusable parser (`parseAirbnbICal`, `upcomingReservations`,
  `loadICal`). This carries forward into the Supabase/Next.js app.
- `src/read.ts` — the CLI runner for Slice 1.
- `sample-calendar.ics` — realistic sample feed (real Airbnb export format).
- `src/airbnb-email.ts` — parser (`parseAirbnbBookingEmail`) that pulls the guest name +
  confirmation code out of an Airbnb "Reservation confirmed" email.
- `src/names.ts` — the CLI runner for Slice 5 (fills `guest_name`, fill-only).
- `sample-emails/` — realistic sample booking emails, keyed to the sample feed's codes.

> Note: all-day iCal dates are parsed at *local* midnight, so dates are formatted in
> local time. Don't force UTC formatting — it rolls the day backward in +offset zones.

## Roadmap
Slices 1–5 are done (see Status above). Next up:
- ✅ **Real Airbnb access** — DONE. Live iCal feed connected (a personal-account test listing); `AIRBNB_ICAL_URL` in `.env` points at it. Sync now reconciles the DB against the feed (see Database above).
- ✅ **Auto guest names** — DONE. `npm run names` parses Airbnb "Reservation confirmed" emails and fills `guest_name`, matched on confirmation code (fill-only). Remaining: live Gmail ingestion into the scheduled sync (currently reads a local email folder).
- 🚧 **Auth + RLS** — login + Row Level Security. Dashboard now requires a Supabase
  Auth login (`web/components/auth-gate.tsx`); `db/003_auth_rls.sql` enables RLS so the
  anon key can't read/write on its own. The server-side sync uses the **service-role**
  key (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS. Sign-up must be disabled and a single
  operator account created (see `db/003_auth_rls.sql`).
- ✅ **Scheduled sync** — DONE. `npm run sync` runs on a GitHub Actions cron so the dashboard stays current.
