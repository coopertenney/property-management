# Property Management Platform

Automates the coordination a property manager currently does: reads bookings from an
Airbnb listing and relays guest + date info to **Everline Resort** so the hotel can set
up key access.

## Status

- **Slice 1 — iCal reader** ✅ — parse a feed and print upcoming reservations.
- **Slice 2 — Supabase sync** ✅ — upsert reservations into a Postgres table, preserving human-entered guest names and status.
- **Slice 3 — Dashboard** ✅ — Next.js + shadcn/ui app in `web/` (Everline lodge theme) with a live card list backed by Supabase.
- **Slice 4 — Send to Everline** ✅ — per-reservation action that opens a pre-filled registration email (guest + dates for key access) and logs the handoff (`status`, `sent_to_resort_at`). Set `NEXT_PUBLIC_EVERLINE_EMAIL` in `web/.env.local` to pre-fill the recipient.

### Sync CLI (repo root)
```bash
npm install
cp .env.example .env      # then fill in SUPABASE_URL / SUPABASE_ANON_KEY (+ AIRBNB_ICAL_URL when you have it)

npm run read              # Slice 1: print upcoming reservations (no DB needed)
npm run sync              # Slice 2: sync feed → Supabase (uses sample-calendar.ics by default)
npm run sync -- "https://www.airbnb.com/calendar/ical/12345.ics?s=SECRET"   # real feed
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
(or via the Management API). The sync **never overwrites** `guest_name` or `status` — the
calendar feed owns dates/code/phone; you own the guest name and the resort-handoff status.

### What Airbnb's iCal feed gives us
- ✅ Booked/blocked **dates**, **reservation code**, guest **phone last-4**, reservation URL
- ❌ **No guest name** — that only comes from Airbnb booking emails or a PMS, and gets
  filled in per-booking later.

## Files
- `src/airbnb-ical.ts` — reusable parser (`parseAirbnbICal`, `upcomingReservations`,
  `loadICal`). This carries forward into the Supabase/Next.js app.
- `src/read.ts` — the CLI runner for Slice 1.
- `sample-calendar.ics` — realistic sample feed (real Airbnb export format).

> Note: all-day iCal dates are parsed at *local* midnight, so dates are formatted in
> local time. Don't force UTC formatting — it rolls the day backward in +offset zones.

## Roadmap
Slices 1–4 are done (see Status above). Next up:
- **Real Airbnb access** — swap the sample feed for the live iCal URL (needs co-host access or your own listing). This is the real-world blocker, not code.
- **Auto guest names** — parse Airbnb booking emails (or a PMS) so the guest name fills in automatically instead of by hand.
- **Auth + RLS** — add login and Row Level Security before this leaves your machine.
- **Scheduled sync** — run `npm run sync` on a schedule (Supabase pg_cron / a cron job) so the dashboard stays current.
