/**
 * CroOverviewPanel — consolidated CRO dashboard.
 * --------------------------------------------------------------
 * One-screen view across all CRO experiments registered via
 * `CRO_EXPERIMENT_KEYS`. Reads only:
 *   - public.ab_experiments  (status, allocator, winner_variant_id)
 *   - public.ab_variants     (label, weight, is_control)
 *   - public.event_logs      (PageView, ApplyCtaClick, QuizStarted,
 *                             QuizCompleted, Lead, BookingCreated/Schedule)
 *
 * Pure read. No writes. Safe to mount alongside existing panels — does not
 * touch Quiz, Booking, CRM, GHL, Pixel, or any auth surface.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CRO_EXPERIMENT_KEYS } from "@/lib/cro/config";
import { Trophy, AlertTriangle, BarChart3, RefreshCw } from "lucide-react";

const CONV_EVENTS = [
  "PageView", "ApplyCtaClick", "QuizStarted", "QuizCompleted",
  "Lead", "HighQualityLead", "BookingCreated", "Schedule",
] as const;
type ConvEvent = (typeof CONV_EVENTS)[number];

interface ExperimentRow {
  id: string; key: string; name: string; status: string;
  allocator: string; winner_variant_id: string | null;
  primary_metric: string; min_lift_pct: number;
  significance_alpha: number; min_samples_per_variant: number;
}
interface VariantRow {
  id: string; experiment_id: string; key: string; label: string;
  is_control: boolean; weight: number;
}
interface EventRow {
  event_name: string;
  payload: { ab_test_name?: string; ab_variant?: string; session_id?: string } | null;
}

type VariantStats = Record<ConvEvent, Set<string>>;
const emptyStats = (): VariantStats =>
  CONV_EVENTS.reduce((acc, e) => ({ ...acc, [e]: new Set<string>() }), {} as VariantStats);

export default function CroOverviewPanel() {
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(14);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - sinceDays * 86_400_000);
      const [{ data: exps, error: e1 }, { data: vars, error: e2 }] = await Promise.all([
        supabase.from("ab_experiments").select(
          "id,key,name,status,allocator,winner_variant_id,primary_metric,min_lift_pct,significance_alpha,min_samples_per_variant",
        ).in("key", [...CRO_EXPERIMENT_KEYS]),
        supabase.from("ab_variants").select(
          "id,experiment_id,key,label,is_control,weight",
        ),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const expKeys = new Set((exps ?? []).map((e) => e.key));
      const evs: EventRow[] = [];
      const PAGE = 1000;
      for (let from = 0; from < 100_000; from += PAGE) {
        const { data, error: e3 } = await supabase
          .from("event_logs")
          .select("event_name, payload")
          .gte("created_at", since.toISOString())
          .in("event_name", [...CONV_EVENTS])
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (e3) throw e3;
        const batch = (data ?? []) as EventRow[];
        evs.push(...batch);
        if (batch.length < PAGE) break;
      }
      setExperiments((exps ?? []) as ExperimentRow[]);
      setVariants(((vars ?? []) as VariantRow[]).filter((v) =>
        (exps ?? []).some((e) => e.id === v.experiment_id && expKeys.has(e.key)),
      ));
      setEvents(evs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sinceDays]);

  /** Per-experiment, per-variant deduped session counts for each conv event. */
  const statsByExp = useMemo(() => {
    const out = new Map<string, Map<string, VariantStats>>();
    for (const exp of experiments) {
      const vmap = new Map<string, VariantStats>();
      for (const v of variants.filter((x) => x.experiment_id === exp.id)) {
        vmap.set(v.key, emptyStats());
      }
      out.set(exp.key, vmap);
    }
    for (const row of events) {
      const p = row.payload ?? {};
      const testName = p.ab_test_name;
      const variantKey = p.ab_variant;
      const sid = p.session_id;
      const ev = row.event_name as ConvEvent;
      if (!testName || !variantKey || !sid || !CONV_EVENTS.includes(ev)) continue;
      const vmap = out.get(testName);
      if (!vmap) continue;
      const vstats = vmap.get(variantKey);
      if (!vstats) continue;
      vstats[ev].add(sid);
    }
    return out;
  }, [experiments, variants, events]);

  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(2)}%` : "—");

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <div>
            <div className="font-medium">CRO Overview — Full-Funnel Per Variant</div>
            <div className="text-xs text-muted-foreground">
              Visitor → CTA → Quiz Start → Quiz Compl. → Lead → Qualified → Booking.
              Score gewichtet downstream (Booking &gt; Qualified &gt; Lead &gt; Quiz). CTR allein entscheidet nie.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={sinceDays === d ? "default" : "outline"}
                    onClick={() => setSinceDays(d)}>{d}d</Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground/80">
        <b>Traffic-Allokation optimiert auf Qualified Leads &amp; Bookings — nicht auf Clicks.</b>
        {" "}Thompson Sampling mit 10% Exploration-Floor, Channel × Device aware
        (Fallback: <code>channel:device → channel → global</code>).
        Winner werden nur <b>empfohlen</b>, niemals automatisch ausgerollt — Control-Swap erfordert manuelle Code-Freigabe.
        Rollback jederzeit via <code>CRO_ENABLED=false</code>.
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {experiments.length === 0 && !loading && (
        <div className="text-sm text-muted-foreground">
          Keine CRO-Experimente registriert. Migration seed_cro_experiments ausführen.
        </div>
      )}


      {experiments.map((exp) => {
        const vmap = statsByExp.get(exp.key) ?? new Map<string, VariantStats>();
        const expVariants = variants
          .filter((v) => v.experiment_id === exp.id)
          .sort((a, b) => (a.is_control === b.is_control ? a.key.localeCompare(b.key) : a.is_control ? -1 : 1));

        const winnerKey = expVariants.find((v) => v.id === exp.winner_variant_id)?.key;

        return (
          <div key={exp.id} className="border border-border rounded-md p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {exp.name}
                  <Badge variant={exp.status === "running" ? "default" : "outline"} className="text-[10px]">
                    {exp.status}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{exp.allocator}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Key <code>{exp.key}</code> · Primary {exp.primary_metric} · α={exp.significance_alpha} · min Lift {exp.min_lift_pct}%
                  · min Samples {exp.min_samples_per_variant}/Var.
                </div>
              </div>
              {winnerKey && exp.status === "won" && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  Gewinner empfohlen: <b>{winnerKey}</b> — manuelle Freigabe für Control-Swap erforderlich.
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-1.5">Variante</th>
                    <th className="py-1.5 text-right">Weight</th>
                    <th className="py-1.5 text-right">Visitors</th>
                    <th className="py-1.5 text-right">CTA</th>
                    <th className="py-1.5 text-right">Quiz Start</th>
                    <th className="py-1.5 text-right">Quiz Compl.</th>
                    <th className="py-1.5 text-right">Lead</th>
                    <th className="py-1.5 text-right">Qualified</th>
                    <th className="py-1.5 text-right">Booking</th>
                    <th className="py-1.5 text-right">CTA %</th>
                    <th className="py-1.5 text-right">Quiz Start %</th>
                    <th className="py-1.5 text-right">Quiz Compl. %</th>
                    <th className="py-1.5 text-right">Lead %</th>
                    <th className="py-1.5 text-right">Qualified %</th>
                    <th className="py-1.5 text-right">Booking %</th>
                    <th className="py-1.5 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {expVariants.map((v) => {
                    const s = vmap.get(v.key) ?? emptyStats();
                    const visitors = s.PageView.size;
                    const cta = s.ApplyCtaClick.size;
                    const apply = s.QuizStarted.size;
                    const compl = s.QuizCompleted.size;
                    const lead = s.Lead.size;
                    const hq = s.HighQualityLead.size;
                    const book = s.BookingCreated.size + s.Schedule.size;
                    const isWinner = v.id === exp.winner_variant_id;
                    // Downstream-weighted score (CTR ignored).
                    // 0.5*booking + 0.25*qualified + 0.15*lead + 0.10*quizStart, normalized to visitors.
                    const score = visitors > 0
                      ? (0.5 * book + 0.25 * hq + 0.15 * lead + 0.10 * apply) / visitors
                      : 0;
                    return (
                      <tr key={v.id} className="border-b border-border/40">
                        <td className="py-1.5">
                          <span className="font-medium">{v.label}</span>
                          {v.is_control && <Badge variant="outline" className="ml-2 text-[10px]">Control</Badge>}
                          {isWinner && <Trophy className="inline h-3.5 w-3.5 text-primary ml-2" />}
                        </td>
                        <td className="py-1.5 text-right font-mono">{(v.weight * 100).toFixed(0)}%</td>
                        <td className="py-1.5 text-right font-mono">{visitors}</td>
                        <td className="py-1.5 text-right font-mono">{cta}</td>
                        <td className="py-1.5 text-right font-mono">{apply}</td>
                        <td className="py-1.5 text-right font-mono">{compl}</td>
                        <td className="py-1.5 text-right font-mono">{lead}</td>
                        <td className="py-1.5 text-right font-mono">{hq}</td>
                        <td className="py-1.5 text-right font-mono font-semibold">{book}</td>
                        <td className="py-1.5 text-right text-muted-foreground font-mono">{pct(cta, visitors)}</td>
                        <td className="py-1.5 text-right text-muted-foreground font-mono">{pct(apply, visitors)}</td>
                        <td className="py-1.5 text-right text-muted-foreground font-mono">{pct(compl, apply)}</td>
                        <td className="py-1.5 text-right text-muted-foreground font-mono">{pct(lead, visitors)}</td>
                        <td className="py-1.5 text-right text-muted-foreground font-mono">{pct(hq, visitors)}</td>
                        <td className="py-1.5 text-right text-muted-foreground font-mono">{pct(book, visitors)}</td>
                        <td className="py-1.5 text-right font-mono font-semibold">{(score * 100).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(() => {
              // ----- Recommendation engine (display-only, manual approval) -----
              type Row = {
                v: typeof expVariants[number];
                visitors: number; lead: number; hq: number; book: number; score: number;
              };
              const rows: Row[] = expVariants.map((v) => {
                const s = vmap.get(v.key) ?? emptyStats();
                const visitors = s.PageView.size;
                const lead = s.Lead.size;
                const hq = s.HighQualityLead.size;
                const book = s.BookingCreated.size + s.Schedule.size;
                const apply = s.QuizStarted.size;
                const score = visitors > 0
                  ? (0.5 * book + 0.25 * hq + 0.15 * lead + 0.10 * apply) / visitors
                  : 0;
                return { v, visitors, lead, hq, book, score };
              });
              const control = rows.find((r) => r.v.is_control) ?? rows[0];
              const challenger = rows
                .filter((r) => r.v.id !== control?.v.id)
                .sort((a, b) => b.score - a.score)[0];
              if (!control || !challenger || control.visitors === 0 || challenger.visitors === 0) {
                return (
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Empfehlung sammelt noch Daten — mindestens {exp.min_samples_per_variant} Visitors pro Variante nötig.
                  </div>
                );
              }
              const liftPct = control.score > 0 ? ((challenger.score - control.score) / control.score) * 100 : 0;
              // Confidence proxy: how close we are to min_samples on each side.
              const minN = exp.min_samples_per_variant || 200;
              const sampleProgress = Math.min(1, Math.min(control.visitors, challenger.visitors) / minN);
              // Booking-rate two-proportion proxy
              const pC = control.book / control.visitors;
              const pT = challenger.book / challenger.visitors;
              const pPool = (control.book + challenger.book) / (control.visitors + challenger.visitors);
              const se = Math.sqrt(pPool * (1 - pPool) * (1 / control.visitors + 1 / challenger.visitors));
              const z = se > 0 ? (pT - pC) / se : 0;
              // Confidence ≈ 1 - p (one-sided), capped 0..1
              const erf = (x: number) => {
                const sign = x < 0 ? -1 : 1; const ax = Math.abs(x);
                const t = 1 / (1 + 0.3275911 * ax);
                const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
                return sign * y;
              };
              const confZ = 0.5 * (1 + erf(z / Math.SQRT2));
              const confidence = Math.max(0, Math.min(1, sampleProgress * confZ));
              // Projected monthly delta: extrapolate window → 30d
              const days = sinceDays;
              const dailyVisitors = (control.visitors + challenger.visitors) / Math.max(1, days);
              const monthlyVisitors = dailyVisitors * 30;
              const challengerShare = 0.5;
              const projLeadDelta = Math.round(
                challengerShare * monthlyVisitors *
                ((challenger.lead / challenger.visitors) - (control.lead / control.visitors)),
              );
              const projBookDelta = Math.round(
                challengerShare * monthlyVisitors *
                ((challenger.book / challenger.visitors) - (control.book / control.visitors)),
              );
              // Harm-guard: challenger must NOT regress booking or qualified rate vs control.
              const bookRateC = control.book / control.visitors;
              const bookRateT = challenger.book / challenger.visitors;
              const hqRateC = control.hq / control.visitors;
              const hqRateT = challenger.hq / challenger.visitors;
              const harmsBooking = bookRateT < bookRateC;
              const harmsQualified = hqRateT < hqRateC;
              const downstreamTotal = rows.reduce((a, r) => a + r.book + r.hq + r.lead, 0);
              const totalVisitors = rows.reduce((a, r) => a + r.visitors, 0);

              const ready =
                sampleProgress >= 1 &&
                liftPct >= (exp.min_lift_pct ?? 10) &&
                confZ >= 1 - (exp.significance_alpha ?? 0.05) &&
                !harmsBooking &&
                !harmsQualified &&
                downstreamTotal > 0;

              // Status derivation
              let statusLabel = "Learning";
              let statusTone: "default" | "outline" | "destructive" = "outline";
              if (exp.status === "paused") { statusLabel = "Paused"; statusTone = "outline"; }
              else if (ready) { statusLabel = "Winner recommended"; statusTone = "default"; }
              else if (sampleProgress < 0.25 || totalVisitors < 100) { statusLabel = "Needs more data"; statusTone = "outline"; }
              else if (downstreamTotal === 0) { statusLabel = "Click-only signal"; statusTone = "destructive"; }
              else if (Math.abs(liftPct) >= (exp.min_lift_pct ?? 10) && sampleProgress >= 0.5) { statusLabel = "Strong signal"; statusTone = "default"; }

              // Data-quality warnings
              const warnings: string[] = [];
              if (totalVisitors < 100) warnings.push("Niedrige Stichprobe (< 100 Visitors gesamt)");
              if (downstreamTotal === 0 && totalVisitors > 50) warnings.push("Keine Downstream-Conversions — nur Click-Signal");
              if (rows.some((r) => r.visitors === 0)) warnings.push("Variante ohne Visitors — Tracking prüfen");
              if (rows.some((r) => r.visitors > 200 && r.lead + r.book + r.hq === 0))
                warnings.push("Variante mit Traffic aber 0 Downstream — mögliches Tracking-Issue");
              if (ready && (harmsBooking || harmsQualified))
                warnings.push("Lift im Score, aber Regression bei Booking/Qualified — Harm-Guard blockiert");

              return (
                <div className={`rounded-md border p-3 text-xs space-y-1.5 ${
                  ready ? "border-amber-400 bg-amber-50/40 dark:bg-amber-950/20" : "border-border bg-muted/30"
                }`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="font-medium text-sm flex items-center gap-2">
                      Empfehlung: <span className="font-mono">{challenger.v.label}</span>
                      {challenger.v.is_control && <Badge variant="outline" className="text-[10px]">Control</Badge>}
                      <Badge variant={statusTone} className="text-[10px]">{statusLabel}</Badge>
                    </div>
                    <Badge variant={ready ? "default" : "outline"} className="text-[10px]">
                      {ready ? "Reif für manuellen Swap" : "Sammelt Daten"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-muted-foreground">Confidence</div>
                      <div className="font-mono font-semibold">{(confidence * 100).toFixed(0)}%</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Est. Lift (Score)</div>
                      <div className="font-mono font-semibold">{liftPct >= 0 ? "+" : ""}{liftPct.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Proj. Δ Leads / Monat</div>
                      <div className="font-mono font-semibold">{projLeadDelta >= 0 ? "+" : ""}{projLeadDelta}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Proj. Δ Bookings / Monat</div>
                      <div className="font-mono font-semibold">{projBookDelta >= 0 ? "+" : ""}{projBookDelta}</div>
                    </div>
                  </div>
                  {warnings.length > 0 && (
                    <div className="rounded border border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20 p-2 text-[11px] text-amber-900 dark:text-amber-200 space-y-0.5">
                      {warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    Sample-Fortschritt {(sampleProgress * 100).toFixed(0)}% (min {minN}/Var.) ·
                    z-Score {z.toFixed(2)} ·
                    Harm-Guard Booking {harmsBooking ? "❌" : "✓"} · Qualified {harmsQualified ? "❌" : "✓"} ·
                    Hierarchie: Booking &gt; Qualified &gt; Lead &gt; Quiz &gt; CTA.
                    <b> Auto-Publish deaktiviert</b> — Code-Swap erfordert manuelle Freigabe.
                  </div>
                </div>
              );

            })()}
            <div className="text-[11px] text-muted-foreground">
              Score-Formel: <code>0.50·Booking + 0.25·Qualified + 0.15·Lead + 0.10·QuizStart</code> ÷ Visitors.
              Quiz Compl. % = Completion ÷ QuizStart (Funnel-Schritt).
              Alle anderen %-Werte = ÷ Visitors.
            </div>
          </div>
        );
      })}

      <div className="text-xs text-muted-foreground">
        Gewinner-Empfehlung erfolgt automatisch sobald Min-Samples + Lift + p-Wert-Gates erreicht sind.
        <b> Control-Swap im Code bleibt manuell</b> — Rollback jederzeit via <code>CRO_ENABLED=false</code>.
      </div>
    </Card>
  );
}
