import ical from "node-ical";

/**
 * A single event pulled from an Airbnb iCal feed.
 *
 * Note what Airbnb's feed does and does NOT contain:
 *   - dates, reservation code, and phone last-4 are present
 *   - the guest's NAME is never in the feed (it only comes from booking
 *     emails or a PMS). That field gets filled in later, per booking.
 */
export interface Reservation {
  /** Reservation code, e.g. "HMNEXT0003", parsed from the reservation URL. Falls back to the UID. */
  code: string;
  /** true = a real guest booking; false = an owner/manual block on the calendar. */
  isBooking: boolean;
  /** Check-in day (the guest arrives). */
  checkIn: Date;
  /** Check-out day (the guest leaves — iCal's DTEND, which is exclusive). */
  checkOut: Date;
  /** Number of nights. */
  nights: number;
  /** Last 4 digits of the guest phone, if Airbnb included them. */
  phoneLast4?: string;
  /** Link to the reservation in the Airbnb host dashboard, if present. */
  reservationUrl?: string;
}

const RESERVATION_CODE_RE = /reservations\/details\/([A-Z0-9]+)/;
const PHONE_LAST4_RE = /Phone Number \(Last 4 Digits\):\s*(\d{4})/;
const RESERVATION_URL_RE = /Reservation URL:\s*(\S+)/;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse the raw text of an Airbnb iCal (.ics) feed into structured reservations.
 * Works identically whether the text came from a file or an HTTPS fetch.
 */
export function parseAirbnbICal(icsText: string): Reservation[] {
  const parsed = ical.sync.parseICS(icsText);
  const reservations: Reservation[] = [];

  for (const key of Object.keys(parsed)) {
    const event = parsed[key];
    if (event.type !== "VEVENT" || !event.start || !event.end) continue;

    const description = typeof event.description === "string" ? event.description : "";
    const summary = typeof event.summary === "string" ? event.summary : "";

    const codeMatch = description.match(RESERVATION_CODE_RE);
    const code = codeMatch ? codeMatch[1] : String(event.uid ?? "unknown");

    const checkIn = event.start as Date;
    const checkOut = event.end as Date;
    const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / MS_PER_DAY));

    // A real booking says "Reserved"; owner/manual blocks say "Not available".
    const isBooking = /reserved/i.test(summary) && !/not available/i.test(summary);

    reservations.push({
      code,
      isBooking,
      checkIn,
      checkOut,
      nights,
      phoneLast4: description.match(PHONE_LAST4_RE)?.[1],
      reservationUrl: description.match(RESERVATION_URL_RE)?.[1],
    });
  }

  return reservations.sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());
}

/**
 * Return only reservations whose stay has not fully ended yet (current + future),
 * i.e. the ones you'd actually need to register with the resort.
 */
export function upcomingReservations(reservations: Reservation[], now: Date = new Date()): Reservation[] {
  return reservations.filter((r) => r.checkOut.getTime() > now.getTime());
}

/**
 * Load an Airbnb iCal feed from either an https:// URL or a local file path.
 */
export async function loadICal(source: string): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch iCal feed: ${res.status} ${res.statusText}`);
    return res.text();
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(source, "utf8");
}
