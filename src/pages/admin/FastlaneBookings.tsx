import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  id: string;
  lead_id: string | null;
  starts_at: string;
  payment_status: string | null;
  appointment_status: string | null;
  pricing_tier: string | null;
  booking_source: string | null;
  fastlane_amount_cents: number | null;
  origin_source: string | null;
  attribution_snapshot: any;
  created_at: string;
};

const ROUTING_REASONS = [
  "no_setter_available",
  "manual_override",
  "high_demand_window",
  "diagnostic_test",
  "unknown",
] as const;

function deriveRoutingReason(r: Row): string {
  const fromAttr =
    r.attribution_snapshot && typeof r.attribution_snapshot === "object"
      ? (r.attribution_snapshot.routing_reason as string | undefined)
      : undefined;
  if (fromAttr) return fromAttr;
  const src = (r.booking_source || "").toLowerCase();
  if (src.includes("diagnostic") || src.includes("acceptance_test") || src.includes("e2e")) return "diagnostic_test";
  if (src.includes("manual")) return "manual_override";
  if (src.includes("fastlane") || src.includes("fallback") || src.includes("no_setter")) return "no_setter_available";
  return "unknown";
}

function fmtEuro(cents: number | null) {
  if (cents == null) return "—";
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function FastlaneBookings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState<string>("30");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRows(null);
      setError(null);
      const sinceIso = new Date(Date.now() - parseInt(days, 10) * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, lead_id, starts_at, payment_status, appointment_status, pricing_tier, booking_source, fastlane_amount_cents, origin_source, attribution_snapshot, created_at"
        )
        .not("fastlane_amount_cents", "is", null)
        .gte("starts_at", sinceIso)
        .order("starts_at", { ascending: false })
        .limit(500);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as Row[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const enriched = useMemo(
    () => (rows ?? []).map((r) => ({ ...r, routing_reason: deriveRoutingReason(r) })),
    [rows]
  );

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (reasonFilter !== "all" && r.routing_reason !== reasonFilter) return false;
      if (statusFilter !== "all" && (r.payment_status || "") !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !(r.id.toLowerCase().includes(s) ||
            (r.lead_id || "").toLowerCase().includes(s) ||
            (r.booking_source || "").toLowerCase().includes(s))
        )
          return false;
      }
      return true;
    });
  }, [enriched, reasonFilter, statusFilter, search]);

  const perDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const k = dayKey(r.starts_at);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  const reasonCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of enriched) map.set(r.routing_reason, (map.get(r.routing_reason) ?? 0) + 1);
    return map;
  }, [enriched]);

  const totals = useMemo(() => {
    const totalCents = filtered.reduce((s, r) => s + (r.fastlane_amount_cents ?? 0), 0);
    const paid = filtered.filter((r) => r.payment_status === "paid").length;
    return { count: filtered.length, totalCents, paid };
  }, [filtered]);

  const paymentStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of enriched) if (r.payment_status) set.add(r.payment_status);
    return Array.from(set).sort();
  }, [enriched]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-serif">Fastlane Bookings</h1>
        <p className="text-sm text-muted-foreground">
          Übersicht über alle Fastlane-Buchungen, Routing-Gründe und reservierte Slots pro Tag.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Bookings (gefiltert)</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-serif">{totals.count}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Bezahlt</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-serif">{totals.paid}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Volumen</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-serif">{fmtEuro(totals.totalCents)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Aktive Tage</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-serif">{perDay.length}</div></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader><CardTitle>Filter</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Zeitraum</label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Letzte 7 Tage</SelectItem>
                  <SelectItem value="14">Letzte 14 Tage</SelectItem>
                  <SelectItem value="30">Letzte 30 Tage</SelectItem>
                  <SelectItem value="90">Letzte 90 Tage</SelectItem>
                  <SelectItem value="365">Letzte 365 Tage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Routing-Grund</label>
              <Select value={reasonFilter} onValueChange={setReasonFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle ({enriched.length})</SelectItem>
                  {ROUTING_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r} ({reasonCounts.get(r) ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Payment-Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle</SelectItem>
                  {paymentStatuses.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Suche (Lead/Source/ID)</label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="UUID, source, ..." />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Slots per day */}
      <Card>
        <CardHeader><CardTitle>Reservierte Slots pro Tag</CardTitle></CardHeader>
        <CardContent>
          {rows === null ? (
            <Skeleton className="h-24 w-full" />
          ) : perDay.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Buchungen im gewählten Zeitraum.</p>
          ) : (
            <div className="space-y-2">
              {perDay.map(([day, count]) => {
                const max = Math.max(...perDay.map(([, c]) => c));
                const pct = Math.max(6, Math.round((count / max) * 100));
                return (
                  <div key={day} className="grid grid-cols-[120px_1fr_60px] items-center gap-3">
                    <div className="text-sm tabular-nums">{fmtDay(day)}</div>
                    <div className="h-3 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-sm tabular-nums text-right">{count}</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle>Buchungen</CardTitle></CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-3">Fehler: {error}</p>}
          {rows === null ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Treffer.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Termin</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Routing-Grund</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">{fmtTime(r.starts_at)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.lead_id?.slice(0, 8) ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{r.routing_reason}</Badge></TableCell>
                      <TableCell className="text-xs">{r.booking_source ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.payment_status === "paid" ? "default" : r.payment_status === "expired" ? "destructive" : "secondary"}>
                          {r.payment_status ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.appointment_status ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtEuro(r.fastlane_amount_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
