import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface StreakData {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  last_action_type: string | null;
  week_actions: Record<string, number>;
}

// Columns: id, user_id, current_streak, longest_streak, last_activity_date,
// last_active_date, last_action_type, week_actions, week_start, total_actions, updated_at

export function useStreak() {
  const { user } = useAuth();
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    supabase
      .from('user_streaks')
      .select('current_streak, longest_streak, last_active_date, last_action_type, week_actions')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data;
          setStreak({
            current_streak: d.current_streak ?? 0,
            longest_streak: d.longest_streak ?? 0,
            last_active_date: d.last_active_date,
            last_action_type: d.last_action_type,
            week_actions: (d.week_actions as Record<string, number> | null) ?? {},
          });
        }
        setLoading(false);
      });
  }, [user]);

  const recordActivity = useCallback(async (actionType: string) => {
    if (!user) return;

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

    const lastDate = streak?.last_active_date;
    let newStreak = streak?.current_streak ?? 0;

    if (lastDate === today) {
      // Already active today — no streak change
    } else if (lastDate === yesterday || lastDate === twoDaysAgo) {
      newStreak += 1;
    } else {
      newStreak = 1; // Reset — gap > 48h
    }

    const longestStreak = Math.max(newStreak, streak?.longest_streak ?? 0);

    // Update week_actions counter
    const weekActions = { ...(streak?.week_actions ?? {}) };
    weekActions[actionType] = (weekActions[actionType] ?? 0) + 1;

    const payload = {
      user_id: user.id,
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_active_date: today,
      last_action_type: actionType,
      week_actions: weekActions as unknown as import('@/integrations/supabase/types').Json,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('user_streaks')
      .upsert(payload, { onConflict: 'user_id' });

    setStreak({
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_active_date: today,
      last_action_type: actionType,
      week_actions: weekActions,
    });
  }, [user, streak]);

  return { streak, loading, recordActivity };
}
