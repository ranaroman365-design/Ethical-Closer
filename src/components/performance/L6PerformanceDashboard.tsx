/**
 * L6 Performance Intelligence Dashboard (Phase 5)
 * 5-Layer Structure: Status → Trend → Benchmark → Insight → Action
 *
 * ALL KPIs via computeL6PerformanceSnapshot() — no raw field access.
 * Data sourced from useL6PerformanceData() hook (real Supabase data).
 */

import { useMemo, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Target,
  Users, DollarSign, BarChart3, Zap, Shield, Activity, RefreshCw, Filter,
} from "lucide-react";
import {
  type L6PerformanceSnapshot,
  type L6OperatorTier,
} from "@/lib/l6-performance-intelligence";
import type { IntelligenceAction, IntelligenceAlert } from "@/lib/conversion-intelligence-engine";
import { useL6PerformanceData, type L6Filters } from "@/hooks/useL6PerformanceData";
import { useOptionalPerformanceFilters } from "@/contexts/PerformanceFiltersContext";
import AccessDenied from "@/components/members/AccessDenied";

// ─── Tier Colors ────────────────────────────────────────────────────────
const TIER_STYLES: Record<L6OperatorTier, { bg: string; text: string; label: string }> = {
  ELITE: { bg: "bg-emerald-500/15 border-emerald-500/30", text: "text-emerald-700 dark:text-emerald-400", label: "Elite" },
  STRONG: { bg: "bg-blue-500/15 border-blue-500/30", text: "text-blue-700 dark:text-blue-400", label: "Strong" },
  AVERAGE: { bg: "bg-amber-500/15 border-amber-500/30", text: "text-amber-700 dark:text-amber-400", label: "Average" },
  CRITICAL: { bg: "bg-red-500/15 border-red-500/30", text: "text-red-600 dark:text-red-400", label: "Critical" },
};

function pct(val: number | null): string {
  if (val === null) return "–";
  return `${Math.round(val * 100)}%`;
}

function fmtEur(val: number): string {
  return `€${val.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Status Layer ───────────────────────────────────────────────────────
function StatusLayer({ snapshot }: { snapshot: L6PerformanceSnapshot }) {
  const tier = TIER_STYLES[snapshot.operator_score.tier];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="col-span-2 lg:col-span-1 border-primary/20">
        <CardHeader className="pb-2">
          <CardDescription className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Revenue (30d)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tracking-tight">{fmtEur(snapshot.revenue_per_operator_30d)}</p>
          <Badge variant="outline" className={`mt-1 ${tier.bg} ${tier.text}`}>
            Score: {snapshot.operator_score.score} — {tier.label}
          </Badge>
        </CardContent>
      </Card>

      <MetricCard label="Show Rate" value={pct(snapshot.totals.show_rate)} icon={<Users className="h-3.5 w-3.5" />} />
      <MetricCard label="Close Rate" value={pct(snapshot.totals.close_rate)} icon={<Target className="h-3.5 w-3.5" />} />
      <MetricCard label="Booking Rate" value={pct(snapshot.totals.booking_rate)} icon={<BarChart3 className="h-3.5 w-3.5" />} />
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5">{icon} {label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Trend Layer ────────────────────────────────────────────────────────
function TrendLayer({ snapshot }: { snapshot: L6PerformanceSnapshot }) {
  const { trend } = snapshot;
  const TrendIcon = trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus;
  const trendColor = trend.direction === "up" ? "text-emerald-600" : trend.direction === "down" ? "text-red-600" : "text-muted-foreground";
  const delta = trend.previous_7d > 0 ? ((trend.current_7d - trend.previous_7d) / trend.previous_7d * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendIcon className={`h-4 w-4 ${trendColor}`} /> Trend (7d vs prev 7d)
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Aktuell (7d)</p>
          <p className="text-xl font-semibold">{fmtEur(trend.current_7d)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Vorher (7d)</p>
          <p className="text-xl font-semibold">{fmtEur(trend.previous_7d)}</p>
        </div>
        <Badge variant="outline" className={trendColor}>
          {delta > 0 ? "+" : ""}{Math.round(delta)}%
        </Badge>
      </CardContent>
    </Card>
  );
}

// ─── Benchmark Layer ────────────────────────────────────────────────────
function BenchmarkLayer({ snapshot, percentile, rank, total }: {
  snapshot: L6PerformanceSnapshot; percentile: number; rank: number; total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" /> Benchmark vs. andere Operator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Rang</span>
          <span className="font-semibold">#{rank} von {total}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Percentile</span>
          <span className="font-semibold">Top {100 - percentile}%</span>
        </div>
        <Progress value={percentile} className="h-2" />
      </CardContent>
    </Card>
  );
}

// ─── Insight Layer ──────────────────────────────────────────────────────
function InsightLayer({ snapshot }: { snapshot: L6PerformanceSnapshot }) {
  return (
    <div className="space-y-4">
      {snapshot.bottlenecks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Bottlenecks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.bottlenecks.map((bn, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium text-sm">{bn.description}</p>
                  <p className="text-xs text-muted-foreground">{bn.affected_leads_count} Leads betroffen</p>
                </div>
                <Badge variant={bn.severity > 70 ? "destructive" : "secondary"}>
                  Severity: {bn.severity}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">KPIs nach Priority</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {(["HIGH", "MEDIUM", "LOW"] as const).map((p) => {
              const d = snapshot.by_priority[p];
              return (
                <div key={p} className="space-y-1 rounded-lg border p-3">
                  <Badge variant="outline" className={
                    p === "HIGH" ? "bg-emerald-500/15 text-emerald-700" :
                    p === "MEDIUM" ? "bg-amber-500/15 text-amber-700" :
                    "bg-red-500/15 text-red-600"
                  }>{p}</Badge>
                  <p>Leads: {d.leads_created}</p>
                  <p>Show: {pct(d.show_rate)}</p>
                  <p>Close: {pct(d.close_rate)}</p>
                  <p>Revenue: {fmtEur(d.confirmed_revenue)}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Action Layer ───────────────────────────────────────────────────────
function ActionLayer({ snapshot }: { snapshot: L6PerformanceSnapshot }) {
  return (
    <div className="space-y-4">
      {snapshot.actions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Empfohlene Maßnahmen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot.actions.map((a, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                <Badge variant={a.priority === "critical" ? "destructive" : "secondary"} className="mt-0.5 shrink-0">
                  {a.priority}
                </Badge>
                <div>
                  <p className="font-medium text-sm">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  <p className="text-xs text-primary mt-1">{a.estimatedImpact}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {snapshot.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshot.alerts.map((al, i) => (
              <div key={i} className={`rounded-lg border p-3 ${al.severity === "critical" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                <p className="text-sm">{al.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {snapshot.team.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Team Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Rolle</th>
                    <th className="text-right py-2">Leads</th>
                    <th className="text-right py-2">Shows</th>
                    <th className="text-right py-2">Closes</th>
                    <th className="text-right py-2">Revenue</th>
                    <th className="text-right py-2">Show%</th>
                    <th className="text-right py-2">Close%</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.team.map((m) => (
                    <tr key={m.user_id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{m.name}</td>
                      <td className="py-2">
                        <Badge variant="outline" className="text-xs">{m.role === "setter" ? "Setter" : "Closer"}</Badge>
                      </td>
                      <td className="py-2 text-right">{m.assigned_leads}</td>
                      <td className="py-2 text-right">{m.shows}</td>
                      <td className="py-2 text-right">{m.closes}</td>
                      <td className="py-2 text-right">{fmtEur(m.revenue)}</td>
                      <td className="py-2 text-right">{pct(m.show_rate)}</td>
                      <td className="py-2 text-right">{pct(m.close_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── FILTER BAR ────────────────────────────────────────────────────────
function FilterBar({ filters, setFilters, teamMembers, onReload }: {
  filters: L6Filters;
  setFilters: (f: L6Filters) => void;
  teamMembers: Array<{ user_id: string; name: string }>;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={filters.range} onValueChange={v => setFilters({ ...filters, range: v as L6Filters["range"] })}>
        <SelectTrigger className="w-[120px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">7 Tage</SelectItem>
          <SelectItem value="14d">14 Tage</SelectItem>
          <SelectItem value="30d">30 Tage</SelectItem>
          <SelectItem value="90d">90 Tage</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.priority ?? "__all"} onValueChange={v => setFilters({ ...filters, priority: v === "__all" ? null : v })}>
        <SelectTrigger className="w-[130px] h-8 text-xs">
          <SelectValue placeholder="Priority" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Alle Priorities</SelectItem>
          <SelectItem value="HIGH">HIGH</SelectItem>
          <SelectItem value="MEDIUM">MEDIUM</SelectItem>
          <SelectItem value="LOW">LOW</SelectItem>
        </SelectContent>
      </Select>

      {teamMembers.length > 0 && (
        <Select value={filters.teamMember ?? "__all"} onValueChange={v => setFilters({ ...filters, teamMember: v === "__all" ? null : v })}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Team Member" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Alle Mitglieder</SelectItem>
            {teamMembers.map(m => (
              <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button variant="ghost" size="sm" onClick={onReload} className="h-8">
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ─── MAIN DASHBOARD ────────────────────────────────────────────────────
export default function L6PerformanceDashboard() {
  const { lang } = useLanguage();
  const perfFilters = useOptionalPerformanceFilters();

  // Sync range from performance shell if nested
  const [filters, setFilters] = useState<L6Filters>({
    range: "30d",
    funnel: null,
    priority: null,
    teamMember: null,
  });

  // Sync from PerformanceShell global filters when nested
  const effectiveFilters = useMemo<L6Filters>(() => {
    if (!perfFilters) return filters;
    const pf = perfFilters.filters;
    return {
      ...filters,
      range: pf.range === "24h" ? "7d" : pf.range as L6Filters["range"],
      funnel: pf.funnel === "__all" ? null : pf.funnel,
    };
  }, [filters, perfFilters]);

  const { snapshot, loading, error, userLevel, isGlobalScope, reload } = useL6PerformanceData(effectiveFilters);

  // Gate: L6+ only
  if (userLevel < 6) {
    return <AccessDenied requiredLevel="L6" resolvedLevel={userLevel} />;
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center space-y-4">
        <AlertTriangle className="h-12 w-12 mx-auto text-red-500/50" />
        <h3 className="text-lg font-semibold text-red-600">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{error}</p>
        <Button variant="outline" onClick={reload}>
          <RefreshCw className="h-4 w-4 mr-2" /> Erneut versuchen
        </Button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="p-6 text-center space-y-4">
        <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <h3 className="text-lg font-semibold">
          {lang === "de" ? "Keine Performance-Daten verfügbar" : "No performance data available"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {lang === "de"
            ? "Sobald Leads, Calls und Events vorhanden sind, erscheinen hier deine Operator-KPIs automatisch."
            : "Once leads, calls, and events exist, your operator KPIs will appear here automatically."}
        </p>
      </div>
    );
  }

  const teamMembers = snapshot.team.map(m => ({ user_id: m.user_id, name: m.name }));

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">
            Operator Intelligence
          </h2>
          <Badge variant="outline" className={TIER_STYLES[snapshot.operator_score.tier].bg + " " + TIER_STYLES[snapshot.operator_score.tier].text}>
            {TIER_STYLES[snapshot.operator_score.tier].label}
          </Badge>
          {isGlobalScope && (
            <Badge variant="secondary" className="text-[10px]">Global</Badge>
          )}
        </div>
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          teamMembers={teamMembers}
          onReload={reload}
        />
      </div>

      <Tabs defaultValue="status">
        <TabsList className="grid grid-cols-5 w-full max-w-xl">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="trend">Trend</TabsTrigger>
          <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
          <TabsTrigger value="insight">Insight</TabsTrigger>
          <TabsTrigger value="action">Action</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="mt-4">
          <StatusLayer snapshot={snapshot} />
        </TabsContent>

        <TabsContent value="trend" className="mt-4">
          <TrendLayer snapshot={snapshot} />
        </TabsContent>

        <TabsContent value="benchmark" className="mt-4">
          <BenchmarkLayer snapshot={snapshot} percentile={50} rank={1} total={1} />
        </TabsContent>

        <TabsContent value="insight" className="mt-4">
          <InsightLayer snapshot={snapshot} />
        </TabsContent>

        <TabsContent value="action" className="mt-4">
          <ActionLayer snapshot={snapshot} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
