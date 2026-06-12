-- 1. Trigger: appointments.call_completed_at -> calls.status='completed'
-- Findet/erstellt den passenden calls-Eintrag und schließt ihn ab.
CREATE OR REPLACE FUNCTION public.sync_appointment_completion_to_calls()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_id uuid;
BEGIN
  -- Nur reagieren, wenn call_completed_at neu gesetzt wird
  IF NEW.call_completed_at IS NOT NULL
     AND (OLD.call_completed_at IS DISTINCT FROM NEW.call_completed_at) THEN

    -- Versuche existierenden Call zum Lead/Setter zu finden (jüngsten offenen)
    SELECT c.id INTO v_call_id
    FROM public.calls c
    WHERE c.pipeline_id = NEW.lead_id::text
       OR (c.user_id = NEW.setter_id AND c.scheduled_for = NEW.starts_at)
    ORDER BY c.created_at DESC
    LIMIT 1;

    IF v_call_id IS NOT NULL THEN
      UPDATE public.calls
      SET status = 'completed',
          closed_at = COALESCE(closed_at, NEW.call_completed_at)
      WHERE id = v_call_id
        AND status NOT IN ('completed', 'closed');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appointment_completion ON public.appointments;
CREATE TRIGGER trg_sync_appointment_completion
AFTER UPDATE OF call_completed_at ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.sync_appointment_completion_to_calls();

-- 2. Cron-Jobs für die nachgelagerte Pipeline
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Entferne ggf. existierende Versionen (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
  WHERE jobname IN ('etc_outcome_fallback_hourly','etc_aggregate_patterns_6h','etc_process_pending_analyses_5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Outcome-Fallback: stündlich
SELECT cron.schedule(
  'etc_outcome_fallback_hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/outcome-fallback',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Pattern Engine Aggregation: alle 6h
SELECT cron.schedule(
  'etc_aggregate_patterns_6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/aggregate-call-patterns',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Pending-Analysen Worker: alle 5 Minuten (verarbeitet die queue, die durch trg_enqueue_call_analysis befüllt wird)
SELECT cron.schedule(
  'etc_process_pending_analyses_5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/process-pending-analyses',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);