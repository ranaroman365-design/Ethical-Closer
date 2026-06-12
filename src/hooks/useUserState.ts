import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useKpis } from './useKpis';
import { useTimebox } from './useTimebox';
import { getLevelForStage } from '@/lib/kpi-config';
import { normalizeBusinessStage } from '@/lib/stage-utils';

export type UserState = 'new' | 'learning' | 'committed' | 'stuck' | 'unstable' | 'performing' | 'scaling' | 'leading';

export interface UserStateData {
  current_state: UserState;
  previous_state: UserState | null;
  state_changed_at: string;
  kpi_trend: 'rising' | 'stable' | 'falling' | 'volatile';
  activity_score: number;
  close_rate_variance: number;
  revenue_30d: number;
  progress_pct: number;
}

const STATE_LABELS: Record<UserState, { de: string; en: string }> = {
  new: { de: 'Neustarter', en: 'New' },
  learning: { de: 'Im Training', en: 'Learning' },
  committed: { de: 'Committed', en: 'Committed' },
  stuck: { de: 'Support empfohlen', en: 'Support recommended' },
  unstable: { de: 'Stabilisierung nötig', en: 'Stabilization needed' },
  performing: { de: 'Performer', en: 'Performing' },
  scaling: { de: 'Scaling', en: 'Scaling' },
  leading: { de: 'Leader', en: 'Leading' },
};

/**
 * Client-side fallback state derivation (exact numeric thresholds).
 * The authoritative state is computed server-side by evaluate_monetization_state().
 */
export function deriveUserState(opts: {
  level: number;
  closingRate: number;
  showRate: number;
  revenue: number;
  activityScore: number;
  timeboxProgressPct: number;
  closeRateVariance: number;
  modulesProgress: number;
  callsDone: number;
  daysSinceSignup: number;
  isMentoring: boolean;
}): UserState {
  const {
    level, closingRate, revenue, activityScore,
    timeboxProgressPct, closeRateVariance, modulesProgress,
    callsDone, daysSinceSignup, isMentoring,
  } = opts;

  // Exact thresholds from spec
  if (daysSinceSignup <= 3) return 'new';
  if (revenue >= 10000 && isMentoring && activityScore >= 70) return 'leading';
  if (revenue >= 5000 && closingRate >= 25) return 'scaling';

  const closeThreshold = level >= 4 ? 25 : 20;

  if (closingRate >= closeThreshold && revenue > 0 && activityScore >= 60) return 'performing';
  if (timeboxProgressPct >= 80 && closingRate < closeThreshold && activityScore < 50) return 'stuck';
  if (closeRateVariance > 8) return 'unstable';
  if (modulesProgress >= 40 && activityScore >= 60 && callsDone >= 10) return 'committed';
  if (modulesProgress < 40 && callsDone < 10 && activityScore >= 40) return 'learning';

  return 'new';
}

export function useUserState() {
  const { user, profile } = useAuth();
  const { kpis } = useKpis();
  const { timebox } = useTimebox();
  const [stateData, setStateData] = useState<UserStateData | null>(null);
  const [loading, setLoading] = useState(true);

  const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
  const level = getLevelForStage(stage);

  // Load state from DB (authoritative, set by evaluate_monetization_state)
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    supabase
      .from('user_states' as any)
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as any;
          setStateData({
            current_state: d.current_state,
            previous_state: d.previous_state,
            state_changed_at: d.state_changed_at,
            kpi_trend: d.kpi_trend || 'stable',
            activity_score: d.activity_score || 0,
            close_rate_variance: d.close_rate_variance || 0,
            revenue_30d: d.revenue_30d || 0,
            progress_pct: d.progress_pct || 0,
          });
        }
        setLoading(false);
      });
  }, [user]);

  // Client-side fallback if no DB state yet
  const fallbackState = deriveUserState({
    level,
    closingRate: kpis?.closing_rate ?? 0,
    showRate: kpis?.show_rate ?? 0,
    revenue: kpis?.revenue_closed ?? 0,
    activityScore: stateData?.activity_score ?? 0,
    timeboxProgressPct: timebox?.progress_pct ?? 0,
    closeRateVariance: stateData?.close_rate_variance ?? 0,
    modulesProgress: stateData?.progress_pct ?? 0,
    callsDone: kpis?.calls_handled ?? 0,
    daysSinceSignup: stateData?.activity_score !== undefined ? 999 : 0, // default old user
    isMentoring: false,
  });

  const state: UserState = stateData?.current_state ?? fallbackState;

  return {
    state,
    stateData,
    loading,
    level,
    stateLabel: STATE_LABELS[state],
  };
}
