import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TimeRange = "today" | "7d" | "30d";

export interface FunnelStage {
  stage: string;
  order: number;
  count: number;
  rate_from_top: number;
  rate_from_prev: number;
}

export interface SourceRow {
  origin_id: string;
  origin_type: string;
  label: string;
  leads: number;
  bookings: number;
  shows: number;
  sales: number;
  revenue: number;
  spend: number;
  cpl: number | null;
  cac: number | null;
  roas: number | null;
}

export interface TeamMember {
  user_id: string;
  name: string;
  email: string;
  bookings?: number;
  shows?: number;
  show_rate?: number;
  calls?: number;
  wins?: number;
  close_rate?: number;
  revenue?: number;
}

export interface CeoSnapshot {
  days: number;
  generated_at: string;
  revenue: {
    today: number;
    last_7d: number;
    last_30d: number;
    previous_30d: number;
    mom_growth_pct: number;
  };
  funnel: FunnelStage[];
  bottleneck: {
    biggest_leak?: string | null;
    booking_rate?: number;
    show_rate?: number;
    closing_rate?: number;
    flags?: Array<{ stage: string; rate: number; threshold: number }>;
    all_green?: boolean;
    recommended_fix?: string;
  };
  sources: SourceRow[];
  community: {
    community_entries: number;
    paths_started: number;
    paths_completed: number;
    upgrades_clicked: number;
    upgrades_converted: number;
    community_to_path_rate: number;
    path_completion_rate: number;
    completion_to_upgrade_rate: number;
    revenue_from_community?: number;
  };
  team: { setters: TeamMember[]; closers: TeamMember[] };
  forecast: {
    open_appointments: number;
    avg_deal_value: number;
    expected_show_rate: number;
    expected_close_rate: number;
    forecast_7d: number;
    forecast_30d: number;
  };
  alerts: Array<{ severity: "critical" | "high" | "medium"; metric: string; message: string }>;
}

export interface BiggestLever {
  heuristic: {
    stage: string;
    label: string;
    current: number;
    target: number;
    lift_pct: number;
    revenue_impact: number;
  } | null;
  narrative: string;
}

const rangeToDays = (r: TimeRange) => (r === "today" ? 1 : r === "7d" ? 7 : 30);

export function useCeoDashboard(range: TimeRange) {
  const [data, setData] = useState<CeoSnapshot | null>(null);
  const [lever, setLever] = useState<BiggestLever | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const days = rangeToDays(range);
    const { data: snap, error: rpcErr } = await supabase.rpc(
      "ceo_dashboard_snapshot" as never,
      { _days: days } as never,
    );
    if (rpcErr) {
      setError(rpcErr.message);
      setLoading(false);
      return;
    }
    const parsed = snap as unknown as CeoSnapshot & { error?: string };
    if (parsed?.error === "forbidden") {
      setForbidden(true);
      setLoading(false);
      return;
    }
    setData(parsed);

    // Fetch AI narrative for biggest lever (non-blocking failure)
    try {
      const { data: lev, error: levErr } = await supabase.functions.invoke("ceo-biggest-lever", {
        body: { snapshot: parsed },
      });
      if (!levErr && lev) setLever(lev as BiggestLever);
    } catch (e) {
      console.error("biggest lever fetch failed", e);
    }

    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  return { data, lever, loading, forbidden, error, refresh: load };
}
