import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GovernanceSnapshot = {
  active_issues: number;
  high_severity: number;
  pending_actions: number;
  delayed_actions: number;
  active_overrides: number;
  data_integrity: {
    pct_leads_with_origin: number | null;
    pct_deals_linked: number | null;
    pct_calls_tracked: number | null;
    status: "ok" | "warning" | "failed";
    checked_at: string;
  } | null;
  recent_events: Array<{
    id: string;
    user_id: string | null;
    level: string | null;
    event_type: string;
    severity: "low" | "medium" | "high" | "critical";
    source: string;
    escalation_level: number;
    resolved: boolean;
    created_at: string;
  }>;
  recent_actions: Array<{
    id: string;
    event_id: string;
    action_type: "warning" | "intervention" | "restriction" | "removal";
    owner_level: "L6" | "L7" | "L8";
    status: "pending" | "executed" | "cancelled" | "delayed";
    event_type: string;
    severity: string;
    user_id: string | null;
    created_at: string;
  }>;
};

export const useGovernanceLock = () => {
  return useQuery({
    queryKey: ["governance-lock-snapshot"],
    queryFn: async (): Promise<GovernanceSnapshot> => {
      const { data, error } = await supabase.rpc("governance_dashboard_snapshot" as any);
      if (error) throw error;
      return data as unknown as GovernanceSnapshot;
    },
    refetchInterval: 60_000,
  });
};
