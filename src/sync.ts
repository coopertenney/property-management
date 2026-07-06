import { loadICal, parseAirbnbICal, type Reservation } from "./airbnb-ical.ts";
import { supabase } from "./supabase.ts";

/**
 * Slice 2: read an Airbnb iCal feed and upsert reservations into Supabase.
 *
 * Key rule: the calendar feed owns dates/code/phone, but NOT guest_name or status.
 * Those are human-owned, so we omit them from the upsert payload — new rows get
 * their column defaults, existing rows keep whatever you typed.
 *
 * Source: CLI arg → AIRBNB_ICAL_URL env → bundled sample-calendar.ics.
 */
async function main() {
  // Use || (not ??) so a blank AIRBNB_ICAL_URL="" falls through to the sample.
  const source = process.argv[2] || process.env.AIRBNB_ICAL_URL?.trim() || "sample-calendar.ics";
  const usingSample = source === "sample-calendar.ics";
  console.log(`\n📥  Syncing calendar: ${source}${usingSample ? "  (sample data)" : ""}\n`);

  const reservations = parseAirbnbICal(await loadICal(source));

  const rows = reservations.map((r) => ({
    code: r.code,
    is_booking: r.isBooking,
    check_in: toDateStr(r.checkIn),
    check_out: toDateStr(r.checkOut),
    nights: r.nights,
    phone_last4: r.phoneLast4 ?? null,
    reservation_url: r.reservationUrl ?? null,
    updated_at: new Date().toISOString(),
    // guest_name and status are deliberately omitted — see note above.
  }));

  const { data, error } = await supabase
    .from("reservations")
    .upsert(rows, { onConflict: "code" })
    .select("code");

  if (error) {
    console.error("❌  Upsert failed:", error.message);
    if (error.message.includes("does not exist")) {
      console.error("   → Run db/schema.sql in the Supabase SQL editor first.\n");
    }
    process.exit(1);
  }

  console.log(`✅  Synced ${data?.length ?? 0} reservation(s) into Supabase.`);

  // Show what's now in the DB, upcoming first, so you can eyeball it.
  const { data: upcoming } = await supabase
    .from("reservations")
    .select("code, check_in, check_out, guest_name, status, is_booking")
    .eq("is_booking", true)
    .gte("check_out", toDateStr(new Date()))
    .order("check_in", { ascending: true });

  if (upcoming?.length) {
    console.log(`\nUpcoming guest reservations in DB:\n`);
    for (const r of upcoming) {
      const name = r.guest_name ?? "(no name yet)";
      console.log(`  • ${r.check_in} → ${r.check_out}  ${r.code}  [${r.status}]  ${name}`);
    }
  }
  console.log();
}

/** Format a node-ical local-midnight Date as YYYY-MM-DD using LOCAL components. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

main().catch((err) => {
  console.error("\n❌  Error:", err.message, "\n");
  process.exit(1);
});
