-- Update convert_lead_to_bewerber to ONLY work when booking_status = 'booking_verified'
CREATE OR REPLACE FUNCTION public.convert_lead_to_bewerber(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
  v_normalized_email text;
  v_booking_status text;
BEGIN
  v_normalized_email := LOWER(TRIM(p_email));

  SELECT id, booking_status INTO v_lead_id, v_booking_status
  FROM leads
  WHERE LOWER(TRIM(email)) = v_normalized_email
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;

  IF v_booking_status IS DISTINCT FROM 'booking_verified' THEN
    RETURN jsonb_build_object('error', 'Booking not verified', 'current_status', v_booking_status);
  END IF;

  UPDATE leads SET
    lead_status = 'bewerber',
    booking_status = 'booking_verified',
    updated_at = now()
  WHERE id = v_lead_id
    AND lead_status = 'interessent';

  RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id);
END;
$function$;

-- Admin-only RPC to verify a booking and convert lead
CREATE OR REPLACE FUNCTION public.confirm_booking_admin(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_current_status text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT email, booking_status INTO v_email, v_current_status
  FROM leads WHERE id = p_lead_id;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;

  UPDATE leads SET
    booking_status = 'booking_verified',
    lead_status = 'bewerber',
    updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO audit_logs (action, actor_id, source_type, note, after_state)
  VALUES (
    'booking_confirmed_by_admin',
    auth.uid(),
    'admin',
    format('Admin confirmed booking for lead %s (email: %s)', p_lead_id, v_email),
    jsonb_build_object('lead_id', p_lead_id, 'previous_booking_status', v_current_status)
  );

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'email', v_email);
END;
$function$;

-- RPC for frontend to claim booking (soft, non-destructive)
CREATE OR REPLACE FUNCTION public.claim_booking(p_email text, p_booking_option text DEFAULT 'standard')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
  v_normalized_email text;
BEGIN
  v_normalized_email := LOWER(TRIM(p_email));

  SELECT id INTO v_lead_id
  FROM leads
  WHERE LOWER(TRIM(email)) = v_normalized_email
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;

  UPDATE leads SET
    booking_status = CASE 
      WHEN booking_status = 'booking_verified' THEN 'booking_verified'
      ELSE 'booking_claimed'
    END,
    updated_at = now()
  WHERE id = v_lead_id;

  INSERT INTO event_logs (event_name, email, payload, status)
  VALUES (
    'booking_claimed',
    v_normalized_email,
    jsonb_build_object('lead_id', v_lead_id, 'booking_option', p_booking_option),
    'received'
  );

  RETURN jsonb_build_object('success', true, 'lead_id', v_lead_id, 'status', 'booking_claimed');
END;
$function$;