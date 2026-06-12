
-- Trigger function: dispatch booking confirmation via edge function
CREATE OR REPLACE FUNCTION public.trigger_booking_confirmation_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_url text;
  v_anon_key text;
BEGIN
  -- Only fire for new appointments with a lead_id
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;

  -- Look up lead phone and name
  SELECT name, phone, email INTO v_lead
  FROM leads WHERE id = NEW.lead_id;

  IF v_lead.phone IS NULL AND v_lead.email IS NULL THEN RETURN NEW; END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.supabase_anon_key', true);

  -- If settings not available, construct from known ref
  IF v_url IS NULL OR v_url = '' THEN
    v_url := 'https://pjufhxzjgdnhvuuvltjn.supabase.co';
  END IF;
  IF v_anon_key IS NULL OR v_anon_key = '' THEN
    v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA';
  END IF;

  -- Fire async HTTP call to dispatch-communication
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
        'appointment_date', COALESCE(NEW.scheduled_at::text, NEW.created_at::text)
      )
    )
  );

  RETURN NEW;
END;
$$;

-- Create the trigger (idempotent)
DROP TRIGGER IF EXISTS trg_booking_confirmation_dispatch ON appointments;
CREATE TRIGGER trg_booking_confirmation_dispatch
  AFTER INSERT ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_booking_confirmation_dispatch();
