-- Restart the GHL outbound events sync cron job
-- 1. Unschedule any existing variants of the job to avoid duplicates
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid, jobname FROM cron.job
    WHERE jobname IN ('process-outbound-events', 'process-outbound-events-15min', 'ghl-outbound-sync')
       OR command ILIKE '%process-outbound-events%'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

-- 2. Re-schedule it every 5 minutes (tighter than before so backlog clears fast)
SELECT cron.schedule(
  'process-outbound-events',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/process-outbound-events',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body := jsonb_build_object('triggered_at', now()::text)
  );
  $$
);

-- 3. Fire it ONCE immediately so the 4 pending events ship to GHL right away
SELECT net.http_post(
  url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/process-outbound-events',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
  body := jsonb_build_object('triggered_at', now()::text, 'manual', true)
);