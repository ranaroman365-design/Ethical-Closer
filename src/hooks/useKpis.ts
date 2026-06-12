import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { MemberKpis } from '@/types/members';

export function useKpis(targetUserId?: string) {
  const { user } = useAuth();
  const userId = targetUserId ?? user?.id;
  const [kpis, setKpis] = useState<MemberKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('member_kpis')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setKpis(data as MemberKpis | null);
        setLoading(false);
      });
  }, [userId]);

  const updateKpi = useCallback(async (field: keyof MemberKpis, value: number) => {
    if (!userId) return;
    const { data } = await supabase
      .from('member_kpis')
      .update({ [field]: value, updated_at: new Date().toISOString() } as any)
      .eq('user_id', userId)
      .select()
      .maybeSingle();
    if (data) setKpis(data as MemberKpis);
  }, [userId]);

  return { kpis, loading, updateKpi };
}
