/**
 * Live Gmail ingestion — the transport half of "auto guest names".
 *
 * Fetches Airbnb "Reservation confirmed" emails straight from the operator's
 * mailbox so the scheduled sync can fill guest names with no manual .eml export.
 * The parse + fill half is unchanged: this just produces the same `string[]` of
 * raw email text that src/names.ts' loadEmails() produces from a local folder,
 * then hands it to the existing parseAirbnbBookingEmail() (src/airbnb-email.ts).
 *
 * Auth: OAuth2 refresh token. This is the only headless option for a PERSONAL
 * Gmail account — a service account with domain-wide delegation is Workspace-
 * only. Set three env vars from a Google Cloud OAuth "Desktop app" client the
 * operator consents to once (scope https://www.googleapis.com/auth/gmail.readonly):
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 * See README → "Live Gmail ingestion" for the one-time setup.
 *
 * Gotcha worth knowing: if the OAuth consent screen is left in "Testing"
 * publishing status, Google expires the refresh token after 7 days and this
 * dies weekly. Publish the app to "Production" (personal use can proceed past
 * the unverified-app warning) so the token is long-lived.
 *
 * Why format=full and not format=raw: real Airbnb emails are multipart HTML with
 * quoted-printable bodies. Gmail's API already decomposes the MIME tree and
 * transfer-decodes each part, so we pull the decoded text/plain part directly
 * (HTML-strip fallback) and hand the regex parser clean text — far more robust
 * than re-implementing a MIME parser over a raw dump. (loadEnvFile() is called
 * by whoever imports supabase.ts, so process.env is already populated here.)
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// Airbnb host reservation-confirmed emails, recent only. Fill-only writes +
// code-keyed matching make re-ingesting the same message idempotent, so a
// bounded lookback (NOT read-state tracking) is all we need. Override with
// GMAIL_QUERY if Airbnb's sender/subject wording drifts.
const DEFAULT_QUERY =
  'from:airbnb.com subject:("reservation confirmed" OR "booking confirmed") newer_than:30d';

/** True when all three OAuth env vars are present. */
export function gmailConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN,
  );
}

/** Exchange the long-lived refresh token for a short-lived access token. */
async function accessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(
      `Gmail token refresh failed (${res.status}). If the token expired, re-consent — ` +
        `a "Testing" OAuth app expires refresh tokens after 7 days; publish it to ` +
        `Production. Detail: ${detail}`,
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Gmail token refresh returned no access_token.");
  return json.access_token;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function decodeB64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

/** Depth-first search for the first part of `mimeType` that carries body data. */
function findPart(part: GmailPart | undefined, mimeType: string): string | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return decodeB64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

/** Very small HTML→text fallback for HTML-only messages (no text/plain part). */
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

/** Best-effort readable text for one message payload. */
function messageText(payload: GmailPart): string {
  const plain = findPart(payload, "text/plain");
  if (plain) return plain;
  const html = findPart(payload, "text/html");
  if (html) return stripHtml(html);
  // Single-part message: body sits directly on the payload.
  if (payload.body?.data) return decodeB64Url(payload.body.data);
  return "";
}

/**
 * Fetch recent Airbnb reservation-confirmed emails as readable text, ready to
 * feed straight into parseAirbnbBookingEmail(). Returns [] when nothing matches.
 */
export async function fetchAirbnbEmails(): Promise<string[]> {
  if (!gmailConfigured()) {
    throw new Error(
      "Gmail not configured. Set GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / " +
        "GMAIL_REFRESH_TOKEN (see README → Live Gmail ingestion).",
    );
  }
  const token = await accessToken();
  const headers = { authorization: `Bearer ${token}` };
  const query = process.env.GMAIL_QUERY?.trim() || DEFAULT_QUERY;

  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=50&q=${encodeURIComponent(query)}`,
    { headers },
  );
  if (!listRes.ok) {
    throw new Error(
      `Gmail messages.list failed (${listRes.status}): ${(await listRes.text()).slice(0, 300)}`,
    );
  }
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const ids = (list.messages ?? []).map((m) => m.id);

  const texts = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, { headers });
      if (!res.ok) return "";
      const msg = (await res.json()) as { payload?: GmailPart };
      return msg.payload ? messageText(msg.payload) : "";
    }),
  );
  return texts.filter((t) => t.trim());
}
