/**
 * A/B Test Dashboard — lean admin overview.
 *
 * Reads `event_logs` (already populated by `log_meta_event_browser` RPC),
 * filters by the currently active test (`ACTIVE_TEST` in
 * `src/lib/ab-active-test.ts`), and shows per-variant counts for the
 * funnel-critical events. The recommended-winner banner stays advisory —
 * the rules state admins must manually promote.
 *
 * Route: /members/admin/ab-tests
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIVE_TEST } from "@/lib/ab-active-test";
import { Beaker, Trophy, AlertCircle } from "lucide-react";
import MasterOfSalesKpiPanel from "@/components/admin/MasterOfSalesKpiPanel";
import AutoAllocatorPanel from "@/components/admin/AutoAllocatorPanel";
import ChannelAllocatorPanel from "@/components/admin/ChannelAllocatorPanel";
import CreativePerformancePanel from "@/components/admin/CreativePerformancePanel";
import CroOverviewPanel from "@/components/admin/CroOverviewPanel";
import CroExperimentBacklogPanel from "@/components/admin/CroExperimentBacklogPanel";
import CroRevenueImpactPanel from "@/components/admin/CroRevenueImpactPanel";
import CroAudienceIntelligencePanel from "@/components/admin/CroAudienceIntelligencePanel";
import CroPsychologyIntelligencePanel from "@/components/admin/CroPsychologyIntelligencePanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TRACKED_EVENTS = [
  "PageView",
  "ApplyCtaClick",
  "QuizStarted",
  "QuizCompleted",
  "Lead",
  "BookingStarted",
  "BookingCreated",
  "Schedule",
] as const;

type EventName = (typeof TRACKED_EVENTS)[number];
type VariantStats = Record<EventName, number>;

interface VariantBucket {
  variant: "A" | "B";
  stats: VariantStats;
  total: number;
}

const ZERO_STATS = (): VariantStats =>
  TRACKED_EVENTS.reduce((acc, e) => ({ ...acc, [e]: 0 }), {} as VariantStats);

interface EventLogRow {
  event_name: string;
  payload: { ab_test_name?: string; ab_variant?: string } | null;
}

export default function AbTestDashboard() {
  const [buckets, setBuckets] = useState<VariantBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinceDays, setSinceDays] = useState(14);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!ACTIVE_TEST) {
        setBuckets([]);
        setLoading(false);
        return;
      }
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      const { data, error: qErr } = await supabase
        .from("event_logs")
        .select("event_name, payload")
        .gte("created_at", since.toISOString())
        .in("event_name", [...TRACKED_EVENTS])
        .filter("payload->>ab_test_name", "eq", ACTIVE_TEST.name)
        .limit(50000);
      if (qErr) throw qErr;

      const a: VariantBucket = { variant: "A", stats: ZERO_STATS(), total: 0 };
      const b: VariantBucket = { variant: "B", stats: ZERO_STATS(), total: 0 };
      for (const row of (data ?? []) as EventLogRow[]) {
        const v = row.payload?.ab_variant;
        const ev = row.event_name as EventName;
        if (!TRACKED_EVENTS.includes(ev)) continue;
        const bucket = v === "A" ? a : v === "B" ? b : null;
        if (!bucket) continue;
        bucket.stats[ev]++;
        bucket.total++;
      }
      setBuckets([a, b]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceDays]);

  const rate = (num: number, den: number) =>
    den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—";

  const winner = (() => {
    if (buckets.length !== 2) return null;
    const [a, b] = buckets;
    const aPv = a.stats.PageView;
    const bPv = b.stats.PageView;
    if (aPv < 50 || bPv < 50) return null;
    const aLeadRate = a.stats.Lead / Math.max(1, aPv);
    const bLeadRate = b.stats.Lead / Math.max(1, bPv);
    if (Math.abs(aLeadRate - bLeadRate) / Math.max(aLeadRate, bLeadRate) < 0.1) return null;
    return aLeadRate > bLeadRate ? "A" : "B";
  })();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Beaker className="h-5 w-5 text-primary" />
            A/B Test Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Lean Single-Test Modus — eine aktive Variation, 50/50 Split per Session.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={sinceDays === d ? "default" : "outline"}
              onClick={() => setSinceDays(d)}
            >
              {d}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            Aktualisieren
          </Button>
        </div>
      </div>

      <Tabs defaultValue="cro" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cro">CRO Overview</TabsTrigger>
          <TabsTrigger value="kpis">KPI-Dashboard</TabsTrigger>
          <TabsTrigger value="auto">Auto-Allocator</TabsTrigger>
          <TabsTrigger value="channel">Per-Channel</TabsTrigger>
          <TabsTrigger value="creative">Per-Creative</TabsTrigger>
          <TabsTrigger value="legacy">Legacy Single-Test</TabsTrigger>
        </TabsList>
        <TabsContent value="cro" className="space-y-4">
          <CroOverviewPanel />
          <CroRevenueImpactPanel />
          <CroAudienceIntelligencePanel />
          <CroPsychologyIntelligencePanel />
          <CroExperimentBacklogPanel />
        </TabsContent>
        <TabsContent value="kpis" className="space-y-4">
          <MasterOfSalesKpiPanel />
        </TabsContent>
        <TabsContent value="auto" className="space-y-4">
          <AutoAllocatorPanel />
        </TabsContent>
        <TabsContent value="channel" className="space-y-4">
          <ChannelAllocatorPanel />
        </TabsContent>
        <TabsContent value="creative" className="space-y-4">
          <CreativePerformancePanel />
        </TabsContent>
        <TabsContent value="legacy" className="space-y-4">
          {/* legacy single-test block rendered below */}
        </TabsContent>
      </Tabs>

      {!ACTIVE_TEST && (
        <Card className="p-6 border-dashed">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Aktuell ist kein A/B-Test aktiv. Setze <code className="px-1 py-0.5 bg-muted rounded">ACTIVE_TEST</code> in <code className="px-1 py-0.5 bg-muted rounded">src/lib/ab-active-test.ts</code>.
          </div>
        </Card>
      )}

      {ACTIVE_TEST && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Aktiver Test</div>
              <div className="font-medium text-lg">{ACTIVE_TEST.name}</div>
              {ACTIVE_TEST.description && (
                <div className="text-sm text-muted-foreground">{ACTIVE_TEST.description}</div>
              )}
            </div>
            {winner ? (
              <Badge className="bg-primary">
                <Trophy className="h-3 w-3 mr-1" />
                Empfohlener Winner: Variante {winner} (manuell promoten)
              </Badge>
            ) : (
              <Badge variant="outline">Noch keine Empfehlung (≥50 PageViews je Variante)</Badge>
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {buckets.map((bucket) => {
              const pv = bucket.stats.PageView;
              return (
                <div key={bucket.variant} className="border border-border rounded-md p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      Variante {bucket.variant}
                      {winner === bucket.variant && (
                        <Trophy className="h-4 w-4 inline ml-2 text-primary" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{bucket.total} Events</span>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-border">
                        <th className="py-1.5">Event</th>
                        <th className="py-1.5 text-right">Count</th>
                        <th className="py-1.5 text-right">vs PV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TRACKED_EVENTS.map((ev) => (
                        <tr key={ev} className="border-b border-border/40">
                          <td className="py-1.5">{ev}</td>
                          <td className="py-1.5 text-right font-mono">{bucket.stats[ev]}</td>
                          <td className="py-1.5 text-right text-muted-foreground font-mono">
                            {ev === "PageView" ? "—" : rate(bucket.stats[ev], pv)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground">
            Empfehlung erscheint erst bei ≥50 PageViews je Variante und ≥10% Lift auf Lead-Rate.
            Winner-Promotion erfolgt manuell durch Anpassen von <code className="px-1 bg-muted rounded">ACTIVE_TEST</code>.
          </div>
        </Card>
      )}
    </div>
  );
}
