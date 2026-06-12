
-- 1. mentor_eligibility table
CREATE TABLE IF NOT EXISTS public.mentor_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_eligible boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  reason_blocked text,
  kpi_score numeric DEFAULT 0,
  mentee_count int DEFAULT 0,
  max_mentees int DEFAULT 3,
  UNIQUE(user_id)
);
ALTER TABLE public.mentor_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access mentor_eligibility" ON public.mentor_eligibility
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own eligibility" ON public.mentor_eligibility
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. mentor_flags table
CREATE TABLE IF NOT EXISTS public.mentor_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_type text NOT NULL DEFAULT 'manual_block',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  notes text
);
ALTER TABLE public.mentor_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access mentor_flags" ON public.mentor_flags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users read own flags" ON public.mentor_flags
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3. Add source column to mentor_assignments
ALTER TABLE public.mentor_assignments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS level_at_assignment int,
  ADD COLUMN IF NOT EXISTS notes text;

-- 4. check_mentor_eligibility function
CREATE OR REPLACE FUNCTION public.check_mentor_eligibility(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_level int;
  v_kpi record;
  v_has_flags boolean;
  v_eligible boolean := false;
  v_reason text;
  v_kpi_score numeric := 0;
  v_mentee_count int;
BEGIN
  SELECT COALESCE(current_level, 0) INTO v_level
  FROM user_level_status WHERE user_id = p_user_id;

  IF v_level IS NULL OR v_level < 2 THEN
    v_reason := 'Level too low (min L2 required)';
    v_eligible := false;
  ELSE
    SELECT * INTO v_kpi FROM member_kpis WHERE user_id = p_user_id;

    SELECT EXISTS(
      SELECT 1 FROM mentor_flags WHERE user_id = p_user_id AND active = true
    ) INTO v_has_flags;

    IF v_has_flags THEN
      v_reason := 'Active flags exist';
      v_eligible := false;
    ELSIF v_kpi.user_id IS NULL THEN
      v_reason := 'No KPI data';
      v_eligible := false;
    ELSE
      v_kpi_score := COALESCE(v_kpi.show_rate, 0) * 0.3
                   + COALESCE(v_kpi.closing_rate, 0) * 0.4
                   + LEAST(COALESCE(v_kpi.calls_per_week, 0)::numeric / 15 * 100, 100) * 0.3;

      IF v_kpi_score >= 40 THEN
        v_eligible := true;
        v_reason := NULL;
      ELSE
        v_eligible := false;
        v_reason := format('KPI score too low: %.1f (min 40)', v_kpi_score);
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_mentee_count
  FROM mentor_assignments WHERE mentor_id = p_user_id AND active = true;

  INSERT INTO mentor_eligibility (user_id, is_eligible, last_checked_at, reason_blocked, kpi_score, mentee_count)
  VALUES (p_user_id, v_eligible, now(), v_reason, v_kpi_score, v_mentee_count)
  ON CONFLICT (user_id) DO UPDATE SET
    is_eligible = EXCLUDED.is_eligible,
    last_checked_at = now(),
    reason_blocked = EXCLUDED.reason_blocked,
    kpi_score = EXCLUDED.kpi_score,
    mentee_count = EXCLUDED.mentee_count;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'eligible', v_eligible,
    'reason', v_reason,
    'kpi_score', v_kpi_score,
    'level', v_level,
    'mentee_count', v_mentee_count
  );
END;
$$;

-- 5. assign_mentor_auto function
CREATE OR REPLACE FUNCTION public.assign_mentor_auto(p_mentee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mentee_level int;
  v_mentor record;
  v_found boolean := false;
  v_search_level int;
BEGIN
  SELECT COALESCE(current_level, 0) INTO v_mentee_level
  FROM user_level_status WHERE user_id = p_mentee_id;

  IF v_mentee_level IS NULL THEN v_mentee_level := 0; END IF;

  -- Check if already has active mentor
  IF EXISTS (SELECT 1 FROM mentor_assignments WHERE mentee_id = p_mentee_id AND active = true) THEN
    RETURN jsonb_build_object('status', 'already_assigned');
  END IF;

  -- Try L+1, then L+2
  FOR v_search_level IN (v_mentee_level + 1)..(v_mentee_level + 2) LOOP
    SELECT me.user_id INTO v_mentor
    FROM mentor_eligibility me
    JOIN user_level_status uls ON uls.user_id = me.user_id
    WHERE me.is_eligible = true
      AND uls.current_level = v_search_level
      AND me.mentee_count < me.max_mentees
    ORDER BY me.kpi_score DESC, me.mentee_count ASC
    LIMIT 1;

    IF v_mentor.user_id IS NOT NULL THEN
      v_found := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_found THEN
    INSERT INTO audit_logs (action, source_type, note, after_state)
    VALUES ('mentor_auto_assign_failed', 'system',
      format('No eligible mentor for user %s at L%s', p_mentee_id, v_mentee_level),
      jsonb_build_object('mentee_id', p_mentee_id, 'level', v_mentee_level));
    RETURN jsonb_build_object('status', 'no_mentor_available', 'mentee_level', v_mentee_level);
  END IF;

  INSERT INTO mentor_assignments (mentee_id, mentor_id, source, level_at_assignment, active, layer)
  VALUES (p_mentee_id, v_mentor.user_id, 'auto', v_mentee_level,  true,
    CASE WHEN v_mentee_level <= 3 THEN 'setter' ELSE 'closer' END);

  -- Update mentee count
  UPDATE mentor_eligibility SET mentee_count = mentee_count + 1 WHERE user_id = v_mentor.user_id;

  -- Create DM thread for mentor-mentee chat
  INSERT INTO chat_threads (user_a, user_b, opened_by, is_open)
  VALUES (
    LEAST(v_mentor.user_id, p_mentee_id),
    GREATEST(v_mentor.user_id, p_mentee_id),
    v_mentor.user_id,
    true
  ) ON CONFLICT DO NOTHING;

  INSERT INTO audit_logs (action, source_type, note, after_state)
  VALUES ('mentor_auto_assigned', 'system',
    format('Auto-assigned mentor %s to mentee %s', v_mentor.user_id, p_mentee_id),
    jsonb_build_object('mentor_id', v_mentor.user_id, 'mentee_id', p_mentee_id, 'level', v_mentee_level));

  RETURN jsonb_build_object(
    'status', 'assigned',
    'mentor_id', v_mentor.user_id,
    'mentee_id', p_mentee_id,
    'level', v_mentee_level
  );
END;
$$;

-- 6. reassign_mentees_from_mentor: when a mentor becomes ineligible
CREATE OR REPLACE FUNCTION public.reassign_mentees_from_mentor(p_mentor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mentee record;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  -- Deactivate all current assignments
  UPDATE mentor_assignments SET active = false
  WHERE mentor_id = p_mentor_id AND active = true;

  -- Reset mentee count
  UPDATE mentor_eligibility SET mentee_count = 0 WHERE user_id = p_mentor_id;

  -- Re-assign each mentee
  FOR v_mentee IN
    SELECT mentee_id FROM mentor_assignments
    WHERE mentor_id = p_mentor_id AND active = false
    AND created_at > now() - interval '30 days'
  LOOP
    v_result := assign_mentor_auto(v_mentee.mentee_id);
    v_results := v_results || v_result;
  END LOOP;

  RETURN jsonb_build_object('reassigned', jsonb_array_length(v_results), 'details', v_results);
END;
$$;

-- 7. Admin manual assign override
CREATE OR REPLACE FUNCTION public.admin_assign_mentor(p_mentor_id uuid, p_mentee_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mentee_level int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  -- Deactivate any existing assignment for this mentee
  UPDATE mentor_assignments SET active = false
  WHERE mentee_id = p_mentee_id AND active = true;

  SELECT COALESCE(current_level, 0) INTO v_mentee_level
  FROM user_level_status WHERE user_id = p_mentee_id;

  INSERT INTO mentor_assignments (mentee_id, mentor_id, source, level_at_assignment, active, notes, layer, created_by)
  VALUES (p_mentee_id, p_mentor_id, 'manual', v_mentee_level, true, p_notes,
    CASE WHEN COALESCE(v_mentee_level, 0) <= 3 THEN 'setter' ELSE 'closer' END,
    auth.uid());

  -- Create DM thread
  INSERT INTO chat_threads (user_a, user_b, opened_by, is_open)
  VALUES (
    LEAST(p_mentor_id, p_mentee_id),
    GREATEST(p_mentor_id, p_mentee_id),
    auth.uid(),
    true
  ) ON CONFLICT DO NOTHING;

  INSERT INTO audit_logs (action, actor_id, source_type, note, after_state)
  VALUES ('mentor_manual_assigned', auth.uid(), 'admin',
    format('Admin assigned mentor %s to mentee %s', p_mentor_id, p_mentee_id),
    jsonb_build_object('mentor_id', p_mentor_id, 'mentee_id', p_mentee_id, 'notes', p_notes));

  RETURN jsonb_build_object('success', true, 'mentor_id', p_mentor_id, 'mentee_id', p_mentee_id);
END;
$$;

-- 8. Admin toggle mentor block
CREATE OR REPLACE FUNCTION public.admin_toggle_mentor_block(p_user_id uuid, p_block boolean, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  IF p_block THEN
    INSERT INTO mentor_flags (user_id, flag_type, active, created_by, notes)
    VALUES (p_user_id, 'manual_block', true, auth.uid(), p_notes)
    ON CONFLICT DO NOTHING;

    UPDATE mentor_eligibility SET is_eligible = false, reason_blocked = 'Manual admin block'
    WHERE user_id = p_user_id;

    -- Reassign mentees
    PERFORM reassign_mentees_from_mentor(p_user_id);
  ELSE
    UPDATE mentor_flags SET active = false WHERE user_id = p_user_id AND flag_type = 'manual_block';
    PERFORM check_mentor_eligibility(p_user_id);
  END IF;

  INSERT INTO audit_logs (action, actor_id, source_type, note)
  VALUES (
    CASE WHEN p_block THEN 'mentor_blocked' ELSE 'mentor_unblocked' END,
    auth.uid(), 'admin',
    format('Admin %s mentor %s. Notes: %s', CASE WHEN p_block THEN 'blocked' ELSE 'unblocked' END, p_user_id, COALESCE(p_notes, ''))
  );

  RETURN jsonb_build_object('success', true, 'blocked', p_block);
END;
$$;
