/**
 * Canonical KPI filter clause for excluding test/inactive/simulation users.
 * Use this SQL fragment in all dashboard queries.
 */
export const KPI_USER_FILTER_SQL = `
  is_active = true
  AND (is_test_user IS NOT TRUE)
  AND (exclude_from_kpis IS NOT TRUE)
  AND (is_simulation_user IS NOT TRUE)
`;

/**
 * Client-side filter for profile objects
 */
export function isRealActiveUser(profile: {
  is_test_user?: boolean | null;
  exclude_from_kpis?: boolean | null;
  is_simulation_user?: boolean | null;
}): boolean {
  return !profile.is_test_user && !profile.exclude_from_kpis && !profile.is_simulation_user;
}
