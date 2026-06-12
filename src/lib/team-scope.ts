/**
 * Team Scope Helper — Canonical Access Resolution
 * ────────────────────────────────────────────────
 * Central function for resolving which user IDs a given user can see.
 * Used by: Calendar, Performance, Revenue Flow, Talent Flow, Intelligence,
 *          Funnel Filter, Operator Filter, Termin-Reassignment.
 *
 * Rules:
 *   Admin / Director / L7+ → all active real users
 *   L6 → self + all directly/indirectly subordinate active real users
 *   L5 → self + directly subordinate users (if any)
 *   L4 and below → self only
 *
 * Test/simulation users are excluded unless caller is a test user.
 */
import { supabase } from "@/integrations/supabase/client";

export interface TeamMember {
  id: string;
  name: string;
  level: number;
  role: string;
}

export interface TeamScopeResult {
  /** All accessible user IDs including self */
  userIds: string[];
  /** Team members (excluding self) */
  members: TeamMember[];
  /** Whether this user sees all data (admin/L7+) */
  isGlobalScope: boolean;
}

/**
 * Resolve accessible user IDs for the current authenticated user.
 * Uses the `get_team_member_ids` RPC (security definer) as the
 * canonical source of truth.
 */
export async function getAccessibleUserIds(
  userId: string,
  options?: { isAdmin?: boolean; level?: number }
): Promise<TeamScopeResult> {
  const isGlobal = (options?.isAdmin || (options?.level && options.level >= 7)) ?? false;

  try {
    const { data, error } = await supabase.rpc("get_team_member_ids", {
      p_user_id: userId,
    });

    if (error) {
      console.error("[TeamScope] RPC error:", error);
      return { userIds: [userId], members: [], isGlobalScope: false };
    }

    const members: TeamMember[] = ((data as any[]) ?? []).map((r: any) => ({
      id: r.member_id,
      name: r.member_name ?? r.member_id?.slice(0, 8),
      level: r.member_level ?? 0,
      role: r.member_role ?? "Unknown",
    }));

    const userIds = [userId, ...members.map((m) => m.id)];

    return { userIds, members, isGlobalScope: isGlobal || members.length > 10 };
  } catch (e) {
    console.error("[TeamScope] unexpected error:", e);
    return { userIds: [userId], members: [], isGlobalScope: false };
  }
}
