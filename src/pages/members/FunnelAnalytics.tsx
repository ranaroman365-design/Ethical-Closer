import FunnelKpiDashboard from "@/components/admin/FunnelKpiDashboard";
import WeeklyFunnelReportButton from "@/components/admin/WeeklyFunnelReportButton";
import FunnelStepAnalyticsPanel from "@/components/admin/FunnelStepAnalyticsPanel";
import CloserKarriereFunnelPanel from "@/components/admin/CloserKarriereFunnelPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Sprint 8 — Admin page wrapping the Funnel KPI Dashboard.
 * Route: /members/admin/funnel-analytics
 *
 * Tabs:
 *  - Per-Step Drop-Off — 9-step apply funnel with campaign/adset/ad/creative/variant filters
 *  - Closer Karriere   — additive, /closer-karriere-specific 11-step funnel (read-only)
 *  - Wochenreport      — legacy funnel_source × traffic_owner aggregation
 */
export default function FunnelAnalytics() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Funnel Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Per-Schritt-Drop-Off mit Campaign/AdSet/Ad/Creative/Variant-Filtern + Wochenreport.
          </p>
        </div>
        <WeeklyFunnelReportButton />
      </div>
      <Tabs defaultValue="steps" className="space-y-4">
        <TabsList>
          <TabsTrigger value="steps">Per-Step Drop-Off</TabsTrigger>
          <TabsTrigger value="closer-karriere">Closer Karriere</TabsTrigger>
          <TabsTrigger value="weekly">Wochenreport</TabsTrigger>
        </TabsList>
        <TabsContent value="steps"><FunnelStepAnalyticsPanel /></TabsContent>
        <TabsContent value="closer-karriere"><CloserKarriereFunnelPanel /></TabsContent>
        <TabsContent value="weekly"><FunnelKpiDashboard /></TabsContent>
      </Tabs>
    </div>
  );
}

