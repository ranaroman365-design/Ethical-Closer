import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  GitBranch,
  Layers,
  Lock,
  RefreshCw,
  Rocket,
  ShieldAlert,
  TrendingUp,
  Workflow,
  Zap,
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "info";

interface Note {
  severity?: Severity;
  msg?: string;
  metric?: string;
  value?: string | number;
  [k: string]: unknown;
}

interface Dimension {
  key: string;
  title: string;
  score: number;
  max: number;
  notes: Note[];
}

interface AuditResult {
  overall_score: number;
  generated_at: string;
  dimensions: Dimension[];
  verdict: "HEALTHY" | "NEEDS ATTENTION" | "AT RISK" | "CRITICAL";
}

const ICONS: Record<string, typeof Activity> = {
  architecture: GitBranch,
  database: Database,
  events: Zap,
  funnel: TrendingUp,
  booking: Activity,
  tracking: Activity,
  ghl: Workflow,
  ux: Layers,
  security: Lock,
  scalability: Rocket,
};

function scoreColor(score: number) {
  if (score >= 8) return "text-emerald-400";
  if (score >= 6) return "text-amber-400";
  if (score >= 4) return "text-orange-400";
  return "text-rose-400";
}

function scoreBg(score: number) {
  if (score >= 8) return "bg-emerald-500/10 border-emerald-500/20";
  if (score >= 6) return "bg-amber-500/10 border-amber-500/20";
  if (score >= 4) return "bg-orange-500/10 border-orange-500/20";
  return "bg-rose-500/10 border-rose-500/20";
}

function severityBadge(sev?: Severity) {
  switch (sev) {
    case "critical":
      return <Badge variant="destructive" className="bg-rose-500/20 text-rose-300 border-rose-500/30">CRITICAL</Badge>;
    case "high":
      return <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30">HIGH</Badge>;
    case "medium":
      return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">MEDIUM</Badge>;
    case "info":
      return <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30">INFO</Badge>;
    default:
      return <Badge variant="outline">METRIC</Badge>;
  }
}

export default function SystemAudit() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  const runAudit = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("run_system_audit" as never);
      if (error) throw error;
      setResult(data as unknown as AuditResult);
      toast.success("Audit abgeschlossen");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Audit fehlgeschlagen";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Top critical findings über alle Dimensionen
  const topFindings = result
    ? result.dimensions
        .flatMap((d) =>
          (d.notes || [])
            .filter((n) => n.severity && n.severity !== "info" && n.msg)
            .map((n) => ({ ...n, dimension: d.title, dimKey: d.key }))
        )
        .sort((a, b) => {
          const order = { critical: 0, high: 1, medium: 2, info: 3 } as const;
          return (order[a.severity as Severity] ?? 9) - (order[b.severity as Severity] ?? 9);
        })
        .slice(0, 10)
    : [];

  return (
    <div className="min-h-screen bg-[hsl(220,15%,7%)] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
              System Audit
            </h1>
            <p className="text-sm text-white/60 mt-1">
              Live-Health-Check über alle 10 Systemdimensionen. Read-only Diagnose.
            </p>
          </div>
          <Button
            onClick={runAudit}
            disabled={loading}
            className="bg-[hsl(39,41%,55%)] hover:bg-[hsl(39,41%,50%)] text-black font-medium"
          >
            {loading ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Läuft …</>
            ) : (
              <><Activity className="h-4 w-4 mr-2" />Audit starten</>
            )}
          </Button>
        </div>

        {/* Empty state */}
        {!result && !loading && (
          <Card className="border-white/10 bg-white/[0.02]">
            <CardContent className="py-16 text-center">
              <ShieldAlert className="h-10 w-10 text-white/30 mx-auto mb-4" />
              <p className="text-white/60">
                Klicke auf <span className="text-white">„Audit starten"</span>, um die Live-Diagnose auszuführen.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-40 bg-white/5" />
            ))}
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <>
            {/* Overall Score */}
            <Card className={`border ${scoreBg(result.overall_score)}`}>
              <CardContent className="p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-white/50 mb-1">
                      Overall System Score
                    </p>
                    <div className="flex items-baseline gap-3">
                      <span className={`text-5xl md:text-6xl font-bold ${scoreColor(result.overall_score)}`}>
                        {result.overall_score.toFixed(1)}
                      </span>
                      <span className="text-xl text-white/40">/ 10</span>
                    </div>
                    <p className="text-sm text-white/60 mt-2">
                      Verdict: <span className={`font-semibold ${scoreColor(result.overall_score)}`}>{result.verdict}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/40">Generiert</p>
                    <p className="text-sm text-white/70">{new Date(result.generated_at).toLocaleString("de-DE")}</p>
                  </div>
                </div>
                <Progress value={result.overall_score * 10} className="mt-6 h-2" />
              </CardContent>
            </Card>

            {/* Top Critical Findings */}
            {topFindings.length > 0 && (
              <Card className="border-white/10 bg-white/[0.02]">
                <CardHeader>
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-400" />
                    Top Findings (Priorität)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {topFindings.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]"
                    >
                      <span className="text-xs font-mono text-white/40 mt-0.5 w-6">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {severityBadge(f.severity as Severity)}
                          <span className="text-xs text-white/50">{f.dimension}</span>
                        </div>
                        <p className="text-sm text-white/80 mt-1">{f.msg}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Dimensions Grid */}
            <div className="grid md:grid-cols-2 gap-4">
              {result.dimensions.map((d) => {
                const Icon = ICONS[d.key] || Activity;
                const realNotes = (d.notes || []).filter((n) => n.msg || n.metric);
                return (
                  <Card key={d.key} className="border-white/10 bg-white/[0.02]">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${scoreBg(d.score)} border`}>
                            <Icon className={`h-4 w-4 ${scoreColor(d.score)}`} />
                          </div>
                          <CardTitle className="text-base text-white">{d.title}</CardTitle>
                        </div>
                        <div className="text-right">
                          <span className={`text-2xl font-semibold ${scoreColor(d.score)}`}>
                            {Number(d.score).toFixed(1)}
                          </span>
                          <span className="text-xs text-white/40 ml-1">/{d.max}</span>
                        </div>
                      </div>
                      <Progress value={(Number(d.score) / d.max) * 100} className="h-1.5 mt-3" />
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      {realNotes.length === 0 && (
                        <div className="flex items-center gap-2 text-sm text-emerald-400/80">
                          <CheckCircle2 className="h-4 w-4" />
                          Keine Auffälligkeiten
                        </div>
                      )}
                      {realNotes.map((n, i) => (
                        <div
                          key={i}
                          className="text-xs flex items-start gap-2 py-1.5 px-2 rounded bg-white/[0.02]"
                        >
                          {n.severity ? (
                            severityBadge(n.severity)
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-white/10 text-white/50">
                              {n.metric}
                            </Badge>
                          )}
                          <span className="text-white/70 flex-1">
                            {n.msg ?? `${n.metric}: ${n.value ?? JSON.stringify(n)}`}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
