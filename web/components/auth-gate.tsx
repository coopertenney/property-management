"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function MountainMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="23.5" cy="8.5" r="3.8" fill="var(--brand)" />
      <path d="M1.5 28 L11.5 11 L18.5 23 L21.5 18.5 L30.5 28 Z" fill="var(--primary)" />
    </svg>
  );
}

/**
 * Gates the dashboard behind Supabase Auth. Row Level Security is the real
 * guard on the data (db/003_auth_rls.sql) — this component is the matching UX:
 * show a login screen until there's a session, then render the app.
 *
 * Sign-up is disabled server-side (single operator), so this is login-only.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  // undefined = still checking; null = signed out; Session = signed in.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return <>{children}</>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    // On success, onAuthStateChange in AuthGate swaps in the dashboard.
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <MountainMark />
        <span className="text-xl font-semibold tracking-tight">
          Everline<span className="text-brand"> Ops</span>
        </span>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted-foreground mt-1.5 mb-6 text-sm">
        Property coordination for Everline Resort. Authorized operators only.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="text-muted-foreground mb-1 block text-xs font-medium"
          >
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            // Operator login is coopertenney7@gmail.com (created server-side; signup is disabled).
            className="bg-background"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="text-muted-foreground mb-1 block text-xs font-medium"
          >
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="bg-background"
          />
        </div>

        {error && (
          <p className="text-sm font-medium text-[#8c1d18] dark:text-[#e79a94]">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
