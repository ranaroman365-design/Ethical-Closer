
-- 1. Add pull-lock fields to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pulled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS pulled_at timestamptz,
  ADD COLUMN IF NOT EXISTS pull_lock_until timestamptz,
  ADD COLUMN IF NOT EXISTS pull_status text NOT NULL DEFAULT 'available';

CREATE INDEX IF NOT EXISTS idx_leads_pull_status ON public.leads (pull_status) WHERE pull_status != 'available';

-- 2. Remove duplicate L7 policy (keep "L7 plus see all leads")
DROP POLICY IF EXISTS "L7 directors see all leads" ON public.leads;

-- 3. Create the secure lead-pull RPC
CREATE OR REPLACE FUNCTION public.pull_lead_secure(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_lead record;
  v_user_level int;
  v_lead_quality text;
  v_has_active_appt boolean;
  v_is_admin boolean;
BEGIN
  -- 1. Auth check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nicht authentifiziert.');
  END IF;

  -- 2. Fetch lead (lock row for atomic update)
  SELECT id, stage, lead_quality, pulled_by, pull_lock_until, pull_status,
         setter_id, closer_id, owner_id
    INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
   FOR UPDATE SKIP LOCKED;

  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead nicht gefunden oder gerade gesperrt.');
  END IF;

  -- 3. Stage guard: only pool leads
  IF v_lead.stage NOT IN ('new', 'backlog', 'recycled', 'in_pool') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead ist nicht im Pool.');
  END IF;

  -- 4. Already assigned check
  IF v_lead.setter_id IS NOT NULL OR v_lead.closer_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead ist bereits einem Setter/Closer zugewiesen.');
  END IF;

  -- 5. Pull-lock check (atomic)
  IF v_lead.pulled_by IS NOT NULL
     AND v_lead.pull_status = 'pulled'
     AND v_lead.pull_lock_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead ist gerade von einem anderen User gesperrt.');
  END IF;

  -- 6. Active appointment check
  SELECT EXISTS (
    SELECT 1 FROM public.appointments
     WHERE lead_id = p_lead_id
       AND appointment_status IN ('booked', 'confirmed', 'scheduled')
  ) INTO v_has_active_appt;

  IF v_has_active_appt THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lead hat bereits einen aktiven Termin.');
  END IF;

  -- 7. Resolve user level
  SELECT COALESCE(
    (SELECT current_level FROM public.user_level_status WHERE user_id = v_user_id),
    (SELECT current_phase FROM public.profiles WHERE id = v_user_id),
    0
  ) INTO v_user_level;

  -- Admin check
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role IN ('admin', 'administrator', 'owner')
  ) INTO v_is_admin;

  -- 8. Quality access matrix
  v_lead_quality := COALESCE(v_lead.lead_quality, 'C');

  IF NOT v_is_admin AND v_user_level < 6 THEN
    -- L1/L2: C only
    IF v_user_level <= 2 AND v_lead_quality != 'C' THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Dein Level erlaubt nur C-Leads. Aktuell: ' || v_lead_quality);
    END IF;
    -- L3: B/C only
    IF v_user_level = 3 AND v_lead_quality NOT IN ('B', 'C') THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Dein Level erlaubt nur B/C-Leads. Aktuell: ' || v_lead_quality);
    END IF;
    -- L4/L5: A/B/C (all standard qualities) — no restriction needed
  END IF;

  -- 9. Atomic update
  UPDATE public.leads
     SET pulled_by = v_user_id,
         pulled_at = now(),
         pull_lock_until = now() + interval '4 hours',
         pull_status = 'pulled',
         stage = 'assigned_setter',
         setter_id = v_user_id,
         owner_id = v_user_id,
         owner_role = 'setter',
         timer_expires_at = now() + interval '72 hours',
         updated_at = now()
   WHERE id = p_lead_id;

  -- 10. Log event
  INSERT INTO public.lead_events (lead_id, event_type, from_stage, to_stage, actor_user_id, metadata)
  VALUES (
    p_lead_id,
    'lead_pulled_secure',
    v_lead.stage,
    'assigned_setter',
    v_user_id,
    jsonb_build_object(
      'lead_quality', v_lead_quality,
      'user_level', v_user_level,
      'pull_lock_until', (now() + interval '4 hours')::text
    )
  );

  -- Also log transition
  INSERT INTO public.lead_transitions (lead_id, previous_stage, new_stage, changed_by)
  VALUES (p_lead_id, v_lead.stage, 'assigned_setter', v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'pulled_by', v_user_id,
    'pull_lock_until', (now() + interval '4 hours')::text
  );
END;
$$;
