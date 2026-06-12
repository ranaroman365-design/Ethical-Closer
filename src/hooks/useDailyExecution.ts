import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { resolveAppointmentIdForCall, markCallAttended, markCallNoShow } from '@/lib/attendance';

export interface DailyTask {
  id: string;
  user_id: string;
  role: string;
  task_type: string;
  task_title: string;
  task_description: string | null;
  task_status: string;
  priority: number;
  due_date: string;
  related_id: string | null;
  related_table: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CallOutcome {
  id: string;
  user_id: string;
  call_id: string | null;
  outcome: string;
  deal_value: number;
  sold_offer: string | null;
  lost_reason: string | null;
  comment: string | null;
  reschedule_planned: boolean | null;
  self_rating: number | null;
  improvement_note: string | null;
  created_at: string;
}

export interface DailyReflection {
  id: string;
  user_id: string;
  reflection_date: string;
  worked_well: string;
  did_not_work: string;
  improve_tomorrow: string;
  created_at: string;
}

export interface QualificationCheck {
  id: string;
  user_id: string;
  lead_id: string | null;
  appointment_id: string | null;
  need_confirmed: boolean;
  budget_confirmed: boolean;
  timing_confirmed: boolean;
  decision_maker_confirmed: boolean;
  purpose_clear: boolean;
  appointment_confirmed: boolean;
  qualification_score: number;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

export const LOST_REASONS = [
  { value: 'price', label: 'Preis', labelEn: 'Price' },
  { value: 'no_trust', label: 'Kein Vertrauen', labelEn: 'No trust' },
  { value: 'no_need', label: 'Kein Bedarf', labelEn: 'No need' },
  { value: 'bad_timing', label: 'Falsches Timing', labelEn: 'Bad timing' },
  { value: 'no_fit', label: 'Falscher Fit', labelEn: 'Wrong fit' },
  { value: 'bad_call', label: 'Schlechte Gesprächsführung', labelEn: 'Poor call execution' },
  { value: 'no_authority', label: 'Keine Entscheidungskompetenz', labelEn: 'No decision authority' },
  { value: 'no_show', label: 'Nicht erschienen', labelEn: 'No show' },
  { value: 'other', label: 'Sonstiges', labelEn: 'Other' },
] as const;

export const WIN_REASONS = [
  { value: 'clear_pain', label: 'Klarer Schmerz', labelEn: 'Clear pain point' },
  { value: 'trust_built', label: 'Vertrauen aufgebaut', labelEn: 'Trust built' },
  { value: 'good_leadership', label: 'Gute Führung', labelEn: 'Good leadership' },
  { value: 'right_timing', label: 'Richtiger Zeitpunkt', labelEn: 'Right timing' },
  { value: 'strong_fit', label: 'Starker Closer Fit', labelEn: 'Strong closer fit' },
] as const;

export function useDailyExecution() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [outcomes, setOutcomes] = useState<CallOutcome[]>([]);
  const [reflection, setReflection] = useState<DailyReflection | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [tasksRes, outcomesRes, reflectionRes] = await Promise.all([
      supabase.from('daily_tasks').select('*').eq('user_id', user.id).eq('due_date', today).order('priority', { ascending: true }),
      supabase.from('call_outcomes').select('*').eq('user_id', user.id).gte('created_at', `${today}T00:00:00`).order('created_at', { ascending: false }),
      supabase.from('daily_reflections').select('*').eq('user_id', user.id).eq('reflection_date', today).maybeSingle(),
    ]);

    setTasks((tasksRes.data ?? []) as DailyTask[]);
    setOutcomes((outcomesRes.data ?? []) as CallOutcome[]);
    setReflection(reflectionRes.data as DailyReflection | null);
    setLoading(false);
  }, [user?.id, today]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const completeTask = useCallback(async (taskId: string) => {
    if (!user?.id) return;
    await supabase.from('daily_tasks').update({ task_status: 'done', completed_at: new Date().toISOString() }).eq('id', taskId).eq('user_id', user.id);
    await fetchAll();
  }, [user?.id, fetchAll]);

  const submitOutcome = useCallback(async (data: Omit<CallOutcome, 'id' | 'user_id' | 'created_at'>) => {
    if (!user?.id) return;
    await supabase.from('call_outcomes').insert({ ...data, user_id: user.id });

    // Canonical attendance write — DB trigger emits `showed` event exactly once.
    // Never block UI on attendance errors.
    try {
      const callId = (data as any).call_id as string | undefined;
      if (callId && (data.outcome === 'won' || data.outcome === 'lost')) {
        const aptId = await resolveAppointmentIdForCall(callId);
        if (aptId) await markCallAttended(aptId);
      } else if (callId && data.outcome === 'no_show') {
        const aptId = await resolveAppointmentIdForCall(callId);
        if (aptId) await markCallNoShow(aptId);
      }
    } catch (e) {
      console.warn('[attendance] submitOutcome attendance hook failed:', e);
    }

    await fetchAll();
  }, [user?.id, fetchAll]);

  const submitReflection = useCallback(async (data: { worked_well: string; did_not_work: string; improve_tomorrow: string }) => {
    if (!user?.id) return;
    await supabase.from('daily_reflections').upsert({
      user_id: user.id,
      reflection_date: today,
      ...data,
    }, { onConflict: 'user_id,reflection_date' });
    await fetchAll();
  }, [user?.id, today, fetchAll]);

  const submitQualification = useCallback(async (data: Omit<QualificationCheck, 'id' | 'user_id' | 'qualification_score' | 'created_at'>) => {
    if (!user?.id) return;
    const { error } = await supabase.from('qualification_checks').insert({ ...data, user_id: user.id, completed_at: new Date().toISOString() });
    return !error;
  }, [user?.id]);

  const pendingTasks = tasks.filter(t => t.task_status === 'pending');
  const doneTasks = tasks.filter(t => t.task_status === 'done');

  return {
    tasks, pendingTasks, doneTasks, outcomes, reflection,
    loading, completeTask, submitOutcome, submitReflection, submitQualification, refetch: fetchAll,
  };
}
