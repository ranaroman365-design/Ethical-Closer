
CREATE OR REPLACE FUNCTION public.tg_calls_sync_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt_id uuid;
  v_completed_at timestamptz;
  v_event_name text;
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (NEW.result IS NOT DISTINCT FROM OLD.result)
       AND (NEW.closed_at IS NOT DISTINCT FROM OLD.closed_at)
       AND (NEW.status IS NOT DISTINCT FROM OLD.status) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF COALESCE(NEW.is_simulation, false) THEN
    RETURN NEW;
  END IF;

  IF NEW.result IS NOT NULL AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;

  IF NEW.result IS NULL AND NEW.closed_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_completed_at := COALESCE(NEW.closed_at, now());

  SELECT a.id INTO v_appt_id
  FROM public.appointments a
  WHERE a.lead_id = NEW.user_id
    AND a.appointment_status NOT IN ('superseded','cancelled')
  ORDER BY a.starts_at DESC NULLS LAST, a.created_at DESC
  LIMIT 1;

  IF v_appt_id IS NOT NULL THEN
    UPDATE public.appointments
       SET attendance_flag    = CASE WHEN NEW.result = 'no_show' THEN false ELSE true END,
           call_completed_at  = COALESCE(call_completed_at, v_completed_at),
           call_status        = CASE WHEN NEW.result = 'no_show' THEN 'no_show' ELSE 'completed' END,
           outcome            = COALESCE(outcome,
             CASE NEW.result
               WHEN 'won'     THEN 'won'
               WHEN 'lost'    THEN 'showed'
               WHEN 'no_show' THEN 'no_show'
               ELSE 'showed'
             END),
           updated_at         = now()
     WHERE id = v_appt_id
       AND (
         attendance_flag IS DISTINCT FROM (NEW.result <> 'no_show')
         OR call_completed_at IS NULL
         OR call_status NOT IN ('completed','no_show')
       );
  END IF;

  IF NEW.result IS NOT NULL THEN
    v_event_name := CASE NEW.result
      WHEN 'won'     THEN 'deal_won'
      WHEN 'lost'    THEN 'deal_lost'
      WHEN 'no_show' THEN 'no_show'
      ELSE 'call_completed'
    END;

    IF NEW.result <> 'no_show' THEN
      INSERT INTO public.event_logs (event_name, payload, status)
      SELECT 'call_completed',
             jsonb_build_object('call_id', NEW.id, 'user_id', NEW.user_id, 'result', NEW.result),
             'logged'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.event_logs
        WHERE event_name='call_completed' AND payload->>'call_id' = NEW.id::text
      );
    END IF;

    INSERT INTO public.event_logs (event_name, payload, status)
    SELECT v_event_name,
           jsonb_build_object('call_id', NEW.id, 'user_id', NEW.user_id, 'revenue', NEW.revenue),
           'logged'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.event_logs
      WHERE event_name=v_event_name AND payload->>'call_id' = NEW.id::text
    );

    IF NEW.result <> 'no_show' AND v_appt_id IS NOT NULL THEN
      INSERT INTO public.event_logs (event_name, payload, status)
      SELECT 'appointment_showed',
             jsonb_build_object('appointment_id', v_appt_id, 'lead_id', NEW.user_id),
             'logged'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.event_logs
        WHERE event_name='appointment_showed' AND payload->>'appointment_id' = v_appt_id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calls_sync_attendance ON public.calls;
CREATE TRIGGER trg_calls_sync_attendance
BEFORE INSERT OR UPDATE OF result, closed_at, status
ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.tg_calls_sync_attendance();

-- Backfill 1: closed_at for orphan results
UPDATE public.calls
   SET closed_at = COALESCE(showed_at, created_at)
 WHERE result IS NOT NULL
   AND closed_at IS NULL
   AND COALESCE(is_simulation, false) = false;

-- Backfill 2: re-touch calls so trigger syncs appointments + emits events
UPDATE public.calls
   SET status = status
 WHERE result IS NOT NULL
   AND COALESCE(is_simulation, false) = false;
