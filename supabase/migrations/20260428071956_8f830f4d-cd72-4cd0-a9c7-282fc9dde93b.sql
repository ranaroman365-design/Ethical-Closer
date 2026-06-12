-- ============================================================
-- Final Three: Touchpoint Editor + Calendar Sync + AI Guardrails
-- Additive only.
-- ============================================================

-- ------------------------------------------------------------
-- 1A. touchpoint_sequences
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.touchpoint_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_key text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_key, name)
);
ALTER TABLE public.touchpoint_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY ts_admin_all ON public.touchpoint_sequences
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY ts_op_read ON public.touchpoint_sequences
  FOR SELECT TO authenticated
  USING (public.is_funnel_operator(funnel_key));

CREATE POLICY ts_op_write ON public.touchpoint_sequences
  FOR INSERT TO authenticated
  WITH CHECK (public.is_funnel_operator(funnel_key));

CREATE POLICY ts_op_update ON public.touchpoint_sequences
  FOR UPDATE TO authenticated
  USING (public.is_funnel_operator(funnel_key))
  WITH CHECK (public.is_funnel_operator(funnel_key));

-- ------------------------------------------------------------
-- 1B. touchpoint_sequence_steps
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.touchpoint_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.touchpoint_sequences(id) ON DELETE CASCADE,
  position integer NOT NULL,
  delay_minutes integer NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp','voice','in_app')),
  template_key text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, position)
);
CREATE INDEX IF NOT EXISTS idx_tss_seq ON public.touchpoint_sequence_steps(sequence_id, position);
ALTER TABLE public.touchpoint_sequence_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY tss_admin_all ON public.touchpoint_sequence_steps
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY tss_op_rw ON public.touchpoint_sequence_steps
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.touchpoint_sequences s
    WHERE s.id = sequence_id AND public.is_funnel_operator(s.funnel_key)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.touchpoint_sequences s
    WHERE s.id = sequence_id AND public.is_funnel_operator(s.funnel_key)
  ));

-- ------------------------------------------------------------
-- 2A. appointment_reschedules audit
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_reschedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_appointment_id uuid NOT NULL,
  new_appointment_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  setter_id uuid,
  reason text,
  rescheduled_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ar_lead ON public.appointment_reschedules(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_old ON public.appointment_reschedules(old_appointment_id);
ALTER TABLE public.appointment_reschedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY ar_admin_all ON public.appointment_reschedules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY ar_actor_self ON public.appointment_reschedules
  FOR SELECT TO authenticated
  USING (rescheduled_by = auth.uid() OR setter_id = auth.uid());

-- ------------------------------------------------------------
-- 2B. reschedule_appointment RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  _old_id uuid,
  _new_starts_at timestamptz,
  _new_ends_at timestamptz,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old public.appointments%ROWTYPE;
  v_new_id uuid;
  v_caller uuid := auth.uid();
  v_is_admin boolean := has_role(v_caller,'admin') OR has_role(v_caller,'owner') OR has_role(v_caller,'ops_admin');
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM public.appointments WHERE id = _old_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment % not found', _old_id USING ERRCODE = 'P0002';
  END IF;

  -- Permission: setter, admin, or matching funnel operator
  IF NOT v_is_admin AND v_old.setter_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'Forbidden: only setter or admin may reschedule' USING ERRCODE = '42501';
  END IF;

  IF v_old.appointment_status IN ('rescheduled','cancelled','completed','closed_won','closed_lost') THEN
    RAISE EXCEPTION 'Cannot reschedule appointment in status %', v_old.appointment_status
      USING ERRCODE = '22023';
  END IF;

  IF _new_starts_at <= now() THEN
    RAISE EXCEPTION 'New start must be in the future' USING ERRCODE = '22023';
  END IF;
  IF _new_ends_at <= _new_starts_at THEN
    RAISE EXCEPTION 'New end must be after start' USING ERRCODE = '22023';
  END IF;

  -- 1) mark old as rescheduled
  UPDATE public.appointments
     SET appointment_status = 'rescheduled',
         updated_at = now()
   WHERE id = _old_id;

  -- 2) clone into a new booked appointment
  INSERT INTO public.appointments (
    lead_id, call_type, appointment_status, starts_at, ends_at,
    setter_id, payment_status, booking_source, pricing_tier,
    priority_price, video_call_link, call_status
  ) VALUES (
    v_old.lead_id, v_old.call_type, 'booked', _new_starts_at, _new_ends_at,
    v_old.setter_id, v_old.payment_status, 'reschedule', v_old.pricing_tier,
    v_old.priority_price, v_old.video_call_link, 'scheduled'
  ) RETURNING id INTO v_new_id;

  -- 3) audit
  INSERT INTO public.appointment_reschedules (
    old_appointment_id, new_appointment_id, lead_id, setter_id, reason, rescheduled_by
  ) VALUES (
    _old_id, v_new_id, v_old.lead_id, v_old.setter_id, _reason, v_caller
  );

  -- 4) notify via outbound_events (best-effort; ignore if table missing)
  BEGIN
    INSERT INTO public.outbound_events (event_name, lead_id, metadata)
    VALUES (
      'appointment_rescheduled',
      v_old.lead_id,
      jsonb_build_object(
        'old_appointment_id', _old_id,
        'new_appointment_id', v_new_id,
        'new_starts_at', _new_starts_at,
        'reason', _reason,
        'rescheduled_by', v_caller
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- non-fatal
    NULL;
  END;

  RETURN jsonb_build_object(
    'old_appointment_id', _old_id,
    'new_appointment_id', v_new_id,
    'lead_id', v_old.lead_id,
    'setter_id', v_old.setter_id,
    'starts_at', _new_starts_at
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, text) TO authenticated;

-- ------------------------------------------------------------
-- 3A. ai_setter_segment_activations
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_setter_segment_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_key text NOT NULL,
  segment text NOT NULL CHECK (segment IN
    ('unbooked_qualified','booked_unconfirmed','booked_at_risk','no_show_recovery','reschedule_requested')),
  enabled boolean NOT NULL DEFAULT false,
  max_calls_per_day integer NOT NULL DEFAULT 20 CHECK (max_calls_per_day >= 0 AND max_calls_per_day <= 500),
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_key, segment)
);
ALTER TABLE public.ai_setter_segment_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY assa_admin_all ON public.ai_setter_segment_activations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'ops_admin'));

CREATE POLICY assa_op_read ON public.ai_setter_segment_activations
  FOR SELECT TO authenticated
  USING (public.is_funnel_operator(funnel_key));

-- ------------------------------------------------------------
-- 3B. ai_setter_can_call gate
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_setter_can_call(
  _lead_id uuid,
  _funnel_key text,
  _segment text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_global record;
  v_funnel record;
  v_seg record;
  v_today_count integer;
BEGIN
  -- 1. global ai_setter
  SELECT * INTO v_global
  FROM public.ai_setter_settings
  WHERE scope = 'global' LIMIT 1;
  IF v_global IS NULL OR NOT v_global.ai_setter_enabled OR v_global.emergency_shutdown THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'global_ai_setter_disabled');
  END IF;
  IF v_global.test_mode THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'global_in_test_mode');
  END IF;

  -- 2. per-funnel feature flag
  SELECT * INTO v_funnel
  FROM public.per_funnel_feature_flags
  WHERE funnel_key = _funnel_key LIMIT 1;
  IF v_funnel IS NULL OR NOT v_funnel.ai_setter_enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'funnel_ai_setter_disabled');
  END IF;
  IF v_funnel.test_mode THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'funnel_in_test_mode');
  END IF;

  -- 3. segment activation
  SELECT * INTO v_seg
  FROM public.ai_setter_segment_activations
  WHERE funnel_key = _funnel_key AND segment = _segment LIMIT 1;
  IF v_seg IS NULL OR NOT v_seg.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'segment_disabled');
  END IF;

  -- 4. daily cap
  SELECT COUNT(*) INTO v_today_count
  FROM public.ai_setter_call_logs
  WHERE created_at >= date_trunc('day', now())
    AND (metadata->>'funnel_key') = _funnel_key
    AND (metadata->>'segment') = _segment;
  IF v_today_count >= v_seg.max_calls_per_day THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_cap_reached',
      'today_count', v_today_count,
      'cap', v_seg.max_calls_per_day
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'today_count', v_today_count,
    'cap', v_seg.max_calls_per_day,
    'remaining', v_seg.max_calls_per_day - v_today_count
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.ai_setter_can_call(uuid, text, text) TO authenticated;