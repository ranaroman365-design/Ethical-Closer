import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Brain, CheckCircle2,
  RefreshCw, Sparkles, Target, TrendingUp, Users, Zap,
} from "lucide-react";
import { useCeoDashboard, type TimeRange, type FunnelStage, type SourceRow, type TeamMember } from "@/hooks/useCeoDashboard";

export default function CeoDashboard() {
  const [range, setRange] = useState<TimeRange>("30d");
  const { data, lever, loading, forbidden, error, refresh } = useCeoDashboard(range);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card className="p-8 text-center">
          <h1 className="text-xl font-bold text-foreground">Access denied</h1>
          <p className="text-sm text-muted-foreground mt-2">CEO control layer requires admin or owner role.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">CEO Control Center</h1>
            <p className="text-xs text-muted-foreground">Clarity → Decision → Action</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as TimeRange)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={refresh} disabled={loading} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 border-destructive/30 bg-destructive/[0.04]">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {/* Alerts */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((a, i) => (
            <Card key={i} className={`p-3 border-l-4 ${a.severity === "critical" ? "border-l-destructive bg-destructive/[0.04]" : "border-l-amber-500 bg-amber-500/[0.04]"}`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${a.severity === "critical" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`} />
                <span className="text-sm text-foreground">{a.message}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">{a.severity}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* SECTION 1: Revenue Snapshot */}
      <RevenueSnapshot data={data} loading={loading} />

      {/* SECTION 7: Biggest Lever (top placement = top decision) */}
      <BiggestLeverPanel lever={lever} loading={loading} />

      {/* SECTIONS 2 + 3: Funnel + Bottleneck */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><FunnelPanel data={data} loading={loading} /></div>
        <BottleneckPanel data={data} loading={loading} />
      </div>

      {/* SECTION 4 + Forecast */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><SourcesPanel data={data} loading={loading} /></div>
        <ForecastPanel data={data} loading={loading} />
      </div>

      {/* SECTION 5: Community Impact */}
      <CommunityPanel data={data} loading={loading} />

      {/* SECTION 6: Team Performance */}
      <TeamPanel data={data} loading={loading} />
    </div>
  );
}

/* ============================================================
   SECTION 1 — Revenue Snapshot
   ============================================================ */
function RevenueSnapshot({ data, loading }: { data: any; loading: boolean }) {
  const r = data?.revenue;
  const growth = Number(r?.mom_growth_pct ?? 0);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <RevTile icon={Banknote} label="Today" value={fmtEUR(r?.today)} loading={loading} />
      <RevTile icon={Banknote} label="Last 7 days" value={fmtEUR(r?.last_7d)} loading={loading} />
      <RevTile icon={Banknote} label="Last 30 days" value={fmtEUR(r?.last_30d)} loading={loading} accent />
      <RevTile
        icon={growth >= 0 ? ArrowUpRight : ArrowDownRight}
        label="MoM Growth"
        value={loading ? "—" : `${growth > 0 ? "+" : ""}${growth}%`}
        valueClass={growth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}
        loading={loading}
      />
    </div>
  );
}

function RevTile({ icon: Icon, label, value, accent, valueClass, loading }: {
  icon: any; label: string; value: string; accent?: boolean; valueClass?: string; loading?: boolean;
}) {
  return (
    <Card className={`p-4 border-border/40 ${accent ? "bg-primary/[0.04]" : "bg-card"}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          {loading ? <Skeleton className="mt-2 h-7 w-20" /> :
            <p className={`mt-1 text-xl font-bold truncate ${valueClass ?? "text-foreground"}`}>{value}</p>}
        </div>
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
      </div>
    </Card>
  );
}

/* ============================================================
   SECTION 7 — Biggest Lever
   ============================================================ */
function BiggestLeverPanel({ lever, loading }: { lever: any; loading: boolean }) {
  return (
    <Card className="p-5 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] border-primary/20">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-primary font-semibold mb-1">Biggest Lever</p>
          {loading || !lever ? (
            <Skeleton className="h-5 w-3/4" />
          ) : (
            <>
              <p className="text-base font-medium text-foreground leading-snug">{lever.narrative}</p>
              {lever.heuristic && (
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <span className="px-2 py-1 rounded-md bg-background/60 border border-border/40">
                    <span className="text-muted-foreground">{lever.heuristic.label}: </span>
                    <span className="font-mono font-semibold text-foreground">{lever.heuristic.current}% → {lever.heuristic.target}%</span>
                  </span>
                  <span className="px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                    + {fmtEUR(lever.heuristic.revenue_impact)} potential
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ============================================================
   SECTION 2 — Funnel Performance
   ============================================================ */
function FunnelPanel({ data, loading }: { data: any; loading: boolean }) {
  const stages: FunnelStage[] = data?.funnel ?? [];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Funnel Performance</h2>
      </div>
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : stages.length === 0 ? (
        <p className="text-xs text-muted-foreground">No funnel data in this window.</p>
      ) : (
        <div className="space-y-2">
          {stages.map((s) => {
            const width = Math.max(8, Number(s.rate_from_top ?? 0));
            return (
              <div key={s.stage}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-medium text-foreground capitalize">{s.stage.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {s.count.toLocaleString()} · {Number(s.rate_from_top ?? 0).toFixed(1)}%
                    {s.rate_from_prev != null && s.order > 1 && (
                      <span className="ml-2 text-[10px]">({Number(s.rate_from_prev).toFixed(1)}% step)</span>
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   SECTION 3 — Bottleneck Detector
   ============================================================ */
function BottleneckPanel({ data, loading }: { data: any; loading: boolean }) {
  const b = data?.bottleneck;
  if (loading) {
    return <Card className="p-5"><Skeleton className="h-32" /></Card>;
  }
  if (!b) return <Card className="p-5"><p className="text-xs text-muted-foreground">No data.</p></Card>;
  if (b.all_green) {
    return (
      <Card className="p-5 border-emerald-500/30 bg-emerald-500/[0.04]">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">All systems green</h3>
            <p className="text-xs text-muted-foreground mt-1">All conversion stages above benchmark.</p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5 border-destructive/30 bg-destructive/[0.04]">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            Biggest Leak: <span className="text-destructive capitalize">{b.biggest_leak}</span>
          </h3>
          {b.recommended_fix && <p className="text-xs text-foreground/80 mt-1">{b.recommended_fix}</p>}
          {b.flags && b.flags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {b.flags.map((f: any) => (
                <span key={f.stage} className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-destructive/30 text-destructive bg-destructive/10 uppercase tracking-wider">
                  {f.stage}: {f.rate}% &lt; {f.threshold}%
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ============================================================
   SECTION 4 — Revenue by Source
   ============================================================ */
function SourcesPanel({ data, loading }: { data: any; loading: boolean }) {
  const sources: SourceRow[] = data?.sources ?? [];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Revenue by Source</h2>
      </div>
      {loading ? (
        <Skeleton className="h-40" />
      ) : sources.length === 0 ? (
        <p className="text-xs text-muted-foreground">No source data.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <th className="px-2 py-2 font-medium">Source</th>
                <th className="px-2 py-2 font-medium text-right">Leads</th>
                <th className="px-2 py-2 font-medium text-right">Sales</th>
                <th className="px-2 py-2 font-medium text-right">Revenue</th>
                <th className="px-2 py-2 font-medium text-right">CAC</th>
                <th className="px-2 py-2 font-medium text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {sources.slice(0, 8).map((s) => (
                <tr key={s.origin_id} className="border-b border-border/20 last:border-b-0">
                  <td className="px-2 py-2 text-foreground font-medium truncate max-w-[140px]">{s.label}</td>
                  <td className="px-2 py-2 text-right font-mono text-muted-foreground">{s.leads}</td>
                  <td className="px-2 py-2 text-right font-mono text-foreground">{s.sales}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold text-foreground">{fmtEUR(s.revenue)}</td>
                  <td className="px-2 py-2 text-right font-mono text-muted-foreground">{s.cac != null ? fmtEUR(s.cac) : "—"}</td>
                  <td className={`px-2 py-2 text-right font-mono ${s.roas != null && s.roas >= 3 ? "text-emerald-600 dark:text-emerald-400" : s.roas != null && s.roas >= 1.5 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {s.roas != null ? `${Number(s.roas).toFixed(1)}x` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   FORECAST
   ============================================================ */
function ForecastPanel({ data, loading }: { data: any; loading: boolean }) {
  const f = data?.forecast;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Revenue Forecast</h2>
      </div>
      {loading || !f ? <Skeleton className="h-32" /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ForecastTile label="Next 7d" value={fmtEUR(f.forecast_7d)} />
            <ForecastTile label="Next 30d" value={fmtEUR(f.forecast_30d)} accent />
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] pt-3 border-t border-border/30">
            <Stat label="Open pipeline" value={`${f.open_appointments}`} />
            <Stat label="Avg deal" value={fmtEUR(f.avg_deal_value)} />
            <Stat label="Show rate" value={`${f.expected_show_rate}%`} />
            <Stat label="Close rate" value={`${f.expected_close_rate}%`} />
          </div>
        </div>
      )}
    </Card>
  );
}

function ForecastTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${accent ? "border-primary/30 bg-primary/[0.04]" : "border-border/40 bg-card"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold font-mono text-foreground">{value}</p>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

/* ============================================================
   SECTION 5 — Community Impact
   ============================================================ */
function CommunityPanel({ data, loading }: { data: any; loading: boolean }) {
  const c = data?.community;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Community Impact</h2>
      </div>
      {loading || !c ? <Skeleton className="h-24" /> : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiBox label="Entries" value={`${c.community_entries ?? 0}`} />
          <KpiBox label="Path → Start" value={`${Number(c.community_to_path_rate ?? 0).toFixed(1)}%`} />
          <KpiBox label="Path Completion" value={`${Number(c.path_completion_rate ?? 0).toFixed(1)}%`} />
          <KpiBox label="Completion → Upgrade" value={`${Number(c.completion_to_upgrade_rate ?? 0).toFixed(1)}%`} />
          <KpiBox label="Revenue from Community" value={fmtEUR(c.revenue_from_community)} accent />
        </div>
      )}
    </Card>
  );
}
function KpiBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-3 rounded-lg border ${accent ? "border-primary/30 bg-primary/[0.04]" : "border-border/40"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-bold font-mono text-foreground">{value}</p>
    </div>
  );
}

/* ============================================================
   SECTION 6 — Team Performance
   ============================================================ */
function TeamPanel({ data, loading }: { data: any; loading: boolean }) {
  const setters: TeamMember[] = data?.team?.setters ?? [];
  const closers: TeamMember[] = data?.team?.closers ?? [];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Setters</h2>
        </div>
        {loading ? <Skeleton className="h-32" /> : setters.length === 0 ? (
          <p className="text-xs text-muted-foreground">No setter activity in window.</p>
        ) : (
          <TeamTable rows={setters.slice(0, 8)} columns={[
            { key: "bookings", label: "Books" },
            { key: "shows", label: "Shows" },
            { key: "show_rate", label: "Show%", suffix: "%" },
          ]} />
        )}
      </Card>
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Closers</h2>
        </div>
        {loading ? <Skeleton className="h-32" /> : closers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No closer activity in window.</p>
        ) : (
          <TeamTable rows={closers.slice(0, 8)} columns={[
            { key: "calls", label: "Calls" },
            { key: "close_rate", label: "Close%", suffix: "%" },
            { key: "revenue", label: "Revenue", isMoney: true },
          ]} />
        )}
      </Card>
    </div>
  );
}

function TeamTable({ rows, columns }: {
  rows: TeamMember[];
  columns: Array<{ key: keyof TeamMember; label: string; suffix?: string; isMoney?: boolean }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
            <th className="py-2 font-medium">Name</th>
            {columns.map((c) => <th key={String(c.key)} className="py-2 px-2 font-medium text-right">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-b border-border/20 last:border-b-0">
              <td className="py-2 text-foreground font-medium truncate max-w-[180px]">{r.name?.trim() || r.email}</td>
              {columns.map((c) => {
                const v = r[c.key];
                let text = "—";
                if (v != null) {
                  text = c.isMoney ? fmtEUR(Number(v)) : `${v}${c.suffix ?? ""}`;
                }
                return <td key={String(c.key)} className="py-2 px-2 text-right font-mono text-foreground">{text}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
   Helpers
   ============================================================ */
function fmtEUR(n: number | null | undefined) {
  if (n == null || isNaN(Number(n))) return "—";
  const num = Number(n);
  if (num >= 1000) return `€${(num / 1000).toFixed(1)}k`;
  return `€${Math.round(num)}`;
}
