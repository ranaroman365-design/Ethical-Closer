import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface RadiantTrigger {
  id: string;
  trigger_type: string;
  trigger_reason: string;
  dismissed: boolean;
  activated_at: string;
  metadata: Record<string, any>;
}

export function useRadiantTrigger() {
  const { user } = useAuth();
  const [triggers, setTriggers] = useState<RadiantTrigger[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    supabase
      .from('radiant_triggers' as any)
      .select('*')
      .eq('user_id', user.id)
      .eq('dismissed', false)
      .gt('expires_at', new Date().toISOString())
      .order('activated_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        setTriggers((data as any as RadiantTrigger[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  const dismiss = useCallback(async (triggerId: string) => {
    await supabase
      .from('radiant_triggers' as any)
      .update({ dismissed: true, dismissed_at: new Date().toISOString() } as any)
      .eq('id', triggerId);
    setTriggers(prev => prev.filter(t => t.id !== triggerId));
  }, []);

  return { triggers, activeTrigger: triggers[0] ?? null, loading, dismiss };
}
