import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseAirbnbBookingEmail, type BookingEmail } from "./airbnb-email.ts";
import { fetchAirbnbEmails } from "./gmail.ts";
import { supabase } from "./supabase.ts";

/**
 * Auto guest names: read Airbnb "Reservation confirmed" emails and fill in the
 * `guest_name` the iCal feed can't provide, matched by confirmation code.
 *
 * FILL-ONLY, never clobber: we set guest_name only on rows where it's still
 * blank. This preserves the codebase's "guest_name is human-owned" invariant —
 * a manual correction you typed always wins over the email. The calendar sync
 * still never touches the field either (see src/sync.ts).
 *
 * Source resolution:
 *   • `npm run names -- --gmail` (or EMAILS_SOURCE=gmail)  →  live Gmail
 *     ingestion via OAuth (src/gmail.ts) — what the scheduled sync uses.
 *   • otherwise a local path (first that's set wins):
 *       1. a path passed as the first CLI arg  →  npm run names -- <dir-or-file>
 *       2. the AIRBNB_EMAILS_DIR environment variable
 *       3. the bundled sample-emails/ directory
 *
 * A local source is a directory of raw emails (one .eml per message) or a single
 * email file. Gmail ingestion returns the same shape (readable message text), so
 * everything below — parse, dedupe, fill-only upsert — is source-agnostic.
 */
async function main() {
  const useGmail = process.argv.includes("--gmail") || process.env.EMAILS_SOURCE === "gmail";
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("🧪  DRY RUN — reading + parsing only, no database writes.");

  let rawEmails: string[];
  if (useGmail) {
    console.log(`\n📨  Reading booking emails from: Gmail (live)\n`);
    rawEmails = await fetchAirbnbEmails();
  } else {
    const source =
      (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "") ||
      process.env.AIRBNB_EMAILS_DIR?.trim() ||
      "sample-emails";
    const usingSample = source === "sample-emails";
    console.log(`\n📨  Reading booking emails from: ${source}${usingSample ? "  (sample data)" : ""}\n`);
    rawEmails = await loadEmails(source);
  }

  if (rawEmails.length === 0) {
    console.warn("⚠️  No emails found — nothing to do.\n");
    return;
  }

  // Parse, drop non-booking / unparseable emails, and dedupe by code (a resend
  // of the same confirmation is common; last one wins).
  const byCode = new Map<string, BookingEmail>();
  for (const raw of rawEmails) {
    const parsed = parseAirbnbBookingEmail(raw);
    if (parsed) byCode.set(parsed.code, parsed);
  }
  const bookings = [...byCode.values()];

  if (bookings.length === 0) {
    console.warn(`⚠️  Read ${rawEmails.length} email(s) but none looked like Airbnb reservation confirmations.`);
    // Don't fail silently-green: if Gmail returned messages we couldn't parse,
    // Airbnb's real layout likely differs from the regexes in airbnb-email.ts.
    // Show the start of the first message so the patterns can be adjusted.
    if (useGmail) {
      console.warn(
        `   → This is expected until the parser is checked against a REAL Airbnb email.\n` +
          `     First message (first 600 chars) so you can adjust airbnb-email.ts:\n`,
      );
      console.warn(rawEmails[0].slice(0, 600));
    }
    console.warn();
    return;
  }
  console.log(`Parsed ${bookings.length} guest name(s) from ${rawEmails.length} email(s):`);
  for (const b of bookings) console.log(`  • ${b.code}  →  ${b.guestName}`);
  console.log();

  // Look up the matching reservation rows so we can (a) skip codes we don't have
  // and (b) respect any name already entered.
  const codes = bookings.map((b) => b.code);
  const { data: existing, error } = await supabase
    .from("reservations")
    .select("code, guest_name")
    .in("code", codes);

  if (error) {
    console.error("❌  Lookup failed:", error.message);
    if (error.message.includes("does not exist")) {
      console.error("   → Run db/schema.sql in the Supabase SQL editor first.\n");
    }
    process.exit(1);
  }

  const rowByCode = new Map((existing ?? []).map((r) => [r.code, r]));
  const now = new Date().toISOString();

  const filled: string[] = [];
  const kept: string[] = []; // already had a name — left untouched
  const unmatched: string[] = []; // no reservation row for this code

  for (const b of bookings) {
    const row = rowByCode.get(b.code);
    if (!row) {
      unmatched.push(b.code);
      continue;
    }
    if (row.guest_name && row.guest_name.trim()) {
      kept.push(b.code);
      continue;
    }
    if (dryRun) {
      filled.push(b.code);
      console.log(`🧪  ${b.code}  ←  ${b.guestName}   (would fill)`);
      continue;
    }
    const { error: upErr } = await supabase
      .from("reservations")
      .update({ guest_name: b.guestName, updated_at: now })
      .eq("code", b.code)
      .or("guest_name.is.null,guest_name.eq.");
    if (upErr) {
      console.error(`❌  Failed to set name for ${b.code}:`, upErr.message);
      process.exit(1);
    }
    filled.push(b.code);
    console.log(`✅  ${b.code}  ←  ${b.guestName}`);
  }

  console.log();
  if (filled.length)
    console.log(`${dryRun ? "Would fill" : "Filled"} ${filled.length} guest name(s): ${filled.join(", ")}`);
  if (kept.length) console.log(`Kept ${kept.length} existing name(s) (not overwritten): ${kept.join(", ")}`);
  if (unmatched.length) {
    console.log(
      `Skipped ${unmatched.length} email(s) with no matching reservation (sync the calendar first?): ${unmatched.join(", ")}`,
    );
  }
  if (!filled.length && !kept.length && !unmatched.length) {
    console.log("Nothing to do.");
  }
  console.log();
}

/**
 * Load raw email text from a directory (every file in it) or a single file.
 * Hidden/dotfiles are skipped so a stray .DS_Store doesn't get parsed.
 */
async function loadEmails(source: string): Promise<string[]> {
  const info = await stat(source).catch(() => null);
  if (!info) throw new Error(`Email source not found: ${source}`);

  if (info.isDirectory()) {
    const names = (await readdir(source)).filter((n) => !n.startsWith("."));
    names.sort();
    return Promise.all(names.map((n) => readFile(join(source, n), "utf8")));
  }
  return [await readFile(source, "utf8")];
}

main().catch((err) => {
  console.error("\n❌  Error:", err.message, "\n");
  process.exit(1);
});
