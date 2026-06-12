import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "@/hooks/usePerformanceDashboard";

export interface AttributionRevenueRow {
  origin_source: string;
  leads: number;
  deals: number;
  revenue: number;
  conversion_rate: number | null;
  community_influenced_revenue: number;
}

export interface AttributionCommunityRoi {
  community_members: number;
  path_completed: number;
  path_completion_rate: number | null;
  community_influenced_deals: number;
  community_influenced_revenue: number;
  avg_time_to_conversion_hours: number | null;
}

export interface AttributionHealth {
  leads_total: number;
  leads_with_origin: number;
  bookings_total: number;
  bookings_with_lead: number;
  deals_total: number;
  deals_with_origin: number;
}

export function useAttributionDashboard(days: DateRange = 30) {
  const [revenue, setRevenue] = useState<AttributionRevenueRow[]>([]);
  const [community, setCommunity] = useState<AttributionCommunityRoi | null>(null);
  const [health, setHealth] = useState<AttributionHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const args = { _days: days } as never;
    const [rev, comm, hlt] = await Promise.all([
      supabase.rpc("attribution_revenue_by_source" as never, args),
      supabase.rpc("attribution_community_roi" as never, args),
      supabase.rpc("attribution_health" as never, args),
    ]);
    if (rev.error?.message?.includes("forbidden")) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (!rev.error) setRevenue((rev.data ?? []) as unknown as AttributionRevenueRow[]);
    if (!comm.error) setCommunity(comm.data as unknown as AttributionCommunityRoi);
    if (!hlt.error) setHealth(hlt.data as unknown as AttributionHealth);
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return { revenue, community, health, loading, forbidden, refresh: load };
}
