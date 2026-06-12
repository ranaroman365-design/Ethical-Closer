-- ============================================================================
-- Fix: L6 cannot see appointment details (returns "not_found")
--
-- ROOT CAUSE
--   appointments SELECT RLS only allows setter_id = auth.uid() OR admin.
--   It does NOT allow:
--     - closer_id = auth.uid()           (closer-side visibility)
--     - current_owner_id = auth.uid()    (post-reassignment owner)
--     - original_owner_id = auth.uid()   (reassigned away)
--     - L6 team subtree                  (Senior Closer over their team)
--
--   When the SELECT is filtered out, get_appointment_full_context (STABLE,
--   caller RLS) hits IF NOT FOUND and returns {"error":"not_found"}.
--
-- FIX (minimal, additive)
--   1. New permissive SELECT policy on appointments covering the missing scopes.
--   2. New permissive SELECT policy on leads for L6 team subtree (read-only).
--   3. Patch get_appointment_full_context to distinguish:
--        not_found  → row truly does not exist
--        forbidden  → row exists but RLS blocked (probed via SECURITY DEFINER)
--        ok         → returns appointment + (lead may be null = LEFT-JOIN safe)
--
--   Booking flow untouched. No INSERT/UPDATE/DELETE policies changed.
--   No data deleted. No global access opened (every clause is scoped).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Appointments — additive SELECT policy
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Closers and L6 team see appointments" ON public.appointments;

CREATE POLICY "Closers and L6 team see appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  -- Closer-side ownership (current OR original after reassignment)
  closer_id          = auth.uid()
  OR current_owner_id  = auth.uid()
  OR original_owner_id = auth.uid()

  -- L6+ Senior Closer sees full team subtree (setter, closer, current owner)
  OR (
    public.is_operator_l6plus(auth.uid())
    AND (
         public.is_in_team_subtree(setter_id,        auth.uid())
      OR public.is_in_team_subtree(closer_id,        auth.uid())
      OR public.is_in_team_subtree(current_owner_id, auth.uid())
    )
  )
);

-- ----------------------------------------------------------------------------
-- 2. Leads — additive SELECT policy for L6 team scope (read-only)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "L6 team sees team leads" ON public.leads;

CREATE POLICY "L6 team sees team leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  public.is_operator_l6plus(auth.uid())
  AND (
       public.is_in_team_subtree(owner_id,  auth.uid())
    OR public.is_in_team_subtree(setter_id, auth.uid())
    OR public.is_in_team_subtree(closer_id, auth.uid())
  )
);

-- ----------------------------------------------------------------------------
-- 3. RPC — distinguish not_found vs forbidden vs lead_missing
--    Stays STABLE (caller RLS) for the main read so visibility rules remain
--    enforced. Uses a tiny SECURITY DEFINER probe to detect "row truly missing"
--    vs "row hidden by RLS" so the UI can show the correct message.
-- ----------------------------------------------------------------------------

-- Tiny existence probe (SECURITY DEFINER, returns only a boolean)
CREATE OR REPLACE FUNCTION public.appointment_exists_unsafe(p_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.appointments WHERE id = p_appointment_id);
$$;

REVOKE ALL ON FUNCTION public.appointment_exists_unsafe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appointment_exists_unsafe(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_appointment_full_context(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  v_appt appointments%ROWTYPE;
  v_lead leads%ROWTYPE;
  v_calls_count int := 0;
  v_messages_count int := 0;
  v_appointments_count int := 0;
  v_quiz jsonb := NULL;
  v_last_call jsonb := NULL;
  v_truly_exists boolean;
BEGIN
  -- Caller RLS: respects the new + existing SELECT policies
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id;

  IF NOT FOUND THEN
    -- Disambiguate: does the row actually exist (forbidden) or not (not_found)?
    v_truly_exists := public.appointment_exists_unsafe(p_appointment_id);
    IF v_truly_exists THEN
      RETURN jsonb_build_object(
        'error', 'forbidden',
        'message', 'Keine Berechtigung für diesen Termin.'
      );
    ELSE
      RETURN jsonb_build_object(
        'error', 'not_found',
        'message', 'Termin existiert nicht.'
      );
    END IF;
  END IF;

  -- LEFT-JOIN-safe: appointment is returned even if lead is missing/blocked.
  -- Lead read is also caller-RLS so team scope from the new policy applies.
  IF v_appt.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_appt.lead_id;
  END IF;

  IF v_lead.id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_calls_count          FROM calls          WHERE user_id = v_lead.id;
    SELECT COUNT(*) INTO v_messages_count       FROM wa_messages    WHERE lead_id = v_lead.id;
    SELECT COUNT(*) INTO v_appointments_count   FROM appointments   WHERE lead_id = v_lead.id;

    SELECT to_jsonb(qs.*) INTO v_quiz
      FROM quiz_submissions qs
      WHERE qs.lead_id = v_lead.id
      ORDER BY qs.created_at DESC
      LIMIT 1;

    SELECT to_jsonb(c.*) INTO v_last_call
      FROM calls c
      WHERE c.user_id = v_lead.id
      ORDER BY c.created_at DESC
      LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'appointment', to_jsonb(v_appt),
    'lead',        CASE WHEN v_lead.id IS NOT NULL THEN to_jsonb(v_lead) ELSE NULL END,
    'lead_missing', v_lead.id IS NULL,
    'stats', jsonb_build_object(
      'calls_count',        v_calls_count,
      'messages_count',     v_messages_count,
      'appointments_count', v_appointments_count
    ),
    'last_quiz', v_quiz,
    'last_call', v_last_call
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', 'exception', 'message', SQLERRM);
END;
$function$;
