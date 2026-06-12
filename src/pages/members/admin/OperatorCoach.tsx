import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Loader2, RefreshCw, Target, TrendingDown, Sparkles, ChevronRight } from "lucide-react";

type Scorecard = {
  id: string;
  operator_email: string;
  operator_role: "setter" | "closer";
  period_start: string;
  period_end: string;
  metrics: Record<string, number>;
  benchmark_metrics: Record<string, number>;
  primary_bottleneck: string | null;
  coach_summary: string | null;
  recommended_actions: string[];
  created_at: string;
};

const bottleneckLabel: Record<string, string> = {
  booking_rate: "Booking Rate",
  show_rate: "Show Rate",
  qualification_rate: "Qualification",
  close_rate: "Close Rate",
  revenue_per_call: "Revenue / Call",
  none: "None",
};

const bottleneckTone: Record<string, string> = {
  none: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
};

export default function OperatorCoach() {
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [selected, setSelected] = useState<Scorecard | null>(null);

  const load = async () => {
    setLoading(true);
    // Latest scorecard per operator
    const { data, error } = await supabase
      .from("operator_scorecards")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { toast.error(error.message); setLoading(false); return; }

    const seen = new Set<string>();
    const latest: Scorecard[] = [];
    for (const row of (data as Scorecard[]) ?? []) {
      const key = `${row.operator_email}-${row.operator_role}`;
      if (!seen.has(key)) { seen.add(key); latest.push(row); }
    }
    setScorecards(latest);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const rebuild = async () => {
    setBuilding(true);
    const { data, error } = await supabase.rpc("build_operator_scorecards", { p_period_days: 30 });
    setBuilding(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${(data as any)?.scorecards_built ?? 0} scorecards built (last 30 days)`);
    await load();
  };

  const setters = scorecards.filter(s => s.operator_role === "setter");
  const closers = scorecards.filter(s => s.operator_role === "closer");

  const lowest = useMemo(() => {
    if (scorecards.length === 0) return null;
    return scorecards.reduce((acc, s) => {
      const score = (s.metrics.booking_rate ?? s.metrics.close_rate ?? 0) as number;
      const accScore = (acc.metrics.booking_rate ?? acc.metrics.close_rate ?? 0) as number;
      return score < accScore ? s : acc;
    });
  }, [scorecards]);

  const teamPatterns = useMemo(() => {
    const setterBottlenecks = setters.map(s => s.primary_bottleneck).filter(Boolean) as string[];
    const closerBottlenecks = closers.map(s => s.primary_bottleneck).filter(Boolean) as string[];
    const mostCommon = (arr: string[]) => {
      const counts: Record<string, number> = {};
      arr.forEach(x => { counts[x] = (counts[x] ?? 0) + 1; });
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    };
    return {
      setterWeakness: mostCommon(setterBottlenecks),
      closerWeakness: mostCommon(closerBottlenecks),
    };
  }, [setters, closers]);

  return (
    <>
      {(() => { document.title = "Operator Coach · Admin Intelligence"; return null; })()}

      <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
              Admin Intelligence · Operator Coach
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground mt-1">Operator Coach</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Which operator has which bottleneck — and what is the highest-impact correction?
            </p>
          </div>
          <Button onClick={rebuild} disabled={building} size="sm">
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Rebuild (30d)</span>
          </Button>
        </header>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Active Setters" value={setters.length} />
          <Kpi label="Active Closers" value={closers.length} />
          <Kpi label="Lowest Performer" value={lowest?.operator_email?.split("@")[0] ?? "—"} small />
          <Kpi label="Setter Pattern" value={bottleneckLabel[teamPatterns.setterWeakness] ?? "—"} small />
          <Kpi label="Closer Pattern" value={bottleneckLabel[teamPatterns.closerWeakness] ?? "—"} small />
        </div>

        {loading ? (
          <Card className="p-12 border-border/40 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </Card>
        ) : scorecards.length === 0 ? (
          <Card className="p-12 border-border/40 text-center space-y-3">
            <Users className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              No operator scorecards yet. Click <strong>Rebuild</strong> to compute them from the last 30 days.
            </p>
            <p className="text-xs text-muted-foreground">
              If still empty: insufficient operator activity in the period.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Scorecard table */}
            <Card className="lg:col-span-2 border-border/40 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/40">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Scorecards</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Operator</th>
                      <th className="text-left px-4 py-2 font-medium">Role</th>
                      <th className="text-right px-4 py-2 font-medium">Key Rate</th>
                      <th className="text-left px-4 py-2 font-medium">Bottleneck</th>
                      <th className="text-right px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {scorecards.map(s => {
                      const keyRate = s.operator_role === "setter"
                        ? `${(s.metrics.booking_rate ?? 0)}%`
                        : `${(s.metrics.close_rate ?? 0)}%`;
                      const isSel = selected?.id === s.id;
                      return (
                        <tr
                          key={s.id}
                          onClick={() => setSelected(s)}
                          className={`cursor-pointer transition ${isSel ? "bg-muted/30" : "hover:bg-muted/20"}`}
                        >
                          <td className="px-4 py-2 text-foreground/90 truncate max-w-[180px]">
                            {s.operator_email}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="text-[10px]">{s.operator_role}</Badge>
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                            {keyRate}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className={`text-[10px] ${bottleneckTone[s.primary_bottleneck ?? ""] ?? ""}`}>
                              {bottleneckLabel[s.primary_bottleneck ?? "none"] ?? s.primary_bottleneck}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Detail panel */}
            <Card className="border-border/40 p-5 h-fit lg:sticky lg:top-4">
              {!selected ? (
                <div className="text-center py-8">
                  <Target className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground mt-2">Select an operator to see coaching detail</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>
                      {selected.operator_role}
                    </p>
                    <h3 className="text-base font-semibold text-foreground truncate">{selected.operator_email}</h3>
                    <p className="text-[10px] text-muted-foreground mt-1" style={{ fontFamily: "DM Mono, monospace" }}>
                      {new Date(selected.period_start).toLocaleDateString("de-DE")} → {new Date(selected.period_end).toLocaleDateString("de-DE")}
                    </p>
                  </div>

                  {selected.primary_bottleneck && selected.primary_bottleneck !== "none" && (
                    <div className="p-3 rounded-md border border-destructive/30 bg-destructive/[0.04]">
                      <div className="flex items-center gap-2 text-xs">
                        <TrendingDown className="h-4 w-4 text-destructive" />
                        <span className="font-semibold text-foreground">Bottleneck:</span>
                        <span className="text-destructive">{bottleneckLabel[selected.primary_bottleneck]}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Metrics vs Benchmark</p>
                    {Object.entries(selected.metrics)
                      .filter(([k]) => k.endsWith("_rate") || k === "revenue_per_call")
                      .map(([k, v]) => {
                        const bench = selected.benchmark_metrics[k];
                        const ok = bench ? v >= bench : true;
                        return (
                          <div key={k} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
                            <span className={ok ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-destructive font-semibold"} style={{ fontFamily: "DM Mono, monospace" }}>
                              {v}{k.endsWith("_rate") ? "%" : ""}
                              {bench && <span className="text-muted-foreground ml-1">/ {bench}</span>}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  {selected.coach_summary && (
                    <div className="text-xs text-foreground/80 leading-relaxed border-l-2 border-primary/40 pl-3">
                      {selected.coach_summary}
                    </div>
                  )}

                  {selected.recommended_actions?.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Top Actions
                      </p>
                      <ul className="space-y-1.5">
                        {selected.recommended_actions.map((a, i) => (
                          <li key={i} className="text-xs text-foreground/90 flex gap-2">
                            <span className="text-muted-foreground" style={{ fontFamily: "DM Mono, monospace" }}>{i + 1}.</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <Card className="p-4 border-border/40">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`${small ? "text-sm" : "text-2xl"} font-bold mt-1 text-foreground truncate`} style={{ fontFamily: "DM Mono, monospace" }}>
        {value}
      </p>
    </Card>
  );
}
