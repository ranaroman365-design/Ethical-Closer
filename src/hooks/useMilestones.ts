import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { trackProductEvent } from '@/lib/track-event';

export interface MilestoneState {
  onboarding_completed: boolean;
  certification_passed: boolean;
  placement_ready: boolean;
  high_ticket_placed: boolean;
  first_1k_earned: boolean;
  total_revenue: number;
  loading: boolean;
}

const FIRED_KEY = 'etc_milestone_fired_v1';

function readFired(): Record<string, true> {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}'); } catch { return {}; }
}
function markFired(key: string) {
  const f = readFired(); f[key] = true;
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(f)); } catch {}
}

/**
 * Derives milestone states from real signals:
 *  - onboarding_completed / certified / placement_ready → profiles
 *  - high_ticket_placed   → ≥1 real (non-simulation) call assigned to user
 *  - first_1k_earned      → sum(commissions.amount where !is_simulation) ≥ 1000
 * Fires MILESTONE_COMPLETED once per (user, milestone) via localStorage guard.
 */
export function useMilestones(): MilestoneState {
  const { user, profile } = useAuth();
  const [state, setState] = useState<MilestoneState>({
    onboarding_completed: false,
    certification_passed: false,
    placement_ready: false,
    high_ticket_placed: false,
    first_1k_earned: false,
    total_revenue: 0,
    loading: true,
  });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      const [callsRes, commissionsRes] = await Promise.all([
        supabase
          .from('calls')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_simulation', false),
        supabase
          .from('commissions')
          .select('amount')
          .eq('user_id', user.id)
          .eq('is_simulation', false),
      ]);

      if (cancelled) return;

      const realCallCount = callsRes.count ?? 0;
      const totalRevenue = (commissionsRes.data ?? []).reduce(
        (sum, r: any) => sum + Number(r.amount || 0),
        0,
      );

      const next: MilestoneState = {
        onboarding_completed: !!(profile as any)?.onboarding_completed,
        certification_passed: !!(profile as any)?.certified,
        placement_ready: !!(profile as any)?.placement_ready,
        high_ticket_placed: realCallCount > 0,
        first_1k_earned: totalRevenue >= 1000,
        total_revenue: totalRevenue,
        loading: false,
      };

      const fired = readFired();
      const checkFire = (key: keyof MilestoneState) => {
        if (next[key] === true && !fired[`${user.id}:${key}`]) {
          markFired(`${user.id}:${key}`);
          trackProductEvent('MILESTONE_COMPLETED', { milestone_id: key, user_id: user.id });
        }
      };
      (['onboarding_completed','certification_passed','placement_ready','high_ticket_placed','first_1k_earned'] as const).forEach(checkFire);

      setState(next);
    })();

    return () => { cancelled = true; };
  }, [user?.id, (profile as any)?.onboarding_completed, (profile as any)?.certified, (profile as any)?.placement_ready]);

  return state;
}
