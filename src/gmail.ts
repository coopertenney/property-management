/**
 * Live Gmail ingestion — the transport half of "auto guest names".
 *
 * Fetches Airbnb "Reservation confirmed" emails straight from the operator's
 * mailbox so the scheduled sync can fill guest names with no manual .eml export.
 * The parse + fill half is unchanged: this produces the same `string[]` of
 * readable email text that src/names.ts' loadEmails() produces from a local
 * folder, then hands it to parseAirbnbBookingEmail() (src/airbnb-email.ts).
 *
 * Auth: IMAP + a Gmail APP PASSWORD (not the account password). This reuses the
 * credential the operator already provisions for mail access — no Google Cloud
 * OAuth client, consent screen, or 7-day-token-expiry dance. Set:
 *   GMAIL_USER            the mailbox address (e.g. coopertenney7@gmail.com)
 *   GMAIL_APP_PASSWORD    a 16-char app password (Google Account → Security →
 *                         2-Step Verification → App passwords). Spaces optional.
 * See README → "Live Gmail ingestion" for the one-time setup.
 *
 * We search Gmail's "All Mail" (so archived confirmations are found too) with
 * STANDARD IMAP search — sender + a date window. We deliberately do NOT use
 * Gmail's X-GM-RAW extension: it silently returned zero results against this
 * account, whereas plain IMAP SEARCH is reliable. We keep the sender filter
 * broad ("airbnb") and let parseAirbnbBookingEmail() discard anything that
 * isn't a reservation confirmation (account/login/ToS mail parses to null).
 * Each match is MIME-parsed with mailparser so the regex parser sees clean text
 * regardless of HTML/quoted-printable encoding.
 * (loadEnvFile() is called by whoever imports supabase.ts, so process.env is
 * already populated here.)
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

// Sender substring to match, and how far back to look. Fill-only writes +
// code-keyed matching make re-ingesting the same message idempotent, so a
// bounded lookback (NOT read-state tracking) is all we need.
const DEFAULT_FROM = "airbnb";
const DEFAULT_LOOKBACK_DAYS = 30;

/** True when both IMAP credentials are present. */
export function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** Small HTML→text fallback for HTML-only messages (no text/plain part). */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Fetch recent Airbnb reservation-confirmed emails as readable text, ready to
 * feed straight into parseAirbnbBookingEmail(). Returns [] when nothing matches.
 */
export async function fetchAirbnbEmails(): Promise<string[]> {
  if (!gmailConfigured()) {
    throw new Error(
      "Gmail not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD (see README → " +
        "Live Gmail ingestion).",
    );
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER!,
      // App passwords are displayed as "abcd efgh ijkl mnop"; accept that form.
      pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, ""),
    },
    logger: false,
  });

  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Gmail IMAP login failed: ${(err as Error).message}. Check GMAIL_USER / ` +
        `GMAIL_APP_PASSWORD — the app password needs 2-Step Verification enabled and ` +
        `IMAP turned on (Gmail → Settings → Forwarding and POP/IMAP).`,
    );
  }

  const from = process.env.GMAIL_FROM?.trim() || DEFAULT_FROM;
  const lookbackDays = Number(process.env.GMAIL_LOOKBACK_DAYS) || DEFAULT_LOOKBACK_DAYS;
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const texts: string[] = [];
  try {
    // "All Mail" so archived confirmations are searched too.
    const lock = await client.getMailboxLock("[Gmail]/All Mail");
    try {
      const uids = await client.search({ from, since }, { uid: true });
      if (uids && uids.length) {
        for await (const msg of client.fetch(uids, { source: true }, { uid: true })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const text = parsed.text || (parsed.html ? stripHtml(parsed.html) : "");
          if (text.trim()) texts.push(text);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return texts;
}
