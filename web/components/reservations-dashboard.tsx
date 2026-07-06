"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  supabase,
  type Reservation,
  type ReservationStatus,
} from "@/lib/supabaseClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { everlineMailto } from "@/lib/everlineEmail";

const EVERLINE_EMAIL = process.env.NEXT_PUBLIC_EVERLINE_EMAIL ?? "";

const STATUS: Record<
  ReservationStatus,
  { label: string; dot: string; chip: string }
> = {
  new: {
    label: "New",
    dot: "#b4552d",
    chip: "bg-[#f4e7dd] text-[#8a3d1c] dark:bg-[#3a2a20] dark:text-[#e0a583]",
  },
  sent_to_resort: {
    label: "Sent to Everline",
    dot: "#c68a2e",
    chip: "bg-[#f7edd3] text-[#856012] dark:bg-[#3a3116] dark:text-[#dcbd6d]",
  },
  confirmed: {
    label: "Confirmed",
    dot: "#35533f",
    chip: "bg-[#e1ebe1] text-[#2f4a37] dark:bg-[#26362b] dark:text-[#9cc4a8]",
  },
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Parse a YYYY-MM-DD string as a local date (no timezone shift). */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function ReservationsDashboard() {
  const [rows, setRows] = useState<Reservation[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("is_booking", true)
        .gte("check_out", todayStr())
        .order("check_in", { ascending: true });
      if (error) {
        toast.error(`Failed to load reservations: ${error.message}`);
        setRows([]);
      } else {
        setRows((data as Reservation[]) ?? []);
      }
    })();
  }, []);

  async function patch(code: string, changes: Partial<Reservation>) {
    setRows((prev) =>
      prev ? prev.map((r) => (r.code === code ? { ...r, ...changes } : r)) : prev,
    );
    const { error } = await supabase
      .from("reservations")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("code", code);
    if (error) toast.error(`Save failed: ${error.message}`);
    else toast.success("Saved");
  }

  function sendToEverline(r: Reservation) {
    if (!r.guest_name?.trim()) {
      toast.error("Add the guest name before sending to Everline.");
      return;
    }
    // Open the user's mail client with the registration email pre-filled.
    window.location.href = everlineMailto(r, EVERLINE_EMAIL);
    // Log the handoff: mark sent + stamp the time.
    patch(r.code, {
      status: "sent_to_resort",
      sent_to_resort_at: new Date().toISOString(),
    });
    toast.success(
      EVERLINE_EMAIL
        ? "Opening email to Everline — marked as sent."
        : "Opening email (add the resort's address) — marked as sent.",
    );
  }

  if (rows === null) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed py-16 text-center">
        <p className="text-muted-foreground">
          No upcoming reservations yet. Run{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-sm">
            npm run sync
          </code>{" "}
          to pull them in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const ci = parseDate(r.check_in);
        const co = parseDate(r.check_out);
        const s = STATUS[r.status];
        return (
          <div
            key={r.code}
            className="bg-card group flex flex-col gap-5 rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center"
          >
            {/* Date block */}
            <div className="flex items-center gap-4 sm:w-[290px] sm:shrink-0">
              <div className="border-border bg-secondary flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border">
                <span className="text-primary text-[11px] font-semibold tracking-wide uppercase">
                  {ci.toLocaleDateString("en-US", { month: "short" })}
                </span>
                <span className="text-2xl leading-none font-semibold">
                  {ci.getDate()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="font-medium">
                  {ci.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  <span className="text-muted-foreground mx-1.5">→</span>
                  {co.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="text-muted-foreground mt-0.5 text-sm">
                  {r.nights} night{r.nights === 1 ? "" : "s"}
                  {" · "}
                  {r.reservation_url ? (
                    <a
                      href={r.reservation_url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-brand font-mono underline-offset-2 hover:underline"
                    >
                      {r.code}
                    </a>
                  ) : (
                    <span className="font-mono">{r.code}</span>
                  )}
                  {r.phone_last4 ? `  ·  ☎ ${r.phone_last4}` : ""}
                </div>
              </div>
            </div>

            {/* Guest name */}
            <div className="flex-1">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Guest name
              </label>
              <Input
                className="bg-background"
                defaultValue={r.guest_name ?? ""}
                placeholder="Add guest name…"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (r.guest_name ?? "")) patch(r.code, { guest_name: v || null });
                }}
              />
            </div>

            {/* Status */}
            <div className="sm:w-[220px] sm:shrink-0">
              <label className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.dot }}
                />
                Resort status
              </label>
              <Select
                value={r.status}
                onValueChange={(v) => patch(r.code, { status: v as ReservationStatus })}
              >
                <SelectTrigger className={`w-full font-medium ${s.chip} border-transparent`}>
                  {s.label}
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS) as ReservationStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: STATUS[k].dot }}
                      />
                      {STATUS[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {r.status === "new" ? (
                <Button
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => sendToEverline(r)}
                >
                  Send to Everline
                </Button>
              ) : (
                <div className="text-muted-foreground mt-2 flex items-center justify-between gap-2 text-xs">
                  <span>
                    {r.sent_to_resort_at
                      ? `Sent ${new Date(r.sent_to_resort_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}`
                      : "Handed off"}
                  </span>
                  <button
                    type="button"
                    onClick={() => sendToEverline(r)}
                    className="hover:text-brand underline underline-offset-2"
                  >
                    Resend
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
