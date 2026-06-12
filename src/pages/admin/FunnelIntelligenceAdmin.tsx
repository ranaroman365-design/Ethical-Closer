import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertTriangle, TrendingDown, TrendingUp, Activity } from "lucide-react";
import { toast } from "sonner";
import {
  type FunnelIntelligencePayload,
  type InsightFinding,
  formatEur,
  severityRank,
} from "@/lib/canonical-funnel-intelligence";

const WINDOWS = [7, 30, 90] as const;

export default function FunnelIntelligenceAdmin() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [data, setData] = useState<FunnelIntelligencePayload | null>(null);

  async function load(days = windowDays) {
    setLoading(true);
    const { data: payload, error } = await supabase.rpc("funnel_intelligence_view", {
      p_window_days: days,
      p_operator_id: null,
    });
    if (error) {
      toast.error(`Load failed: ${error.message}`);
    } else {
      setData(payload as unknown as FunnelIntelligencePayload);
    }
    setLoading(false);
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("funnel-intelligence-refresh", {
        body: { days: windowDays },
      });
      if (error) throw error;
      toast.success(
        `Refreshed: ${res?.refreshed_rows ?? 0} rows · ${res?.insights_count ?? 0} insights`,
      );
      await load(windowDays);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(windowDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  const top = data?.top_kpis;
  const findings = (data?.findings ?? []).slice().sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  );

  return (
    <div className="container mx-auto py-8 max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif text-foreground">Full Funnel Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Layer 34 · CEO Master View · Lead → Booking → Show → Close → Revenue
          </p>
        </div>
        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <Button
              key={w}
              variant={windowDays === w ? "default" : "outline"}
              size="sm"
              onClick={() => setWindowDays(w)}
            >
              {w}d
            </Button>
          ))}
          <Button onClick={refreshAll} disabled={refreshing} size="sm">
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Keine Daten. Klicke „Refresh" um Aggregate zu erzeugen.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* TOP KPI BAR */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Revenue" value={formatEur(top?.revenue_cents ?? 0)} />
            <KpiCard label="Leads" value={(top?.leads ?? 0).toLocaleString("de-DE")} />
            <KpiCard label="Bookings" value={(top?.bookings ?? 0).toLocaleString("de-DE")} />
            <KpiCard label="Shows" value={(top?.shows ?? 0).toLocaleString("de-DE")} />
            <KpiCard label="Closes" value={(top?.closes ?? 0).toLocaleString("de-DE")} />
            <KpiCard label="€ / Lead" value={formatEur(top?.revenue_per_lead_cents ?? 0)} />
          </div>

          {/* FUNNEL FLOW */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" /> Funnel Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <FunnelStep
                  label="Leads"
                  value={top?.leads ?? 0}
                  rate={null}
                  rateLabel={null}
                />
                <FunnelStep
                  label="Bookings"
                  value={top?.bookings ?? 0}
                  rate={top?.lead_to_book ?? 0}
                  rateLabel="Lead → Book"
                />
                <FunnelStep
                  label="Shows"
                  value={top?.shows ?? 0}
                  rate={top?.book_to_show ?? 0}
                  rateLabel="Book → Show"
                />
                <FunnelStep
                  label="Closes"
                  value={top?.closes ?? 0}
                  rate={top?.show_to_close ?? 0}
                  rateLabel="Show → Close"
                />
              </div>
            </CardContent>
          </Card>

          {/* INSIGHT ENGINE */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Insight Engine
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  (deterministisch · regel-basiert)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {findings.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Keine Bottlenecks erkannt. System läuft im Soll.
                </div>
              ) : (
                <ul className="space-y-3">
                  {findings.map((f) => (
                    <FindingRow key={f.id} f={f} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* DAILY TREND TABLE */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Daily Trend (last {windowDays}d)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Date</th>
                      <th className="text-right">Leads</th>
                      <th className="text-right">Bookings</th>
                      <th className="text-right">Shows</th>
                      <th className="text-right">Closes</th>
                      <th className="text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.daily ?? []).slice(-30).reverse().map((d) => (
                      <tr key={d.date} className="border-b last:border-0">
                        <td className="py-1.5">{d.date}</td>
                        <td className="text-right">{d.leads}</td>
                        <td className="text-right">{d.bookings}</td>
                        <td className="text-right">{d.shows}</td>
                        <td className="text-right">{d.closes}</td>
                        <td className="text-right tabular-nums">{formatEur(d.revenue_cents)}</td>
                      </tr>
                    ))}
                    {(data.daily ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center text-muted-foreground py-6">
                          Noch keine Aggregate. Klicke „Refresh".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-right">
            Generated: {new Date(data.generated_at).toLocaleString("de-DE")} · Role: {data.role}
          </p>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xl font-serif mt-1 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function FunnelStep({
  label,
  value,
  rate,
  rateLabel,
}: {
  label: string;
  value: number;
  rate: number | null;
  rateLabel: string | null;
}) {
  return (
    <div className="border rounded-xl p-4 bg-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-serif mt-1 tabular-nums">{value.toLocaleString("de-DE")}</div>
      {rateLabel && (
        <div className="text-xs mt-2 text-muted-foreground">
          {rateLabel}: <span className="font-medium text-foreground">{rate?.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

function FindingRow({ f }: { f: InsightFinding }) {
  const sevColor =
    f.severity === "critical"
      ? "bg-destructive text-destructive-foreground"
      : f.severity === "warning"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : "bg-muted text-muted-foreground";
  return (
    <li className="border rounded-lg p-3 bg-card">
      <div className="flex items-start gap-3">
        <Badge className={sevColor + " uppercase text-[10px]"}>{f.severity}</Badge>
        <div className="flex-1">
          <div className="text-sm font-medium flex items-center gap-2">
            <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
            {f.message_de}
          </div>
          {f.recommendation && (
            <div className="text-xs text-muted-foreground mt-1">→ {f.recommendation}</div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1.5 uppercase tracking-wide">
            Bottleneck: {f.bottleneck} · Scope: {f.scope}/{f.scope_id}
          </div>
        </div>
      </div>
    </li>
  );
}
