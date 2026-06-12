
-- Drop and recreate assign_mentor_auto with correct signature
DROP FUNCTION IF EXISTS public.assign_mentor_auto(uuid);

CREATE OR REPLACE FUNCTION public.assign_mentor_auto(p_mentee_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mentee_stage text;
  v_mentor_id uuid;
  v_stage_order text[] := ARRAY['opener','setter','senior_associate','junior_manager','manager','senior_manager','director','partner'];
  v_idx int;
  v_target_stage text;
  v_level_at int;
BEGIN
  SELECT business_stage INTO v_mentee_stage FROM profiles WHERE id = p_mentee_id;
  IF v_mentee_stage IS NULL THEN RETURN NULL; END IF;

  v_idx := array_position(v_stage_order, v_mentee_stage);
  IF v_idx IS NULL THEN v_idx := 1; END IF;

  FOR i IN 1..2 LOOP
    IF (v_idx + i) <= array_length(v_stage_order, 1) THEN
      v_target_stage := v_stage_order[v_idx + i];

      SELECT p.id INTO v_mentor_id
      FROM profiles p
      INNER JOIN mentor_eligibility me ON me.user_id = p.id AND me.is_eligible = true
        AND (me.mentee_count < me.max_mentees OR me.max_mentees IS NULL)
      LEFT JOIN mentor_scores ms ON ms.user_id = p.id
      WHERE p.business_stage = v_target_stage
        AND NOT EXISTS (
          SELECT 1 FROM mentor_flags mf WHERE mf.user_id = p.id AND mf.active = true AND mf.flag_type = 'manual_block'
        )
        AND NOT EXISTS (
          SELECT 1 FROM mentor_assignments ma WHERE ma.mentor_id = p.id AND ma.mentee_id = p_mentee_id AND ma.active = true
        )
      ORDER BY COALESCE(ms.mentor_score_total, 50) DESC, COALESCE(me.mentee_count, 0) ASC
      LIMIT 1;

      IF v_mentor_id IS NOT NULL THEN
        v_level_at := v_idx;
        INSERT INTO mentor_assignments (mentee_id, mentor_id, level_at_assignment, source, active)
        VALUES (p_mentee_id, v_mentor_id, v_level_at, 'auto', true);
        UPDATE mentor_eligibility SET mentee_count = COALESCE(mentee_count, 0) + 1 WHERE user_id = v_mentor_id;
        RETURN v_mentor_id;
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;
