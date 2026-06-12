import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DateRange = 7 | 30 | 90;

export interface ExecutiveStrip {
  revenue_today: number;
  revenue_7d: number;
  revenue_30d: number;
  spend: number;
  roas: number | null;
  cac: number | null;
  cpl: number | null;
  days: number;
}
export interface FunnelStage {
  stage: string;
  stage_order: number;
  count: number;
  rate_from_top: number;
  rate_from_prev: number;
}
export interface SourceRow {
  source: string;
  leads: number; sales: number; revenue: number; spend: number;
  cpl: number | null; cac: number | null; roas: number | null;
  recommendation: "SCALE" | "OPTIMIZE" | "PAUSE";
}
export interface CampaignRow {
  campaign: string; source: string; spend: number; leads: number;
  cpl: number | null; sales: number; revenue: number; roas: number | null;
}
export interface CloserRow {
  closer_id: string; closer_name: string;
  calls: number; shows: number; sales: number;
  close_rate: number; revenue: number;
}
export interface BottleneckResult {
  leads: number; bookings: number; shows: number; sales: number;
  booking_rate: number; show_rate: number; closing_rate: number;
  flags: Array<{ stage: string; rate: number; threshold: number; severity: string }>;
  biggest_leak: string | null;
  recommended_fix: string | null;
  all_green: boolean;
}

const REFRESH_MS = 5 * 60 * 1000; // 5 min, per spec

export function usePerformanceDashboard(days: DateRange = 30) {
  const [executive,  setExecutive]  = useState<ExecutiveStrip | null>(null);
  const [funnel,     setFunnel]     = useState<FunnelStage[]>([]);
  const [sources,    setSources]    = useState<SourceRow[]>([]);
  const [campaigns,  setCampaigns]  = useState<CampaignRow[]>([]);
  const [closers,    setClosers]    = useState<CloserRow[]>([]);
  const [bottleneck, setBottleneck] = useState<BottleneckResult | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [forbidden,  setForbidden]  = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const args = { _days: days } as never;
    const [exe, fun, src, cam, clo, bot] = await Promise.all([
      supabase.rpc("perf_executive_strip" as never, args),
      supabase.rpc("perf_funnel_stages" as never, args),
      supabase.rpc("perf_source_performance" as never, args),
      supabase.rpc("perf_campaign_breakdown" as never, args),
      supabase.rpc("perf_closer_performance" as never, args),
      supabase.rpc("perf_bottleneck_detection" as never, args),
    ]);
    if (exe.error?.message?.includes("forbidden")) {
      setForbidden(true); setLoading(false); return;
    }
    if (!exe.error) setExecutive(exe.data as unknown as ExecutiveStrip);
    if (!fun.error) setFunnel((fun.data ?? []) as unknown as FunnelStage[]);
    if (!src.error) setSources((src.data ?? []) as unknown as SourceRow[]);
    if (!cam.error) setCampaigns((cam.data ?? []) as unknown as CampaignRow[]);
    if (!clo.error) setClosers((clo.data ?? []) as unknown as CloserRow[]);
    if (!bot.error) setBottleneck(bot.data as unknown as BottleneckResult);
    setLastUpdated(new Date());
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return { executive, funnel, sources, campaigns, closers, bottleneck, loading, forbidden, lastUpdated, refresh: load };
}
