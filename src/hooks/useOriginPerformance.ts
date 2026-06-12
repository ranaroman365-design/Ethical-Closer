import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DateRange } from "@/hooks/usePerformanceDashboard";

export interface OriginRow {
  origin_id: string;
  origin_type: "DL" | "TEAM" | "FOUNDER" | "PARTNER";
  label: string;
  leads: number; bookings: number; shows: number; sales: number;
  revenue: number; spend: number;
  cpl: number | null; cac: number | null; roas: number | null;
  recommendation: "SCALE" | "OPTIMIZE" | "PAUSE";
}
export interface FunnelComparisonRow {
  origin_id: string; label: string; funnel_id: string;
  leads: number; bookings: number; shows: number; sales: number;
  booking_rate: number; show_rate: number; closing_rate: number;
}
export interface CloserOriginRow {
  closer_id: string; closer_name: string;
  origin_id: string; origin_label: string;
  calls: number; sales: number; close_rate: number; revenue: number;
}

const REFRESH_MS = 5 * 60 * 1000;

export function useOriginPerformance(days: DateRange = 30) {
  const [origins,   setOrigins]   = useState<OriginRow[]>([]);
  const [funnels,   setFunnels]   = useState<FunnelComparisonRow[]>([]);
  const [matrix,    setMatrix]    = useState<CloserOriginRow[]>([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(async () => {
    const args = { _days: days } as never;
    const [orig, fun, mat] = await Promise.all([
      supabase.rpc("perf_origin_performance"   as never, args),
      supabase.rpc("perf_funnel_comparison"    as never, args),
      supabase.rpc("perf_closer_origin_matrix" as never, args),
    ]);
    if (!orig.error) setOrigins((orig.data ?? []) as unknown as OriginRow[]);
    if (!fun.error)  setFunnels((fun.data ?? []) as unknown as FunnelComparisonRow[]);
    if (!mat.error)  setMatrix((mat.data  ?? []) as unknown as CloserOriginRow[]);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return { origins, funnels, matrix, loading, refresh: load };
}
