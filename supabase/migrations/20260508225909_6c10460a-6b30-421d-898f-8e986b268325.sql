-- ═══════════════════════════════════════════════════════════════════
-- S5: CANONICAL PROMOTION EVALUATOR — SHADOW-ONLY
-- Additive only. No mutation of levels, commissions, certifications.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Extend audit table (additive, nullable)
ALTER TABLE public.promotion_evaluations
  ADD COLUMN IF NOT EXISTS readiness_score numeric,
  ADD COLUMN IF NOT EXISTS all_pass boolean,
  ADD COLUMN IF NOT EXISTS blockers_count integer,
  ADD COLUMN IF NOT EXISTS evaluation_payload jsonb,
  ADD COLUMN IF NOT EXISTS evaluator text DEFAULT 'canonical_v1';

-- 2. Inspection view of active level requirements
CREATE OR REPLACE VIEW public.level_kpi_requirements AS
SELECT level, role_name, kpi_key, threshold_operator, threshold_value, weight
FROM public.level_requirements
WHERE active = true;

COMMENT ON VIEW public.level_kpi_requirements IS
  'Revenue Operator Canon S5: read-only inspection of active level KPI thresholds.';

-- 3. Canonical promotion evaluator
CREATE OR REPLACE FUNCTION public.evaluate_promotion_canonical(
  p_user_id uuid,
  p_target_level integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level_text          text := 'L' || p_target_level;
  v_profile             record;
  v_kpis                public.member_kpis%ROWTYPE;
  v_rop                 record;
  v_blockers            jsonb := '[]'::jsonb;
  v_missing_kpis        jsonb := '[]'::jsonb;
  v_kpi_pass            boolean := true;
  v_academy_pass        boolean := true;
  v_application_pass    boolean := true;
  v_verification_pass   boolean := true;
  v_certification_pass  boolean := true;
  v_kpi_required        int := 0;
  v_kpi_passed          int := 0;
  v_completion_pct      numeric := 0;
  v_required_modules_ok boolean := false;
  v_required_quizzes_ok boolean := false;
  v_total_modules       int := 0;
  v_done_modules        int := 0;
  v_quizzes_passed      int := 0;
  v_sim_calls           int := 0;
  v_live_calls          int := 0;
  v_scorecard_count     int := 0;
  v_min_sim_calls       int;
  v_min_live_calls      int;
  v_required_tier       text;
  v_required_tier_rank  int;
  v_actual_tier_rank    int;
  v_score               numeric := 0;
  v_kpi_score           numeric := 0;
  v_ver_score           numeric := 0;
  v_cert_score          numeric := 0;
  v_app_score           numeric := 0;
  v_acad_score          numeric := 0;
  v_actual_value        numeric;
  v_passes              boolean;
  r                     record;
  v_result              jsonb;
BEGIN
  -- Identity / safety
  SELECT id, full_name, email, business_stage, certified, certification_status, current_phase
    INTO v_profile
  FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', 'user_not_found',
      'evaluated_at', now()
    );
  END IF;

  -- Pull canonical Revenue Operator Profile row (read-only, null-safe)
  SELECT * INTO v_rop FROM public.revenue_operator_profile WHERE user_id = p_user_id;

  -- Pull current KPIs (may be null)
  SELECT * INTO v_kpis FROM public.member_kpis WHERE user_id = p_user_id LIMIT 1;

  -- ── KPI GATE ────────────────────────────────────────────────
  FOR r IN
    SELECT kpi_key, threshold_operator, threshold_value, weight
    FROM public.level_requirements
    WHERE active = true AND level = v_level_text
  LOOP
    v_kpi_required := v_kpi_required + 1;

    v_actual_value := CASE r.kpi_key
      WHEN 'show_rate'              THEN v_kpis.show_rate
      WHEN 'closing_rate'           THEN v_kpis.closing_rate
      WHEN 'close_rate'             THEN v_kpis.closing_rate
      WHEN 'qualification_accuracy' THEN v_kpis.qualification_accuracy
      WHEN 'crm_hygiene_score'      THEN v_kpis.crm_hygiene_score
      WHEN 'follow_up_rate'         THEN v_kpis.follow_up_rate
      WHEN 'storno_rate'            THEN v_kpis.storno_rate
      WHEN 'response_time'          THEN v_kpis.response_time
      WHEN 'calls_per_week'         THEN v_kpis.calls_per_week
      WHEN 'calls_handled'          THEN v_kpis.calls_handled
      WHEN 'earnings_per_call'      THEN v_kpis.earnings_per_call
      WHEN 'revenue_closed'         THEN v_kpis.revenue_closed
      WHEN 'commission_earned'      THEN v_kpis.commission_earned
      WHEN 'lead_quality_sensitivity' THEN v_kpis.lead_quality_sensitivity
      WHEN 'booking_rate'           THEN NULL  -- not tracked in member_kpis
      WHEN 'contact_rate'           THEN NULL  -- not tracked in member_kpis
      ELSE NULL
    END;

    IF v_actual_value IS NULL THEN
      v_passes := false;
      v_blockers := v_blockers || jsonb_build_object(
        'category','kpi','code','kpi_missing_'||r.kpi_key,
        'message', format('KPI "%s" not yet tracked for this user', r.kpi_key),
        'severity','medium'
      );
      v_missing_kpis := v_missing_kpis || jsonb_build_object(
        'kpi_key', r.kpi_key,
        'required_value', r.threshold_value,
        'actual_value', NULL,
        'delta', NULL
      );
    ELSE
      v_passes := CASE r.threshold_operator
        WHEN '>=' THEN v_actual_value >= r.threshold_value
        WHEN '<=' THEN v_actual_value <= r.threshold_value
        WHEN '='  THEN v_actual_value =  r.threshold_value
        WHEN '>'  THEN v_actual_value >  r.threshold_value
        WHEN '<'  THEN v_actual_value <  r.threshold_value
        ELSE false
      END;

      IF v_passes THEN
        v_kpi_passed := v_kpi_passed + 1;
      ELSE
        v_blockers := v_blockers || jsonb_build_object(
          'category','kpi',
          'code','kpi_below_threshold_'||r.kpi_key,
          'message', format('KPI "%s" %s %s required, actual %s',
            r.kpi_key, r.threshold_operator, r.threshold_value, v_actual_value),
          'severity','high'
        );
        v_missing_kpis := v_missing_kpis || jsonb_build_object(
          'kpi_key', r.kpi_key,
          'required_value', r.threshold_value,
          'actual_value', v_actual_value,
          'delta', v_actual_value - r.threshold_value
        );
      END IF;
    END IF;
  END LOOP;

  IF v_kpi_required = 0 THEN
    -- No requirements defined for level → cannot affirmatively pass
    v_kpi_pass := false;
    v_blockers := v_blockers || jsonb_build_object(
      'category','kpi','code','no_kpi_requirements_defined',
      'message', format('No active level_requirements rows for %s', v_level_text),
      'severity','high'
    );
    v_kpi_score := 0;
  ELSE
    v_kpi_pass := (v_kpi_passed = v_kpi_required);
    v_kpi_score := (v_kpi_passed::numeric / v_kpi_required) * 100;
  END IF;

  -- ── ACADEMY GATE ─────────────────────────────────────────────
  SELECT COUNT(*) INTO v_total_modules FROM public.modules;
  SELECT COUNT(*) INTO v_done_modules
  FROM public.member_progress
  WHERE user_id = p_user_id AND completed = true;

  IF v_total_modules > 0 THEN
    v_completion_pct := (v_done_modules::numeric / v_total_modules) * 100;
  END IF;

  -- Heuristic per target level (conservative, configurable later via level_requirements extension)
  v_required_modules_ok := CASE
    WHEN p_target_level <= 2 THEN v_completion_pct >= 40
    WHEN p_target_level <= 4 THEN v_completion_pct >= 70
    ELSE v_completion_pct >= 85
  END;

  SELECT COUNT(*) INTO v_quizzes_passed
  FROM public.quiz_attempts
  WHERE user_id = p_user_id AND passed = true;

  v_required_quizzes_ok := CASE
    WHEN p_target_level <= 2 THEN v_quizzes_passed >= 1
    WHEN p_target_level <= 4 THEN v_quizzes_passed >= 3
    ELSE v_quizzes_passed >= 5
  END;

  v_academy_pass := v_required_modules_ok AND v_required_quizzes_ok;
  v_acad_score := LEAST(100, v_completion_pct);

  IF NOT v_required_modules_ok THEN
    v_blockers := v_blockers || jsonb_build_object(
      'category','academy','code','academy_modules_incomplete',
      'message', format('Academy completion %.1f%% — required for L%s',
        v_completion_pct, p_target_level),
      'severity','medium'
    );
  END IF;
  IF NOT v_required_quizzes_ok THEN
    v_blockers := v_blockers || jsonb_build_object(
      'category','academy','code','academy_quizzes_insufficient',
      'message', format('Quizzes passed: %s — insufficient for L%s', v_quizzes_passed, p_target_level),
      'severity','medium'
    );
  END IF;

  -- ── APPLICATION GATE ────────────────────────────────────────
  SELECT COUNT(*) INTO v_sim_calls
  FROM public.practice_calls WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_live_calls
  FROM public.calls
  WHERE COALESCE(revenue_owner_user_id, user_id) = p_user_id
    AND COALESCE(is_simulation, false) = false;

  SELECT COUNT(*) INTO v_scorecard_count
  FROM public.operator_scorecards
  WHERE operator_email = v_profile.email;

  v_min_sim_calls := CASE
    WHEN p_target_level <= 2 THEN 3
    WHEN p_target_level <= 4 THEN 5
    ELSE 5
  END;

  v_min_live_calls := CASE
    WHEN p_target_level <= 2 THEN 0
    WHEN p_target_level <= 3 THEN 5
    WHEN p_target_level <= 4 THEN 20
    WHEN p_target_level <= 5 THEN 50
    WHEN p_target_level <= 6 THEN 100
    ELSE 200
  END;

  v_application_pass :=
    (v_sim_calls >= v_min_sim_calls) AND
    (v_live_calls >= v_min_live_calls);

  v_app_score := LEAST(100,
    CASE WHEN v_min_sim_calls > 0
         THEN (LEAST(v_sim_calls, v_min_sim_calls)::numeric / v_min_sim_calls) * 50
         ELSE 50 END
    +
    CASE WHEN v_min_live_calls > 0
         THEN (LEAST(v_live_calls, v_min_live_calls)::numeric / v_min_live_calls) * 50
         ELSE 50 END
  );

  IF v_sim_calls < v_min_sim_calls THEN
    v_blockers := v_blockers || jsonb_build_object(
      'category','application','code','simulation_calls_insufficient',
      'message', format('Simulation calls: %s — need %s', v_sim_calls, v_min_sim_calls),
      'severity','medium'
    );
  END IF;
  IF v_live_calls < v_min_live_calls THEN
    v_blockers := v_blockers || jsonb_build_object(
      'category','application','code','live_calls_insufficient',
      'message', format('Live calls: %s — need %s', v_live_calls, v_min_live_calls),
      'severity','high'
    );
  END IF;

  -- ── VERIFICATION GATE ────────────────────────────────────────
  v_required_tier := CASE
    WHEN p_target_level <= 2 THEN 'T0_COMPUTED'
    WHEN p_target_level <= 3 THEN 'T1_SELF_REPORTED'
    WHEN p_target_level <= 4 THEN 'T2_PROOF_UPLOADED'
    WHEN p_target_level <= 6 THEN 'T3_REVIEWED'
    ELSE 'T4_CERTIFIED'
  END;

  v_required_tier_rank := CASE v_required_tier
    WHEN 'T0_COMPUTED' THEN 0 WHEN 'T1_SELF_REPORTED' THEN 1
    WHEN 'T2_PROOF_UPLOADED' THEN 2 WHEN 'T3_REVIEWED' THEN 3
    WHEN 'T4_CERTIFIED' THEN 4 ELSE 0 END;

  v_actual_tier_rank := CASE COALESCE(v_rop.verification_tier, 'T0_COMPUTED')
    WHEN 'T0_COMPUTED' THEN 0 WHEN 'T1_SELF_REPORTED' THEN 1
    WHEN 'T2_PROOF_UPLOADED' THEN 2 WHEN 'T3_REVIEWED' THEN 3
    WHEN 'T4_CERTIFIED' THEN 4 ELSE 0 END;

  v_verification_pass := v_actual_tier_rank >= v_required_tier_rank;
  v_ver_score := LEAST(100, COALESCE(v_rop.verification_confidence, 0)
    + CASE WHEN v_verification_pass THEN 25 ELSE 0 END);

  IF NOT v_verification_pass THEN
    v_blockers := v_blockers || jsonb_build_object(
      'category','verification','code','verification_tier_insufficient',
      'message', format('Verification tier %s required, actual %s',
        v_required_tier, COALESCE(v_rop.verification_tier,'T0_COMPUTED')),
      'severity','high'
    );
  END IF;

  -- Detect "fake certified" — flagged certified user with zero proof rows
  IF COALESCE(v_profile.certified, false) = true
     AND COALESCE(v_rop.proof_count, 0) = 0
     AND COALESCE(v_rop.verification_count, 0) = 0
     AND p_target_level >= 4
  THEN
    v_blockers := v_blockers || jsonb_build_object(
      'category','verification','code','certification_without_proof',
      'message','User flagged as certified but no proof or verification rows exist',
      'severity','high'
    );
    v_verification_pass := false;
  END IF;

  -- ── CERTIFICATION GATE ──────────────────────────────────────
  v_certification_pass := CASE
    WHEN p_target_level <= 3 THEN true                                  -- not required
    WHEN p_target_level >= 4 THEN COALESCE(v_profile.certified, false)  -- required from L4+
    ELSE false
  END;
  v_cert_score := CASE WHEN v_certification_pass THEN 100 ELSE 0 END;

  IF NOT v_certification_pass THEN
    v_blockers := v_blockers || jsonb_build_object(
      'category','certification','code','certification_required',
      'message', format('Certification required for L%s, current status: %s',
        p_target_level, COALESCE(v_profile.certification_status::text,'none')),
      'severity','high'
    );
  END IF;

  -- ── READINESS SCORE (weighted) ──────────────────────────────
  v_score := ROUND(
      v_kpi_score  * 0.35
    + v_ver_score  * 0.20
    + v_cert_score * 0.15
    + v_app_score  * 0.15
    + v_acad_score * 0.15
  , 2);
  v_score := GREATEST(0, LEAST(100, v_score));

  -- ── ASSEMBLE PAYLOAD ────────────────────────────────────────
  v_result := jsonb_build_object(
    'academy_pass', v_academy_pass,
    'application_pass', v_application_pass,
    'kpi_pass', v_kpi_pass,
    'verification_pass', v_verification_pass,
    'certification_pass', v_certification_pass,
    'all_pass', (v_academy_pass AND v_application_pass AND v_kpi_pass
                 AND v_verification_pass AND v_certification_pass),
    'readiness_score', v_score,
    'blockers', v_blockers,
    'missing_kpis', v_missing_kpis,
    'verification_summary', jsonb_build_object(
      'verification_tier',  COALESCE(v_rop.verification_tier,'T0_COMPUTED'),
      'required_tier',      v_required_tier,
      'proof_count',        COALESCE(v_rop.proof_count, 0),
      'verification_count', COALESCE(v_rop.verification_count, 0),
      'confidence',         COALESCE(v_rop.verification_confidence, 0)
    ),
    'certification_summary', jsonb_build_object(
      'certification_status', v_profile.certification_status,
      'certified_at',         v_rop.certified_at,
      'legacy_certified',     COALESCE(v_profile.certified, false)
    ),
    'academy_summary', jsonb_build_object(
      'completion_pct',           v_completion_pct,
      'modules_total',            v_total_modules,
      'modules_done',             v_done_modules,
      'quizzes_passed',           v_quizzes_passed,
      'required_modules_complete',v_required_modules_ok,
      'required_quizzes_passed',  v_required_quizzes_ok
    ),
    'application_summary', jsonb_build_object(
      'simulation_calls_completed', v_sim_calls,
      'live_calls_completed',       v_live_calls,
      'scorecard_count',            v_scorecard_count,
      'min_simulation_calls',       v_min_sim_calls,
      'min_live_calls',             v_min_live_calls,
      'application_pass',           v_application_pass
    ),
    'track_record_summary', jsonb_build_object(
      'lifetime_calls',          COALESCE(v_rop.lifetime_calls, 0),
      'lifetime_shows',          COALESCE(v_rop.lifetime_shows, 0),
      'lifetime_closings',       COALESCE(v_rop.lifetime_closings, 0),
      'lifetime_revenue_closed', COALESCE(v_rop.lifetime_revenue_closed, 0)
    ),
    'evaluator_version', 'canonical_v1',
    'target_level',      p_target_level,
    'evaluated_at',      now()
  );

  -- ── AUDIT LOG (no promotion) ────────────────────────────────
  INSERT INTO public.promotion_evaluations (
    user_id, current_level, target_level,
    show_rate, close_rate, earnings_per_call,
    threshold_passed, evaluation_reason,
    readiness_score, all_pass, blockers_count,
    evaluation_payload, evaluator
  ) VALUES (
    p_user_id,
    NULLIF(regexp_replace(COALESCE(v_rop.current_level,''),'\D','','g'),'')::int,
    p_target_level,
    v_kpis.show_rate,
    v_kpis.closing_rate,
    v_kpis.earnings_per_call,
    (v_result->>'all_pass')::boolean,
    'canonical_v1 shadow evaluation',
    v_score,
    (v_result->>'all_pass')::boolean,
    jsonb_array_length(v_blockers),
    v_result,
    'canonical_v1'
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.evaluate_promotion_canonical(uuid, integer) IS
  'Revenue Operator Canon S5: shadow-only canonical promotion evaluator. Reads canonical KPI/Cert/Verification/Academy/Application sources and writes one audit row to promotion_evaluations. NEVER promotes, never mutates levels/commissions/permissions.';

REVOKE ALL ON FUNCTION public.evaluate_promotion_canonical(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_promotion_canonical(uuid, integer) TO authenticated, service_role;