import { loadICal, parseAirbnbICal, upcomingReservations, type Reservation } from "./airbnb-ical.ts";

// Load .env (Node 22 built-in) so AIRBNB_ICAL_URL is available without a CLI arg.
try {
  process.loadEnvFile();
} catch {
  // .env is optional — a CLI arg or existing env var still works.
}

/**
 * Slice 1: read an Airbnb iCal feed and print the upcoming reservations
 * you'd need to relay to Everline Resort for key access.
 *
 * Source resolution (first that's set wins):
 *   1. a path/URL passed as the first CLI arg   →  npm run read -- <url-or-path>
 *   2. the AIRBNB_ICAL_URL environment variable
 *   3. the bundled sample-calendar.ics
 */
async function main() {
  const source = process.argv[2] ?? process.env.AIRBNB_ICAL_URL ?? "sample-calendar.ics";
  const usingSample = source === "sample-calendar.ics";

  console.log(`\n📅  Reading calendar from: ${source}${usingSample ? "  (sample data)" : ""}\n`);

  const icsText = await loadICal(source);
  const all = parseAirbnbICal(icsText);
  const upcoming = upcomingReservations(all);

  const bookings = upcoming.filter((r) => r.isBooking);
  const blocks = upcoming.filter((r) => !r.isBooking);

  if (bookings.length === 0) {
    console.log("No upcoming guest reservations found.\n");
  } else {
    console.log(`Found ${bookings.length} upcoming reservation(s) to register with Everline:\n`);
    for (const r of bookings) console.log(formatReservation(r));
  }

  if (blocks.length > 0) {
    console.log(`(Also ${blocks.length} owner/blocked date range(s) — not guests, no action needed.)\n`);
  }
}

function fmtDate(d: Date): string {
  // node-ical builds all-day (VALUE=DATE) dates at *local* midnight, so the true
  // calendar day is the date's local components. Format in local time to match —
  // forcing UTC here would roll the day backward in any positive-offset timezone.
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatReservation(r: Reservation): string {
  const lines = [
    `  ┌─ ${r.code}`,
    `  │  Check-in : ${fmtDate(r.checkIn)}`,
    `  │  Check-out: ${fmtDate(r.checkOut)}   (${r.nights} night${r.nights === 1 ? "" : "s"})`,
  ];
  if (r.phoneLast4) lines.push(`  │  Guest phone (last 4): ${r.phoneLast4}`);
  if (r.reservationUrl) lines.push(`  │  ${r.reservationUrl}`);
  lines.push(`  └─ Guest name: (fill in — not provided by Airbnb's feed)`);
  return lines.join("\n") + "\n";
}

main().catch((err) => {
  console.error("\n❌  Error:", err.message, "\n");
  process.exit(1);
});
