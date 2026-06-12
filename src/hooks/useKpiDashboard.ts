import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface KpiOverview {
  dau_today: number; dau_yesterday: number; dau_delta_pct: number;
  wau: number; mau: number;
  revenue_today: number; revenue_30d: number;
  conversion_pct: number; tracked_users: number;
}
export interface EngagementPoint { day: string; dau: number; posts: number; comments: number; reactions: number; }
export interface CohortRow { cohort_week: string; cohort_size: number; d1: number; d7: number; d30: number; }
export interface FunnelData { L0: number; L1: number; L2: number; L4: number; L6: number; l0_to_l1_pct: number; l1_to_l2_pct: number; l2_to_l4_pct: number; l4_to_l6_pct: number; }
export interface LevelRow { level_key: string; user_count: number; avg_credits: number; }
export interface TopContent { message_id: string; content_preview: string; author_id: string; reactions: number; replies: number; score: number; created_at: string; }

const REFRESH_MS = 60_000;

export function useKpiDashboard() {
  const [overview, setOverview] = useState<KpiOverview | null>(null);
  const [series, setSeries] = useState<EngagementPoint[]>([]);
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [top, setTop] = useState<TopContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [o, s, c, f, l, t] = await Promise.all([
        supabase.rpc("kpi_overview" as never),
        supabase.rpc("kpi_engagement_series" as never, { _days: 30 } as never),
        supabase.rpc("kpi_retention_cohorts" as never, { _weeks: 8 } as never),
        supabase.rpc("kpi_conversion_funnel" as never),
        supabase.rpc("kpi_level_distribution" as never),
        supabase.rpc("kpi_top_content" as never, { _limit: 10 } as never),
      ]);
      const firstErr = [o, s, c, f, l, t].find(r => r.error)?.error;
      if (firstErr) {
        if (/forbidden/i.test(firstErr.message)) { setForbidden(true); }
        else setError(firstErr.message);
        return;
      }
      setOverview(o.data as unknown as KpiOverview);
      setSeries((s.data ?? []) as unknown as EngagementPoint[]);
      setCohorts((c.data ?? []) as unknown as CohortRow[]);
      setFunnel(f.data as unknown as FunnelData);
      setLevels((l.data ?? []) as unknown as LevelRow[]);
      setTop((t.data ?? []) as unknown as TopContent[]);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  return { overview, series, cohorts, funnel, levels, top, loading, forbidden, error, refresh: fetchAll };
}
