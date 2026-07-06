# Property Management Platform

Automates the coordination a property manager currently does: reads bookings from an
Airbnb listing and relays guest + date info to **Everline Resort** so the hotel can set
up key access.

## Status — Slice 1: iCal reader ✅

Reads an Airbnb iCal feed and prints the upcoming reservations to register with the resort.

```bash
npm install
npm run read                              # uses bundled sample-calendar.ics
npm run read -- ./sample-calendar.ics     # explicit file
npm run read -- "https://www.airbnb.com/calendar/ical/12345.ics?s=SECRET"   # real feed
# or set AIRBNB_ICAL_URL in the environment
```

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
- **Slice 2** — Supabase project + `reservations` table; upsert parsed feed.
- **Slice 3** — Next.js dashboard listing upcoming stays with an editable guest-name field.
- **Slice 4** — "Send to Everline" → structured registration email + status logging.
