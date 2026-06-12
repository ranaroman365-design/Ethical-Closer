CREATE OR REPLACE FUNCTION public.validate_appointment_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Canonical call_type vocabulary
  IF NEW.call_type NOT IN (
    'standard', 'priority',
    'setter', 'closer', 'orientation', 'strategy', 'follow_up'
  ) THEN
    RAISE EXCEPTION 'Invalid call_type: %', NEW.call_type;
  END IF;

  IF NEW.appointment_status NOT IN (
    'scheduled', 'booked', 'confirmed', 'pending_confirmation',
    'completed', 'no_show', 'cancelled',
    'rescheduled', 'superseded', 'pending_payment', 'expired'
  ) THEN
    RAISE EXCEPTION 'Invalid appointment_status: %', NEW.appointment_status;
  END IF;

  IF NEW.payment_status NOT IN ('none', 'pending', 'paid', 'refunded', 'expired') THEN
    RAISE EXCEPTION 'Invalid payment_status: %', NEW.payment_status;
  END IF;

  IF NEW.outcome IS NOT NULL AND NEW.outcome NOT IN ('attended', 'no_show', 'cancelled', 'rescheduled') THEN
    RAISE EXCEPTION 'Invalid outcome: %', NEW.outcome;
  END IF;

  IF NEW.qualification_result IS NOT NULL AND NEW.qualification_result NOT IN ('qualified', 'not_qualified', 'follow_up_needed') THEN
    RAISE EXCEPTION 'Invalid qualification_result: %', NEW.qualification_result;
  END IF;

  RETURN NEW;
END;
$function$;