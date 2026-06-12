
-- 1. Calendar Events (comprehensive audit log)
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  previous_owner_id uuid,
  new_owner_id uuid,
  actor_user_id uuid NOT NULL,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_events_appointment ON public.calendar_events(appointment_id);
CREATE INDEX idx_calendar_events_lead ON public.calendar_events(lead_id);
CREATE INDEX idx_calendar_events_actor ON public.calendar_events(actor_user_id);
CREATE INDEX idx_calendar_events_type ON public.calendar_events(event_type);
CREATE INDEX idx_calendar_events_created ON public.calendar_events(created_at DESC);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Admins see all events
CREATE POLICY "Admins manage calendar_events"
  ON public.calendar_events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can insert their own events
CREATE POLICY "Users insert own calendar_events"
  ON public.calendar_events FOR INSERT
  WITH CHECK (auth.uid() = actor_user_id);

-- Users can see events they are involved in
CREATE POLICY "Users see own calendar_events"
  ON public.calendar_events FOR SELECT
  USING (
    actor_user_id = auth.uid()
    OR previous_owner_id = auth.uid()
    OR new_owner_id = auth.uid()
  );

-- L6+ see events for their team
CREATE POLICY "L6 see team calendar_events"
  ON public.calendar_events FOR SELECT
  USING (
    is_operator_l6plus(auth.uid())
    AND (
      is_in_team_subtree(actor_user_id, auth.uid())
      OR is_in_team_subtree(previous_owner_id, auth.uid())
      OR is_in_team_subtree(new_owner_id, auth.uid())
    )
  );

-- 2. Calendar Blockers
CREATE TABLE IF NOT EXISTS public.calendar_blockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  title text DEFAULT '',
  blocker_type text NOT NULL DEFAULT 'personal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_blockers_user ON public.calendar_blockers(user_id);
CREATE INDEX idx_calendar_blockers_time ON public.calendar_blockers(starts_at, ends_at);

ALTER TABLE public.calendar_blockers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own blockers"
  ON public.calendar_blockers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "L6 see team blockers"
  ON public.calendar_blockers FOR SELECT
  USING (
    is_operator_l6plus(auth.uid())
    AND is_in_team_subtree(user_id, auth.uid())
  );

CREATE POLICY "Admins manage all blockers"
  ON public.calendar_blockers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Add missing lead qualification fields (only if not existing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='qualification_notes') THEN
    ALTER TABLE public.leads ADD COLUMN qualification_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='pain_points') THEN
    ALTER TABLE public.leads ADD COLUMN pain_points text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='motivation') THEN
    ALTER TABLE public.leads ADD COLUMN motivation text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='sales_experience') THEN
    ALTER TABLE public.leads ADD COLUMN sales_experience text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='financial_readiness') THEN
    ALTER TABLE public.leads ADD COLUMN financial_readiness text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='urgency') THEN
    ALTER TABLE public.leads ADD COLUMN urgency text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='objection_status') THEN
    ALTER TABLE public.leads ADD COLUMN objection_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='fit_score') THEN
    ALTER TABLE public.leads ADD COLUMN fit_score integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='next_step') THEN
    ALTER TABLE public.leads ADD COLUMN next_step text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='qualification_status') THEN
    ALTER TABLE public.leads ADD COLUMN qualification_status text DEFAULT 'pending';
  END IF;
END$$;

-- 4. RPC: log_calendar_event (security definer so it bypasses RLS for inserts)
CREATE OR REPLACE FUNCTION public.log_calendar_event(
  p_event_type text,
  p_appointment_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_previous_owner_id uuid DEFAULT NULL,
  p_new_owner_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.calendar_events (
    event_type, appointment_id, lead_id,
    previous_owner_id, new_owner_id, actor_user_id,
    reason, metadata
  ) VALUES (
    p_event_type, p_appointment_id, p_lead_id,
    p_previous_owner_id, p_new_owner_id, auth.uid(),
    p_reason, p_metadata
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 5. RPC: get_leads_without_appointment (for lead pool pull)
CREATE OR REPLACE FUNCTION public.get_leads_without_appointment(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  quiz_score integer,
  lead_quality text,
  source text,
  stage text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.name, l.email, l.phone, l.quiz_score, l.lead_quality, l.source, l.stage, l.created_at
  FROM public.leads l
  WHERE l.has_booking = false
    AND l.booking_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.lead_id = l.id
        AND a.appointment_status IN ('scheduled', 'booked', 'pending_confirmation', 'confirmed')
    )
    AND l.is_simulation = false
    AND (l.outcome IS NULL OR l.outcome NOT IN ('closed_won', 'closed_lost', 'disqualified'))
    -- Access control: user must be allowed to see this lead
    AND (
      l.owner_id = p_user_id
      OR l.setter_id = p_user_id
      OR l.closer_id = p_user_id
      OR is_operator_l6plus(p_user_id)
      OR has_role(p_user_id, 'admin')
    )
  ORDER BY l.created_at DESC
  LIMIT 50;
END;
$$;

-- 6. RPC: create_manual_appointment
CREATE OR REPLACE FUNCTION public.create_manual_appointment(
  p_lead_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_call_type text DEFAULT 'setter_call',
  p_confirmed boolean DEFAULT false,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_level integer;
  v_appointment_id uuid;
  v_has_active boolean;
  v_initial_status text;
BEGIN
  -- Check caller level
  SELECT COALESCE(current_level, 0) INTO v_caller_level
  FROM public.user_level_status WHERE user_id = v_caller;

  IF v_caller_level IS NULL OR (v_caller_level < 3 AND NOT has_role(v_caller, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_level');
  END IF;

  -- Check no active appointment for this lead
  SELECT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE lead_id = p_lead_id
      AND appointment_status IN ('scheduled', 'booked', 'pending_confirmation', 'confirmed')
  ) INTO v_has_active;

  IF v_has_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_has_active_appointment');
  END IF;

  -- Determine initial status
  v_initial_status := CASE WHEN p_confirmed THEN 'confirmed' ELSE 'pending_confirmation' END;

  -- Create appointment
  INSERT INTO public.appointments (
    lead_id, starts_at, ends_at, call_type,
    appointment_status, booking_source,
    setter_id, current_owner_id, current_owner_role,
    original_owner_id, original_owner_role
  ) VALUES (
    p_lead_id, p_starts_at, p_ends_at, p_call_type,
    v_initial_status, 'manual',
    CASE WHEN v_caller_level < 4 THEN v_caller ELSE NULL END,
    v_caller,
    CASE
      WHEN v_caller_level >= 6 THEN 'senior_closer'
      WHEN v_caller_level >= 4 THEN 'closer'
      ELSE 'setter'
    END,
    v_caller,
    CASE
      WHEN v_caller_level >= 6 THEN 'senior_closer'
      WHEN v_caller_level >= 4 THEN 'closer'
      ELSE 'setter'
    END
  )
  RETURNING id INTO v_appointment_id;

  -- Update lead
  UPDATE public.leads SET
    has_booking = true,
    booking_id = v_appointment_id,
    booking_status = v_initial_status,
    appointment_date = p_starts_at
  WHERE id = p_lead_id;

  -- Log event
  INSERT INTO public.calendar_events (
    event_type, appointment_id, lead_id,
    new_owner_id, actor_user_id, reason, metadata
  ) VALUES (
    'appointment_created_manual', v_appointment_id, p_lead_id,
    v_caller, v_caller,
    p_reason,
    jsonb_build_object('confirmed', p_confirmed, 'call_type', p_call_type)
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appointment_id,
    'status', v_initial_status
  );
END;
$$;
