-- Migration 003 — Auth + Row Level Security.
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run),
-- or it is applied for you by the Auth+RLS setup step.
--
-- WHAT THIS DOES
--   Locks down the `reservations` table so the publishable/anon key can no longer
--   read or write on its own. After this:
--     • the dashboard works only for a signed-in operator (Supabase Auth), and
--       every read/write goes through the "authenticated" policy below;
--     • the server-side sync (npm run sync / GitHub Actions) uses the SERVICE ROLE
--       key, which bypasses RLS entirely — no policy needed for it.
--
-- ⚠️  RLS IS ONLY HALF THE LOCK. Supabase email sign-up is ON by default, which
--     would let anyone self-register and pass the "authenticated" check below.
--     You MUST also disable sign-up (Dashboard → Authentication → Providers →
--     Email → turn OFF "Allow new users to sign up", or the Auth config API's
--     `disable_signup: true`) and create exactly the operator account(s) you want.
--     Enabling RLS without closing sign-up is a false sense of security.

alter table reservations enable row level security;
-- Belt and suspenders: reject even the table owner unless a policy allows it.
alter table reservations force row level security;

-- Any logged-in user (there should be only the operator account, because
-- sign-up is disabled) has full access. The service-role key bypasses RLS and
-- is unaffected by this policy.
drop policy if exists "authenticated_full_access" on reservations;
create policy "authenticated_full_access"
  on reservations
  for all
  to authenticated
  using (true)
  with check (true);

-- No policy is granted to the `anon` role, so the bare publishable/anon key
-- (unauthenticated) can neither read nor write. That is the point.
