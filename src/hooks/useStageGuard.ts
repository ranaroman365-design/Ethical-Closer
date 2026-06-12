import { useAuth } from './useAuth';
import { normalizeBusinessStage } from '@/lib/stage-utils';

const STAGE_ORDER = [
  'prospect', 'opener', 'setter', 'associate_setter', 'senior_associate',
  'junior_manager', 'manager', 'senior_manager',
  'director', 'partner',
];

const ROUTE_ACCESS: Record<string, string[]> = {
  '/members': STAGE_ORDER,
  '/members/dashboard': STAGE_ORDER,
  '/members/profile': STAGE_ORDER,
  '/members/closer-benefits': STAGE_ORDER,
  '/members/build-your-team': STAGE_ORDER,
  '/members/academy': STAGE_ORDER,
  '/members/practice': STAGE_ORDER,
  '/members/certification': STAGE_ORDER,
  '/members/radiant': STAGE_ORDER,
  '/members/help': STAGE_ORDER,
  '/members/tools': STAGE_ORDER,
  '/members/path': STAGE_ORDER,
  '/members/objection-handling': STAGE_ORDER,
  '/members/start': STAGE_ORDER,
  '/members/philosophy': STAGE_ORDER,
  '/members/ethical-framework': STAGE_ORDER,
  '/members/interview': STAGE_ORDER,

  '/members/community': STAGE_ORDER,
  '/members/mentor-space': STAGE_ORDER,
  '/members/opener-simulator': STAGE_ORDER,

  // Closing OS: L4+ (junior_manager and above)
  '/members/closing-os': ['junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/simulation-lab': ['junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/call-review': ['junior_manager', 'manager', 'senior_manager', 'director', 'partner'],

  // Intelligence Dashboard + Deal Intelligence: L5+ (manager and above)
  '/members/intelligence': ['manager', 'senior_manager', 'director', 'partner'],
  '/members/deal-intelligence': ['manager', 'senior_manager', 'director', 'partner'],

  // Partner Earnings: L8 (partner only)
  '/members/partner-earnings': ['partner'],

  '/members/pool': ['director', 'partner'],
  '/members/setter': ['setter', 'senior_associate'],
  '/members/call-framework': ['setter', 'senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/simulator': ['senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/closing-questions': ['senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/closer': ['junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/closer-community': ['junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/closer-framework': ['junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/placement': ['senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/advanced-lab': ['manager', 'senior_manager', 'director', 'partner'],
  '/members/quarterly-crossing': ['manager', 'senior_manager', 'director', 'partner'],
  '/members/inner-circle': ['partner'],
  '/members/director-workspace': ['director', 'partner'],
  '/members/operator-calendar': ['senior_manager', 'director', 'partner'],
  '/members/scale-hub': ['senior_manager', 'director', 'partner'],
  '/members/setter-simulator': ['setter', 'senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '/members/payment-links': ['junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
};

export function useStageGuard(pathname: string): { allowed: boolean; loading: boolean } {
  const { user, profile, isAdmin, isLoading } = useAuth();

  if (isLoading) return { allowed: true, loading: true };
  if (isAdmin) return { allowed: true, loading: false };
  if (!user) return { allowed: false, loading: false };

  const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
  const cleanPath = pathname.replace(/\/$/, '') || '/members';

  const allowedStages = ROUTE_ACCESS[cleanPath];
  if (allowedStages) {
    return { allowed: allowedStages.map(normalizeBusinessStage).includes(stage), loading: false };
  }

  const parentPath = cleanPath.split('/').slice(0, -1).join('/');
  const parentAllowed = ROUTE_ACCESS[parentPath];
  if (parentAllowed) {
    return { allowed: parentAllowed.map(normalizeBusinessStage).includes(stage), loading: false };
  }

  if (cleanPath === '/members/admin') {
    return { allowed: false, loading: false };
  }

  return { allowed: true, loading: false };
}
