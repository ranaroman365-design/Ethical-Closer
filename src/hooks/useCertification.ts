import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CertificationData {
  user_id: string;
  current_level: string;
  theory_score: number;
  theory_verified: boolean;
  simulation_score: number;
  simulation_avg: number;
  simulation_attempts: number;
  realtime_pass_count: number;
  realtime_verified: boolean;
  kpi_total_calls: number;
  kpi_deals_closed: number;
  kpi_revenue: number;
  kpi_conversion_rate: number;
  kpi_verified: boolean;
  final_score: number;
  percentile_rank: number;
  certification_title: string;
  certified_at: string | null;
  admin_override: boolean;
  pdf_export_available: boolean;
  updated_at: string | null;
}

export function useCertification(targetUserId?: string) {
  const { user } = useAuth();
  const userId = targetUserId ?? user?.id;
  const [cert, setCert] = useState<CertificationData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('certification_status')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    setCert(data as CertificationData | null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const recalculate = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('recalculate_certification', { p_user_id: userId });
    if (!error) await load();
    setLoading(false);
    return data;
  }, [userId, load]);

  return { cert, loading, recalculate, reload: load };
}
