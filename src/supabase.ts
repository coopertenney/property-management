import { createClient } from "@supabase/supabase-js";

// Load .env (Node 22 built-in — no dotenv dependency needed).
try {
  process.loadEnvFile();
} catch {
  // .env is optional if the vars are already in the environment.
}

const url = process.env.SUPABASE_URL;
// The sync runs server-side (local CLI + GitHub Actions cron), so it uses the
// SERVICE ROLE key, which bypasses Row Level Security. Once RLS is enabled
// (db/003_auth_rls.sql), the anon/publishable key can no longer write — only
// the dashboard's logged-in users (via RLS) and this service-role sync can.
// Fall back to the anon key so `npm run read`-style local use still works if
// someone hasn't set the service-role key yet (it just won't be able to write
// against an RLS-enabled table).
const key =
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_SECRET_KEY. Add them to .env (see .env.example). " +
      "The sync needs the service-role (secret) key to write once RLS is enabled.",
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
