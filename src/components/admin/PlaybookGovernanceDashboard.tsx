import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG = {
  current: { icon: CheckCircle, color: "text-green-600", badge: "bg-green-100 text-green-800", label: "🟢 Aktuell" },
  partially_outdated: { icon: AlertTriangle, color: "text-yellow-600", badge: "bg-yellow-100 text-yellow-800", label: "🟡 Teilweise veraltet" },
  outdated: { icon: XCircle, color: "text-orange-600", badge: "bg-orange-100 text-orange-800", label: "🔴 Veraltet" },
  critically_wrong: { icon: XCircle, color: "text-red-600", badge: "bg-red-100 text-red-800", label: "🔴 Kritisch falsch" },
} as const;

export default function PlaybookGovernanceDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ["playbook-audit-runs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("playbook_audit_runs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
  });

  const { data: results } = useQuery({
    queryKey: ["playbook-audit-results", selectedRun],
    enabled: !!selectedRun,
    queryFn: async () => {
      const { data } = await supabase
        .from("playbook_audit_results" as any)
        .select("*")
        .eq("audit_run_id", selectedRun!)
        .order("risk_level", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: gaps } = useQuery({
    queryKey: ["playbook-gaps", selectedRun],
    enabled: !!selectedRun,
    queryFn: async () => {
      const { data } = await supabase
        .from("playbook_gaps" as any)
        .select("*")
        .eq("audit_run_id", selectedRun!)
        .order("severity", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: suggestions } = useQuery({
    queryKey: ["playbook-suggestions", selectedRun],
    enabled: !!selectedRun,
    queryFn: async () => {
      const { data } = await supabase
        .from("playbook_update_suggestions" as any)
        .select("*")
        .eq("audit_run_id", selectedRun!)
        .order("priority", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const triggerAudit = useMutation({
    mutationFn: async (type: "weekly" | "monthly") => {
      const { data, error } = await supabase.functions.invoke("playbook-audit", {
        body: { audit_type: type },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Audit gestartet", description: `Run ID: ${data?.run_id}` });
      queryClient.invalidateQueries({ queryKey: ["playbook-audit-runs"] });
    },
    onError: (e: any) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const latestRun = runs?.[0];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">Playbook Governance</h1>
          <p className="text-sm text-muted-foreground">System-Kohärenz & Dokumentations-Health</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => triggerAudit.mutate("weekly")} disabled={triggerAudit.isPending}>
            {triggerAudit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            Weekly Check
          </Button>
          <Button size="sm" onClick={() => triggerAudit.mutate("monthly")} disabled={triggerAudit.isPending}>
            {triggerAudit.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            Monthly Deep Audit
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {latestRun && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{latestRun.total_playbooks}</div>
            <div className="text-xs text-muted-foreground">Gesamt</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-green-600">{latestRun.current_count}</div>
            <div className="text-xs text-muted-foreground">🟢 Aktuell</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{latestRun.partially_outdated_count}</div>
            <div className="text-xs text-muted-foreground">🟡 Teilweise</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-red-600">{latestRun.outdated_count + latestRun.critically_wrong_count}</div>
            <div className="text-xs text-muted-foreground">🔴 Veraltet</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{latestRun.gaps_found}</div>
            <div className="text-xs text-muted-foreground">Gaps</div>
          </CardContent></Card>
        </div>
      )}

      {/* Audit Runs */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Audit-Runs</CardTitle></CardHeader>
        <CardContent>
          {runsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (
            <div className="space-y-2">
              {(runs ?? []).map((run: any) => (
                <button key={run.id} onClick={() => setSelectedRun(run.id)}
                  className={`w-full text-left p-3 rounded-lg border transition ${selectedRun === run.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{run.audit_type}</Badge>
                      <span className="text-sm">{new Date(run.created_at).toLocaleDateString("de-DE")} {new Date(run.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {run.status === "completed" ? <CheckCircle className="h-4 w-4 text-green-600" /> : run.status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4 text-red-600" />}
                      <span>{run.total_playbooks} Playbooks · {run.gaps_found} Gaps</span>
                    </div>
                  </div>
                </button>
              ))}
              {!runs?.length && <p className="text-sm text-muted-foreground">Noch kein Audit durchgeführt.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {selectedRun && results && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Playbook Health</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {results.map((r: any) => {
                const cfg = STATUS_CONFIG[r.health_status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.current;
                return (
                  <div key={r.id} className="flex items-start justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.playbook_key}</span>
                        <Badge className={cfg.badge}>{cfg.label}</Badge>
                      </div>
                      {r.ai_analysis && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.ai_analysis}</p>}
                    </div>
                    <Badge variant="outline">{r.risk_level}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gaps */}
      {selectedRun && gaps && gaps.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Gaps ({gaps.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {gaps.map((g: any) => (
                <div key={g.id} className="p-3 border rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={g.severity === "critical" ? "destructive" : "outline"}>{g.severity}</Badge>
                    <Badge variant="outline">{g.gap_type.replace(/_/g, " ")}</Badge>
                    <span className="text-sm font-medium">{g.playbook_key}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{g.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Update Suggestions */}
      {selectedRun && suggestions && suggestions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Update-Vorschläge ({suggestions.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestions.map((s: any) => (
                <div key={s.id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={s.priority === "critical" ? "destructive" : "outline"}>{s.priority}</Badge>
                    <span className="text-sm font-medium">{s.playbook_key} — {s.section_title}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-red-50 rounded"><strong>ALT:</strong><br />{s.old_text}</div>
                    <div className="p-2 bg-green-50 rounded"><strong>NEU:</strong><br />{s.new_text}</div>
                  </div>
                  <p className="text-xs text-muted-foreground"><strong>Begründung:</strong> {s.rationale}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
