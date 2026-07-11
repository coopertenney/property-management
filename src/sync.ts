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

  // Bad-fetch guard: an empty feed is indistinguishable from a failed/partial fetch,
  // so we refuse to upsert OR reconcile against it — otherwise a hiccup would prune
  // or cancel every real reservation. A genuinely empty calendar simply no-ops here.
  if (reservations.length === 0) {
    console.warn(
      "⚠️  Feed contained 0 events — skipping upsert and reconciliation to avoid data loss.\n",
    );
    return;
  }

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

  await reconcile(reservations);

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

/**
 * Reconcile the DB against the feed. The upsert only ADDS/updates what the feed
 * contains; it never removes rows that dropped out. This closes that gap for
 * *current/future* rows (past stays are left untouched — they age out of the feed
 * naturally and are not cancellations):
 *
 *   - block no longer in feed            → delete (no human-entered data to keep)
 *   - booking gone, still 'new'          → delete (never sent to the resort, nothing to undo)
 *   - booking gone, already sent/confirmed → mark 'cancelled' + stamp cancelled_at,
 *                                            KEEP it visible so the resort can revoke access
 *   - a 'cancelled' code that reappears   → revive to 'new' (rebooking)
 *
 * Called only after a non-empty feed, so it can't mass-cancel on a bad fetch.
 */
async function reconcile(feed: Reservation[]) {
  const feedCodes = [...new Set(feed.map((r) => r.code))];
  const feedSet = new Set(feedCodes);
  const now = new Date().toISOString();
  const today = toDateStr(new Date());

  // Rebooking: a previously-cancelled code is back in the feed → treat as fresh.
  const { data: revived, error: revErr } = await supabase
    .from("reservations")
    .update({ status: "new", cancelled_at: null, updated_at: now })
    .in("code", feedCodes)
    .eq("status", "cancelled")
    .select("code");
  if (revErr) {
    console.error("❌  Reconcile (revive) failed:", revErr.message);
    process.exit(1);
  }

  // Current/future rows the feed no longer lists.
  const { data: current, error: curErr } = await supabase
    .from("reservations")
    .select("code, is_booking, status")
    .gte("check_out", today);
  if (curErr) {
    console.error("❌  Reconcile (read) failed:", curErr.message);
    process.exit(1);
  }
  const missing = (current ?? []).filter((r) => !feedSet.has(r.code));

  const toDelete = missing
    .filter((r) => !r.is_booking || r.status === "new")
    .map((r) => r.code);
  const toCancel = missing
    .filter(
      (r) => r.is_booking && (r.status === "sent_to_resort" || r.status === "confirmed"),
    )
    .map((r) => r.code);

  if (toDelete.length) {
    const { error } = await supabase.from("reservations").delete().in("code", toDelete);
    if (error) {
      console.error("❌  Reconcile (prune) failed:", error.message);
      process.exit(1);
    }
    console.log(`🗑️   Pruned ${toDelete.length} stale row(s) no longer in feed: ${toDelete.join(", ")}`);
  }

  if (toCancel.length) {
    const { error } = await supabase
      .from("reservations")
      .update({ status: "cancelled", cancelled_at: now, updated_at: now })
      .in("code", toCancel);
    if (error) {
      console.error("❌  Reconcile (cancel) failed:", error.message);
      if (/check constraint/i.test(error.message)) {
        console.error(
          "   → Run db/002_add_cancelled_status.sql in the Supabase SQL editor first (adds the 'cancelled' status).",
        );
      }
      process.exit(1);
    }
    console.log(
      `🚫  Marked ${toCancel.length} cancelled — dropped from feed after resort handoff (revoke key access): ${toCancel.join(", ")}`,
    );
  }

  if (revived?.length) {
    console.log(`↩️   Revived ${revived.length} rebooked reservation(s): ${revived.map((r) => r.code).join(", ")}`);
  }
  if (!toDelete.length && !toCancel.length && !revived?.length) {
    console.log("🔄  Reconciliation: DB matches feed — nothing to prune or cancel.");
  }
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
