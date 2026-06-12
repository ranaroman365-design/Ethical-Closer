
-- 1. Canonical mapping function
CREATE OR REPLACE FUNCTION public.canonical_business_stage(p_stage text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(trim(p_stage))
    -- canonical passthrough
    WHEN 'prospect'         THEN 'prospect'
    WHEN 'opener'           THEN 'opener'
    WHEN 'setter'           THEN 'setter'
    WHEN 'senior_associate' THEN 'senior_associate'
    WHEN 'junior_manager'   THEN 'junior_manager'
    WHEN 'manager'          THEN 'manager'
    WHEN 'senior_manager'   THEN 'senior_manager'
    WHEN 'director'         THEN 'director'
    WHEN 'partner'          THEN 'partner'
    -- aliases
    WHEN 'trainee'          THEN 'opener'
    WHEN 'applicant'        THEN 'prospect'
    WHEN 'associate'        THEN 'setter'
    WHEN 'associate_setter' THEN 'setter'
    WHEN 'senior_setter'    THEN 'senior_associate'
    WHEN 'senior_closer'    THEN 'senior_manager'
    WHEN 'junior_closer'    THEN 'junior_manager'
    WHEN 'managing_closer'  THEN 'manager'
    WHEN 'admin'            THEN 'partner'
    -- unknown → passthrough (trigger will handle fallback)
    ELSE lower(trim(p_stage))
  END;
$$;

-- 2. Stage → expected phase mapping
CREATE OR REPLACE FUNCTION public.stage_to_phase(p_stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_stage
    WHEN 'prospect'         THEN 1
    WHEN 'opener'           THEN 1
    WHEN 'setter'           THEN 3
    WHEN 'senior_associate' THEN 5
    WHEN 'junior_manager'   THEN 4
    WHEN 'manager'          THEN 5
    WHEN 'senior_manager'   THEN 6
    WHEN 'director'         THEN 8
    WHEN 'partner'          THEN 8
    ELSE 1
  END;
$$;

-- 3. Trigger function: normalize on insert/update
CREATE OR REPLACE FUNCTION public.trg_normalize_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_canonical text;
  v_expected_phase integer;
BEGIN
  -- Normalize business_stage
  v_canonical := canonical_business_stage(NEW.business_stage);
  NEW.business_stage := v_canonical;

  -- Ensure current_phase is at least as high as the stage implies
  v_expected_phase := stage_to_phase(v_canonical);
  IF NEW.current_phase < v_expected_phase THEN
    NEW.current_phase := v_expected_phase;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_profile_role ON profiles;
CREATE TRIGGER trg_normalize_profile_role
  BEFORE INSERT OR UPDATE OF business_stage, current_phase
  ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION trg_normalize_profile_role();

-- 4. Audit RPC
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
    LEFT JOIN operator_team_members otm ON otm.user_id = p.id
  LOOP
    v_issues := '[]'::jsonb;

    -- Check alias mismatch
    IF r.business_stage <> r.expected_stage THEN
      v_issues := v_issues || jsonb_build_object(
        'type', 'alias_not_normalized',
        'current', r.business_stage,
        'expected', r.expected_stage
      );
    END IF;

    -- Check phase too low
    IF r.current_phase < r.expected_min_phase THEN
      v_issues := v_issues || jsonb_build_object(
        'type', 'phase_too_low',
        'current_phase', r.current_phase,
        'expected_min', r.expected_min_phase
      );
    END IF;

    -- L6 (senior_manager, phase 6) should have operator unit
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

-- 5. Fix RPC
CREATE OR REPLACE FUNCTION public.fix_profile_role_consistency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fixed integer := 0;
  v_details jsonb := '[]'::jsonb;
  r record;
  v_canonical text;
  v_min_phase integer;
BEGIN
  FOR r IN
    SELECT id, full_name, business_stage, current_phase
    FROM profiles
    WHERE business_stage <> canonical_business_stage(business_stage)
       OR current_phase < stage_to_phase(canonical_business_stage(business_stage))
  LOOP
    v_canonical := canonical_business_stage(r.business_stage);
    v_min_phase := stage_to_phase(v_canonical);

    UPDATE profiles SET
      business_stage = v_canonical,
      current_phase = GREATEST(current_phase, v_min_phase)
    WHERE id = r.id;

    v_fixed := v_fixed + 1;
    v_details := v_details || jsonb_build_object(
      'user_id', r.id,
      'full_name', r.full_name,
      'old_stage', r.business_stage,
      'new_stage', v_canonical,
      'old_phase', r.current_phase,
      'new_phase', GREATEST(r.current_phase, v_min_phase)
    );
  END LOOP;

  RETURN jsonb_build_object('fixed', v_fixed, 'details', v_details);
END;
$$;

-- 6. Immediate backfill: normalize any existing aliases
UPDATE profiles SET
  business_stage = canonical_business_stage(business_stage),
  current_phase = GREATEST(current_phase, stage_to_phase(canonical_business_stage(business_stage)))
WHERE business_stage <> canonical_business_stage(business_stage)
   OR current_phase < stage_to_phase(canonical_business_stage(business_stage));
