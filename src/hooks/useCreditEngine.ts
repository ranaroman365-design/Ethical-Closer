import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export type CreditType = 'post' | 'comment' | 'like_received' | 'login' | 'call' | 'top_answer';

export interface CreditProfile {
  credit_level: number;
  credits_balance: number;
  posts_count: number;
  comments_count: number;
  calls_count: number;
  top_answers_count: number;
}

export interface NextLevelRequirement {
  level: number;
  credits: number;
  posts: number;
  comments: number;
  calls: number;
  top_answers?: number;
}

const LEVEL_REQUIREMENTS: NextLevelRequirement[] = [
  { level: 1, credits: 50,   posts: 1,  comments: 1,  calls: 0 },
  { level: 2, credits: 150,  posts: 3,  comments: 10, calls: 1 },
  { level: 3, credits: 300,  posts: 5,  comments: 20, calls: 2, top_answers: 1 },
  { level: 4, credits: 600,  posts: 8,  comments: 30, calls: 3 },
  { level: 5, credits: 1200, posts: 10, comments: 50, calls: 5 },
  { level: 6, credits: 2500, posts: 15, comments: 80, calls: 10 },
];

export interface NextAction {
  key: string;
  label: string;
  reward: number;
  href?: string;
}

export function getNextLevelRequirement(level: number): NextLevelRequirement | null {
  return LEVEL_REQUIREMENTS.find(r => r.level === level + 1) ?? null;
}

export function computeNextActions(p: CreditProfile, lang: 'de' | 'en' = 'de'): NextAction[] {
  const next = getNextLevelRequirement(p.credit_level);
  if (!next) return [];

  const t = (de: string, en: string) => (lang === 'de' ? de : en);
  const actions: NextAction[] = [];

  if (p.posts_count < next.posts) {
    actions.push({
      key: 'post',
      label: t(`Schreibe einen Beitrag (+5 Credits)`, `Write a post (+5 credits)`),
      reward: 5,
      href: '/members/community',
    });
  }
  if (p.comments_count < next.comments) {
    actions.push({
      key: 'comment',
      label: t(`Schreibe einen Kommentar (+2 Credits)`, `Write a comment (+2 credits)`),
      reward: 2,
      href: '/members/community',
    });
  }
  if (p.calls_count < next.calls) {
    actions.push({
      key: 'call',
      label: t(`Nimm an einem Call teil (+15 Credits)`, `Join a call (+15 credits)`),
      reward: 15,
      href: '/members/calendar',
    });
  }
  if (next.top_answers && p.top_answers_count < next.top_answers) {
    actions.push({
      key: 'top_answer',
      label: t(`Erhalte eine Top-Antwort (+10 Credits)`, `Earn a Top Answer (+10 credits)`),
      reward: 10,
      href: '/members/community',
    });
  }
  if (p.credits_balance < next.credits) {
    actions.push({
      key: 'credits',
      label: t(`Sammle weitere Credits durch Aktivität`, `Earn more credits through activity`),
      reward: 0,
    });
  }

  return actions.slice(0, 3);
}

export function useCreditEngine() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<CreditProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return; }
    const { data } = await supabase
      .from('profiles')
      .select('credit_level, credits_balance, posts_count, comments_count, calls_count, top_answers_count')
      .eq('id', user.id)
      .single();
    if (data) setProfile(data as CreditProfile);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: re-fetch on credit log inserts
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`credits-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'user_credit_log',
        filter: `user_id=eq.${user.id}`,
      }, () => { refresh(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refresh]);

  const award = useCallback(async (type: CreditType, referenceId?: string, note?: string) => {
    if (!user) return null;
    const prevLevel = profile?.credit_level ?? 0;
    const { data, error } = await supabase.rpc('award_credits', {
      _type: type,
      _reference: referenceId ?? null,
      _note: note ?? null,
    } as any);
    if (error) return null;
    const result = data as { ok: boolean; awarded?: number; new_level?: number; capped?: boolean };
    if (result?.ok && (result.awarded ?? 0) > 0) {
      toast.success(`+${result.awarded} Credits`, { duration: 1800 });
      if (result.new_level !== undefined && result.new_level > prevLevel) {
        toast.success(`🎉 Level Up — L${result.new_level}`, { duration: 4000 });
      }
    }
    await refresh();
    return result;
  }, [user, profile, refresh]);

  return { profile, loading, refresh, award, nextRequirement: profile ? getNextLevelRequirement(profile.credit_level) : null };
}
