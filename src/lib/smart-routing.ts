import { normalizeBusinessStage } from '@/lib/stage-utils';

const LAST_PAGE_KEY = 'etc_last_valid_page';

/**
 * Returns the ideal default route for a user based on their business stage.
 */
export function getDefaultRouteForStage(stage: string | null | undefined, isAdmin: boolean): string {
  if (isAdmin) return '/members/admin-workspace';

  const normalized = normalizeBusinessStage(stage);

  switch (normalized) {
    case 'prospect':
    case 'applicant':
      return '/members/dashboard';
    case 'opener':
    case 'setter':
    case 'associate_setter':
    case 'senior_associate':
      return '/members/start';
    case 'junior_manager':
    case 'manager':
      return '/members/dashboard';
    case 'senior_manager':
      return '/members/placement';
    case 'director':
      return '/members/director-workspace';
    case 'partner':
      return '/members/partner-hub';
    default:
      return '/members/dashboard';
  }
}

/** Persist the current page so we can restore it on next login. */
export function saveLastPage(pathname: string) {
  try {
    if (pathname.startsWith('/members') && pathname !== '/members/login') {
      localStorage.setItem(LAST_PAGE_KEY, pathname);
    }
  } catch { /* quota exceeded etc */ }
}

/** Get and clear the last saved page, returning null if none. */
export function popLastPage(): string | null {
  try {
    const page = localStorage.getItem(LAST_PAGE_KEY);
    localStorage.removeItem(LAST_PAGE_KEY);
    return page;
  } catch {
    return null;
  }
}
