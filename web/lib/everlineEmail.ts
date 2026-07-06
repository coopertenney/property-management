import type { Reservation } from "./supabaseClient";

/** Parse a YYYY-MM-DD string as a local date (no timezone shift). */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function longDate(s: string): string {
  return parseDate(s).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Build the registration email (subject + body) to send to Everline Resort for
 * a reservation. This is the message that tells the hotel who's arriving and
 * when, so they can set up key access.
 */
export function buildEverlineEmail(r: Reservation): { subject: string; body: string } {
  const guest = r.guest_name?.trim() || "(guest name)";
  const subject = `Guest key access — ${r.guest_name?.trim() ?? r.code}, ${longDate(
    r.check_in,
  )}`;
  const body = [
    "Hello Everline team,",
    "",
    "Please arrange key access for the upcoming reservation below:",
    "",
    `Guest:        ${guest}`,
    `Check-in:     ${longDate(r.check_in)}`,
    `Check-out:    ${longDate(r.check_out)}  (${r.nights} night${
      r.nights === 1 ? "" : "s"
    })`,
    `Reservation:  ${r.code}`,
    "",
    "Thank you.",
  ].join("\n");
  return { subject, body };
}

/** Build a mailto: link that opens the user's mail client pre-filled. */
export function everlineMailto(r: Reservation, to: string): string {
  const { subject, body } = buildEverlineEmail(r);
  const params = new URLSearchParams({ subject, body });
  // URLSearchParams encodes spaces as "+"; mail clients want %20 in mailto bodies.
  const query = params.toString().replace(/\+/g, "%20");
  // Address (if any) goes in raw — email addresses have no chars needing encoding.
  return `mailto:${to.trim()}?${query}`;
}
