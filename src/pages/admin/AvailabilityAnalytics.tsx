import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Activity, Timer, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";

type DailyRow = {
  day: string;
  checks: number;
  available_checks: number;
  availability_rate_pct: number | null;
  avg_latency_ms: number | null;
  p_max_latency_ms: number | null;
  avg_open_slots: number | null;
};

type HeatRow = {
  weekday: number;
  hour: number;
  checks: number;
  availability_rate_pct: number | null;
  avg_latency_ms: number | null;
};

type ReasonRow = {
  reason: string;
  checks: number;
  share_pct: number | null;
  avg_latency_ms: number | null;
};

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export default function AvailabilityAnalytics() {
  const [windowDays, setWindowDays] = useState(5);
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [heat, setHeat] = useState<HeatRow[]>([]);
  const [reasons, setReasons] = useState<ReasonRow[]>([]);

  async function load() {
    setLoading(true);
    const since = new Date(Date.now() - rangeDays * 86400_000).toISOString().slice(0, 10);
    const [d, h, r] = await Promise.all([
      supabase.from("v_availability_daily" as any).select("*").gte("day", since).order("day", { ascending: true }),
      supabase.from("v_availability_hourly_heatmap" as any).select("*"),
      supabase.from("v_availability_reasons" as any).select("*"),
    ]);
    setDaily(((d.data as any) || []) as DailyRow[]);
    setHeat(((h.data as any) || []) as HeatRow[]);
    setReasons(((r.data as any) || []) as ReasonRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays]);

  async function runProbe() {
    setRunning(true);
    try {
      await supabase.rpc("check_setter_availability_logged" as any, {
        p_window_days: windowDays,
        p_traffic_source: "admin_probe",
        p_context: { source: "AvailabilityAnalytics" },
      });
      await load();
    } finally {
      setRunning(false);
    }
  }

  const kpis = useMemo(() => {
    const totalChecks = daily.reduce((s, x) => s + (x.checks || 0), 0);
    const totalAvail = daily.reduce((s, x) => s + (x.available_checks || 0), 0);
    const rate = totalChecks ? (100 * totalAvail) / totalChecks : 0;
    const avgLat =
      daily.length > 0
        ? daily.reduce((s, x) => s + Number(x.avg_latency_ms || 0) * (x.checks || 0), 0) / Math.max(totalChecks, 1)
        : 0;
    const lastDay = daily[daily.length - 1];
    return {
      totalChecks,
      rate,
      avgLat,
      lastRate: lastDay?.availability_rate_pct ?? null,
    };
  }, [daily]);

  // Heatmap matrix [weekday][hour]
  const heatMatrix = useMemo(() => {
    const m: (HeatRow | null)[][] = Array.from({ length: 7 }, () => Array(24).fill(null));
    heat.forEach((row) => {
      if (row.weekday >= 0 && row.weekday < 7 && row.hour >= 0 && row.hour < 24) {
        m[row.weekday][row.hour] = row;
      }
    });
    return m;
  }, [heat]);

  function heatColor(pct: number | null | undefined) {
    if (pct == null) return "hsl(var(--muted))";
    // 0% red-ish → 100% gold
    const p = Math.max(0, Math.min(100, pct)) / 100;
    const alpha = 0.15 + 0.75 * p;
    return `hsla(42, 55%, 48%, ${alpha})`;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif tracking-tight">Setter-Verfügbarkeit · Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Auswertung von <code>check_setter_availability(p_window_days)</code> über Zeit — Verfügbarkeitsquote, Ø-Latenz, Gründe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(rangeDays)} onValueChange={(v) => setRangeDays(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Tage</SelectItem>
              <SelectItem value="30">30 Tage</SelectItem>
              <SelectItem value="90">90 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Fenster 3 Tage</SelectItem>
              <SelectItem value="5">Fenster 5 Tage</SelectItem>
              <SelectItem value="7">Fenster 7 Tage</SelectItem>
              <SelectItem value="14">Fenster 14 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Reload
          </Button>
          <Button size="sm" onClick={runProbe} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
            Probe ausführen
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Checks ({rangeDays}d)</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{kpis.totalChecks.toLocaleString("de-DE")}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Verfügbarkeitsquote</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{kpis.rate.toFixed(1)}%</div>
            {kpis.lastRate != null && <div className="text-xs text-muted-foreground mt-1">Letzter Tag: {Number(kpis.lastRate).toFixed(1)}%</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Timer className="h-4 w-4" /> Ø-Latenz</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{kpis.avgLat.toFixed(1)} <span className="text-base text-muted-foreground">ms</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Top-Grund</CardTitle></CardHeader>
          <CardContent>
            {reasons[0] ? (
              <div>
                <div className="text-xl font-semibold">{reasons[0].reason}</div>
                <div className="text-xs text-muted-foreground">{Number(reasons[0].share_pct ?? 0).toFixed(1)}% der Checks</div>
              </div>
            ) : <div className="text-muted-foreground text-sm">—</div>}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend">Tages-Trend</TabsTrigger>
          <TabsTrigger value="heatmap">Stunden-Heatmap</TabsTrigger>
          <TabsTrigger value="reasons">Gründe</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Verfügbarkeitsquote (%)</CardTitle></CardHeader>
            <CardContent style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" />
                  <YAxis domain={[0, 100]} unit="%" />
                  <RTooltip />
                  <Line type="monotone" dataKey="availability_rate_pct" name="Verfügbar %" stroke="hsl(42 55% 48%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Latenz (Ø ms) & Volumen</CardTitle></CardHeader>
            <CardContent style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" />
                  <YAxis yAxisId="l" />
                  <YAxis yAxisId="r" orientation="right" />
                  <RTooltip />
                  <Legend />
                  <Bar yAxisId="l" dataKey="checks" name="Checks" fill="hsl(var(--muted-foreground))" opacity={0.4} />
                  <Bar yAxisId="r" dataKey="avg_latency_ms" name="Ø Latenz (ms)" fill="hsl(42 55% 48%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="heatmap">
          <Card>
            <CardHeader>
              <CardTitle>Stunde × Wochentag (60 Tage)</CardTitle>
              <p className="text-xs text-muted-foreground">Farbintensität = Verfügbarkeitsquote. Hover für Details.</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="text-xs border-separate border-spacing-1">
                  <thead>
                    <tr>
                      <th className="w-10"></th>
                      {Array.from({ length: 24 }, (_, h) => (
                        <th key={h} className="w-8 text-center text-muted-foreground font-normal">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatMatrix.map((row, wd) => (
                      <tr key={wd}>
                        <td className="text-muted-foreground pr-2 text-right">{WEEKDAYS[wd]}</td>
                        {row.map((cell, h) => (
                          <td
                            key={h}
                            title={cell ? `${WEEKDAYS[wd]} ${h}:00 — ${Number(cell.availability_rate_pct ?? 0).toFixed(0)}% · ${cell.checks} Checks · Ø ${Number(cell.avg_latency_ms ?? 0).toFixed(0)}ms` : "Keine Daten"}
                            className="w-8 h-8 rounded-sm border border-border/50"
                            style={{ background: heatColor(cell?.availability_rate_pct ?? null) }}
                          />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reasons">
          <Card>
            <CardHeader><CardTitle>Grund-Verteilung (30 Tage)</CardTitle></CardHeader>
            <CardContent>
              {reasons.length === 0 ? (
                <div className="text-muted-foreground text-sm py-8 text-center">Noch keine Daten — führe oben „Probe ausführen“ aus.</div>
              ) : (
                <div className="space-y-2">
                  {reasons.map((r) => (
                    <div key={r.reason} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <Badge variant={r.reason.startsWith("ok") ? "default" : "destructive"}>{r.reason}</Badge>
                        <span className="text-sm text-muted-foreground">{r.checks} Checks · Ø {Number(r.avg_latency_ms ?? 0).toFixed(0)} ms</span>
                      </div>
                      <div className="text-sm font-medium">{Number(r.share_pct ?? 0).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
