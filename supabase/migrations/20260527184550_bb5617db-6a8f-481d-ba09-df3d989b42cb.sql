-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule prior version if present
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'apply-nurture-process-hourly';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'apply-nurture-process-hourly',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/apply-nurture-process',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('source','pg_cron')
  );
  $$
);
