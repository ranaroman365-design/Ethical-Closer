import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface TimeboxData {
  current_level: number;
  level_started_at: string;
  timebox_weeks: number;
  behind_schedule: boolean;
  booster_active: boolean;
  booster_activated_at: string | null;
  weeks_elapsed: number;
  weeks_remaining: number;
  progress_pct: number;
}

export function useTimebox() {
  const { user } = useAuth();
  const [data, setData] = useState<TimeboxData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    supabase
      .from('user_timebox' as any)
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data: row }) => {
        if (row) {
          const r = row as any;
          const started = new Date(r.level_started_at).getTime();
          const weeksElapsed = (Date.now() - started) / (7 * 24 * 60 * 60 * 1000);
          const remaining = Math.max(r.timebox_weeks - weeksElapsed, 0);
          const pct = Math.min((weeksElapsed / r.timebox_weeks) * 100, 100);

          setData({
            current_level: r.current_level,
            level_started_at: r.level_started_at,
            timebox_weeks: r.timebox_weeks,
            behind_schedule: r.behind_schedule,
            booster_active: r.booster_active,
            booster_activated_at: r.booster_activated_at,
            weeks_elapsed: Math.round(weeksElapsed * 10) / 10,
            weeks_remaining: Math.round(remaining * 10) / 10,
            progress_pct: Math.round(pct),
          });
        }
        setLoading(false);
      });
  }, [user]);

  return { timebox: data, loading };
}
