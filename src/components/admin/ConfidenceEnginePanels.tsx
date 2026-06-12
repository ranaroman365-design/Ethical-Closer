/**
 * ConfidenceEnginePanels — additive Confidence Layer UI for /members/admin/winner-engine.
 *
 * Read-only. Surfaces:
 *   • Per-variant confidence score + level + reasons
 *   • Winner status (potential / winner / confirmed)
 *   • Experiment health per slot
 *   • Variance indicator + coverage impact
 *   • Auto-Audit warnings
 *
 * Does NOT mutate weights, scores or winner flags.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, RefreshCw, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";

interface ConfidenceRow {
  slot: string;
  variant: string;
  confidence_score: number;
  confidence_level: string;
  confidence_reason: string[];
  winner_status: string;
  experiment_health: number;
  variance_indicator: number;
  coverage_impact: number;
  shift_allowed: boolean;
  last_confidence_update: string | null;
}
interface WarningRow {
  id: string;
  slot: string;
  variant: string | null;
  kind: string;
  message: string;
  severity: string;
  created_at: string;
}

const LEVEL_COLOR: Record<string, string> = {
  very_high: "bg-emerald-600",
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-orange-500",
  very_low: "bg-rose-600",
};
const STATUS_COLOR: Record<string, string> = {
  confirmed: "bg-amber-500",
  winner: "bg-emerald-500",
  potential: "bg-sky-500",
  none: "bg-muted text-foreground",
};

export default function ConfidenceEnginePanels() {
  const [rows, setRows] = useState<ConfidenceRow[]>([]);
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [w, warn] = await Promise.all([
      supabase.from("ab_slot_weights")
        .select("slot,variant,confidence_score,confidence_level,confidence_reason,winner_status,experiment_health,variance_indicator,coverage_impact,shift_allowed,last_confidence_update")
        .order("slot").order("confidence_score", { ascending: false }),
      supabase.from("ab_confidence_warnings")
        .select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    if (w.data) setRows(w.data as ConfidenceRow[]);
    if (warn.data) setWarnings(warn.data as WarningRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const trigger = async () => {
    setRunning(true);
    try { await supabase.functions.invoke("ab-confidence-engine"); } catch { /* noop */ }
    await load();
    setRunning(false);
  };

  const bySlot = new Map<string, ConfidenceRow[]>();
  for (const r of rows) {
    const arr = bySlot.get(r.slot) ?? [];
    arr.push(r);
    bySlot.set(r.slot, arr);
  }

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Confidence Engine</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Institutionelle Confidence Layer. Traffic-Shift nur bei ≥90 Confidence + ≥95% Coverage + Mindestdaten.
          </p>
        </div>
        <Button onClick={trigger} disabled={running} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} />
          Recompute
        </Button>
      </header>

      {warnings.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Auto-Audit Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {warnings.map((w) => (
                <li key={w.id} className="flex items-start gap-2">
                  <Badge variant={w.severity === "error" ? "destructive" : "outline"}>{w.kind}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{w.slot}{w.variant ? `:${w.variant}` : ""}</span>
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {Array.from(bySlot.entries()).map(([slot, variants]) => {
        const health = variants[0]?.experiment_health ?? 0;
        return (
          <Card key={slot}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 font-mono text-base">
                {slot}
                <Badge className={LEVEL_COLOR[variants[0]?.confidence_level ?? "very_low"]}>
                  <Activity className="mr-1 h-3 w-3" />
                  Health {health.toFixed(0)}/100
                </Badge>
              </CardTitle>
              <CardDescription>Confidence-Verteilung & Winner-Status pro Variante.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3">Variant</th>
                      <th className="py-2 pr-3 text-right">Confidence</th>
                      <th className="py-2 pr-3">Level</th>
                      <th className="py-2 pr-3">Winner Status</th>
                      <th className="py-2 pr-3 text-right">Variance</th>
                      <th className="py-2 pr-3 text-right">Coverage Impact</th>
                      <th className="py-2 pr-3">Shift</th>
                      <th className="py-2">Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.variant} className="border-b align-top">
                        <td className="py-2 pr-3 font-mono">{v.variant}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{v.confidence_score.toFixed(1)}</td>
                        <td className="py-2 pr-3">
                          <Badge className={LEVEL_COLOR[v.confidence_level] ?? ""}>{v.confidence_level}</Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge className={STATUS_COLOR[v.winner_status] ?? ""}>{v.winner_status}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-right">{(v.variance_indicator * 100).toFixed(0)}%</td>
                        <td className="py-2 pr-3 text-right">{(v.coverage_impact * 100).toFixed(0)}%</td>
                        <td className="py-2 pr-3">
                          {v.shift_allowed
                            ? <Badge className="bg-emerald-600"><ShieldCheck className="mr-1 h-3 w-3" /> allowed</Badge>
                            : <Badge variant="outline"><ShieldAlert className="mr-1 h-3 w-3" /> blocked</Badge>}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {v.confidence_reason?.slice(0, 3).join(" · ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
