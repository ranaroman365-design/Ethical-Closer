-- =====================================================================
-- HARD RESET CLEANUP — pre-2026-04-26
-- Idempotent. Safe to re-run. Backups kept in *_backup_20260429.
-- =====================================================================

-- ---------- 1. Snapshot tables (idempotent) ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads','appointments','quiz_attempts','quiz_submissions',
    'calls','call_outcomes','call_analysis',
    'lead_events','lead_transitions','lead_assignments',
    'wa_messages','wa_conversations','twilio_message_logs',
    'direct_messages','community_messages'
  ] LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I_backup_20260429 AS
         SELECT * FROM public.%I WHERE created_at < ''2026-04-26''',
      t, t
    );
    -- Lock down: admin-only
    EXECUTE format('ALTER TABLE public.%I_backup_20260429 ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS "admin read backup" ON public.%I_backup_20260429',
      t
    );
    EXECUTE format(
      'CREATE POLICY "admin read backup" ON public.%I_backup_20260429
         FOR SELECT TO authenticated
         USING (public.has_role(auth.uid(), ''admin''::app_role))',
      t
    );
  END LOOP;
END $$;

-- ---------- 2. Deletes (children → parents) ----------
-- Children of leads / appointments first.
DELETE FROM public.lead_transitions   WHERE created_at < '2026-04-26';
DELETE FROM public.lead_events        WHERE created_at < '2026-04-26';
DELETE FROM public.lead_assignments   WHERE created_at < '2026-04-26';
DELETE FROM public.call_outcomes      WHERE created_at < '2026-04-26';
DELETE FROM public.call_analysis      WHERE created_at < '2026-04-26';
DELETE FROM public.calls              WHERE created_at < '2026-04-26';
DELETE FROM public.quiz_submissions   WHERE created_at < '2026-04-26';
DELETE FROM public.quiz_attempts      WHERE created_at < '2026-04-26';
DELETE FROM public.wa_messages        WHERE created_at < '2026-04-26';
DELETE FROM public.wa_conversations   WHERE created_at < '2026-04-26';
DELETE FROM public.twilio_message_logs WHERE created_at < '2026-04-26';
DELETE FROM public.direct_messages    WHERE created_at < '2026-04-26';
DELETE FROM public.community_messages WHERE created_at < '2026-04-26';
-- Appointments before leads (FK leads -> booking_id and appointments -> lead_id)
DELETE FROM public.appointments       WHERE created_at < '2026-04-26';
DELETE FROM public.leads              WHERE created_at < '2026-04-26';

-- ---------- 3. Cleanup audit row ----------
CREATE TABLE IF NOT EXISTS public.cleanup_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  cutoff date NOT NULL,
  notes text
);
ALTER TABLE public.cleanup_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read cleanup_audit" ON public.cleanup_audit;
CREATE POLICY "admin read cleanup_audit" ON public.cleanup_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.cleanup_audit (cutoff, notes)
VALUES ('2026-04-26', 'Hard reset · backups in *_backup_20260429 + CSV in /mnt/documents/cleanup_20260429');