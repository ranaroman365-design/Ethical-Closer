-- RPC: log a manual replay QA entry for a given event_id without firing Meta
CREATE OR REPLACE FUNCTION public.log_meta_event_replay(
  _event_id text,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src record;
  v_new_id uuid;
BEGIN
  -- admin/owner only
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _event_id IS NULL OR length(trim(_event_id)) = 0 THEN
    RAISE EXCEPTION 'event_id required';
  END IF;

  -- Find most recent existing log for this event_id to copy identifiers
  SELECT event_name, lead_id, session_id, appointment_id, call_id, origin_key, operator_email
    INTO v_src
  FROM public.meta_event_logs
  WHERE event_id = _event_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_src.event_name IS NULL THEN
    RAISE EXCEPTION 'no prior log found for event_id=%', _event_id;
  END IF;

  INSERT INTO public.meta_event_logs(
    event_name, event_id, source,
    lead_id, session_id, appointment_id, call_id,
    origin_key, operator_email,
    meta_response_status, error_message
  ) VALUES (
    v_src.event_name, _event_id, 'unknown',
    v_src.lead_id, v_src.session_id, v_src.appointment_id, v_src.call_id,
    v_src.origin_key, v_src.operator_email,
    NULL,
    '[replay] ' || COALESCE(_note, 'manual QA replay (no Meta call)')
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_meta_event_replay(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_meta_event_replay(text, text) TO authenticated;