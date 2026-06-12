import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ShieldAlert, AlertTriangle, CheckCircle2, RefreshCw, Wrench,
  ScrollText, Loader2, Database,
} from "lucide-react";

type Incident = {
  id: string;
  incident_code: string;
  entity_type: string;
  entity_id: string | null;
  detected_issue: string;
  severity: "low" | "medium" | "high" | "critical";
  proposed_fix: string | null;
  fix_status: "open" | "fixed" | "escalated" | "ignored";
  fixed_at: string | null;
  metadata: any;
  created_at: string;
};

type ActionLog = {
  id: string;
  incident_id: string | null;
  action_type: string;
  action_result: string;
  payload: any;
  created_at: string;
};

const severityClasses: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  critical: "bg-destructive/10 text-destructive border-destructive/30",
};

const statusClasses: Record<string, string> = {
  open: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  fixed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  escalated: "bg-destructive/10 text-destructive border-destructive/30",
  ignored: "bg-muted text-muted-foreground border-border",
};

export default function SystemIntegrity() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: inc }, { data: log }] = await Promise.all([
      supabase
        .from("auto_fix_incidents")
        .select("*")
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("auto_fix_actions_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setIncidents((inc as Incident[]) ?? []);
    setActions((log as ActionLog[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runScan = async () => {
    setScanning(true);
    const { data, error } = await supabase.rpc("detect_system_incidents");
    setScanning(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${(data as any)?.new_incidents ?? 0} new incidents detected`);
    await load();
  };

  const applyFixes = async () => {
    setFixing(true);
    const { data, error } = await supabase.rpc("apply_safe_auto_fixes");
    setFixing(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${(data as any)?.fixed ?? 0} incidents auto-fixed`);
    await load();
  };

  const backfill = async () => {
    setBackfilling(true);
    const { data, error } = await supabase.rpc("backfill_funnel_events");
    setBackfilling(false);
    if (error) { toast.error(error.message); return; }
    const d = data as any;
    toast.success(
      `Backfill complete: ${d.lead_created} leads · ${d.booked} booked · ${d.deal_won} won`
    );
    await load();
  };

  const open = incidents.filter(i => i.fix_status === "open");
  const critical = open.filter(i => i.severity === "critical");
  const fixedToday = actions.filter(
    a => new Date(a.created_at).toDateString() === new Date().toDateString()
  ).length;
  const totalActions = actions.length;
  const successRate = totalActions
    ? Math.round((actions.filter(a => a.action_result === "success").length / totalActions) * 100)
    : 100;

  return (
    <>
      {(() => { document.title = "System Integrity · Admin Intelligence"; return null; })()}

      <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              Admin Intelligence · System Integrity
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground mt-1">
              Integrity & Auto-Fix
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              What is broken right now, and what can be safely repaired?
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={backfill} disabled={backfilling} variant="outline" size="sm">
              {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              <span className="ml-2">Backfill Events</span>
            </Button>
            <Button onClick={runScan} disabled={scanning} variant="outline" size="sm">
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Scan</span>
            </Button>
            <Button onClick={applyFixes} disabled={fixing || open.length === 0} size="sm">
              {fixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              <span className="ml-2">Apply Safe Fixes</span>
            </Button>
          </div>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Open Incidents" value={open.length} tone={open.length > 0 ? "warning" : "ok"} />
          <Kpi label="Critical" value={critical.length} tone={critical.length > 0 ? "critical" : "ok"} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
          <Kpi label="Auto-Fixed Today" value={fixedToday} tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
          <Kpi label="Total Actions" value={totalActions} tone="neutral" />
          <Kpi label="Success Rate" value={`${successRate}%`} tone={successRate >= 90 ? "ok" : "warning"} />
        </div>

        {/* Insight Box */}
        <Card className="p-5 border-border/40">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-foreground shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">Integrity Snapshot</h3>
              {loading ? (
                <p className="text-xs text-muted-foreground mt-2">Loading…</p>
              ) : open.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">
                  No active incidents detected. Run a scan to refresh.
                </p>
              ) : (
                <p className="text-xs text-foreground/80 mt-2">
                  <strong>{open.length}</strong> open incidents · <strong>{critical.length}</strong> critical require manual review ·{" "}
                  <strong>{open.filter(i => ["APPT_NO_BOOKED_EVENT","LEAD_NO_CREATED_EVENT","CALL_OUTCOME_NO_EVENT"].includes(i.incident_code)).length}</strong> can be safely auto-fixed.
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Incidents Table */}
        <Card className="border-border/40 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Incidents</h3>
            <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              {incidents.length} total
            </span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            </div>
          ) : incidents.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <p className="text-sm text-muted-foreground mt-2">No incidents detected. Run a scan to start.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Severity</th>
                    <th className="text-left px-4 py-2 font-medium">Issue</th>
                    <th className="text-left px-4 py-2 font-medium">Entity</th>
                    <th className="text-left px-4 py-2 font-medium">Proposed Fix</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-left px-4 py-2 font-medium">Detected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {incidents.slice(0, 100).map((i) => (
                    <tr key={i.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`text-[10px] ${severityClasses[i.severity] || ""}`}>
                          {i.severity}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-foreground/90 max-w-md">
                        <div className="truncate">{i.detected_issue}</div>
                        <div className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                          {i.incident_code}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs" style={{ fontFamily: "DM Mono, monospace" }}>
                        {i.entity_type}
                      </td>
                      <td className="px-4 py-2 text-foreground/70 text-xs max-w-xs truncate">{i.proposed_fix ?? "—"}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={`text-[10px] ${statusClasses[i.fix_status] || ""}`}>
                          {i.fix_status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs whitespace-nowrap" style={{ fontFamily: "DM Mono, monospace" }}>
                        {new Date(i.created_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Action Log */}
        <Card className="border-border/40 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Audit Trail</h3>
          </div>
          {actions.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No fixes applied yet.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {actions.slice(0, 20).map(a => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    {a.action_result === "success"
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      : <AlertTriangle className="h-4 w-4 text-destructive" />}
                    <div>
                      <div className="text-foreground/90">{a.action_type}</div>
                      <div className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                        {(a.payload?.event_type ?? "")} · entity {(a.payload?.entity_id ?? "").slice(0, 8)}…
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                    {new Date(a.created_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string | number; tone: "ok" | "warning" | "critical" | "neutral"; icon?: React.ReactNode }) {
  const toneClass = {
    ok: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    critical: "text-destructive",
    neutral: "text-foreground",
  }[tone];
  return (
    <Card className="p-4 border-border/40">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`text-2xl font-bold mt-1 ${toneClass}`} style={{ fontFamily: "DM Mono, monospace" }}>
        {value}
      </p>
    </Card>
  );
}
