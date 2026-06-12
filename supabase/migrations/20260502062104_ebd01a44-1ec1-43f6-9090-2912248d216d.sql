
CREATE OR REPLACE FUNCTION public.audit_profile_role_consistency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_issues jsonb;
  r record;
BEGIN
  FOR r IN
    SELECT
      p.id,
      p.full_name,
      p.business_stage,
      p.current_phase,
      p.is_test_user,
      canonical_business_stage(p.business_stage) AS expected_stage,
      stage_to_phase(canonical_business_stage(p.business_stage)) AS expected_min_phase,
      otm.team_role,
      (SELECT EXISTS(SELECT 1 FROM operator_units ou WHERE ou.operator_user_id = p.id)) AS has_operator_unit
    FROM profiles p
    LEFT JOIN operator_team_members otm ON otm.member_id = p.id
  LOOP
    v_issues := '[]'::jsonb;

    IF r.business_stage <> r.expected_stage THEN
      v_issues := v_issues || jsonb_build_object(
        'type', 'alias_not_normalized',
        'current', r.business_stage,
        'expected', r.expected_stage
      );
    END IF;

    IF r.current_phase < r.expected_min_phase THEN
      v_issues := v_issues || jsonb_build_object(
        'type', 'phase_too_low',
        'current_phase', r.current_phase,
        'expected_min', r.expected_min_phase
      );
    END IF;

    IF r.business_stage = 'senior_manager' AND r.current_phase >= 6 AND NOT r.has_operator_unit THEN
      v_issues := v_issues || jsonb_build_object(
        'type', 'l6_missing_operator_unit',
        'user', r.full_name
      );
    END IF;

    IF jsonb_array_length(v_issues) > 0 THEN
      v_result := v_result || jsonb_build_object(
        'user_id', r.id,
        'full_name', r.full_name,
        'business_stage', r.business_stage,
        'current_phase', r.current_phase,
        'is_test_user', r.is_test_user,
        'issues', v_issues
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_profiles', (SELECT count(*) FROM profiles),
    'issues_found', jsonb_array_length(v_result),
    'details', v_result
  );
END;
$$;
