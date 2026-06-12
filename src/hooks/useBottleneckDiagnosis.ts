import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BottleneckType =
  | "traffic_problem"
  | "booking_problem"
  | "setting_show_problem"
  | "closing_problem"
  | "no_meaningful_gap"
  | "insufficient_data"
  | "incomplete_funnel"
  | "suspicious_data";

export type ConfidenceLevel = "high_confidence" | "medium_confidence" | "low_confidence" | "blocked";

export interface BottleneckRecommendation {
  cause: string;
  leverage: string;
  actions: string[];
}

export interface BottleneckOperator {
  operator_email: string;
  reliability_label: string;
  eligible: boolean;
  suspicious: boolean;
  confidence: ConfidenceLevel;
  primary_bottleneck: BottleneckType;
  primary_actual: number | null;
  primary_benchmark: number | null;
  primary_gap_pct_points: number;
  estimated_lost_revenue: number;
  estimated_lost_wins: number;
  volume: { leads: number; quiz: number; booked: number; showed: number; won: number; revenue: number };
  stages: {
    quiz_rate: number | null; quiz_benchmark: number | null;
    booking_rate: number | null; booking_benchmark: number | null;
    show_rate: number | null; show_benchmark: number | null;
    close_rate: number | null; close_benchmark: number | null;
    avg_deal_value: number | null;
  };
  impact_per_stage: Record<"traffic" | "booking" | "show" | "close", { lost_revenue: number; lost_wins: number }>;
  recommendation: BottleneckRecommendation;
  reasons: string[];
}

export interface BottleneckGlobal {
  operators_total: number;
  operators_diagnosed: number;
  operators_blocked: number;
  total_lost_revenue: number;
  most_common_bottleneck: BottleneckType | null;
  distribution: Partial<Record<BottleneckType, number>>;
  top_opportunities: Array<{
    operator_email: string;
    primary_bottleneck: BottleneckType;
    estimated_lost_revenue: number;
    confidence: ConfidenceLevel;
  }>;
}

export interface BottleneckDiagnosis {
  days: number;
  generated_at: string;
  benchmarks: {
    median: { quiz_rate: number | null; booking_rate: number | null; show_rate: number | null; close_rate: number | null };
    top_quartile: { quiz_rate: number | null; booking_rate: number | null; show_rate: number | null; close_rate: number | null };
    avg_deal_value_cohort_median: number | null;
  };
  global: BottleneckGlobal;
  operators: BottleneckOperator[];
}

export function useBottleneckDiagnosis(days = 30) {
  const [data, setData] = useState<BottleneckDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await supabase.rpc(
      "perf_bottleneck_diagnose" as never,
      { _days: days } as never,
    );
    if (error) {
      if (error.message?.toLowerCase().includes("forbidden")) setForbidden(true);
      setLoading(false);
      return;
    }
    const parsed = res as unknown as BottleneckDiagnosis & { error?: string };
    if (parsed?.error === "forbidden") {
      setForbidden(true);
    } else {
      setData(parsed);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, forbidden, refresh: load };
}
