import { useAuth } from "@/hooks/useAuth";

/**
 * Canonical L0 / L1+ access tier.
 *
 * - L0 = Insider (lead, no purchase) → /insider preview only
 * - L1+ = paying member, admin, or progressed operator → full /community + /members
 *
 * L1 is granted when ANY of:
 *  - community_access = true (paid €27 buyer)
 *  - current_phase >= 1
 *  - role is admin/owner/community_member
 */
const L1_ROLES = new Set([
  "owner",
  "administrator",
  "admin",
  "security_admin",
  "ops_admin",
  "content_admin",
  "finance_admin",
  "support_admin",
  "community_member",
]);

export function useUserLevel() {
  const { user, profile, role, isLoading } = useAuth();

  const profileWithAccess = profile as
    | (typeof profile & { community_access?: boolean | null })
    | null;

  const phase = profile?.current_phase ?? 0;
  const hasPaidAccess = Boolean(profileWithAccess?.community_access);
  const hasPrivilegedRole = role ? L1_ROLES.has(role) : false;

  const isL1Plus = hasPaidAccess || phase >= 1 || hasPrivilegedRole;
  const level = isL1Plus ? Math.max(1, phase) : 0;

  return {
    loading: isLoading,
    isAuthenticated: Boolean(user),
    level,
    isL0: !isL1Plus,
    isL1Plus,
  };
}
