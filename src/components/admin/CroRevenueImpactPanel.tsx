/**
 * CroRevenueImpactPanel — Phase 6 (display-only).
 * ------------------------------------------------
 * Read-only revenue attribution per CRO experiment variant.
 * Reads event_logs ONLY (already populated by existing tracking layer).
 * No writes, no allocation changes, no CRM mutations, no schema changes.
 *
 * Revenue hierarchy (descending weight):
 *   1. Closed Deal     — events: closed_won · deal_won · purchase_completed
 *   2. Show-Up         — events: showed · appointment_showed
 *   3. Qualified Booking — Booking + Qualified on same session
 *   4. Qualified Lead  — events: qualified · setter_qualified · HighQualityLead
 *   5. Lead Submit     — event: Lead
 *   6. CTA Click       — event: ApplyCtaClick (guardrail only)
 *
 * Estimated revenue impact uses an operator-configurable AOV (default €4400 —
 * mid-tier ETC product). Display-only, no DB read of payment tables (kept
 * read-isolated from CRM).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CRO_EXPERIMENT_KEYS } from "@/lib/cro/config";
import { Coins, RefreshCw } from "lucide-react";

const REV_EVENTS = [
  "ApplyCtaClick",
  "Lead",
  "HighQualityLead",
  "qualified",
  "setter_qualified",
  "BookingCreated",
  "Schedule",
  "showed",
  "appointment_showed",
  "closed_won",
  "deal_won",
  "purchase_completed",
] as const;
type RevEvent = (typeof REV_EVENTS)[number];

interface ExperimentRow { id: string; key: string; name: string; status: string; }
interface VariantRow { id: string; experiment_id: string; key: string; label: string; is_control: boolean; }
interface EventRow {
  event_name: string;
  payload: { ab_test_name?: string; ab_variant?: string; session_id?: string } | null;
}

type VStats = Record<RevEvent, Set<string>>;
const emptyStats = (): VStats =>
  REV_EVENTS.reduce((a, e) => ({ ...a, [e]: new Set<string>() }), {} as VStats);

export default function CroRevenueImpactPanel() {
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [sinceDays, setSinceDays] = useState(30);
  const [aov, setAov] = useState(4400);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - sinceDays * 86_400_000);
      const [{ data: exps, error: e1 }, { data: vars, error: e2 }] = await Promise.all([
        supabase.from("ab_experiments").select("id,key,name,status").in("key", [...CRO_EXPERIMENT_KEYS]),
        supabase.from("ab_variants").select("id,experiment_id,key,label,is_control"),
      ]);
      if (e1) throw e1; if (e2) throw e2;

      const evs: EventRow[] = [];
      const PAGE = 1000;
      for (let from = 0; from < 100_000; from += PAGE) {
        const { data, error: e3 } = await supabase
          .from("event_logs")
          .select("event_name, payload")
          .gte("created_at", since.toISOString())
          .in("event_name", [...REV_EVENTS])
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (e3) throw e3;
        const batch = (data ?? []) as EventRow[];
        evs.push(...batch);
        if (batch.length < PAGE) break;
      }
      setExperiments((exps ?? []) as ExperimentRow[]);
      setVariants(((vars ?? []) as VariantRow[]).filter((v) =>
        (exps ?? []).some((e) => e.id === v.experiment_id),
      ));
      setEvents(evs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sinceDays]);

  const statsByExp = useMemo(() => {
    const out = new Map<string, Map<string, VStats>>();
    for (const exp of experiments) {
      const vmap = new Map<string, VStats>();
      for (const v of variants.filter((x) => x.experiment_id === exp.id)) vmap.set(v.key, emptyStats());
      out.set(exp.key, vmap);
    }
    for (const row of events) {
      const p = row.payload ?? {};
      const ev = row.event_name as RevEvent;
      if (!p.ab_test_name || !p.ab_variant || !p.session_id) continue;
      const vmap = out.get(p.ab_test_name); if (!vmap) continue;
      const vstats = vmap.get(p.ab_variant); if (!vstats) continue;
      if (REV_EVENTS.includes(ev)) vstats[ev].add(p.session_id);
    }
    return out;
  }, [experiments, variants, events]);

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-2">
          <Coins className="h-5 w-5 text-primary mt-0.5" />
          <div>
            <div className="font-medium">Revenue Impact — Per Experiment Variant</div>
            <div className="text-xs text-muted-foreground max-w-2xl">
              Hierarchie: <b>Closed Deal &gt; Show-Up &gt; Qualified Booking &gt; Qualified Lead &gt; Lead &gt; CTA</b>.
              Read-only. Liest <code>event_logs</code> — kein Zugriff auf CRM-Mutationen, Payments oder Allokation.
              Geschätzter Umsatz = Closed Deals × AOV. AOV operator-konfigurierbar.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={sinceDays === d ? "default" : "outline"} onClick={() => setSinceDays(d)}>{d}d</Button>
          ))}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">AOV €</span>
            <Input type="number" value={aov} onChange={(e) => setAov(Number(e.target.value) || 0)} className="h-8 w-24" />
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {experiments.map((exp) => {
        const vmap = statsByExp.get(exp.key) ?? new Map<string, VStats>();
        const expVariants = variants
          .filter((v) => v.experiment_id === exp.id)
          .sort((a, b) => (a.is_control === b.is_control ? a.key.localeCompare(b.key) : a.is_control ? -1 : 1));

        // Control reference (for incremental revenue lift)
        const ctl = expVariants.find((v) => v.is_control);
        const ctlStats = ctl ? vmap.get(ctl.key) ?? emptyStats() : emptyStats();
        const ctlDeals = ctlStats.closed_won.size + ctlStats.deal_won.size + ctlStats.purchase_completed.size;
        const ctlVisits = ctlStats.Lead.size; // proxy denominator
        const ctlDealRate = ctlVisits > 0 ? ctlDeals / ctlVisits : 0;

        return (
          <div key={exp.id} className="border border-border rounded-md p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-medium">{exp.name}</div>
              <Badge variant={exp.status === "running" ? "default" : "outline"} className="text-[10px]">{exp.status}</Badge>
              <code className="text-[11px] text-muted-foreground">{exp.key}</code>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-1.5">Variante</th>
                    <th className="py-1.5 text-right">CTA</th>
                    <th className="py-1.5 text-right">Lead</th>
                    <th className="py-1.5 text-right">Qualified</th>
                    <th className="py-1.5 text-right">Booking</th>
                    <th className="py-1.5 text-right">Qual. Booking</th>
                    <th className="py-1.5 text-right">Show-Up</th>
                    <th className="py-1.5 text-right">Closed Deal</th>
                    <th className="py-1.5 text-right">Est. Revenue</th>
                    <th className="py-1.5 text-right">Δ Revenue vs Control</th>
                  </tr>
                </thead>
                <tbody>
                  {expVariants.map((v) => {
                    const s = vmap.get(v.key) ?? emptyStats();
                    const cta = s.ApplyCtaClick.size;
                    const lead = s.Lead.size;
                    const qualified = new Set([
                      ...s.qualified, ...s.setter_qualified, ...s.HighQualityLead,
                    ]).size;
                    const booking = new Set([...s.BookingCreated, ...s.Schedule]);
                    const qualifiedSet = new Set([...s.qualified, ...s.setter_qualified, ...s.HighQualityLead]);
                    const qualBooking = [...booking].filter((sid) => qualifiedSet.has(sid)).length;
                    const showup = new Set([...s.showed, ...s.appointment_showed]).size;
                    const deals = s.closed_won.size + s.deal_won.size + s.purchase_completed.size;
                    const estRev = deals * aov;
                    // Δ Revenue vs Control: extrapolated to challenger's traffic
                    let deltaRev = 0;
                    if (ctl && v.id !== ctl.id && ctlVisits > 0) {
                      const variantDealRate = lead > 0 ? deals / lead : 0;
                      deltaRev = (variantDealRate - ctlDealRate) * lead * aov;
                    }
                    return (
                      <tr key={v.id} className="border-b border-border/40">
                        <td className="py-1.5">
                          {v.label}
                          {v.is_control && <Badge variant="outline" className="ml-2 text-[10px]">Control</Badge>}
                        </td>
                        <td className="py-1.5 text-right font-mono text-muted-foreground">{cta}</td>
                        <td className="py-1.5 text-right font-mono">{lead}</td>
                        <td className="py-1.5 text-right font-mono">{qualified}</td>
                        <td className="py-1.5 text-right font-mono">{booking.size}</td>
                        <td className="py-1.5 text-right font-mono">{qualBooking}</td>
                        <td className="py-1.5 text-right font-mono">{showup}</td>
                        <td className="py-1.5 text-right font-mono font-semibold">{deals}</td>
                        <td className="py-1.5 text-right font-mono font-semibold">€ {estRev.toLocaleString("de-DE")}</td>
                        <td className={`py-1.5 text-right font-mono ${deltaRev > 0 ? "text-emerald-600" : deltaRev < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {v.is_control ? "—" : `${deltaRev >= 0 ? "+" : ""}€ ${Math.round(deltaRev).toLocaleString("de-DE")}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="text-[11px] text-muted-foreground border-t border-border pt-3 space-y-1">
        <div>
          <b>Signal-Quellen:</b> <code>event_logs.payload.ab_test_name/ab_variant/session_id</code>.
          Downstream-Events vorhanden: <code>qualified</code>, <code>setter_qualified</code>, <code>showed</code>,
          <code> appointment_showed</code>, <code>closed_won</code>, <code>deal_won</code>, <code>purchase_completed</code>.
        </div>
        <div>
          <b>Nicht angebunden (bewusst):</b> <code>appointments.payment_status</code>, <code>calls.deal_size</code>,
          <code> payment_events</code>, <code>stripe_events</code> — Revenue-Attribution bleibt CRM-isoliert.
          Wenn echte Deal-Größe pro Variante benötigt wird, eigener Read-Only Join-Job nötig (separater Phase 7-Vorschlag).
        </div>
        <div>
          <b>Allokation unverändert:</b> Dieses Panel <i>liest nur</i>. Recompute, Thompson Sampling,
          Channel-Weights und Harm-Guard unangetastet.
        </div>
      </div>
    </Card>
  );
}
