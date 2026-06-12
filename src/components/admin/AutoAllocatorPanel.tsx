/**
 * AutoAllocatorPanel — admin view of the auto A/B system.
 *
 * Live KPIs joined via `ab_allocations.session_id ↔ event_logs.payload.session_id`.
 * Manual controls: pause / resume / promote-winner / archive. Strictly additive —
 * does NOT modify any existing dashboard, event, table, or integration.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Beaker, Trophy, Pause, Play, Archive, RefreshCw } from "lucide-react";
import { twoProportionZTest } from "@/lib/ab-auto/stats";

type ExperimentStatus = "draft" | "running" | "paused" | "won" | "archived";

interface Experiment {
  id: string;
  key: string;
  name: string;
  status: ExperimentStatus;
  primary_metric: string;
  guardrail_metric: string | null;
  min_samples_per_variant: number;
  significance_alpha: number;
  min_lift_pct: number;
  winner_variant_id: string | null;
  last_recomputed_at: string | null;
}

interface Variant {
  id: string;
  key: string;
  label: string;
  is_control: boolean;
  weight: number;
  is_active: boolean;
}

interface VariantKpis {
  lpViews: number;
  quizStarts: number;
  quizCompletions: number;
  bookings: number;
  sessions: number;
}

const METRIC_EVENTS = {
  lpViews: ["PageView", "lp_view"],
  quizStarts: ["quiz_started", "QuizStarted"],
  quizCompletions: ["quiz_completed", "QuizCompleted"],
  bookings: ["appointment_booked", "BookingCreated", "Schedule"],
} as const;

export default function AutoAllocatorPanel() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [variants, setVariants] = useState<Record<string, Variant[]>>({});
  const [kpis, setKpis] = useState<Record<string, VariantKpis>>({});
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const { data: exps, error: e1 } = await supabase
        .from("ab_experiments")
        .select("*")
        .neq("status", "archived")
        .order("created_at", { ascending: false });
      if (e1) throw e1;

      const expRows = (exps ?? []) as unknown as Experiment[];
      const { data: vars, error: e2 } = await supabase
        .from("ab_variants")
        .select("*")
        .in("experiment_id", expRows.map((e) => e.id));
      if (e2) throw e2;

      const varMap: Record<string, Variant[]> = {};
      for (const v of (vars ?? []) as unknown as (Variant & { experiment_id: string })[]) {
        (varMap[v.experiment_id] ||= []).push(v);
      }

      // KPI computation: per variant, count distinct sessions in event_logs join.
      const k: Record<string, VariantKpis> = {};
      for (const exp of expRows) {
        const expVars = varMap[exp.id] ?? [];
        const { data: allocs } = await supabase
          .from("ab_allocations")
          .select("session_id, variant_id")
          .eq("experiment_id", exp.id)
          .limit(20000);
        const byVariant = new Map<string, Set<string>>();
        for (const a of allocs ?? []) {
          if (!byVariant.has(a.variant_id)) byVariant.set(a.variant_id, new Set());
          byVariant.get(a.variant_id)!.add(a.session_id);
        }
        for (const v of expVars) {
          const sessions = byVariant.get(v.id) ?? new Set<string>();
          k[v.id] = { lpViews: 0, quizStarts: 0, quizCompletions: 0, bookings: 0, sessions: sessions.size };
          if (sessions.size === 0) continue;
          const chunks: string[][] = [];
          const ids = Array.from(sessions);
          for (let i = 0; i < ids.length; i += 300) chunks.push(ids.slice(i, i + 300));
          for (const chunk of chunks) {
            const orFilter = chunk.map((s) => `payload->>session_id.eq.${s}`).join(",");
            const allEv = Object.values(METRIC_EVENTS).flat();
            const { data: events } = await supabase
              .from("event_logs")
              .select("event_name")
              .in("event_name", allEv)
              .or(orFilter)
              .limit(50000);
            for (const ev of events ?? []) {
              if (METRIC_EVENTS.lpViews.includes(ev.event_name as never)) k[v.id].lpViews++;
              if (METRIC_EVENTS.quizStarts.includes(ev.event_name as never)) k[v.id].quizStarts++;
              if (METRIC_EVENTS.quizCompletions.includes(ev.event_name as never)) k[v.id].quizCompletions++;
              if (METRIC_EVENTS.bookings.includes(ev.event_name as never)) k[v.id].bookings++;
            }
          }
        }
      }

      setExperiments(expRows);
      setVariants(varMap);
      setKpis(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const recompute = async () => {
    setRecomputing(true);
    try {
      await supabase.functions.invoke("ab-recompute-weights", { body: {} });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecomputing(false);
    }
  };

  const setStatus = async (id: string, status: ExperimentStatus) => {
    await supabase.from("ab_experiments").update({ status }).eq("id", id);
    await load();
  };

  const promote = async (expId: string, variantId: string) => {
    await supabase.from("ab_experiments").update({ status: "won", winner_variant_id: variantId }).eq("id", expId);
    const exp = experiments.find((e) => e.id === expId);
    if (exp) {
      for (const v of variants[expId] ?? []) {
        await supabase.from("ab_variants").update({ weight: v.id === variantId ? 1 : 0 }).eq("id", v.id);
      }
    }
    await load();
  };

  const rate = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";
  const ampel = (r: number) => r > 0.35 ? "text-emerald-600" : r >= 0.2 ? "text-amber-600" : "text-rose-600";

  // Composite-Reward Preview (clientseitig, identische Formel wie Edge-Function):
  // reward = 0.2*QuizStart + 0.3*Completion + 0.5*Booking · pro Variante.
  const compositeReward = (v: Variant): number => {
    const k = kpis[v.id]; if (!k) return 0;
    return 0.2 * k.quizStarts + 0.3 * k.quizCompletions + 0.5 * k.bookings;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Beaker className="h-4 w-4 text-primary" />
            Auto-Allocator (Hybrid Bandit · Composite-Reward)
          </h2>
          <p className="text-xs text-muted-foreground">
            Reward = 0.2·QuizStart + 0.3·Completion + 0.5·Booking, sobald jede Variante ≥ 50 LP-Sessions hat ·
            Exploration-Floor 5% pro Variante · Frequentist Winner-Gate auf Booking-Ebene.
            Quiz, Booking, Calendly, CRM bleiben unberührt.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={recompute} disabled={recomputing}>
          <RefreshCw className={`h-3 w-3 mr-1 ${recomputing ? "animate-spin" : ""}`} />
          Recompute jetzt
        </Button>
      </div>

      {error && <Card className="p-3 border-destructive/40 text-sm text-destructive">{error}</Card>}
      {loading && <Card className="p-6 text-sm text-muted-foreground">Lade Experimente…</Card>}
      {!loading && experiments.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          Noch keine Experimente angelegt. Seed: <code className="px-1 bg-muted rounded">masterofsales_hero_v1</code> (Control) wurde via Migration vorbereitet.
        </Card>
      )}

      {experiments.map((exp) => {
        const vs = variants[exp.id] ?? [];
        const control = vs.find((v) => v.is_control) ?? vs[0];
        return (
          <Card key={exp.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-semibold">{exp.name}</div>
                <div className="text-xs text-muted-foreground">
                  Key: <code>{exp.key}</code> · Primary: <code>{exp.primary_metric}</code>
                  {exp.guardrail_metric && <> · Guardrail: <code>{exp.guardrail_metric}</code></>}
                  {exp.last_recomputed_at && <> · Letzte Berechnung: {new Date(exp.last_recomputed_at).toLocaleString("de-DE")}</>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={exp.status === "won" ? "default" : exp.status === "running" ? "outline" : "secondary"}>
                  {exp.status === "won" && <Trophy className="h-3 w-3 mr-1" />} {exp.status}
                </Badge>
                {exp.status === "running" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(exp.id, "paused")}>
                    <Pause className="h-3 w-3 mr-1" /> Pause
                  </Button>
                )}
                {exp.status === "paused" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(exp.id, "running")}>
                    <Play className="h-3 w-3 mr-1" /> Resume
                  </Button>
                )}
                {exp.status !== "archived" && (
                  <Button size="sm" variant="ghost" onClick={() => setStatus(exp.id, "archived")}>
                    <Archive className="h-3 w-3 mr-1" /> Archive
                  </Button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-1.5">Variante</th>
                    <th className="text-right py-1.5">Weight</th>
                    <th className="text-right py-1.5">Sessions</th>
                    <th className="text-right py-1.5">LP Views</th>
                    <th className="text-right py-1.5">Quiz Starts</th>
                    <th className="text-right py-1.5">Start Rate</th>
                    <th className="text-right py-1.5">Completions</th>
                    <th className="text-right py-1.5">Bookings</th>
                    <th className="text-right py-1.5">Reward*</th>
                    <th className="text-right py-1.5">p-Value</th>
                    <th className="text-right py-1.5">Lift</th>
                    <th className="text-right py-1.5">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {vs.map((v) => {
                    const k = kpis[v.id] ?? { lpViews: 0, quizStarts: 0, quizCompletions: 0, bookings: 0, sessions: 0 };
                    const startRate = k.lpViews > 0 ? k.quizStarts / k.lpViews : 0;
                    let p = "—", lift = "—";
                    if (control && v.id !== control.id) {
                      const cK = kpis[control.id];
                      if (cK) {
                        const r = twoProportionZTest(
                          { trials: cK.lpViews, successes: cK.bookings },
                          { trials: k.lpViews, successes: k.bookings },
                        );
                        p = r.pValue.toFixed(3);
                        lift = `${r.liftPct.toFixed(1)}%`;
                      }
                    }
                    return (
                      <tr key={v.id} className="border-b border-border/40">
                        <td className="py-1.5">
                          {v.label} {v.is_control && <Badge variant="outline" className="ml-1 text-[10px]">Control</Badge>}
                          {exp.winner_variant_id === v.id && <Trophy className="inline h-3 w-3 ml-1 text-primary" />}
                        </td>
                        <td className="py-1.5 text-right font-mono">{(v.weight * 100).toFixed(1)}%</td>
                        <td className="py-1.5 text-right font-mono">{k.sessions}</td>
                        <td className="py-1.5 text-right font-mono">{k.lpViews}</td>
                        <td className="py-1.5 text-right font-mono">{k.quizStarts}</td>
                        <td className={`py-1.5 text-right font-mono ${ampel(startRate)}`}>{rate(k.quizStarts, k.lpViews)}</td>
                        <td className="py-1.5 text-right font-mono">{k.quizCompletions}</td>
                        <td className="py-1.5 text-right font-mono">{k.bookings}</td>
                        <td className="py-1.5 text-right font-mono font-semibold">{compositeReward(v).toFixed(1)}</td>
                        <td className="py-1.5 text-right font-mono">{p}</td>
                        <td className="py-1.5 text-right font-mono">{lift}</td>
                        <td className="py-1.5 text-right">
                          {exp.status !== "won" && !v.is_control && (
                            <Button size="sm" variant="ghost" onClick={() => promote(exp.id, v.id)}>
                              <Trophy className="h-3 w-3 mr-1" /> Promote
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-muted-foreground">
              Winner-Gate: p &lt; {exp.significance_alpha} · Lift ≥ {exp.min_lift_pct}% · Min Samples: {exp.min_samples_per_variant} / Variante (Booking-Ebene).
              Ampel auf Start Rate: 🟢 &gt;35% · 🟡 20–35% · 🔴 &lt;20%.
              <br />
              <span className="opacity-80">*Reward = 0.2·QuizStart + 0.3·Completion + 0.5·Booking. Bandit bevorzugt automatisch Varianten mit höherem Reward; jede Variante behält ≥ 5% Traffic für Exploration.</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
