
-- 1. Backfill existing nulls
UPDATE public.appointments
SET booking_priority = 'MEDIUM'
WHERE booking_priority IS NULL;

-- 2. Set default
ALTER TABLE public.appointments
ALTER COLUMN booking_priority SET DEFAULT 'MEDIUM';

-- 3. Trigger to recompute booking_priority when lead WA status changes
CREATE OR REPLACE FUNCTION public.recompute_booking_priority_on_wa_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _priority TEXT;
  _quality TEXT;
  _risk TEXT;
  _qs NUMERIC;
  _lq TEXT;
  _phone_valid BOOLEAN;
  _wa_confirmed BOOLEAN;
  _wa_unresponsive BOOLEAN;
  _no_shows INT;
  _attended INT;
BEGIN
  -- Only fire if whatsapp_confirmed or whatsapp_unresponsive changed
  IF (OLD.whatsapp_confirmed IS NOT DISTINCT FROM NEW.whatsapp_confirmed)
     AND (OLD.whatsapp_unresponsive IS NOT DISTINCT FROM NEW.whatsapp_unresponsive) THEN
    RETURN NEW;
  END IF;

  -- Read lead fields
  _phone_valid := COALESCE(NEW.phone_valid, false);
  _wa_confirmed := COALESCE(NEW.whatsapp_confirmed, false) OR COALESCE(NEW.whatsapp_opt_in, false);
  _wa_unresponsive := COALESCE(NEW.whatsapp_unresponsive, false);
  _no_shows := COALESCE(NEW.total_no_shows, 0);
  _attended := COALESCE(NEW.total_calls_attended, 0);
  _qs := COALESCE(NEW.quiz_score, NEW.qualification_score, 0);
  _lq := UPPER(COALESCE(NEW.lead_quality, ''));

  -- Derive quality
  IF _lq = 'A' OR _qs >= 12 THEN _quality := 'high';
  ELSIF _lq = 'B' OR _qs >= 7 THEN _quality := 'mid';
  ELSE _quality := 'low';
  END IF;

  -- Derive risk
  _risk := 'low';
  IF _wa_unresponsive AND NOT _wa_confirmed THEN _risk := 'high';
  ELSIF _no_shows >= 2 THEN _risk := 'high';
  ELSIF _no_shows = 1 AND _attended = 0 THEN
    _risk := CASE WHEN _wa_confirmed THEN 'mid' ELSE 'high' END;
  ELSIF _no_shows = 1 AND _attended >= 1 THEN
    _risk := CASE WHEN _wa_confirmed THEN 'low' ELSE 'mid' END;
  END IF;

  -- Derive priority (mirrors canonical engine)
  IF _risk = 'high' AND NOT _wa_confirmed THEN _priority := 'LOW';
  ELSIF _phone_valid AND _quality != 'low' AND _risk != 'high' AND _wa_confirmed THEN _priority := 'HIGH';
  ELSIF _qs >= 7 OR (_phone_valid AND _quality != 'low') THEN _priority := 'MEDIUM';
  ELSE _priority := 'LOW';
  END IF;

  -- Update all open appointments for this lead
  UPDATE public.appointments
  SET booking_priority = _priority, updated_at = now()
  WHERE lead_id = NEW.id
    AND appointment_status IN ('booked', 'confirmed');

  -- Log event (once per change, not per appointment)
  INSERT INTO public.event_logs (lead_id, event_type, metadata)
  VALUES (NEW.id, 'BOOKING_PRIORITY_RECOMPUTED', jsonb_build_object(
    'new_priority', _priority,
    'trigger', 'whatsapp_status_change',
    'wa_confirmed', _wa_confirmed,
    'wa_unresponsive', _wa_unresponsive
  ));

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recompute_booking_priority_on_wa
AFTER UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.recompute_booking_priority_on_wa_change();
