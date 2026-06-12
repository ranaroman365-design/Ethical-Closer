import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/* ─── XP values per action ─── */
export const XP_VALUES: Record<string, number> = {
  login: 1,
  lesson_complete: 5,
  quiz_correct: 10,
  lead_handled: 15,
  appointment_set: 25,
  call_completed: 30,
  deal_closed: 100,
  mentee_promoted: 50,
  certification_passed: 75,
};

/* ─── Career step thresholds mapped to stages ─── */
export const LEVELS = [
  { level: 0, label: 'Bewerber', stage: 'prospect', minXp: 0 },
  { level: 1, label: 'Trainee (Opener)', stage: 'opener', minXp: 25 },
  { level: 2, label: 'Associate Setter', stage: 'setter', minXp: 100 },
  { level: 3, label: 'Senior Setter', stage: 'senior_associate', minXp: 300 },
  { level: 4, label: 'Closer (Placement Track)', stage: 'junior_manager', minXp: 600 },
  { level: 5, label: 'Managing Closer', stage: 'manager', minXp: 1200 },
  { level: 6, label: 'Senior Closer', stage: 'senior_manager', minXp: 2500 },
  { level: 7, label: 'Director', stage: 'director', minXp: 5000 },
  { level: 8, label: 'Partner', stage: 'partner', minXp: 10000 },
  { level: 9, label: 'Admin', stage: 'admin', minXp: 99999 },
];

export function getLevelForXp(totalXp: number) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (totalXp >= lvl.minXp) current = lvl;
    else break;
  }
  const nextLevel = LEVELS.find(l => l.level === current.level + 1);
  const progressInLevel = nextLevel ? ((totalXp - current.minXp) / (nextLevel.minXp - current.minXp)) * 100 : 100;
  return { ...current, nextLevel, progressInLevel: Math.min(100, Math.round(progressInLevel)), totalXp };
}

export function useXp() {
  const { user } = useAuth();

  const awardXp = useCallback(async (action: string, metadata?: Record<string, any>) => {
    if (!user) return;
    const amount = XP_VALUES[action] ?? 0;
    if (amount <= 0) return;

    // Award XP via SECURITY DEFINER RPC — server validates action + amount
    const { error: xpError } = await supabase.rpc('award_xp' as any, {
      p_action: action,
      p_metadata: metadata ?? {},
    });
    if (xpError) {
      console.error('[useXp] award_xp failed:', xpError);
      return;
    }

    // Update streak
    const today = new Date().toISOString().slice(0, 10);
    const { data: streak } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!streak) {
      await supabase.from('user_streaks').insert({
        user_id: user.id,
        current_streak: 1,
        longest_streak: 1,
        last_activity_date: today,
      } as any);
    } else {
      const lastDate = (streak as any).last_activity_date;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      
      if (lastDate === today) return;
      
      const newStreak = lastDate === yesterday ? (streak as any).current_streak + 1 : 1;
      const newLongest = Math.max(newStreak, (streak as any).longest_streak);
      
      await supabase.from('user_streaks').update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_activity_date: today,
        updated_at: new Date().toISOString(),
      } as any).eq('user_id', user.id);
    }
  }, [user]);

  return { awardXp };
}
