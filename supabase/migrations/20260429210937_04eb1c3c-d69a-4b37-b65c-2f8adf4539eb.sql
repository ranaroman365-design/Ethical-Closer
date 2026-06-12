-- =========================================================================
-- APPOINTMENT REASSIGNMENT SYSTEM (additive, non-breaking)
-- =========================================================================

-- 1. New columns on appointments (all nullable, no defaults that could break inserts)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS closer_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_owner_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_owner_role     text CHECK (current_owner_role IN ('setter','closer')),
  ADD COLUMN IF NOT EXISTS original_owner_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_owner_role    text CHECK (original_owner_role IN ('setter','closer')),
  ADD COLUMN IF NOT EXISTS reassigned_at          timestamptz,
  ADD COLUMN IF NOT EXISTS reassigned_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reassignment_reason    text;

CREATE INDEX IF NOT EXISTS idx_appointments_current_owner  ON public.appointments(current_owner_id);
CREATE INDEX IF NOT EXISTS idx_appointments_closer_id      ON public.appointments(closer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_original_owner ON public.appointments(original_owner_id);

-- 2. One-time backfill: seed current/original owner from existing setter_id
UPDATE public.appointments
   SET current_owner_id    = setter_id,
       current_owner_role  = 'setter',
       original_owner_id   = setter_id,
       original_owner_role = 'setter'
 WHERE current_owner_id IS NULL
   AND setter_id IS NOT NULL;

-- 3. Audit log table
CREATE TABLE IF NOT EXISTS public.appointment_reassignment_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id       uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  previous_owner_id    uuid,
  previous_owner_role  text CHECK (previous_owner_role IN ('setter','closer')),
  new_owner_id         uuid NOT NULL,
  new_owner_role       text NOT NULL CHECK (new_owner_role IN ('setter','closer')),
  reassignment_type    text NOT NULL CHECK (reassignment_type IN ('self_takeover','reassignment')),
  reason               text,
  reassigned_by        uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_arl_appointment ON public.appointment_reassignment_log(appointment_id);
CREATE INDEX IF NOT EXISTS idx_arl_new_owner   ON public.appointment_reassignment_log(new_owner_id);
CREATE INDEX IF NOT EXISTS idx_arl_created_at  ON public.appointment_reassignment_log(created_at DESC);

ALTER TABLE public.appointment_reassignment_log ENABLE ROW LEVEL SECURITY;

-- L6+ and admins can read; nobody can update/delete (append-only audit)
CREATE POLICY "L6+ and admins can read reassignment log"
  ON public.appointment_reassignment_log
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_min_level(auth.uid(), 6)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- No INSERT/UPDATE/DELETE policies on purpose — only the SECURITY DEFINER RPC can write.

-- 4. Reassignment RPC (the single legal entry point)
CREATE OR REPLACE FUNCTION public.reassign_appointment(
  p_appointment_id    uuid,
  p_new_owner_id      uuid,
  p_new_owner_role    text,
  p_reassignment_type text,
  p_reason            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller            uuid := auth.uid();
  v_appt              record;
  v_prev_owner_id     uuid;
  v_prev_owner_role   text;
  v_is_first          boolean;
  v_active_statuses   text[] := ARRAY['booked','confirmed','scheduled','pending_payment'];
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  -- PERMISSION GATE: strictly L6+ or admin
  IF NOT (
    public.user_has_min_level(v_caller, 6)
    OR public.has_role(v_caller, 'admin'::app_role)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden_level_below_l6');
  END IF;

  -- Input validation
  IF p_new_owner_role NOT IN ('setter','closer') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_owner_role');
  END IF;

  IF p_reassignment_type NOT IN ('self_takeover','reassignment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_reassignment_type');
  END IF;

  IF p_reassignment_type = 'self_takeover' AND p_new_owner_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_takeover_must_target_caller');
  END IF;

  IF p_new_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_new_owner');
  END IF;

  -- New owner must exist
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_new_owner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'new_owner_not_found');
  END IF;

  -- Lock the row to prevent concurrent reassignments
  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'appointment_not_found');
  END IF;

  -- Status gate (no time gate — per spec)
  IF NOT (v_appt.appointment_status = ANY(v_active_statuses)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'appointment_not_active',
      'status', v_appt.appointment_status
    );
  END IF;

  -- Determine previous owner (current_owner_* takes precedence; fall back to legacy setter_id)
  v_prev_owner_id   := COALESCE(v_appt.current_owner_id, v_appt.setter_id);
  v_prev_owner_role := COALESCE(v_appt.current_owner_role, 'setter');

  -- No-op guard
  IF v_prev_owner_id = p_new_owner_id AND v_prev_owner_role = p_new_owner_role THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_owner');
  END IF;

  v_is_first := (v_appt.original_owner_id IS NULL);

  -- Update appointment
  UPDATE public.appointments
     SET current_owner_id    = p_new_owner_id,
         current_owner_role  = p_new_owner_role,
         -- Original owner is set ONCE and never overwritten
         original_owner_id   = COALESCE(original_owner_id, v_prev_owner_id),
         original_owner_role = COALESCE(original_owner_role, v_prev_owner_role),
         -- Keep legacy fields in sync so existing calendar queries continue to work
         setter_id  = CASE WHEN p_new_owner_role = 'setter' THEN p_new_owner_id ELSE setter_id END,
         closer_id  = CASE WHEN p_new_owner_role = 'closer' THEN p_new_owner_id ELSE closer_id END,
         reassigned_at       = now(),
         reassigned_by       = v_caller,
         reassignment_reason = p_reason,
         updated_at          = now()
   WHERE id = p_appointment_id;

  -- Append-only audit log
  INSERT INTO public.appointment_reassignment_log (
    appointment_id, previous_owner_id, previous_owner_role,
    new_owner_id, new_owner_role, reassignment_type, reason, reassigned_by
  ) VALUES (
    p_appointment_id, v_prev_owner_id, v_prev_owner_role,
    p_new_owner_id, p_new_owner_role, p_reassignment_type, p_reason, v_caller
  );

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', p_appointment_id,
    'previous_owner_id', v_prev_owner_id,
    'previous_owner_role', v_prev_owner_role,
    'new_owner_id', p_new_owner_id,
    'new_owner_role', p_new_owner_role,
    'first_reassignment', v_is_first,
    'reassigned_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_appointment(uuid, uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reassign_appointment(uuid, uuid, text, text, text) TO authenticated;
