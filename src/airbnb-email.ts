/**
 * Parse an Airbnb host "Reservation confirmed" email to recover the one thing the
 * iCal feed never carries: the guest's NAME.
 *
 * The join back to a reservation is the **confirmation code** — the same
 * `HM…` code the iCal parser pulls from the reservation URL
 * (see `airbnb-ical.ts`, RESERVATION_CODE_RE). That makes guest names a clean
 * key-matched fill against rows the calendar sync already created.
 *
 * These regexes target the current Airbnb host-confirmation layout, exactly the
 * way `airbnb-ical.ts`'s patterns were derived from the real feed format. The
 * bundled `sample-emails/` fixtures mirror that layout so the flow runs offline.
 * If Airbnb changes its wording, THIS is the single place to adjust — nothing
 * downstream cares how the name was extracted.
 */

export interface BookingEmail {
  /** Confirmation code, e.g. "HMNEXT0003" — the join key to a reservation row. */
  code: string;
  /** Guest's full name as it appears in the email (used as the guest of record). */
  guestName: string;
}

// "Confirmation code: HMNEXT0003" — also matches the code on the next line
// ("Confirmation code\nHMNEXT0003"), since [\s:] spans the newline.
const CONFIRMATION_CODE_RE = /Confirmation code[\s:]+([A-Z0-9]{8,12})\b/i;

// The body headline is "<Full Name> arrives <date>" on its own line, so the
// guest's FULL name is everything on that line before "arrives". Anchored to a
// line start (m flag) and matched against the BODY only (headers stripped
// first), so the "Subject:" header and the standalone "Reservation confirmed"
// line above it can't be mistaken for the name.
const GUEST_NAME_RE = /^([^\n]+?)\s+arrives\b/im;

/** Strip RFC-822 headers: everything up to and including the first blank line. */
function emailBody(rawEmail: string): string {
  const split = rawEmail.split(/\r?\n\r?\n/);
  // No blank line → treat the whole thing as body (e.g. a body-only paste).
  return split.length > 1 ? split.slice(1).join("\n\n") : rawEmail;
}

/**
 * Parse a single raw email (headers + body, one `.eml` message) into a booking.
 * Returns null when it isn't an Airbnb reservation email or is missing the code
 * or name we need — callers skip those rather than write a partial row.
 */
export function parseAirbnbBookingEmail(rawEmail: string): BookingEmail | null {
  const code = rawEmail.match(CONFIRMATION_CODE_RE)?.[1];
  if (!code) return null;

  const guestName = emailBody(rawEmail).match(GUEST_NAME_RE)?.[1]?.trim();
  if (!guestName) return null;

  return { code, guestName };
}
