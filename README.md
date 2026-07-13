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
npm run names -- --gmail  # live: pull booking emails straight from Gmail (see "Live Gmail ingestion")
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
  `AIRBNB_EMAILS_DIR` or a CLI arg; it defaults to the bundled `sample-emails/`. For the
  scheduled sync it reads Gmail directly — see **Live Gmail ingestion** below.

### Live Gmail ingestion
`npm run names -- --gmail` pulls Airbnb "Reservation confirmed" emails straight from the
operator's mailbox (`src/gmail.ts`) and runs them through the same parse + fill pipeline —
no manual `.eml` export. The scheduled sync (`.github/workflows/sync.yml`) runs this step
right after the iCal sync, **gated on the `GMAIL_REFRESH_TOKEN` secret** so it stays dormant
until you complete the setup below.

Auth is an **OAuth2 refresh token** — the only headless option for a *personal* Gmail
account (a service account with domain-wide delegation is Google Workspace only). One-time
setup:

1. In [Google Cloud Console](https://console.cloud.google.com/) create (or pick) a project,
   enable the **Gmail API**, and configure the **OAuth consent screen** (External, your own
   account as a test user is fine). **Publish the app to "Production"** — while it's in
   "Testing", Google expires the refresh token after **7 days** and the cron dies weekly.
2. Create an **OAuth client ID** of type **Desktop app**. Note the client ID + secret.
3. Do the one-time consent to mint a **refresh token** with scope
   `https://www.googleapis.com/auth/gmail.readonly` (e.g. via the
   [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/): gear icon → "Use
   your own OAuth credentials" → authorize the Gmail readonly scope → exchange for a refresh
   token).
4. Put the three values in `.env` locally (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`) and as **repo secrets** for the Actions cron. Optionally set
   `GMAIL_QUERY` to override the default search
   (`from:airbnb.com subject:("reservation confirmed" OR "booking confirmed") newer_than:30d`).

> ⚠️ **Validate against a real email first.** The parser's regexes
> (`src/airbnb-email.ts`) were derived from sample fixtures, not a real Airbnb host email —
> real ones are multipart HTML, which `gmail.ts` extracts to text before parsing. Run
> `npm run names -- --gmail` once by hand and confirm names fill. If a message is fetched
> but not parsed, the command prints the start of it so you can adjust the regexes — that's
> the single place to fix wording. Re-ingestion is idempotent (fill-only, code-keyed), so
> running it repeatedly is safe.

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
- ✅ **Auto guest names** — DONE. `npm run names` parses Airbnb "Reservation confirmed" emails and fills `guest_name`, matched on confirmation code (fill-only). Live Gmail ingestion (`--gmail`) is wired into the scheduled sync, gated on OAuth creds (see **Live Gmail ingestion**); one manual validation against a real Airbnb email closes it out.
- 🚧 **Auth + RLS** — login + Row Level Security. Dashboard now requires a Supabase
  Auth login (`web/components/auth-gate.tsx`); `db/003_auth_rls.sql` enables RLS so the
  anon key can't read/write on its own. The server-side sync uses the **service-role**
  key (`SUPABASE_SERVICE_ROLE_KEY`) to bypass RLS. Sign-up must be disabled and a single
  operator account created (see `db/003_auth_rls.sql`).
- ✅ **Scheduled sync** — DONE. `npm run sync` runs on a GitHub Actions cron so the dashboard stays current.
