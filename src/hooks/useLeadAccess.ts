/**
 * Lead Data Access — Canonical level-based access control.
 *
 * L0–L2: NO lead data access
 * L3 (Setter): Own leads only, restricted fields
 * L4 (Junior Closer): Own leads only, extended fields
 * L5 (Managing Closer): ALL leads within own unit
 * L6 (Senior Closer / Operator): ALL leads in operator unit
 * L7 (Director): ALL leads across area (recursive subtree)
 * L8 (Admin): Full global access
 *
 * Canon: Layer 47 · Revenue Engine · Visualization
 */
import { useAuth } from "@/hooks/useAuth";

export type LeadAccessTier = "none" | "own_restricted" | "own_extended" | "unit" | "area" | "global";

export function useLeadAccess() {
  const { profile, role } = useAuth();

  const level = profile?.current_phase ?? 0;
  const isAdmin = role === "admin" || role === "administrator" || role === "owner";

  let tier: LeadAccessTier = "none";
  if (isAdmin || level >= 8) {
    tier = "global";
  } else if (level >= 7) {
    tier = "area";
  } else if (level >= 5) {
    tier = "unit";
  } else if (level >= 4) {
    tier = "own_extended";
  } else if (level >= 3) {
    tier = "own_restricted";
  }

  const canViewLeads = tier !== "none";
  const canViewFullLeads = level >= 6 || isAdmin;
  const canViewAllUnitLeads = level >= 5 || isAdmin;
  const canViewGlobalLeads = level >= 7 || isAdmin;

  // Debug logging per user request
  if (typeof window !== "undefined") {
    console.log("[useLeadAccess]", {
      user_id: profile?.id,
      current_phase: level,
      tier,
      canViewLeads,
      canViewFullLeads,
      canViewAllUnitLeads,
    });
  }

  return {
    level,
    tier,
    canViewLeads,
    canViewFullLeads,
    canViewAllUnitLeads,
    canViewGlobalLeads,
    isAdmin,
  };
}
