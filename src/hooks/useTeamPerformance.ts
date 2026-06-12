import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { roleLabel } from "@/lib/canonical-roles";

export type PerformanceScope = "my" | "team";

export interface TeamMember {
  member_id: string;
  member_name: string;
  member_level: number;
  member_role: string;
}

export interface TeamKpis {
  total_leads: number;
  booked_calls: number;
  booking_rate: number;
  shows: number;
  show_rate: number;
  no_shows: number;
  no_show_rate: number;
  closed_deals: number;
  close_rate: number;
  revenue: number;
  revenue_per_lead: number;
  revenue_per_show: number;
  ttfc_minutes: number;
  response_rate: number;
  team_size: number;
  user_level: number;
  period_days: number;
}

const EMPTY_KPIS: TeamKpis = {
  total_leads: 0, booked_calls: 0, booking_rate: 0, shows: 0, show_rate: 0,
  no_shows: 0, no_show_rate: 0, closed_deals: 0, close_rate: 0, revenue: 0,
  revenue_per_lead: 0, revenue_per_show: 0, ttfc_minutes: 0, response_rate: 0,
  team_size: 0, user_level: 0, period_days: 30,
};

/** Map canonical role filter key to level range for display */
function canonicalRoleLabel(level: number): string {
  return roleLabel(level, "hybrid", "de");
}

export function useTeamPerformance(
  days: number = 30,
  memberId?: string | null,
  roleFilter?: string | null,
) {
  const [kpis, setKpis] = useState<TeamKpis>(EMPTY_KPIS);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("not_authenticated"); setLoading(false); return; }

      // Fetch team members
      const membersPromise = supabase.rpc("get_team_member_ids" as never, { p_user_id: user.id } as never);
      
      // Build KPI args with optional role filter
      const kpisArgs: Record<string, unknown> = { p_user_id: user.id, p_days: days };
      if (memberId) kpisArgs.p_member_id = memberId;
      if (roleFilter && roleFilter !== "all") kpisArgs.p_role_filter = roleFilter;
      const kpisPromise = supabase.rpc("get_team_performance_kpis" as never, kpisArgs as never);

      const [membersRes, kpisRes] = await Promise.all([membersPromise, kpisPromise]) as [
        { data: unknown; error: { message: string } | null },
        { data: unknown; error: { message: string } | null },
      ];

      if (!membersRes.error && membersRes.data) {
        const rawMembers = membersRes.data as unknown as TeamMember[];
        // Enrich member_role with canonical label (never show raw DB strings)
        const enriched = rawMembers.map(m => ({
          ...m,
          member_name: m.member_name || "Teammitglied",
          member_role: canonicalRoleLabel(m.member_level),
        }));
        
        // Add self to the member list if not already there
        const selfInList = enriched.some(m => m.member_id === user.id);
        if (!selfInList) {
          const { data: selfProfile } = await supabase
            .from("profiles")
            .select("full_name, current_phase")
            .eq("id", user.id)
            .maybeSingle();
          const selfLevel = selfProfile?.current_phase ?? 0;
          enriched.unshift({
            member_id: user.id,
            member_name: selfProfile?.full_name || user.email || "Ich",
            member_level: selfLevel,
            member_role: canonicalRoleLabel(selfLevel),
          });
        }
        
        setMembers(enriched);
      }

      if (kpisRes.error) {
        console.error("[useTeamPerformance] KPI RPC error:", kpisRes.error.message);
        setError(kpisRes.error.message);
      } else if (kpisRes.data) {
        const d = kpisRes.data as unknown as Record<string, unknown>;
        if (d.error === "forbidden") {
          setError("forbidden");
        } else {
          setKpis({
            total_leads: Number(d.total_leads ?? 0),
            booked_calls: Number(d.booked_calls ?? 0),
            booking_rate: Number(d.booking_rate ?? 0),
            shows: Number(d.shows ?? 0),
            show_rate: Number(d.show_rate ?? 0),
            no_shows: Number(d.no_shows ?? 0),
            no_show_rate: Number(d.no_show_rate ?? 0),
            closed_deals: Number(d.closed_deals ?? 0),
            close_rate: Number(d.close_rate ?? 0),
            revenue: Number(d.revenue ?? 0),
            revenue_per_lead: Number(d.revenue_per_lead ?? 0),
            revenue_per_show: Number(d.revenue_per_show ?? 0),
            ttfc_minutes: Number(d.ttfc_minutes ?? 0),
            response_rate: Number(d.response_rate ?? 0),
            team_size: Number(d.team_size ?? 0),
            user_level: Number(d.user_level ?? 0),
            period_days: days,
          });
        }
      }
    } catch (e) {
      console.error("[useTeamPerformance] Unexpected error:", e);
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [days, memberId, roleFilter]);

  useEffect(() => { load(); }, [load]);

  return { kpis, members, loading, error, refresh: load };
}
