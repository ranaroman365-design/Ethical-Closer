/**
 * ExperimentAuditPanels — additive audit / proof UI for /members/admin/winner-engine.
 *
 * Surfaces the data written by the `ab-experiment-audit` edge function:
 *   • Attribution Coverage (last 14d)
 *   • Winner Inputs (allowed vs. forbidden, with live warning)
 *   • Weight History (per slot/variant, latest 20 changes)
 *   • Audit Errors (self-check failures)
 *
 * Read-only. Does not touch existing weights or the rollup.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, History, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";

interface AttributionRow {
  id: string;
  window_days: number;
  total_conversions: number;
  attributed_conversions: number;
  coverage_pct: number;
  by_event: Record<string, { total: number; attributed: number }>;
  forbidden_inputs_found: string[];
  created_at: string;
}
interface WeightHistoryRow {
  id: string;
  slot: string;
  variant: string;
  weight: number;
  paused: boolean;
  is_winner: boolean;
  score: number;
  exposures: number;
  leads: number;
  bookings: number;
  recorded_at: string;
}
interface AuditErrorRow {
  id: string;
  check_name: string;
  severity: string;
  slot: string | null;
  variant: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const ALLOWED_INPUTS = [
  "booking_created (×12)",
  "qualified / HQL (×8)",
  "appointment_showed (×8)",
  "lead_capture_submitted (×4)",
  "application_submitted (×4)",
  "quiz_completed (×2)",
  "quiz_started (×1)",
];
const FORBIDDEN_INPUTS = [
  "ctr", "cta_click", "hero_click", "scroll_depth", "impressions", "pageview clicks",
];

export default function ExperimentAuditPanels() {
  const [attribution, setAttribution] = useState<AttributionRow | null>(null);
  const [history, setHistory] = useState<WeightHistoryRow[]>([]);
  const [errors, setErrors] = useState<AuditErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [a, h, e] = await Promise.all([
      supabase
        .from("ab_attribution_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("ab_weight_history")
        .select("*")
        .order("recorded_at", { ascending: false })
        .limit(60),
      supabase
        .from("ab_audit_errors")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setAttribution((a.data?.[0] as AttributionRow) ?? null);
    setHistory((h.data as WeightHistoryRow[]) ?? []);
    setErrors((e.data as AuditErrorRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const runAudit = async () => {
    setRunning(true);
    try {
      await supabase.functions.invoke("ab-experiment-audit");
    } catch { /* noop */ }
    await load();
    setRunning(false);
  };

  const historyBySlot = useMemo(() => {
    const map = new Map<string, WeightHistoryRow[]>();
    for (const r of history) {
      const arr = map.get(r.slot) ?? [];
      arr.push(r);
      map.set(r.slot, arr);
    }
    return Array.from(map.entries());
  }, [history]);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  const coverage = attribution?.coverage_pct ?? null;
  const coverageOk = coverage === null || coverage >= 95;
  const forbiddenLive = attribution?.forbidden_inputs_found ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Experiment Audit Layer</h2>
        <Button onClick={runAudit} disabled={running} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} />
          Run audit now
        </Button>
      </div>

      {/* Attribution Coverage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Attribution Coverage (14d)
          </CardTitle>
          <CardDescription>
            Share of business conversions that carry an <code>ab_slots</code> attribution tag.
            Target: 100 %. Warning below 95 %.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!attribution ? (
            <p className="text-sm text-muted-foreground">No audit run yet. Click "Run audit now".</p>
          ) : (
            <>
              <div className="flex items-baseline gap-4">
                <span className={`text-4xl font-semibold ${coverageOk ? "text-emerald-600" : "text-amber-600"}`}>
                  {coverage?.toFixed(1)}%
                </span>
                <span className="text-sm text-muted-foreground">
                  {attribution.attributed_conversions} / {attribution.total_conversions} attributed
                </span>
                <Badge variant={coverageOk ? "default" : "destructive"} className={coverageOk ? "bg-emerald-500" : ""}>
                  {coverageOk ? "OK" : "Below threshold"}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(attribution.by_event).map(([ev, v]) => {
                  const pct = v.total ? (v.attributed / v.total) * 100 : 100;
                  return (
                    <div key={ev} className="rounded border border-border bg-muted/30 p-3 text-sm">
                      <div className="font-mono text-xs">{ev}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-muted-foreground">{v.attributed} / {v.total}</span>
                        <span className={pct >= 95 ? "text-emerald-600" : "text-amber-600"}>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Winner Inputs (allowed vs. forbidden) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" /> Winner Inputs
          </CardTitle>
          <CardDescription>
            What the Winner Engine is allowed to weight. CTR/clicks/scroll must never appear.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-emerald-700">Allowed (weighted)</h4>
            <ul className="space-y-1.5 text-sm">
              {ALLOWED_INPUTS.map((i) => (
                <li key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="font-mono text-xs">{i}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-rose-700">Forbidden (never weighted)</h4>
            <ul className="space-y-1.5 text-sm">
              {FORBIDDEN_INPUTS.map((i) => (
                <li key={i} className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-rose-500" />
                  <span className="font-mono text-xs">{i}</span>
                </li>
              ))}
            </ul>
            {forbiddenLive.length > 0 && (
              <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                <strong>⚠ Drift detected:</strong> {forbiddenLive.join(", ")}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Weight History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Weight History
          </CardTitle>
          <CardDescription>
            Every reweighting event captured by the audit job. Proves traffic was actually shifted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyBySlot.length === 0 ? (
            <p className="text-sm text-muted-foreground">No weight changes recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {historyBySlot.map(([slot, rows]) => (
                <div key={slot}>
                  <div className="mb-2 font-mono text-sm font-semibold">{slot}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-1 pr-3">When</th>
                          <th className="py-1 pr-3">Variant</th>
                          <th className="py-1 pr-3 text-right">Weight</th>
                          <th className="py-1 pr-3 text-right">Score</th>
                          <th className="py-1 pr-3 text-right">Leads</th>
                          <th className="py-1 pr-3 text-right">Bookings</th>
                          <th className="py-1">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 20).map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="py-1 pr-3">{new Date(r.recorded_at).toLocaleString()}</td>
                            <td className="py-1 pr-3 font-mono">{r.variant}</td>
                            <td className="py-1 pr-3 text-right font-semibold">{(r.weight * 100).toFixed(0)}%</td>
                            <td className="py-1 pr-3 text-right">{Number(r.score).toFixed(3)}</td>
                            <td className="py-1 pr-3 text-right">{r.leads}</td>
                            <td className="py-1 pr-3 text-right">{r.bookings}</td>
                            <td className="py-1">
                              {r.paused ? <Badge variant="destructive">Paused</Badge>
                                : r.is_winner ? <Badge className="bg-amber-500">Winner</Badge>
                                : <Badge variant="outline">Active</Badge>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Self-Check Errors
          </CardTitle>
          <CardDescription>
            Weight invariants, paused-with-traffic, conversions without exposure, forbidden inputs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> No errors logged.
            </div>
          ) : (
            <div className="space-y-2">
              {errors.map((e) => (
                <div key={e.id} className={`flex items-start gap-2 rounded border p-2 text-xs ${
                  e.severity === "error" ? "border-rose-300 bg-rose-50" : "border-amber-300 bg-amber-50"
                }`}>
                  <Badge variant={e.severity === "error" ? "destructive" : "outline"}>{e.severity}</Badge>
                  <div className="flex-1">
                    <div className="font-mono">{e.check_name} {e.slot && <span className="text-muted-foreground">· {e.slot}/{e.variant}</span>}</div>
                    <div className="text-muted-foreground">{JSON.stringify(e.details)}</div>
                  </div>
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
