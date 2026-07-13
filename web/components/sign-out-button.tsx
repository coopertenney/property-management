"use client";

import { supabase } from "@/lib/supabaseClient";

/**
 * Sign-out control for the header. Only rendered inside the authenticated
 * branch (AuthGate), so it always has a session to end.
 */
export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => supabase.auth.signOut()}
      className="text-muted-foreground hover:text-brand text-sm underline-offset-2 hover:underline"
    >
      Sign out
    </button>
  );
}
