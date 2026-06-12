/**
 * Champion Funnel + Auto Budget Engine — admin panel.
 *
 * Read-only surface over `champion_funnels` + `funnel_budget_recommendations`
 * + `champion_engine_readiness()`. The engine *suggests*; the human applies
 * via `apply_funnel_budget_change(funnel_source, new_amount, reason)`.
 *
 * Slots into the existing Performance Command Center as a new tab — no
 * standalone route, no UI duplication. All safety rules (≥50 leads, ±30 %,
 * 3d cooldown) are enforced server-side; the UI just surfaces them.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Crown, TrendingUp, TrendingDown, Pause, AlertCircle, RefreshCw } from "lucide-react";

interface Recommendation {
  funnel_source: string;
  leads: number;
  performance_score: number | null;
  rank_bucket: number | null;
  spend_7d: number;
  spend_30d: number;
  recommendation: "SCALE" | "MAINTAIN" | "REDUCE" | "PAUSED" | "COOLDOWN" | "INSUFFICIENT_DATA";
  suggested_delta_pct: number;
  suggested_new_spend_7d: number;
  last_applied_at: string | null;
  budget_routing_paused: boolean;
  forced_status: string | null;
}

interface Champion {
  funnel_source: string;
  leads: number;
  revenue_per_lead: number | null;
  booking_rate: number | null;
  show_rate: number | null;
  close_rate: number | null;
  status: string;
}

interface Readiness {
  funnels_total: number;
  funnels_ready: number;
  champions: number;
  readiness_score: number;
}

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

export default function ChampionBudgetPanel() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [champions, setChampions] = useState<Champion[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [r, c, ready] = await Promise.all([
      supabase.from("funnel_budget_recommendations" as never).select("*"),
      supabase.from("champion_funnels" as never).select("*"),
      supabase.rpc("champion_engine_readiness" as never) as unknown as Promise<{ data: Readiness | null; error: unknown }>,
    ]);
    if (!r.error && r.data) setRecs(r.data as unknown as Recommendation[]);
    if (!c.error && c.data) setChampions(c.data as unknown as Champion[]);
    if (!ready.error && ready.data) setReadiness(ready.data);
  };

  useEffect(() => { load(); }, []);

  const applyRecommendation = async (r: Recommendation) => {
    if (r.recommendation !== "SCALE" && r.recommendation !== "REDUCE") return;
    setBusy(true);
    const { error } = await supabase.rpc("apply_funnel_budget_change" as never, {
      p_funnel_source: r.funnel_source,
      p_new_amount: r.suggested_new_spend_7d,
      p_reason: `auto_${r.recommendation.toLowerCase()}_bucket_${r.rank_bucket}`,
    } as never);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(`Budget angewendet: ${r.funnel_source}`); load(); }
  };

  const togglePause = async (funnel: string, paused: boolean) => {
    setBusy(true);
    const { error } = await supabase
      .from("funnel_status_overrides" as never)
      .upsert({ funnel_source: funnel, budget_routing_paused: !paused, updated_at: new Date().toISOString() } as never, { onConflict: "funnel_source" } as never);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(!paused ? "Routing pausiert" : "Routing aktiv"); load(); }
  };

  const recBadge = (rec: Recommendation["recommendation"]) => {
    const map: Record<typeof rec, { label: string; cls: string; icon?: React.ReactNode }> = {
      SCALE:             { label: "SCALE +30%",   cls: "bg-primary text-primary-foreground", icon: <TrendingUp className="h-3 w-3 mr-1" /> },
      REDUCE:            { label: "REDUCE -30%",  cls: "bg-destructive text-destructive-foreground", icon: <TrendingDown className="h-3 w-3 mr-1" /> },
      MAINTAIN:          { label: "MAINTAIN",     cls: "bg-muted text-muted-foreground" },
      PAUSED:            { label: "PAUSED",       cls: "bg-muted text-muted-foreground", icon: <Pause className="h-3 w-3 mr-1" /> },
      COOLDOWN:          { label: "COOLDOWN",     cls: "bg-muted text-muted-foreground" },
      INSUFFICIENT_DATA: { label: "n<50",         cls: "bg-muted text-muted-foreground", icon: <AlertCircle className="h-3 w-3 mr-1" /> },
    };
    const m = map[rec];
    return <Badge className={m.cls}>{m.icon}{m.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Readiness */}
      <Card className="p-4 border-border/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Engine Readiness</span>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={busy}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
        {readiness && (
          <>
            <Progress value={readiness.readiness_score * 100} className="h-2 mb-2" />
            <div className="text-xs text-muted-foreground flex gap-4 flex-wrap">
              <span>Funnels: <strong className="text-foreground">{readiness.funnels_total}</strong></span>
              <span>Datenbereit (≥50 Leads): <strong className="text-foreground">{readiness.funnels_ready}</strong></span>
              <span>Champions: <strong className="text-foreground">{readiness.champions}</strong></span>
              <span>Score: <strong className="text-foreground">{(readiness.readiness_score * 100).toFixed(0)}%</strong></span>
            </div>
          </>
        )}
      </Card>

      {/* Champions */}
      <Card className="p-4 border-border/40">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Crown className="h-4 w-4 text-primary" /> Aktive Champions
        </h3>
        {champions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Noch kein Funnel erfüllt alle Champion-Kriterien (n≥50 · booking≥20% · show≥60% · close≥20% · max Rev/Lead).
          </p>
        ) : (
          <div className="space-y-2">
            {champions.map((c) => (
              <div key={c.funnel_source} className="flex items-center justify-between text-sm border border-border/50 rounded p-2">
                <div className="flex items-center gap-2">
                  <Crown className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono">{c.funnel_source}</span>
                  <Badge variant="secondary">{c.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.leads} leads · €{c.revenue_per_lead}/lead · close {((c.close_rate ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recommendations */}
      <Card className="p-4 border-border/40">
        <h3 className="text-sm font-medium mb-3">Budget-Empfehlungen (7d Cycle)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border/40">
                <th className="text-left py-2 px-2">Funnel</th>
                <th className="text-right">Leads</th>
                <th className="text-right">Score</th>
                <th className="text-right">Bucket</th>
                <th className="text-right">Spend 7d</th>
                <th className="text-right">→ Vorschlag</th>
                <th className="text-center">Empfehlung</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => {
                const canApply = r.recommendation === "SCALE" || r.recommendation === "REDUCE";
                return (
                  <tr key={r.funnel_source} className="border-b border-border/20 hover:bg-muted/30">
                    <td className="py-2 px-2 font-mono">{r.funnel_source}</td>
                    <td className="text-right">{r.leads}</td>
                    <td className="text-right tabular-nums">{r.performance_score?.toFixed(3) ?? "—"}</td>
                    <td className="text-right">{r.rank_bucket ?? "—"}</td>
                    <td className="text-right">{fmtEur(r.spend_7d)}</td>
                    <td className="text-right">{fmtEur(r.suggested_new_spend_7d)}</td>
                    <td className="text-center">{recBadge(r.recommendation)}</td>
                    <td className="text-right space-x-1">
                      {canApply && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => applyRecommendation(r)}>
                          Anwenden
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => togglePause(r.funnel_source, r.budget_routing_paused)}>
                        {r.budget_routing_paused ? "Resume" : "Pause"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {recs.length === 0 && (
                <tr><td colSpan={8} className="text-center text-xs text-muted-foreground py-4">Keine Funnel-Daten verfügbar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Safeguards: min 50 Leads · max ±30 % pro Cycle · 3-Tage Cooldown · manuelle Bestätigung erforderlich.
        </p>
      </Card>
    </div>
  );
}
