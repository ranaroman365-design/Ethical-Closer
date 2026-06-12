import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface EscalationAlert {
  id: string;
  alert_type: string;
  severity: string;
  target_role: string;
  title: string;
  description: string;
  source_entity_id: string | null;
  source_entity_type: string | null;
  metadata: Record<string, any>;
  status: string;
  created_at: string;
}

export function useEscalationAlerts() {
  const { user, profile } = useAuth();
  const [alerts, setAlerts] = useState<EscalationAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const stage = (profile as any)?.business_stage;
  const isDirectorOrAbove = ['director', 'partner'].includes(stage);

  useEffect(() => {
    if (!user || !isDirectorOrAbove) { setLoading(false); return; }

    supabase
      .from('escalation_alerts' as any)
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setAlerts((data as any as EscalationAlert[]) ?? []);
        setLoading(false);
      });
  }, [user, isDirectorOrAbove]);

  const resolve = useCallback(async (alertId: string) => {
    await supabase
      .from('escalation_alerts' as any)
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: user?.id } as any)
      .eq('id', alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  }, [user]);

  return { alerts, loading, resolve, isDirectorOrAbove };
}
