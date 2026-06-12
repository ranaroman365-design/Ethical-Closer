/**
 * Meta Event QA + Attribution Monitoring Dashboard
 * ─────────────────────────────────────────────────
 * Admin-only observability surface over the existing Pixel + CAPI integration.
 * Reads from PII-safe `meta_event_logs` via SECURITY DEFINER RPCs.
 *
 * Sections:
 *  1. Health Overview        — totals, success rate, dedup rate
 *  2. Event Coverage         — per canonical Meta event
 *  3. Recent Logs            — last 100 events with status
 *  4. Attribution Completeness — % of recent leads with utm/fbclid/fbp/fbc/origin/operator
 *  5. Warnings               — derived from health + coverage thresholds
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface Health {
  total_events: number;
  browser_events: number;
  server_events: number;
  server_success_rate: number | null;
  dedup_pairs: number;
  dedup_rate: number | null;
  missing_event_id: number;
  error_count: number;
}

interface CoverageRow {
  event_name: string;
  has_browser: boolean;
  has_server: boolean;
  has_dedup: boolean;
  last_seen_at: string | null;
  count_24h: number;
  error_count: number;
  status: string;
}

interface RecentLog {
  id: string;
  created_at: string;
  event_name: string;
  event_id: string | null;
  source: string;
  meta_response_status: number | null;
  meta_fbtrace_id: string | null;
  lead_id: string | null;
  session_id: string | null;
  appointment_id: string | null;
  origin_key: string | null;
  error_message: string | null;
}

interface Attribution {
  total_leads: number;
  pct_with_utm: number;
  pct_with_fbclid: number;
  pct_with_fbp: number;
  pct_with_fbc: number;
  pct_with_origin: number;
  pct_with_operator: number;
}

const STATUS_VARIANT: Record<string, { label: string; cls: string }> = {
  ok_deduped:    { label: "OK (deduped)", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  browser_only:  { label: "Browser only",  cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  server_only:   { label: "Server only",   cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  partial:       { label: "Partial",       cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  missing_event: { label: "Missing",       cls: "bg-destructive/15 text-destructive" },
  failing:       { label: "Failing",       cls: "bg-destructive/15 text-destructive" },
};

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Number(v).toFixed(1)}%`;
}
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function shortId(s: string | null): string {
  if (!s) return "—";
  return s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

export default function MetaEvents() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [recent, setRecent] = useState<RecentLog[]>([]);
  const [attr, setAttr] = useState<Attribution | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sb = supabase as unknown as {
        rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
      };
      const [h, c, r, a] = await Promise.all([
        sb.rpc("meta_event_health", { _hours: 24 }),
        sb.rpc("meta_event_coverage", { _hours: 24 }),
        sb.rpc("meta_recent_logs", { _limit: 100 }),
        sb.rpc("meta_attribution_completeness", { _days: 7 }),
      ]);
      if (h.error) throw new Error(h.error.message);
      if (c.error) throw new Error(c.error.message);
      if (r.error) throw new Error(r.error.message);
      if (a.error) throw new Error(a.error.message);
      const hArr = Array.isArray(h.data) ? (h.data as Health[]) : [];
      const aArr = Array.isArray(a.data) ? (a.data as Attribution[]) : [];
      setHealth(hArr[0] ?? null);
      setCoverage(Array.isArray(c.data) ? (c.data as CoverageRow[]) : []);
      setRecent(Array.isArray(r.data) ? (r.data as RecentLog[]) : []);
      setAttr(aArr[0] ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const warnings = useMemo(() => {
    const out: string[] = [];
    if (health) {
      if (health.server_success_rate !== null && health.server_success_rate < 95) {
        out.push(`CAPI Erfolgsquote bei ${fmtPct(health.server_success_rate)} (< 95%).`);
      }
      if (health.dedup_rate !== null && health.dedup_rate < 80 && (health.browser_events + health.server_events) > 10) {
        out.push(`Dedup-Match-Rate bei ${fmtPct(health.dedup_rate)} (< 80%) — Pixel und CAPI laufen nicht gepaart.`);
      }
      if (health.missing_event_id > 0) {
        out.push(`${health.missing_event_id} Event(s) ohne event_id — Deduplication unmöglich.`);
      }
    }
    if (attr && attr.total_leads >= 5) {
      if (attr.pct_with_origin < 50) out.push(`Nur ${fmtPct(attr.pct_with_origin)} der jüngsten Leads haben Origin-Daten.`);
      if (attr.pct_with_utm < 30 && attr.pct_with_fbclid < 30) {
        out.push(`UTMs/fbclid fehlen bei der Mehrheit der jüngsten Leads.`);
      }
    }
    coverage.forEach((row) => {
      if (row.event_name === "Purchase") {
        const hasZero = recent.some(
          (r) => r.event_name === "Purchase" && r.error_message?.includes("value")
        );
        if (hasZero) out.push("Purchase-Event ohne value erkannt.");
      }
      if (row.event_name === "Schedule" && row.count_24h > 0) {
        const noAppt = recent.some(
          (r) => r.event_name === "Schedule" && !r.appointment_id
        );
        if (noAppt) out.push("Schedule-Event ohne appointment_id erkannt.");
      }
      if (row.event_name === "Lead" && row.count_24h > 0) {
        const noEntity = recent.some(
          (r) => r.event_name === "Lead" && !r.lead_id && !r.session_id
        );
        if (noEntity) out.push("Lead-Event ohne lead_id/session_id erkannt.");
      }
    });
    return out;
  }, [health, attr, coverage, recent]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meta Event QA</h1>
          <p className="text-sm text-muted-foreground">
            Beobachtbarkeit der Meta Pixel + CAPI Integration. PII-frei, Admin-only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/members/admin/meta-events/replay">Event Replay</a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler beim Laden</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {warnings.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Warnungen ({warnings.length})</AlertTitle>
          <AlertDescription>
            <ul className="ml-4 list-disc space-y-1">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      ) : !loading && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Keine Warnungen</AlertTitle>
          <AlertDescription>
            Pixel/CAPI laufen innerhalb der definierten Grenzwerte.
          </AlertDescription>
        </Alert>
      )}

      {/* 1. Health Overview */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Events 24h" value={health?.total_events ?? "—"} />
        <Stat label="CAPI Success" value={fmtPct(health?.server_success_rate ?? null)} />
        <Stat label="Dedup Rate"   value={fmtPct(health?.dedup_rate ?? null)} sub={`${health?.dedup_pairs ?? 0} Paare`} />
        <Stat label="Errors / Missing IDs" value={`${health?.error_count ?? 0} / ${health?.missing_event_id ?? 0}`} />
      </div>

      {/* 2. Coverage */}
      <Card>
        <CardHeader>
          <CardTitle>Event Coverage (24h)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Browser</TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Dedup</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-right">24h</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coverage.map((row) => {
                const v = STATUS_VARIANT[row.status] ?? { label: row.status, cls: "" };
                return (
                  <TableRow key={row.event_name}>
                    <TableCell className="font-mono">{row.event_name}</TableCell>
                    <TableCell>{row.has_browser ? "✅" : "—"}</TableCell>
                    <TableCell>{row.has_server  ? "✅" : "—"}</TableCell>
                    <TableCell>{row.has_dedup   ? "✅" : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtTime(row.last_seen_at)}</TableCell>
                    <TableCell className="text-right">{row.count_24h}</TableCell>
                    <TableCell className="text-right">{row.error_count}</TableCell>
                    <TableCell><Badge className={v.cls} variant="secondary">{v.label}</Badge></TableCell>
                  </TableRow>
                );
              })}
              {coverage.length === 0 && !loading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Keine Daten in den letzten 24h.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 4. Attribution Completeness */}
      <Card>
        <CardHeader>
          <CardTitle>Attribution Completeness (7 Tage)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 text-sm text-muted-foreground">
            Basis: {attr?.total_leads ?? 0} Leads
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Stat label="UTM"      value={fmtPct(attr?.pct_with_utm)} />
            <Stat label="fbclid"   value={fmtPct(attr?.pct_with_fbclid)} />
            <Stat label="_fbp"     value={fmtPct(attr?.pct_with_fbp)} />
            <Stat label="_fbc"     value={fmtPct(attr?.pct_with_fbc)} />
            <Stat label="Origin"   value={fmtPct(attr?.pct_with_origin)} />
            <Stat label="Operator" value={fmtPct(attr?.pct_with_operator)} />
          </div>
        </CardContent>
      </Card>

      {/* 3. Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Logs (last 100)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Event ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>fbtrace</TableHead>
                <TableHead>Lead / Appt / Session</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtTime(r.created_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.event_name}</TableCell>
                  <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{shortId(r.event_id)}</TableCell>
                  <TableCell>{r.meta_response_status ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{shortId(r.meta_fbtrace_id)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {[r.lead_id ? `L:${shortId(r.lead_id)}` : null,
                      r.appointment_id ? `A:${shortId(r.appointment_id)}` : null,
                      r.session_id ? `S:${shortId(r.session_id)}` : null]
                      .filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-destructive" title={r.error_message ?? ""}>
                    {r.error_message ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {recent.length === 0 && !loading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Keine Events.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
