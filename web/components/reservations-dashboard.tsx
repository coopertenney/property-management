"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  supabase,
  type Reservation,
  type ReservationStatus,
} from "@/lib/supabaseClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABELS: Record<ReservationStatus, string> = {
  new: "New",
  sent_to_resort: "Sent to Everline",
  confirmed: "Confirmed",
};

const STATUS_VARIANT: Record<ReservationStatus, "secondary" | "default" | "outline"> = {
  new: "secondary",
  sent_to_resort: "outline",
  confirmed: "default",
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Format a YYYY-MM-DD string without any timezone shift. */
function fmtDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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
    // Optimistic update.
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

  if (rows === null) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center">
        No upcoming reservations. Run <code className="font-mono">npm run sync</code> to
        pull them in.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Check-in</TableHead>
          <TableHead>Check-out</TableHead>
          <TableHead className="text-center">Nights</TableHead>
          <TableHead>Guest name</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Resort status</TableHead>
          <TableHead className="text-right">Code</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.code}>
            <TableCell className="font-medium whitespace-nowrap">
              {fmtDate(r.check_in)}
            </TableCell>
            <TableCell className="whitespace-nowrap">{fmtDate(r.check_out)}</TableCell>
            <TableCell className="text-center">{r.nights}</TableCell>
            <TableCell className="min-w-[180px]">
              <Input
                defaultValue={r.guest_name ?? ""}
                placeholder="Add guest name…"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (r.guest_name ?? "")) patch(r.code, { guest_name: v || null });
                }}
              />
            </TableCell>
            <TableCell className="text-muted-foreground whitespace-nowrap">
              {r.phone_last4 ? `••• ${r.phone_last4}` : "—"}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Select
                  value={r.status}
                  onValueChange={(v) => patch(r.code, { status: v as ReservationStatus })}
                >
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as ReservationStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABELS[r.status]}</Badge>
              </div>
            </TableCell>
            <TableCell className="text-right">
              {r.reservation_url ? (
                <a
                  href={r.reservation_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs underline underline-offset-2"
                >
                  {r.code}
                </a>
              ) : (
                <span className="font-mono text-xs">{r.code}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
