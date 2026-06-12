/**
 * A/B Funnel Test — admin panel embedded in the Performance Command Center.
 *
 * Pure read of `ab_funnel_tests` + `ab_test_kpis` + `ab_test_significance`,
 * with three actions: start pending → promote winner → next pending starts.
 * No new dashboard, no new UI surface — slots into the existing tab grid.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Beaker, Play, Trophy } from "lucide-react";

interface TestRow {
  id: string;
  test_key: string;
  test_number: number;
  status: "pending" | "running" | "completed" | "aborted";
  champion_funnel: string;
  challenger_funnel: string;
  primary_kpi: string;
  winner: string | null;
  started_at: string | null;
  completed_at: string | null;
  min_sample_size: number;
  min_duration_days: number;
}

interface KpiRow {
  test_id: string;
  bucket: "champion" | "challenger";
  funnel_source: string;
  leads: number;
  bookings: number;
  shows: number;
  deals: number;
  revenue: number;
  booking_rate: number | null;
  show_rate: number | null;
  close_rate: number | null;
  revenue_per_lead: number | null;
}

interface SigRow {
  test_id: string;
  test_key: string;
  leads_a: number;
  leads_b: number;
  rpl_a: number | null;
  rpl_b: number | null;
  rpl_lift_pct: number | null;
  days_running: number | null;
  decision_state: string;
}

export default function AbFunnelTestPanel() {
  const [tests, setTests] = useState<TestRow[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [sig, setSig] = useState<SigRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [t, k, s] = await Promise.all([
      supabase.from("ab_funnel_tests" as never).select("*").order("test_number"),
      supabase.from("ab_test_kpis" as never).select("*"),
      supabase.from("ab_test_significance" as never).select("*"),
    ]);
    if (!t.error && t.data) setTests(t.data as unknown as TestRow[]);
    if (!k.error && k.data) setKpis(k.data as unknown as KpiRow[]);
    if (!s.error && s.data) setSig(s.data as unknown as SigRow[]);
  };

  useEffect(() => { load(); }, []);

  const startTest = async (key: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("ab_start_test" as never, { p_test_key: key } as never);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success(`Test ${key} läuft`); load(); }
  };

  const promote = async (key: string, winner: string) => {
    setBusy(true);
    const { error } = await supabase.rpc("ab_promote_winner" as never, {
      p_test_key: key, p_winner: winner,
    } as never);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success(`Winner: ${winner}`); load(); }
  };

  const fmt = (n: number | null | undefined, suffix = "") =>
    n === null || n === undefined ? "—" : `${n}${suffix}`;
  const pct = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : `${(Number(n) * 100).toFixed(1)}%`;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Beaker className="h-5 w-5 text-primary" />
          <h2 className="font-serif text-xl">Funnel A/B Test — Sequential</h2>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}>
          Aktualisieren
        </Button>
      </div>

      <div className="space-y-3">
        {tests.map((t) => {
          const tk = kpis.filter((k) => k.test_id === t.id);
          const champ = tk.find((k) => k.bucket === "champion");
          const chal = tk.find((k) => k.bucket === "challenger");
          const s = sig.find((x) => x.test_id === t.id);
          const canStart = t.status === "pending" &&
            !tests.some((x) => x.status === "running");
          return (
            <div key={t.id} className="border border-border rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-sm text-muted-foreground">Test #{t.test_number}</div>
                  <div className="font-medium">{t.test_key}</div>
                  <div className="text-xs text-muted-foreground">
                    Primary KPI: {t.primary_kpi} · n≥{t.min_sample_size} · ≥{t.min_duration_days}d
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={
                    t.status === "running" ? "default" :
                    t.status === "completed" ? "secondary" : "outline"
                  }>
                    {t.status.toUpperCase()}
                  </Badge>
                  {s && t.status === "running" && (
                    <Badge variant="outline">{s.decision_state}</Badge>
                  )}
                  {t.winner && <Badge className="bg-primary"><Trophy className="h-3 w-3 mr-1" />{t.winner}</Badge>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                {(["champion", "challenger"] as const).map((b) => {
                  const row = b === "champion" ? champ : chal;
                  const funnel = b === "champion" ? t.champion_funnel : t.challenger_funnel;
                  return (
                    <div key={b} className="border border-border/50 rounded p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase text-muted-foreground">{b}</span>
                        <span className="text-xs font-mono">{funnel}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                        <span className="text-muted-foreground">Leads</span><span className="text-right">{fmt(row?.leads ?? 0)}</span>
                        <span className="text-muted-foreground">Bookings</span><span className="text-right">{fmt(row?.bookings ?? 0)}</span>
                        <span className="text-muted-foreground">Shows</span><span className="text-right">{fmt(row?.shows ?? 0)}</span>
                        <span className="text-muted-foreground">Deals</span><span className="text-right">{fmt(row?.deals ?? 0)}</span>
                        <span className="text-muted-foreground">Revenue</span><span className="text-right">€{fmt(row?.revenue ?? 0)}</span>
                        <span className="text-muted-foreground">Close-Rate</span><span className="text-right">{pct(row?.close_rate)}</span>
                        <span className="text-muted-foreground">Rev/Lead</span><span className="text-right">€{fmt(row?.revenue_per_lead)}</span>
                      </div>
                      {t.status === "running" && (
                        <Button size="sm" variant="outline" className="w-full mt-2"
                          onClick={() => promote(t.test_key, funnel)} disabled={busy}>
                          <Trophy className="h-3 w-3 mr-1" /> Als Winner promoten
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              {s && t.status === "running" && (
                <div className="text-xs text-muted-foreground">
                  Lift Challenger vs Champion (Rev/Lead): {s.rpl_lift_pct ?? "—"}%
                  {" · "}läuft seit {s.days_running ? s.days_running.toFixed(1) : "0"}d
                </div>
              )}

              {canStart && (
                <Button size="sm" onClick={() => startTest(t.test_key)} disabled={busy}>
                  <Play className="h-3 w-3 mr-1" /> Test starten
                </Button>
              )}
            </div>
          );
        })}
        {tests.length === 0 && (
          <div className="text-sm text-muted-foreground">Keine Tests konfiguriert.</div>
        )}
      </div>
    </Card>
  );
}
