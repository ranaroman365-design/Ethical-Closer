/**
 * KPI User Consistency — Single Source of Truth
 *
 * Central filter for determining if a user/profile should be included
 * in KPIs, leaderboards, revenue dashboards, and performance metrics.
 *
 * SQL equivalent: WHERE is_test_user IS NOT TRUE AND exclude_from_kpis IS NOT TRUE AND is_active = TRUE
 * DB function equivalent: is_real_user(uuid)
 * DB view equivalent: real_users_view
 */

export interface KpiFilterableUser {
  is_test_user?: boolean | null;
  exclude_from_kpis?: boolean | null;
  is_active?: boolean | null;
}

/**
 * Returns true only for real, active, non-test users.
 * Use this EVERYWHERE user data feeds into KPIs, rankings, or revenue metrics.
 */
export const isRealActiveUser = (u: KpiFilterableUser): boolean => {
  return (
    u.is_test_user !== true &&
    u.exclude_from_kpis !== true &&
    u.is_active !== false // default true if undefined/null
  );
};

/**
 * Filter an array of users/profiles to only real active users.
 */
export const filterRealUsers = <T extends KpiFilterableUser>(users: T[]): T[] => {
  return users.filter(isRealActiveUser);
};

/**
 * Leaderboard empty-state message (DE/EN).
 */
export const LEADERBOARD_EMPTY_MESSAGE = {
  de: 'Die ersten echten Rankings erscheinen, sobald genügend Aktivität vorhanden ist.',
  en: 'Real rankings will appear once there is enough activity.',
} as const;
