import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getLevelForStage } from "@/lib/kpi-config";
import { usePerformanceDashboard, type DateRange } from "@/hooks/usePerformanceDashboard";
import { useOriginPerformance } from "@/hooks/useOriginPerformance";
import ExecutiveStrip from "@/components/admin/performance/ExecutiveStrip";
import FunnelVisualization from "@/components/admin/performance/FunnelVisualization";
import SourcePerformanceTable from "@/components/admin/performance/SourcePerformanceTable";
import CampaignTable from "@/components/admin/performance/CampaignTable";
import CloserPerformanceTable from "@/components/admin/performance/CloserPerformanceTable";
import BottleneckDetector from "@/components/admin/performance/BottleneckDetector";
import BottleneckTeamPanel from "@/components/admin/performance/BottleneckTeamPanel";
import { useBottleneckDiagnosis } from "@/hooks/useBottleneckDiagnosis";
import AdSpendForm from "@/components/admin/performance/AdSpendForm";
import OriginPerformanceTable from "@/components/admin/performance/OriginPerformanceTable";
import FunnelComparison from "@/components/admin/performance/FunnelComparison";
import CloserOriginMatrix from "@/components/admin/performance/CloserOriginMatrix";
import OriginsAdminCard from "@/components/admin/performance/OriginsAdminCard";
import IntegrityPanel from "@/components/admin/performance/IntegrityPanel";
import FunnelCompletenessPanel from "@/components/admin/performance/FunnelCompletenessPanel";
import AttributionPanel from "@/components/admin/performance/AttributionPanel";
import AbFunnelTestPanel from "@/components/admin/performance/AbFunnelTestPanel";
import ChampionBudgetPanel from "@/components/admin/performance/ChampionBudgetPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Activity,
  RefreshCw,
  Lock,
  Euro,
  Users,
  Phone,
  Target,
  TrendingUp,
  LayoutDashboard,
  Wallet,
  ArrowRight,
} from "lucide-react";

/**
 * L6 Performance Command Center
 * Level Gating:
 *   < L3  → no access
 *   L3    → blurred preview
 *   L4    → partial (Closer table only)
 *   L5    → Funnel + Closer
 *   L6+   → full dashboard + spend editing + origin admin
 */
export default function PerformanceCommandCenter() {
  const { profile, isAdmin, isOwner } = useAuth();
  const stage = (profile as any)?.business_stage ?? "opener";
  const level = getLevelForStage(stage);
  const isAdminLike = isAdmin || isOwner;
  const effectiveLevel = isAdminLike ? 6 : level;

  const [days, setDays] = useState<DateRange>(30);
  const { executive, funnel, sources, campaigns, closers, bottleneck, loading, forbidden, lastUpdated, refresh } =
    usePerformanceDashboard(days);
  const { origins, funnels, matrix, refresh: refreshOrigins } = useOriginPerformance(days);
  const { data: bottleneckDx } = useBottleneckDiagnosis(days);

  const showFull    = effectiveLevel >= 6;
  const showPartial = effectiveLevel >= 5;
  const showCloser  = effectiveLevel >= 4;
  const showPreview = effectiveLevel >= 3;

  const lastUpdatedLabel = useMemo(
    () => (lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "—"),
    [lastUpdated]
  );

  const refreshAll = () => { refresh(); refreshOrigins(); };

  // Headline KPI derivations from funnel data
  const fmtEur = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
  const fmtNum = (n: number) => new Intl.NumberFormat("de-DE").format(n || 0);
  const leadsCount    = funnel.find((f) => f.stage === "lead")?.count ?? 0;
  const bookingsCount = funnel.find((f) => f.stage === "booked")?.count ?? 0;
  const showsCount    = funnel.find((f) => f.stage === "showed")?.count ?? 0;
  const winsCount     = funnel.find((f) => f.stage === "deal_won")?.count ?? 0;
  const bookingRate   = leadsCount > 0 ? (bookingsCount / leadsCount) * 100 : 0;
  const closeRate     = showsCount > 0 ? (winsCount / showsCount) * 100 : 0;

  if (effectiveLevel < 3 || forbidden) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card className="p-8 text-center border-border/40">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-lg font-semibold text-foreground">Performance Command Center</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Dieses Dashboard ist ab Level 6 (Director / Partner) freigeschaltet.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2"><Activity className="h-5 w-5 text-primary" /></div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Performance Command Center</h1>
            <p className="text-xs text-muted-foreground">
              Revenue · Funnel · Origins · Closer · Ads · {lastUpdatedLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AdSpendForm canEdit={showFull} onSaved={refreshAll} />
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as DateRange)}>
            <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Tage</SelectItem>
              <SelectItem value="30">30 Tage</SelectItem>
              <SelectItem value="90">90 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={loading} className="h-8">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Top KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={<Euro className="h-4 w-4" />}   label="Revenue 30d"  value={fmtEur(executive?.revenue_30d ?? 0)} loading={loading} />
        <KpiTile icon={<Users className="h-4 w-4" />}  label="Leads 30d"    value={fmtNum(leadsCount)} loading={loading} />
        <KpiTile icon={<Phone className="h-4 w-4" />}  label="Booking Rate" value={`${bookingRate.toFixed(1)}%`} loading={loading} />
        <KpiTile icon={<Target className="h-4 w-4" />} label="Close Rate"   value={`${closeRate.toFixed(1)}%`} loading={loading} />
      </div>

      {/* Quick Actions */}
      <Card className="p-3 border-border/40">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-1">
            Quick Actions
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <QuickAction to="/members/admin/performance"          icon={<LayoutDashboard className="h-3.5 w-3.5" />} label="Übersicht" />
            <QuickAction to="/members/dashboard/performance"      icon={<TrendingUp className="h-3.5 w-3.5" />}     label="Operator Vergleich" />
            <QuickAction to="/members/admin/revenue-command"      icon={<Wallet className="h-3.5 w-3.5" />}         label="Revenue Command" />
            <QuickAction to="/members/admin/performance-control"  icon={<Activity className="h-3.5 w-3.5" />}       label="Performance Control" />
          </div>
        </div>
      </Card>

      {/* Preview overlay for L3/L4 */}
      {!showPartial && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/[0.05]">
          <p className="text-sm text-foreground">
            <Lock className="h-3.5 w-3.5 inline mr-1.5" />
            Preview-Modus — vollständiger Zugriff ab Level 6.
          </p>
        </Card>
      )}

      <div className={!showPartial ? "pointer-events-none select-none blur-sm opacity-60" : ""}>
        <Tabs defaultValue="overview" className="space-y-5">
          <TabsList className="grid w-full grid-cols-6 max-w-2xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="origins" disabled={!showFull}>Origins</TabsTrigger>
            <TabsTrigger value="campaigns" disabled={!showFull}>Campaigns</TabsTrigger>
            <TabsTrigger value="closers" disabled={!showCloser}>Closers</TabsTrigger>
            <TabsTrigger value="abtest" disabled={!showFull}>A/B Test</TabsTrigger>
            <TabsTrigger value="champion" disabled={!showFull}>Champion</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-5 mt-0">
            {showFull   && <ExecutiveStrip data={executive} />}
            {showFull   && <IntegrityPanel days={days} />}
            {showFull   && <FunnelCompletenessPanel days={days} />}
            {showFull   && <BottleneckDetector data={bottleneck} />}
            {showFull   && bottleneckDx && <BottleneckTeamPanel data={bottleneckDx} />}
            {showPartial && <FunnelVisualization stages={funnel} />}
            {showFull   && <SourcePerformanceTable rows={sources} />}
            {showFull   && <AttributionPanel days={days} />}
            {showPreview && !showCloser && <FunnelVisualization stages={funnel} />}
          </TabsContent>

          {/* ORIGINS */}
          <TabsContent value="origins" className="space-y-5 mt-0">
            {showFull && <OriginPerformanceTable rows={origins} />}
            {showFull && <FunnelComparison rows={funnels} />}
            {showFull && <CloserOriginMatrix rows={matrix} />}
            {showFull && <OriginsAdminCard canEdit={showFull} />}
          </TabsContent>

          {/* CAMPAIGNS */}
          <TabsContent value="campaigns" className="space-y-5 mt-0">
            {showFull && <CampaignTable rows={campaigns} />}
            {showFull && <SourcePerformanceTable rows={sources} />}
          </TabsContent>

          {/* CLOSERS */}
          <TabsContent value="closers" className="space-y-5 mt-0">
            {showCloser && <CloserPerformanceTable rows={closers} />}
            {showFull   && <CloserOriginMatrix rows={matrix} />}
          </TabsContent>

          {/* A/B TEST */}
          <TabsContent value="abtest" className="space-y-5 mt-0">
            {showFull && <AbFunnelTestPanel />}
          </TabsContent>

          {/* CHAMPION + AUTO BUDGET */}
          <TabsContent value="champion" className="space-y-5 mt-0">
            {showFull && <ChampionBudgetPanel />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ───────────────────────── Subcomponents ─────────────────────────

function KpiTile({
  icon, label, value, loading,
}: { icon: React.ReactNode; label: string; value: string; loading: boolean }) {
  return (
    <Card className="p-4 border-border/40">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-semibold text-foreground tabular-nums">
        {loading ? <span className="inline-block h-6 w-20 rounded bg-muted/50 animate-pulse" /> : value}
      </div>
    </Card>
  );
}

function QuickAction({
  to, icon, label,
}: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted/40 hover:bg-muted/70 text-foreground text-xs font-medium transition-colors group"
    >
      {icon}
      <span>{label}</span>
      <ArrowRight className="h-3 w-3 opacity-0 -ml-1 group-hover:opacity-60 group-hover:ml-0 transition-all" />
    </Link>
  );
}
