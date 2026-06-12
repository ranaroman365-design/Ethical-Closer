/**
 * useL6PerformanceData — Loads real Supabase data for L6 Performance Intelligence.
 *
 * Sources:
 *   - leads (scoped by owner_id / setter_id / closer_id)
 *   - calls (revenue from calls.revenue WHERE result='closed_won')
 *   - funnel_events_v2 (canonical event mapping)
 *   - profiles (team members)
 *
 * Scoping:
 *   - L6 → own team only (owner_id = user.id OR setter/closer assigned by operator)
 *   - L7/admin → global or filtered by operator
 *
 * Feeds computeL6PerformanceSnapshot() with real data.
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getLevelForStage } from "@/lib/kpi-config";
import {
  computeL6PerformanceSnapshot,
  type L6SnapshotInput,
  type L6PerformanceSnapshot,
} from "@/lib/l6-performance-intelligence";

export interface L6Filters {
  range: "7d" | "14d" | "30d" | "90d";
  funnel: string | null;         // null = all
  priority: string | null;       // null = all, "HIGH" | "MEDIUM" | "LOW"
  teamMember: string | null;     // null = all, user_id
}

const RANGE_DAYS: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };

export function useL6PerformanceData(filters: L6Filters) {
  const { user, profile, isAdmin, isOwner } = useAuth();
  const [snapshot, setSnapshot] = useState<L6PerformanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derive current user's level
  const userLevel = useMemo(() => {
    if (isAdmin || isOwner) return 8;
    const stage = (profile as any)?.business_stage ?? "opener";
    return getLevelForStage(stage);
  }, [profile, isAdmin, isOwner]);

  const isGlobalScope = userLevel >= 7 || isAdmin || isOwner;
  const operatorId = user?.id ?? null;

  const loadData = useCallback(async () => {
    if (!operatorId) return;
    setLoading(true);
    setError(null);

    try {
      const days = RANGE_DAYS[filters.range] ?? 30;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
      const since14d = new Date(Date.now() - 14 * 86400000).toISOString();

      // ── 1. Load leads ──
      let leadsQuery = supabase
        .from("leads")
        .select("id, name, email, phone, source, stage, lead_score, lead_quality, qualification_score, qualification_bucket, setter_id, closer_id, owner_id, created_at, appointment_date, total_no_shows, conversion_state, phone_valid, whatsapp_confirmed, whatsapp_unresponsive, attendance_flag, deal_value")
        .gte("created_at", since)
        .eq("is_simulation", false)
        .eq("is_test_lead", false);

      if (!isGlobalScope) {
        // L6 scope: leads they own, or where they are setter/closer
        leadsQuery = leadsQuery.or(`owner_id.eq.${operatorId},setter_id.eq.${operatorId},closer_id.eq.${operatorId}`);
      }

      if (filters.funnel) {
        leadsQuery = leadsQuery.eq("source", filters.funnel);
      }

      const { data: leadsRaw, error: leadsErr } = await leadsQuery.order("created_at", { ascending: false }).limit(1000);
      if (leadsErr) throw leadsErr;
      const leads = leadsRaw ?? [];

      // ── 2. Load calls (revenue source of truth) ──
      let callsQuery = supabase
        .from("calls")
        .select("id, lead_id, user_id, result, revenue, created_at, deal_size")
        .gte("created_at", since)
        .eq("is_simulation", false);

      if (!isGlobalScope) {
        callsQuery = callsQuery.eq("user_id", operatorId);
      }

      const { data: callsRaw, error: callsErr } = await callsQuery.limit(1000);
      if (callsErr) throw callsErr;

      // Also load calls for team members (closers in scope)
      const leadIds = leads.map(l => l.id);
      let teamCallsData: any[] = [];
      if (leadIds.length > 0) {
        // Load calls linked to our leads
        const { data: tc } = await supabase
          .from("calls")
          .select("id, lead_id, user_id, result, revenue, created_at")
          .in("lead_id", leadIds.slice(0, 500))
          .eq("is_simulation", false);
        teamCallsData = tc ?? [];
      }

      // Merge and deduplicate calls
      const callMap = new Map<string, any>();
      for (const c of [...(callsRaw ?? []), ...teamCallsData]) {
        callMap.set(c.id, c);
      }
      const calls = Array.from(callMap.values());

      // ── 3. Load funnel events (canonical event mapping) ──
      let eventsQuery = supabase
        .from("funnel_events_v2")
        .select("id, lead_id, event_type, created_at")
        .gte("created_at", since);

      if (leadIds.length > 0 && leadIds.length <= 500) {
        eventsQuery = eventsQuery.in("lead_id", leadIds);
      }

      const { data: eventsRaw, error: eventsErr } = await eventsQuery.limit(5000);
      if (eventsErr) throw eventsErr;
      const events = eventsRaw ?? [];

      // ── 4. Load team members (profiles assigned as setter/closer for these leads) ──
      const teamUserIds = new Set<string>();
      for (const l of leads) {
        if (l.setter_id) teamUserIds.add(l.setter_id);
        if (l.closer_id) teamUserIds.add(l.closer_id);
      }
      teamUserIds.delete(operatorId); // exclude self

      let teamMembers: Array<{ user_id: string; name: string; role: "setter" | "closer" }> = [];
      if (teamUserIds.size > 0) {
        const { data: profilesRaw } = await supabase
          .from("profiles")
          .select("id, full_name, business_stage")
          .in("id", Array.from(teamUserIds).slice(0, 100));

        if (profilesRaw) {
          teamMembers = profilesRaw.map(p => {
            const level = getLevelForStage(p.business_stage ?? "opener");
            return {
              user_id: p.id,
              name: p.full_name || "Unbekannt",
              role: (level <= 3 ? "setter" : "closer") as "setter" | "closer",
            };
          });
        }
      }

      // ── 5. Build lead assignments (lead_id → assigned user_id) ──
      const leadAssignments: Record<string, string> = {};
      for (const l of leads) {
        // Assign to closer if present, otherwise setter
        if (l.closer_id) leadAssignments[l.id] = l.closer_id;
        else if (l.setter_id) leadAssignments[l.id] = l.setter_id;
      }

      // ── 6. Revenue trend (7d current vs 7d previous) ──
      const revenue7dCurrent = calls
        .filter(c => c.result === "closed_won" && typeof c.revenue === "number" && new Date(c.created_at) >= new Date(since7d))
        .reduce((sum, c) => sum + (c.revenue ?? 0), 0);

      const revenue7dPrevious = calls
        .filter(c => c.result === "closed_won" && typeof c.revenue === "number" &&
          new Date(c.created_at) >= new Date(since14d) && new Date(c.created_at) < new Date(since7d))
        .reduce((sum, c) => sum + (c.revenue ?? 0), 0);

      // ── 7. Recovery rate (rebooked after no-show / total no-shows) ──
      const totalNoShows = leads.filter(l => (l.total_no_shows ?? 0) > 0).length;
      const rebooked = leads.filter(l => (l.total_no_shows ?? 0) > 0 && l.conversion_state === "rebooked").length;
      const recoveryRate = totalNoShows > 0 ? rebooked / totalNoShows : null;

      // ── 8. Build snapshot input ──
      const input: L6SnapshotInput = {
        operator_id: operatorId,
        leads,
        calls,
        events,
        team_members: teamMembers,
        lead_assignments: leadAssignments,
        revenue_7d_current: revenue7dCurrent,
        revenue_7d_previous: revenue7dPrevious,
        recovery_rate: recoveryRate,
        period_start: since,
        period_end: new Date().toISOString(),
      };

      const result = computeL6PerformanceSnapshot(input);
      setSnapshot(result);
    } catch (err: any) {
      console.error("[L6 Performance] Error loading data:", err);
      setError(err.message ?? "Fehler beim Laden der Daten");
    } finally {
      setLoading(false);
    }
  }, [operatorId, isGlobalScope, filters.range, filters.funnel]);

  useEffect(() => { loadData(); }, [loadData]);

  return { snapshot, loading, error, userLevel, isGlobalScope, reload: loadData };
}
