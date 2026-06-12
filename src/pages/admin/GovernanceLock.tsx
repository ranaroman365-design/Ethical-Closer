import { useGovernanceLock } from "@/hooks/useGovernanceLock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ShieldCheck, Clock, AlertOctagon, Lock, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

const severityVariant = (s: string) => {
  if (s === "critical") return "destructive";
  if (s === "high") return "destructive";
  if (s === "medium") return "default";
  return "secondary";
};

const statusBadge = (s: string) => {
  if (s === "ok") return { label: "Healthy", variant: "default" as const };
  if (s === "warning") return { label: "Warning", variant: "secondary" as const };
  return { label: "Failed", variant: "destructive" as const };
};

export default function GovernanceLock() {
  const { data, isLoading, refetch } = useGovernanceLock();
  const qc = useQueryClient();

  const runDetections = async () => {
    const { error } = await supabase.rpc("governance_run_all_detections" as any);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Detections executed");
    qc.invalidateQueries({ queryKey: ["governance-lock-snapshot"] });
  };

  if (isLoading) {
    return (
      <div className="container py-8 space-y-4">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const snap = data;
  const integrity = snap?.data_integrity;
  const integrityBadge = integrity ? statusBadge(integrity.status) : null;

  return (
    <div className="container py-8 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Lock className="h-7 w-7 text-primary" />
            Governance Lock
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Institutional Enforcement Layer — system decides, humans execute, governance enforces.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
          <Button onClick={runDetections}>Run detections now</Button>
        </div>
      </header>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" />Active Issues</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{snap?.active_issues ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><AlertOctagon className="h-3 w-3" />High Severity</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{snap?.high_severity ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Pending Actions</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{snap?.pending_actions ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3" />Delayed</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-warning">{snap?.delayed_actions ?? 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" />Active Overrides</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{snap?.active_overrides ?? 0}</div></CardContent>
        </Card>
      </section>

      {/* Data Integrity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Data Integrity Lock</CardTitle>
          {integrityBadge && <Badge variant={integrityBadge.variant}>{integrityBadge.label}</Badge>}
        </CardHeader>
        <CardContent>
          {integrity ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Leads with Origin</div>
                <div className="text-2xl font-bold">{integrity.pct_leads_with_origin ?? "—"}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Deals Linked</div>
                <div className="text-2xl font-bold">{integrity.pct_deals_linked ?? "—"}%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Calls Tracked</div>
                <div className="text-2xl font-bold">{integrity.pct_calls_tracked ?? "—"}%</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No integrity check yet. Run detections to populate.</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Events */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Governance Events</CardTitle></CardHeader>
        <CardContent>
          {snap?.recent_events?.length ? (
            <div className="divide-y">
              {snap.recent_events.map((e) => (
                <div key={e.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{e.event_type}</span>
                      <Badge variant={severityVariant(e.severity) as any}>{e.severity}</Badge>
                      {e.level && <Badge variant="outline">{e.level}</Badge>}
                      {e.escalation_level > 1 && <Badge variant="outline">esc.{e.escalation_level}</Badge>}
                      {e.resolved && <Badge variant="secondary">resolved</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {e.source} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No events recorded.</p>
          )}
        </CardContent>
      </Card>

      {/* Pending / Delayed Actions */}
      <Card>
        <CardHeader><CardTitle className="text-base">Action Queue</CardTitle></CardHeader>
        <CardContent>
          {snap?.recent_actions?.length ? (
            <div className="divide-y">
              {snap.recent_actions.map((a) => (
                <div key={a.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm capitalize">{a.action_type}</span>
                      <Badge variant="outline">{a.owner_level}</Badge>
                      <Badge variant={a.status === "delayed" ? "destructive" : a.status === "executed" ? "secondary" : "default"}>
                        {a.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">→ {a.event_type}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No actions queued.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
