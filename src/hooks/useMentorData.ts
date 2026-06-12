import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface MenteeInfo {
  id: string;
  full_name: string | null;
  email: string | null;
  business_stage: string;
  certified: boolean;
  kpis: {
    closing_rate: number | null;
    show_rate: number | null;
    calls_per_week: number | null;
    storno_rate: number | null;
    qualification_accuracy: number | null;
  } | null;
}

export function useMentorData() {
  const { user, profile, isAdmin } = useAuth();
  const [mentees, setMentees] = useState<MenteeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMentor, setIsMentor] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const stage = (profile as any)?.business_stage || 'opener';
    // Mentors are L3 (senior_associate) or L5 (manager)
    const mentorStages = ['senior_associate', 'manager', 'senior_manager', 'director', 'partner'];
    if (!mentorStages.includes(stage) && !isAdmin) {
      setIsMentor(false);
      setLoading(false);
      return;
    }

    setIsMentor(true);

    (async () => {
      const { data: assignments } = await supabase
        .from('mentor_assignments')
        .select('mentee_id')
        .eq('mentor_id', user.id)
        .eq('active', true);

      if (!assignments?.length) { setLoading(false); return; }

      const menteeIds = assignments.map((a: any) => a.mentee_id);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, business_stage, certified')
        .in('id', menteeIds);

      const { data: kpisData } = await supabase
        .from('member_kpis')
        .select('user_id, closing_rate, show_rate, calls_per_week, storno_rate, qualification_accuracy')
        .in('user_id', menteeIds);

      const kpisMap = new Map((kpisData ?? []).map((k: any) => [k.user_id, k]));

      const result: MenteeInfo[] = (profiles ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        business_stage: p.business_stage,
        certified: p.certified,
        kpis: kpisMap.get(p.id) ?? null,
      }));

      setMentees(result);
      setLoading(false);
    })();
  }, [user, profile, isAdmin]);

  return { mentees, loading, isMentor };
}
