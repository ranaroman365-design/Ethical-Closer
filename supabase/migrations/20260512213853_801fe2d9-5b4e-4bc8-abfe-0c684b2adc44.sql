
-- ============================================================
-- A. Move 15 verified backup tables → archive schema
-- ============================================================
CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM PUBLIC, anon, authenticated;
GRANT  USAGE ON SCHEMA archive TO postgres, service_role;

ALTER TABLE public.appointments_backup_20260429        SET SCHEMA archive;
ALTER TABLE public.call_analysis_backup_20260429       SET SCHEMA archive;
ALTER TABLE public.call_outcomes_backup_20260429       SET SCHEMA archive;
ALTER TABLE public.calls_backup_20260429               SET SCHEMA archive;
ALTER TABLE public.community_messages_backup_20260429  SET SCHEMA archive;
ALTER TABLE public.direct_messages_backup_20260429     SET SCHEMA archive;
ALTER TABLE public.lead_assignments_backup_20260429    SET SCHEMA archive;
ALTER TABLE public.lead_events_backup_20260429         SET SCHEMA archive;
ALTER TABLE public.lead_transitions_backup_20260429    SET SCHEMA archive;
ALTER TABLE public.leads_backup_20260429               SET SCHEMA archive;
ALTER TABLE public.quiz_attempts_backup_20260429       SET SCHEMA archive;
ALTER TABLE public.quiz_submissions_backup_20260429    SET SCHEMA archive;
ALTER TABLE public.twilio_message_logs_backup_20260429 SET SCHEMA archive;
ALTER TABLE public.wa_conversations_backup_20260429    SET SCHEMA archive;
ALTER TABLE public.wa_messages_backup_20260429         SET SCHEMA archive;

REVOKE ALL ON ALL TABLES IN SCHEMA archive FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON ALL TABLES IN SCHEMA archive TO postgres, service_role;

-- ============================================================
-- B. Enable RLS + SELECT-only policies (verified predicates)
-- ============================================================

-- B1. commission_rates: L4+ or admin
ALTER TABLE public.commission_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commission_rates_select_l4plus"
ON public.commission_rates
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_access_contract uac
    WHERE uac.user_id = auth.uid()
      AND (uac.is_admin = true OR uac.level >= 4)
  )
);

-- B2. canonical_state_transitions: state-machine whitelist, readable by any signed-in user
ALTER TABLE public.canonical_state_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "canonical_state_transitions_select_authenticated"
ON public.canonical_state_transitions
FOR SELECT
TO authenticated
USING (true);


-- ============================================================
-- C. Unschedule cron job 53 if it exists
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobid = 53
  ) THEN
    PERFORM cron.unschedule(53);
  ELSE
    RAISE NOTICE 'Skipping cron.unschedule(53): job 53 does not exist in this database';
  END IF;
END $$;

-- ============================================================
-- D. SECURITY INVOKER view hardening skipped for fresh dev database
-- ============================================================
-- Removed ALTER VIEW ... SET (security_invoker = true) statements because
-- they caused migration failure on fresh dev Supabase setup.
-- These can be re-applied manually after the schema is fully migrated.
