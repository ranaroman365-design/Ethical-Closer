
-- Re-apply same migration (idempotent), with safer deprecation block.
INSERT INTO public.level_requirements (level, role_name, kpi_key, threshold_operator, threshold_value, weight, active)
VALUES
  ('L1','Opener','contact_rate','>=',35,1,true),
  ('L1','Opener','response_time','<=',60,1,true),
  ('L1','Opener','show_rate','>=',60,1,true),
  ('L1','Opener','follow_up_rate','>=',80,1,true),
  ('L1','Opener','crm_hygiene_score','>=',80,1,true),
  ('L2','Associate Setter','booking_rate','>=',20,1,true),
  ('L2','Associate Setter','qualification_accuracy','>=',70,1,true),
  ('L2','Associate Setter','show_rate','>=',70,1,true),
  ('L2','Associate Setter','crm_hygiene_score','>=',90,1,true),
  ('L2','Associate Setter','storno_rate','<=',12,1,true),
  ('L2','Associate Setter','response_time','<=',15,1,true),
  ('L2','Associate Setter','follow_up_rate','>=',90,1,true),
  ('L3','Senior Setter','qualification_accuracy','>=',80,1,true),
  ('L3','Senior Setter','show_rate','>=',77,1,true),
  ('L3','Senior Setter','handover_rate','>=',60,1,true),
  ('L3','Senior Setter','storno_rate','<=',10,1,true),
  ('L3','Senior Setter','follow_up_rate','>=',95,1,true),
  ('L3','Senior Setter','crm_hygiene_score','>=',95,1,true),
  ('L4','Junior Closer','closing_rate','>=',20,1,true),
  ('L4','Junior Closer','show_rate','>=',75,1,true),
  ('L4','Junior Closer','revenue_closed','>=',10000,1,true),
  ('L4','Junior Closer','storno_rate','<=',10,1,true),
  ('L4','Junior Closer','follow_up_rate','>=',95,1,true),
  ('L4','Junior Closer','crm_hygiene_score','>=',95,1,true),
  ('L5','Manager Closer','closing_rate','>=',27,1,true),
  ('L5','Manager Closer','show_rate','>=',80,1,true),
  ('L5','Manager Closer','revenue_closed','>=',25000,1,true),
  ('L5','Manager Closer','storno_rate','<=',8,1,true),
  ('L5','Manager Closer','earnings_per_call','>=',200,1,true),
  ('L5','Manager Closer','follow_up_rate','>=',100,1,true),
  ('L5','Manager Closer','crm_hygiene_score','>=',98,1,true),
  ('L6','Operator','closing_rate','>=',32,1,true),
  ('L6','Operator','show_rate','>=',85,2,true),
  ('L6','Operator','revenue_closed','>=',50000,2,true),
  ('L6','Operator','storno_rate','<=',5,1,true),
  ('L6','Operator','team_revenue','>=',100000,2,true),
  ('L6','Operator','team_kpi_stability','>=',80,1,true),
  ('L6','Operator','revenue_consistency','>=',80,1,true),
  ('L7','Director','subtree_revenue','>=',500000,2,true),
  ('L7','Director','active_units','>=',3,1,true),
  ('L7','Director','portfolio_stability','>=',85,1,true),
  ('L7','Director','override_revenue','>=',20000,1,true),
  ('L7','Director','governance_readiness','>=',80,1,true),
  ('L8','Partner','portfolio_revenue','>=',2000000,1,true),
  ('L8','Partner','active_operators','>=',5,1,true),
  ('L8','Partner','governance_signoff','>=',1,1,true)
ON CONFLICT (level, kpi_key) DO UPDATE SET
  role_name = EXCLUDED.role_name, threshold_operator = EXCLUDED.threshold_operator,
  threshold_value = EXCLUDED.threshold_value, weight = EXCLUDED.weight,
  active = true, updated_at = now();

CREATE TABLE IF NOT EXISTS public.canonical_threshold_mirror (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL, kpi_key text NOT NULL,
  threshold_operator text NOT NULL, threshold_value numeric NOT NULL,
  source text NOT NULL DEFAULT 'src/lib/canonical-thresholds.ts',
  notes text, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (level, kpi_key, source)
);
ALTER TABLE public.canonical_threshold_mirror ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ctm_read" ON public.canonical_threshold_mirror;
CREATE POLICY "ctm_read" ON public.canonical_threshold_mirror FOR SELECT USING (true);
DROP POLICY IF EXISTS "ctm_admin_write" ON public.canonical_threshold_mirror;
CREATE POLICY "ctm_admin_write" ON public.canonical_threshold_mirror FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

INSERT INTO public.canonical_threshold_mirror (level, kpi_key, threshold_operator, threshold_value) VALUES
  ('L1','show_rate','>=',60),('L1','storno_rate','<=',15),('L1','response_time','<=',30),
  ('L1','follow_up_rate','>=',80),('L1','crm_hygiene_score','>=',80),
  ('L2','show_rate','>=',70),('L2','qualification_accuracy','>=',60),('L2','handover_rate','>=',50),
  ('L2','storno_rate','<=',12),('L2','response_time','<=',15),('L2','follow_up_rate','>=',90),('L2','crm_hygiene_score','>=',90),
  ('L3','show_rate','>=',77),('L3','qualification_accuracy','>=',70),('L3','handover_rate','>=',60),
  ('L3','storno_rate','<=',10),('L3','response_time','<=',10),('L3','follow_up_rate','>=',95),('L3','crm_hygiene_score','>=',95),
  ('L4','closing_rate','>=',20),('L4','show_rate','>=',75),('L4','revenue_closed','>=',10000),
  ('L4','storno_rate','<=',10),('L4','response_time','<=',10),('L4','follow_up_rate','>=',95),('L4','crm_hygiene_score','>=',95),
  ('L5','closing_rate','>=',27),('L5','show_rate','>=',80),('L5','revenue_closed','>=',25000),
  ('L5','storno_rate','<=',8),('L5','response_time','<=',5),('L5','follow_up_rate','>=',100),('L5','crm_hygiene_score','>=',98),
  ('L6','closing_rate','>=',32),('L6','show_rate','>=',85),('L6','revenue_closed','>=',50000),
  ('L6','storno_rate','<=',5),('L6','response_time','<=',5),('L6','follow_up_rate','>=',100),('L6','crm_hygiene_score','>=',98)
ON CONFLICT (level, kpi_key, source) DO UPDATE SET
  threshold_operator = EXCLUDED.threshold_operator,
  threshold_value = EXCLUDED.threshold_value, updated_at = now();

CREATE OR REPLACE FUNCTION public.audit_kpi_threshold_drift()
RETURNS TABLE (level text, kpi_key text, ts_operator text, ts_value numeric,
  db_operator text, db_value numeric, status text, severity text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ts AS (SELECT level, kpi_key, threshold_operator AS op, threshold_value AS val FROM public.canonical_threshold_mirror),
  db AS (SELECT level, kpi_key, threshold_operator AS op, threshold_value AS val FROM public.level_requirements WHERE active = true)
  SELECT COALESCE(ts.level, db.level), COALESCE(ts.kpi_key, db.kpi_key),
    ts.op, ts.val, db.op, db.val,
    CASE WHEN ts.kpi_key IS NULL THEN 'missing_in_ts'
         WHEN db.kpi_key IS NULL THEN 'missing_in_db'
         WHEN ts.op = db.op AND ts.val = db.val THEN 'match' ELSE 'conflict' END,
    CASE WHEN ts.kpi_key IS NULL OR db.kpi_key IS NULL THEN 'medium'
         WHEN ts.op = db.op AND ts.val = db.val THEN 'none'
         WHEN ts.op <> db.op THEN 'high'
         WHEN abs(ts.val - db.val) / NULLIF(GREATEST(ts.val, db.val),0) > 0.25 THEN 'high'
         ELSE 'low' END
  FROM ts FULL OUTER JOIN db USING (level, kpi_key) ORDER BY 1, 2;
$$;
GRANT EXECUTE ON FUNCTION public.audit_kpi_threshold_drift() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.level_academy_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_level integer NOT NULL UNIQUE,
  required_module_group text,
  min_completion_pct numeric NOT NULL DEFAULT 0,
  min_quizzes_passed integer NOT NULL DEFAULT 0,
  min_quiz_score numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.level_academy_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lar_read" ON public.level_academy_requirements;
CREATE POLICY "lar_read" ON public.level_academy_requirements FOR SELECT USING (true);
DROP POLICY IF EXISTS "lar_admin" ON public.level_academy_requirements;
CREATE POLICY "lar_admin" ON public.level_academy_requirements FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
INSERT INTO public.level_academy_requirements (target_level, min_completion_pct, min_quizzes_passed, min_quiz_score) VALUES
  (1,20,0,0),(2,40,1,70),(3,60,2,75),(4,75,3,80),(5,85,4,80),(6,90,5,85),(7,95,6,85),(8,100,7,90)
ON CONFLICT (target_level) DO UPDATE SET
  min_completion_pct = EXCLUDED.min_completion_pct,
  min_quizzes_passed = EXCLUDED.min_quizzes_passed,
  min_quiz_score = EXCLUDED.min_quiz_score, updated_at = now();

CREATE TABLE IF NOT EXISTS public.level_application_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_level integer NOT NULL UNIQUE,
  min_simulation_calls integer NOT NULL DEFAULT 0,
  min_live_calls integer NOT NULL DEFAULT 0,
  min_scorecards integer NOT NULL DEFAULT 0,
  min_supervised_calls integer NOT NULL DEFAULT 0,
  min_review_score numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.level_application_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lapp_read" ON public.level_application_requirements;
CREATE POLICY "lapp_read" ON public.level_application_requirements FOR SELECT USING (true);
DROP POLICY IF EXISTS "lapp_admin" ON public.level_application_requirements;
CREATE POLICY "lapp_admin" ON public.level_application_requirements FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
INSERT INTO public.level_application_requirements (target_level, min_simulation_calls, min_live_calls, min_scorecards, min_supervised_calls, min_review_score) VALUES
  (1,0,0,0,0,0),(2,3,0,0,1,60),(3,5,5,1,2,70),(4,5,20,3,3,75),
  (5,5,50,5,5,80),(6,5,100,10,5,85),(7,5,200,15,8,88),(8,5,400,25,10,90)
ON CONFLICT (target_level) DO UPDATE SET
  min_simulation_calls = EXCLUDED.min_simulation_calls,
  min_live_calls = EXCLUDED.min_live_calls,
  min_scorecards = EXCLUDED.min_scorecards,
  min_supervised_calls = EXCLUDED.min_supervised_calls,
  min_review_score = EXCLUDED.min_review_score, updated_at = now();

CREATE OR REPLACE FUNCTION public.evaluate_promotion_canonical(p_user_id uuid, p_target_level integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_level_text text := 'L' || p_target_level;
  v_profile record; v_kpis public.member_kpis%ROWTYPE; v_rop record;
  v_blockers jsonb := '[]'::jsonb; v_missing_kpis jsonb := '[]'::jsonb;
  v_kpi_pass boolean := true; v_academy_pass boolean := true;
  v_application_pass boolean := true; v_verification_pass boolean := true;
  v_certification_pass boolean := true;
  v_kpi_required int := 0; v_kpi_passed int := 0;
  v_completion_pct numeric := 0; v_required_modules_ok boolean := false;
  v_required_quizzes_ok boolean := false; v_total_modules int := 0;
  v_done_modules int := 0; v_quizzes_passed int := 0;
  v_sim_calls int := 0; v_live_calls int := 0; v_scorecard_count int := 0;
  v_min_sim_calls int; v_min_live_calls int;
  v_min_completion_pct numeric; v_min_quizzes_passed int; v_min_scorecards int;
  v_required_tier text; v_required_tier_rank int; v_actual_tier_rank int;
  v_score numeric := 0; v_kpi_score numeric := 0; v_ver_score numeric := 0;
  v_cert_score numeric := 0; v_app_score numeric := 0; v_acad_score numeric := 0;
  v_actual_value numeric; v_passes boolean;
  v_acad_req record; v_app_req record; r record; v_result jsonb;
BEGIN
  SELECT id, full_name, email, business_stage, certified, certification_status, current_phase
    INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','user_not_found','evaluated_at', now()); END IF;
  SELECT * INTO v_rop FROM public.revenue_operator_profile WHERE user_id = p_user_id;
  SELECT * INTO v_kpis FROM public.member_kpis WHERE user_id = p_user_id LIMIT 1;

  FOR r IN SELECT kpi_key, threshold_operator, threshold_value, weight
    FROM public.level_requirements WHERE active = true AND level = v_level_text LOOP
    v_kpi_required := v_kpi_required + 1;
    v_actual_value := CASE r.kpi_key
      WHEN 'show_rate' THEN v_kpis.show_rate WHEN 'closing_rate' THEN v_kpis.closing_rate
      WHEN 'close_rate' THEN v_kpis.closing_rate
      WHEN 'qualification_accuracy' THEN v_kpis.qualification_accuracy
      WHEN 'crm_hygiene_score' THEN v_kpis.crm_hygiene_score
      WHEN 'follow_up_rate' THEN v_kpis.follow_up_rate
      WHEN 'storno_rate' THEN v_kpis.storno_rate
      WHEN 'response_time' THEN v_kpis.response_time
      WHEN 'calls_per_week' THEN v_kpis.calls_per_week
      WHEN 'calls_handled' THEN v_kpis.calls_handled
      WHEN 'earnings_per_call' THEN v_kpis.earnings_per_call
      WHEN 'revenue_closed' THEN v_kpis.revenue_closed
      WHEN 'commission_earned' THEN v_kpis.commission_earned
      WHEN 'team_revenue' THEN COALESCE(v_rop.team_revenue, 0)
      WHEN 'override_revenue' THEN COALESCE(v_rop.lifetime_override_revenue, 0)
      ELSE NULL END;
    IF v_actual_value IS NULL THEN
      v_blockers := v_blockers || jsonb_build_object('category','kpi','code','kpi_missing_'||r.kpi_key,
        'message', format('KPI "%s" not yet tracked for this user', r.kpi_key),'severity','medium');
      v_missing_kpis := v_missing_kpis || jsonb_build_object('kpi_key', r.kpi_key,
        'required_value', r.threshold_value,'actual_value', NULL,'delta', NULL);
    ELSE
      v_passes := CASE r.threshold_operator WHEN '>=' THEN v_actual_value >= r.threshold_value
        WHEN '<=' THEN v_actual_value <= r.threshold_value WHEN '=' THEN v_actual_value = r.threshold_value
        WHEN '>' THEN v_actual_value > r.threshold_value WHEN '<' THEN v_actual_value < r.threshold_value
        ELSE false END;
      IF v_passes THEN v_kpi_passed := v_kpi_passed + 1;
      ELSE
        v_blockers := v_blockers || jsonb_build_object('category','kpi','code','kpi_below_threshold_'||r.kpi_key,
          'message', format('KPI "%s" %s %s required, actual %s', r.kpi_key, r.threshold_operator, r.threshold_value, v_actual_value),
          'severity','high');
        v_missing_kpis := v_missing_kpis || jsonb_build_object('kpi_key', r.kpi_key,
          'required_value', r.threshold_value,'actual_value', v_actual_value,'delta', v_actual_value - r.threshold_value);
      END IF;
    END IF;
  END LOOP;

  IF v_kpi_required = 0 THEN
    v_kpi_pass := false;
    v_blockers := v_blockers || jsonb_build_object('category','kpi','code','no_kpi_requirements_defined',
      'message', format('No active level_requirements rows for %s', v_level_text),'severity','high');
    v_kpi_score := 0;
  ELSE
    v_kpi_pass := (v_kpi_passed = v_kpi_required);
    v_kpi_score := (v_kpi_passed::numeric / v_kpi_required) * 100;
  END IF;

  SELECT * INTO v_acad_req FROM public.level_academy_requirements WHERE target_level = p_target_level AND active = true LIMIT 1;
  SELECT COUNT(*) INTO v_total_modules FROM public.modules;
  SELECT COUNT(*) INTO v_done_modules FROM public.member_progress WHERE user_id = p_user_id AND completed = true;
  IF v_total_modules > 0 THEN v_completion_pct := (v_done_modules::numeric / v_total_modules) * 100; END IF;
  SELECT COUNT(*) INTO v_quizzes_passed FROM public.quiz_attempts WHERE user_id = p_user_id AND passed = true;

  IF v_acad_req.target_level IS NOT NULL THEN
    v_min_completion_pct := v_acad_req.min_completion_pct;
    v_min_quizzes_passed := v_acad_req.min_quizzes_passed;
  ELSE
    v_min_completion_pct := CASE WHEN p_target_level<=2 THEN 40 WHEN p_target_level<=4 THEN 70 ELSE 85 END;
    v_min_quizzes_passed := CASE WHEN p_target_level<=2 THEN 1 WHEN p_target_level<=4 THEN 3 ELSE 5 END;
  END IF;
  v_required_modules_ok := v_completion_pct >= v_min_completion_pct;
  v_required_quizzes_ok := v_quizzes_passed >= v_min_quizzes_passed;
  v_academy_pass := v_required_modules_ok AND v_required_quizzes_ok;
  v_acad_score := LEAST(100, v_completion_pct);
  IF NOT v_required_modules_ok THEN
    v_blockers := v_blockers || jsonb_build_object('category','academy','code','academy_modules_incomplete',
      'message', format('Academy completion %.1f%% — required %.0f%% for L%s', v_completion_pct, v_min_completion_pct, p_target_level),
      'severity','medium');
  END IF;
  IF NOT v_required_quizzes_ok THEN
    v_blockers := v_blockers || jsonb_build_object('category','academy','code','academy_quizzes_insufficient',
      'message', format('Quizzes passed: %s — need %s for L%s', v_quizzes_passed, v_min_quizzes_passed, p_target_level),'severity','medium');
  END IF;

  SELECT * INTO v_app_req FROM public.level_application_requirements WHERE target_level = p_target_level AND active = true LIMIT 1;
  SELECT COUNT(*) INTO v_sim_calls FROM public.practice_calls WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_live_calls FROM public.calls
    WHERE COALESCE(revenue_owner_user_id, user_id) = p_user_id AND COALESCE(is_simulation, false) = false;
  SELECT COUNT(*) INTO v_scorecard_count FROM public.operator_scorecards WHERE operator_email = v_profile.email;

  IF v_app_req.target_level IS NOT NULL THEN
    v_min_sim_calls := v_app_req.min_simulation_calls;
    v_min_live_calls := v_app_req.min_live_calls;
    v_min_scorecards := v_app_req.min_scorecards;
  ELSE
    v_min_sim_calls := CASE WHEN p_target_level<=2 THEN 3 WHEN p_target_level<=4 THEN 5 ELSE 5 END;
    v_min_live_calls := CASE WHEN p_target_level<=2 THEN 0 WHEN p_target_level<=3 THEN 5
      WHEN p_target_level<=4 THEN 20 WHEN p_target_level<=5 THEN 50
      WHEN p_target_level<=6 THEN 100 ELSE 200 END;
    v_min_scorecards := 0;
  END IF;

  v_application_pass := (v_sim_calls >= v_min_sim_calls) AND (v_live_calls >= v_min_live_calls) AND (v_scorecard_count >= v_min_scorecards);
  v_app_score := LEAST(100,
    CASE WHEN v_min_sim_calls>0 THEN (LEAST(v_sim_calls, v_min_sim_calls)::numeric/v_min_sim_calls)*40 ELSE 40 END +
    CASE WHEN v_min_live_calls>0 THEN (LEAST(v_live_calls, v_min_live_calls)::numeric/v_min_live_calls)*40 ELSE 40 END +
    CASE WHEN v_min_scorecards>0 THEN (LEAST(v_scorecard_count, v_min_scorecards)::numeric/v_min_scorecards)*20 ELSE 20 END);

  IF v_sim_calls < v_min_sim_calls THEN
    v_blockers := v_blockers || jsonb_build_object('category','application','code','simulation_calls_insufficient',
      'message', format('Simulation calls: %s — need %s', v_sim_calls, v_min_sim_calls),'severity','medium');
  END IF;
  IF v_live_calls < v_min_live_calls THEN
    v_blockers := v_blockers || jsonb_build_object('category','application','code','live_calls_insufficient',
      'message', format('Live calls: %s — need %s', v_live_calls, v_min_live_calls),'severity','high');
  END IF;
  IF v_scorecard_count < v_min_scorecards THEN
    v_blockers := v_blockers || jsonb_build_object('category','application','code','scorecards_insufficient',
      'message', format('Scorecards: %s — need %s', v_scorecard_count, v_min_scorecards),'severity','medium');
  END IF;

  v_required_tier := CASE WHEN p_target_level <= 2 THEN 'T0_COMPUTED' WHEN p_target_level <= 3 THEN 'T1_SELF_REPORTED'
    WHEN p_target_level <= 4 THEN 'T2_PROOF_UPLOADED' WHEN p_target_level <= 6 THEN 'T3_REVIEWED' ELSE 'T4_CERTIFIED' END;
  v_required_tier_rank := CASE v_required_tier WHEN 'T0_COMPUTED' THEN 0 WHEN 'T1_SELF_REPORTED' THEN 1
    WHEN 'T2_PROOF_UPLOADED' THEN 2 WHEN 'T3_REVIEWED' THEN 3 WHEN 'T4_CERTIFIED' THEN 4 ELSE 0 END;
  v_actual_tier_rank := CASE COALESCE(v_rop.verification_tier, 'T0_COMPUTED') WHEN 'T0_COMPUTED' THEN 0
    WHEN 'T1_SELF_REPORTED' THEN 1 WHEN 'T2_PROOF_UPLOADED' THEN 2 WHEN 'T3_REVIEWED' THEN 3 WHEN 'T4_CERTIFIED' THEN 4 ELSE 0 END;
  v_verification_pass := v_actual_tier_rank >= v_required_tier_rank;
  v_ver_score := LEAST(100, COALESCE(v_rop.verification_confidence, 0) + CASE WHEN v_verification_pass THEN 25 ELSE 0 END);
  IF NOT v_verification_pass THEN
    v_blockers := v_blockers || jsonb_build_object('category','verification','code','verification_tier_insufficient',
      'message', format('Verification tier %s required, actual %s', v_required_tier, COALESCE(v_rop.verification_tier,'T0_COMPUTED')),
      'severity','high');
  END IF;
  IF COALESCE(v_profile.certified, false) = true AND COALESCE(v_rop.proof_count, 0) = 0
     AND COALESCE(v_rop.verification_count, 0) = 0 AND p_target_level >= 4 THEN
    v_blockers := v_blockers || jsonb_build_object('category','verification','code','certification_without_proof',
      'message','User flagged as certified but no proof or verification rows exist (legacy_certified — provisional only)','severity','high');
    v_verification_pass := false;
  END IF;

  v_certification_pass := CASE WHEN p_target_level <= 3 THEN true
    WHEN p_target_level >= 4 THEN COALESCE(v_profile.certified, false) ELSE false END;
  v_cert_score := CASE WHEN v_certification_pass THEN 100 ELSE 0 END;
  IF NOT v_certification_pass THEN
    v_blockers := v_blockers || jsonb_build_object('category','certification','code','certification_required',
      'message', format('Certification required for L%s, current status: %s', p_target_level, COALESCE(v_profile.certification_status::text,'none')),
      'severity','high');
  END IF;

  v_score := ROUND(v_kpi_score*0.35 + v_ver_score*0.20 + v_cert_score*0.15 + v_app_score*0.15 + v_acad_score*0.15, 2);
  v_score := GREATEST(0, LEAST(100, v_score));

  v_result := jsonb_build_object(
    'academy_pass', v_academy_pass,'application_pass', v_application_pass,
    'kpi_pass', v_kpi_pass,'verification_pass', v_verification_pass,'certification_pass', v_certification_pass,
    'all_pass', (v_academy_pass AND v_application_pass AND v_kpi_pass AND v_verification_pass AND v_certification_pass),
    'readiness_score', v_score,'blockers', v_blockers,'missing_kpis', v_missing_kpis,
    'verification_summary', jsonb_build_object('verification_tier', COALESCE(v_rop.verification_tier,'T0_COMPUTED'),
      'required_tier', v_required_tier,'proof_count', COALESCE(v_rop.proof_count,0),
      'verification_count', COALESCE(v_rop.verification_count,0),'confidence', COALESCE(v_rop.verification_confidence,0)),
    'certification_summary', jsonb_build_object('certification_status', v_profile.certification_status,
      'certified_at', v_rop.certified_at,'legacy_certified', COALESCE(v_profile.certified,false)),
    'academy_summary', jsonb_build_object('completion_pct', v_completion_pct,'modules_total', v_total_modules,
      'modules_done', v_done_modules,'quizzes_passed', v_quizzes_passed,
      'min_completion_pct', v_min_completion_pct,'min_quizzes_passed', v_min_quizzes_passed,
      'required_modules_complete', v_required_modules_ok,'required_quizzes_passed', v_required_quizzes_ok,
      'source', CASE WHEN v_acad_req.target_level IS NOT NULL THEN 'data_driven' ELSE 'heuristic_fallback' END),
    'application_summary', jsonb_build_object('simulation_calls_completed', v_sim_calls,'live_calls_completed', v_live_calls,
      'scorecard_count', v_scorecard_count,'min_simulation_calls', v_min_sim_calls,'min_live_calls', v_min_live_calls,
      'min_scorecards', v_min_scorecards,'application_pass', v_application_pass,
      'source', CASE WHEN v_app_req.target_level IS NOT NULL THEN 'data_driven' ELSE 'heuristic_fallback' END),
    'track_record_summary', jsonb_build_object('lifetime_calls', COALESCE(v_rop.lifetime_calls,0),
      'lifetime_shows', COALESCE(v_rop.lifetime_shows,0),'lifetime_closings', COALESCE(v_rop.lifetime_closings,0),
      'lifetime_revenue_closed', COALESCE(v_rop.lifetime_revenue_closed,0)),
    'evaluator_version','canonical_v1.1','target_level', p_target_level,'evaluated_at', now());

  INSERT INTO public.promotion_evaluations (user_id, current_level, target_level,
    show_rate, close_rate, earnings_per_call, threshold_passed, evaluation_reason,
    readiness_score, all_pass, blockers_count, evaluation_payload, evaluator)
  VALUES (p_user_id,
    NULLIF(regexp_replace(COALESCE(v_rop.current_level,''),'\D','','g'),'')::int,
    p_target_level, v_kpis.show_rate, v_kpis.closing_rate, v_kpis.earnings_per_call,
    (v_result->>'all_pass')::boolean,'canonical_v1.1 shadow evaluation',
    v_score, (v_result->>'all_pass')::boolean, jsonb_array_length(v_blockers), v_result, 'canonical_v1.1');
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.submit_kpi_proof(
  p_submission_type text, p_period_start date, p_period_end date,
  p_evidence_urls text[], p_revenue_total numeric DEFAULT NULL, p_closes_count integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  INSERT INTO public.kpi_submissions (user_id, submission_type, period_start, period_end,
    evidence_urls, revenue_total, closes_count, status, submitted_at)
  VALUES (v_user, p_submission_type, p_period_start, p_period_end,
    p_evidence_urls, p_revenue_total::text, p_closes_count, 'pending', now())
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_kpi_proof(text,date,date,text[],numeric,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_kpi_submission(p_submission_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_actor,'admin'::app_role) THEN RAISE EXCEPTION 'admin role required'; END IF;
  IF p_status NOT IN ('approved','rejected','needs_more_proof') THEN RAISE EXCEPTION 'invalid status: %', p_status; END IF;
  UPDATE public.kpi_submissions SET status = p_status, reviewer_note = p_note,
    reviewed_at = now(), partner_confirmation = v_actor WHERE id = p_submission_id;
  RETURN jsonb_build_object('ok', true, 'submission_id', p_submission_id, 'status', p_status, 'reviewer', v_actor);
END; $$;
GRANT EXECUTE ON FUNCTION public.verify_kpi_submission(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_certification_review(p_user_id uuid, p_decision_type text,
  p_reason text DEFAULT NULL, p_evidence jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid; v_from text;
BEGIN
  IF NOT public.has_role(v_actor,'admin'::app_role) THEN RAISE EXCEPTION 'admin role required'; END IF;
  IF p_decision_type NOT IN ('granted','revoked','provisional','renewed','rejected') THEN
    RAISE EXCEPTION 'invalid decision_type: %', p_decision_type; END IF;
  SELECT certification_status INTO v_from FROM public.profiles WHERE id = p_user_id;
  INSERT INTO public.operator_certification_log (user_id, from_level, to_level,
    decision_type, decided_by, decided_at, reason, evidence)
  VALUES (p_user_id, v_from, p_decision_type, p_decision_type, v_actor, now(), p_reason, p_evidence)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_certification_review(uuid,text,text,jsonb) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.promotion_policy (
  id integer PRIMARY KEY DEFAULT 1,
  auto_promotion_enabled boolean NOT NULL DEFAULT false,
  canonical_evaluator_required boolean NOT NULL DEFAULT true,
  require_verification boolean NOT NULL DEFAULT true,
  require_certification boolean NOT NULL DEFAULT true,
  allow_admin_force boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_policy_singleton CHECK (id = 1)
);
ALTER TABLE public.promotion_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pp_read" ON public.promotion_policy;
CREATE POLICY "pp_read" ON public.promotion_policy FOR SELECT USING (true);
DROP POLICY IF EXISTS "pp_admin" ON public.promotion_policy;
CREATE POLICY "pp_admin" ON public.promotion_policy FOR ALL
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
INSERT INTO public.promotion_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.promote_user_guarded(p_user_id uuid, p_target_level integer,
  p_admin_force boolean DEFAULT false, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_policy public.promotion_policy%ROWTYPE; v_eval jsonb; v_result jsonb;
BEGIN
  SELECT * INTO v_policy FROM public.promotion_policy WHERE id = 1;
  v_eval := public.evaluate_promotion_canonical(p_user_id, p_target_level);
  IF p_admin_force THEN
    IF NOT v_policy.allow_admin_force THEN RETURN jsonb_build_object('success', false, 'error', 'admin_force_disabled'); END IF;
    IF NOT public.has_role(v_actor,'admin'::app_role) THEN RETURN jsonb_build_object('success', false, 'error', 'admin_role_required'); END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN RETURN jsonb_build_object('success', false, 'error', 'reason_required'); END IF;
    INSERT INTO public.audit_logs (action, source_type, actor_id, note, after_state)
    VALUES ('promote_user_force', 'system', v_actor,
      format('Admin-force promotion of %s to L%s. Reason: %s', p_user_id, p_target_level, p_reason),
      jsonb_build_object('user_id', p_user_id, 'target_level', p_target_level, 'reason', p_reason, 'evaluator_payload', v_eval));
    v_result := public.promote_user(p_user_id, p_target_level);
    RETURN v_result || jsonb_build_object('forced', true, 'evaluator', v_eval);
  END IF;
  IF v_policy.canonical_evaluator_required AND COALESCE((v_eval->>'all_pass')::boolean, false) <> true THEN
    RETURN jsonb_build_object('success', false, 'error', 'canonical_evaluator_blocked',
      'blockers_count', (v_eval->>'blockers_count')::int, 'evaluator', v_eval);
  END IF;
  IF NOT v_policy.auto_promotion_enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'auto_promotion_disabled',
      'message','Set promotion_policy.auto_promotion_enabled=true or use admin force.','evaluator', v_eval);
  END IF;
  v_result := public.promote_user(p_user_id, p_target_level);
  RETURN v_result || jsonb_build_object('guarded', true, 'evaluator', v_eval);
END; $$;
REVOKE ALL ON FUNCTION public.promote_user_guarded(uuid,integer,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_user_guarded(uuid,integer,boolean,text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.canonical_promotion_readiness AS
WITH latest AS (
  SELECT DISTINCT ON (user_id, target_level)
    user_id, current_level, target_level, readiness_score, all_pass, blockers_count, evaluation_payload, created_at
  FROM public.promotion_evaluations
  WHERE evaluator IN ('canonical_v1','canonical_v1.1')
  ORDER BY user_id, target_level, created_at DESC
)
SELECT l.user_id,
  COALESCE(rop.current_level, 'L'||l.current_level) AS current_level,
  l.target_level, l.readiness_score,
  (l.evaluation_payload->>'academy_pass')::boolean AS academy_pass,
  (l.evaluation_payload->>'application_pass')::boolean AS application_pass,
  (l.evaluation_payload->>'kpi_pass')::boolean AS kpi_pass,
  (l.evaluation_payload->>'verification_pass')::boolean AS verification_pass,
  (l.evaluation_payload->>'certification_pass')::boolean AS certification_pass,
  l.all_pass, l.blockers_count, l.created_at AS last_evaluated_at
FROM latest l
LEFT JOIN public.revenue_operator_profile rop ON rop.user_id = l.user_id;
GRANT SELECT ON public.canonical_promotion_readiness TO authenticated, service_role;

CREATE OR REPLACE VIEW public.revenue_operator_promotion_overlay AS
SELECT rop.user_id, rop.current_level, rop.verification_tier, rop.verification_confidence,
  rop.proof_count, rop.verification_count, rop.certification_log_count, rop.legacy_certified,
  cpr.target_level AS readiness_target_level, cpr.readiness_score AS readiness_score,
  cpr.all_pass AS readiness_all_pass, cpr.blockers_count AS readiness_blockers_count,
  cpr.last_evaluated_at AS readiness_last_evaluated_at,
  (SELECT MAX(decided_at) FROM public.operator_certification_log ocl WHERE ocl.user_id = rop.user_id)
    AS latest_certification_review_at
FROM public.revenue_operator_profile rop
LEFT JOIN LATERAL (
  SELECT * FROM public.canonical_promotion_readiness c WHERE c.user_id = rop.user_id
  ORDER BY c.last_evaluated_at DESC NULLS LAST LIMIT 1
) cpr ON true;
GRANT SELECT ON public.revenue_operator_promotion_overlay TO authenticated, service_role;

-- Dynamic deprecation comments (resolves real signatures)
DO $deprecate$
DECLARE r record; sig text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users_kpi_snapshot') THEN
    EXECUTE 'COMMENT ON TABLE public.users_kpi_snapshot IS ''DEPRECATED: superseded by canonical_kpi_unified + revenue_operator_profile.''';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dashboard_daily_aggregates') THEN
    EXECUTE 'COMMENT ON TABLE public.dashboard_daily_aggregates IS ''DEPRECATED: superseded by canonical_kpi_unified.''';
  END IF;
  FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public'
             AND p.proname IN ('evaluate_user_for_promotion','check_promotion_eligibility','get_promotion_blockers')
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('COMMENT ON FUNCTION %s IS ''DEPRECATED: use evaluate_promotion_canonical(uuid, integer) instead.''', sig);
  END LOOP;
END $deprecate$;
