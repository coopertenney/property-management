import { createClient } from "@supabase/supabase-js";

// Load .env (Node 22 built-in — no dotenv dependency needed).
try {
  process.loadEnvFile();
} catch {
  // .env is optional if the vars are already in the environment.
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_ANON_KEY. Add them to .env (see .env.example).",
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
