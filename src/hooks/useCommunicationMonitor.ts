import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DryRunResult {
  would_send: number;
  skipped_duplicate: number;
  skipped_outside_window: number;
  skipped_no_consent: number;
  skipped_no_contact: number;
  details: Array<{
    appointment_id: string;
    lead_id: string;
    template: string;
    action: 'would_send' | 'skipped_duplicate' | 'skipped_outside_window' | 'skipped_no_consent' | 'skipped_no_contact';
    reason?: string;
  }>;
}

export interface DuplicateReport {
  duplicate_emails: Array<{
    recipient_email: string;
    template_name: string;
    appointment_id: string | null;
    count: number;
    message_ids: string[];
  }>;
  duplicate_reminders: Array<{
    appointment_id: string;
    stage: string;
    count: number;
  }>;
  duplicate_noshow_recovery: Array<{
    appointment_id: string;
    count: number;
  }>;
  failed_sends: number;
  retries: number;
  skipped_duplicates: number;
  period_start: string;
  period_end: string;
}

export function useCommunicationMonitor() {
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('communication-monitor', {
        body: { mode: 'report' },
      });
      if (fnError) throw fnError;
      setReport(data?.report ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDryRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Dry-run: simulate reminder cron without sending
      const now = new Date();
      const windowStart = new Date(now.getTime() + 25 * 60_000).toISOString();
      const windowEnd = new Date(now.getTime() + 35 * 60_000).toISOString();

      // Fetch appointments that would be reminded
      const { data: upcoming } = await supabase
        .from('appointments')
        .select('id, lead_id, setter_id, starts_at, setter_reminder_sent_at, appointment_status')
        .in('appointment_status', ['booked', 'scheduled', 'confirmed'])
        .gte('starts_at', windowStart)
        .lte('starts_at', new Date(now.getTime() + 120 * 60_000).toISOString())
        .limit(50);

      const result: DryRunResult = {
        would_send: 0,
        skipped_duplicate: 0,
        skipped_outside_window: 0,
        skipped_no_consent: 0,
        skipped_no_contact: 0,
        details: [],
      };

      for (const apt of upcoming ?? []) {
        const startsAt = new Date(apt.starts_at);
        const minsUntil = (startsAt.getTime() - now.getTime()) / 60_000;

        if (apt.setter_reminder_sent_at) {
          result.skipped_duplicate++;
          result.details.push({
            appointment_id: apt.id,
            lead_id: apt.lead_id ?? '',
            template: 'setter_reminder_30m',
            action: 'skipped_duplicate',
            reason: 'Already sent',
          });
        } else if (minsUntil < 25 || minsUntil > 35) {
          result.skipped_outside_window++;
          result.details.push({
            appointment_id: apt.id,
            lead_id: apt.lead_id ?? '',
            template: 'setter_reminder_30m',
            action: 'skipped_outside_window',
            reason: `${Math.round(minsUntil)}min until start`,
          });
        } else {
          // Check lead has contact info
          if (apt.lead_id) {
            const { data: lead } = await supabase
              .from('leads')
              .select('email, phone')
              .eq('id', apt.lead_id)
              .single();

            if (!lead?.email && !lead?.phone) {
              result.skipped_no_contact++;
              result.details.push({
                appointment_id: apt.id,
                lead_id: apt.lead_id,
                template: 'setter_reminder_30m',
                action: 'skipped_no_contact',
              });
            } else {
              result.would_send++;
              result.details.push({
                appointment_id: apt.id,
                lead_id: apt.lead_id,
                template: 'setter_reminder_30m',
                action: 'would_send',
              });
            }
          } else {
            result.skipped_no_contact++;
            result.details.push({
              appointment_id: apt.id,
              lead_id: '',
              template: 'setter_reminder_30m',
              action: 'skipped_no_contact',
              reason: 'No lead_id',
            });
          }
        }
      }

      setDryRun(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { report, dryRun, loading, error, fetchReport, fetchDryRun };
}
