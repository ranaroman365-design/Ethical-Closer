import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { deriveLeadQuality } from '@/lib/canonical-decision-engine';

export interface ManualLeadData {
  full_name: string;
  email: string;
  phone: string;
  funnel_subsource: string;
  current_income_range: string;
  goal: string;
  commitment_level: number;
}

interface UseManualLeadEntryReturn {
  submitLead: (data: ManualLeadData) => Promise<{ leadId: string } | null>;
  checkDuplicate: (email: string) => Promise<{ exists: boolean; leadId?: string; name?: string }>;
  isSubmitting: boolean;
  manualLeadRatio: number | null;
  loadManualLeadRatio: () => Promise<void>;
}

export function useManualLeadEntry(): UseManualLeadEntryReturn {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualLeadRatio, setManualLeadRatio] = useState<number | null>(null);

  const checkDuplicate = async (email: string) => {
    const { data } = await supabase
      .from('leads')
      .select('id, name')
      .eq('email', email.trim().toLowerCase())
      .limit(1);

    if (data && data.length > 0) {
      return { exists: true, leadId: data[0].id, name: (data[0] as any).name ?? undefined };
    }
    return { exists: false };
  };

  const submitLead = async (data: ManualLeadData): Promise<{ leadId: string } | null> => {
    if (!user) {
      toast({ title: 'Fehler', description: 'Nicht authentifiziert.', variant: 'destructive' });
      return null;
    }

    setIsSubmitting(true);
    try {
      const qualificationData = {
        current_income_range: data.current_income_range,
        goal: data.goal,
        commitment_level: data.commitment_level,
        source: 'manual_qualification',
      };

      const userLevel = (profile as any)?.level ?? 0;

      // 1. Create lead (using rpc-style insert to handle types)
      const leadPayload: Record<string, unknown> = {
        name: data.full_name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        source: 'manual',
        source_funnel: 'manual',
        quiz_funnel_source: data.funnel_subsource,
        origin_type: 'manual',
        stage: 'qualified',
        lead_status: 'qualified_manual',
        conversion_state: 'engaged',
        created_by: user.id,
        owner_id: user.id,
        owner_role: userLevel >= 4 ? 'closer' : 'setter',
        setter_id: userLevel < 4 ? user.id : null,
        qualification_checklist: qualificationData,
        qualification_score: Math.round(data.commitment_level * 10),
        qualification_bucket: data.commitment_level >= 7 ? 'high' : data.commitment_level >= 4 ? 'medium' : 'low',
        lead_quality: deriveLeadQuality({ qualification_score: Math.round(data.commitment_level * 10) }),
        is_simulation: false,
      };

      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert(leadPayload as any)
        .select('id')
        .single();

      if (leadError) throw leadError;
      const leadId = (lead as any).id as string;

      // 2. Write to lead_state_log (canonical state machine audit)
      await supabase.from('lead_state_log').insert({
        lead_id: leadId,
        from_state: null,
        to_state: 'engaged',
        event: 'lead_created',
        triggered_by: user.id,
        metadata: {
          manual: true,
          subsource: data.funnel_subsource,
          created_by: user.id,
          qualification: qualificationData,
        },
      });

      // 3. Write to event_logs
      await supabase.from('event_logs').insert({
        event_name: 'lead_created',
        email: data.email.trim().toLowerCase(),
        payload: {
          manual: true,
          lead_id: leadId,
          subsource: data.funnel_subsource,
          created_by: user.id,
        },
      });

      // 4. Write funnel_events
      await (supabase.from('funnel_events') as any).insert([
        { lead_id: leadId, event_type: 'manual_created', source: 'manual', origin_type: 'manual' },
        { lead_id: leadId, event_type: 'qualified_manual', source: 'manual', origin_type: 'manual' },
      ]);

      toast({ title: 'Lead erstellt', description: `${data.full_name} wurde erfolgreich hinzugefügt.` });
      return { leadId };
    } catch (err: any) {
      console.error('Manual lead creation failed:', err);
      toast({ title: 'Fehler', description: err.message || 'Lead konnte nicht erstellt werden.', variant: 'destructive' });
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadManualLeadRatio = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString();

    const [{ count: totalCount }, { count: manualCount }] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', since),
      supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', since).eq('source', 'manual'),
    ]);

    if (totalCount && totalCount > 0 && manualCount !== null) {
      setManualLeadRatio(manualCount / totalCount);
    } else {
      setManualLeadRatio(0);
    }
  };

  return { submitLead, checkDuplicate, isSubmitting, manualLeadRatio, loadManualLeadRatio };
}
