
-- Fix the broken trigger function referencing non-existent scheduled_at column
CREATE OR REPLACE FUNCTION public.trigger_booking_confirmation_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_anon_key text;
  v_lead record;
BEGIN
  -- Only fire on new confirmed appointments
  IF NEW.appointment_status <> 'confirmed' THEN RETURN NEW; END IF;

  SELECT phone, email, name INTO v_lead FROM leads WHERE id = NEW.lead_id;
  IF v_lead IS NULL OR v_lead.phone IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;

  IF v_url IS NULL OR v_anon_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/dispatch-communication',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := jsonb_build_object(
      'event_key', 'booking_completed_wa',
      'lead_id', NEW.lead_id::text,
      'recipient_phone', v_lead.phone,
      'recipient_email', v_lead.email,
      'payload', jsonb_build_object(
        'body', 'Hi ' || COALESCE(v_lead.name, '') || '! ✅ Dein Termin ist bestätigt. Wir freuen uns auf das Gespräch! Dein ETC Team',
        'first_name', COALESCE(v_lead.name, ''),
        'appointment_id', NEW.id::text,
        'appointment_date', COALESCE(NEW.starts_at::text, NEW.created_at::text)
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block appointment creation due to dispatch failure
  RETURN NEW;
END;
$$;
