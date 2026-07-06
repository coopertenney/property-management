import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to web/.env.local.",
  );
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

export type ReservationStatus = "new" | "sent_to_resort" | "confirmed";

export interface Reservation {
  code: string;
  is_booking: boolean;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  nights: number;
  phone_last4: string | null;
  reservation_url: string | null;
  guest_name: string | null;
  status: ReservationStatus;
  sent_to_resort_at: string | null;
  first_seen_at: string;
  updated_at: string;
}
