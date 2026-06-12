
-- Add 3-pillar certification fields to certification_status
ALTER TABLE public.certification_status
  ADD COLUMN IF NOT EXISTS theory_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS theory_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS simulation_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS simulation_avg numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS simulation_attempts integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS realtime_pass_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS realtime_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS kpi_total_calls integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kpi_deals_closed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kpi_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kpi_conversion_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kpi_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentile_rank numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS certification_title text DEFAULT 'In Progress',
  ADD COLUMN IF NOT EXISTS certified_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_override_by uuid,
  ADD COLUMN IF NOT EXISTS admin_override_at timestamptz;

-- Function to recalculate certification for a user
CREATE OR REPLACE FUNCTION public.recalculate_certification(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_theory_score numeric := 0;
  v_theory_verified boolean := false;
  v_sim_avg numeric := 0;
  v_sim_attempts int := 0;
  v_rt_pass int := 0;
  v_rt_verified boolean := false;
  v_sim_score numeric := 0;
  v_kpi_calls int := 0;
  v_kpi_deals int := 0;
  v_kpi_revenue numeric := 0;
  v_kpi_conv numeric := 0;
  v_kpi_verified boolean := false;
  v_kpi_score numeric := 0;
  v_final numeric := 0;
  v_level int := 0;
  v_status text := 'In Progress';
  v_percentile numeric := 0;
  v_ethical_score numeric := 0;
BEGIN
  -- Get user level
  SELECT COALESCE(uls.current_level, 0) INTO v_level
  FROM user_level_status uls WHERE uls.user_id = p_user_id;

  -- PILLAR 1: Theory — from member_kpis ethical_alignment_score
  SELECT COALESCE(mk.ethical_alignment_score, 0) INTO v_ethical_score
  FROM member_kpis mk WHERE mk.user_id = p_user_id;
  
  v_theory_score := LEAST(v_ethical_score, 100);
  v_theory_verified := v_theory_score >= 75;

  -- PILLAR 2: Simulation — from simulation_user_progress
  SELECT COALESCE(sup.avg_score, 0), COALESCE(sup.total_attempts, 0)
  INTO v_sim_avg, v_sim_attempts
  FROM simulation_user_progress sup WHERE sup.user_id = p_user_id
  ORDER BY level DESC LIMIT 1;

  -- Count realtime sessions with score >= 7.5
  SELECT count(*) INTO v_rt_pass
  FROM simulation_attempts sa
  WHERE sa.user_id = p_user_id AND sa.mode = 'realtime'
    AND COALESCE(sa.total_score, 0) >= 7.5;

  v_rt_verified := v_rt_pass >= 3;
  v_sim_score := CASE
    WHEN v_sim_attempts >= 10 AND v_sim_avg >= 7.5 THEN LEAST(v_sim_avg * 10, 100)
    WHEN v_sim_attempts >= 5 THEN LEAST(v_sim_avg * 8, 80)
    ELSE LEAST(v_sim_avg * 5, 50)
  END;

  -- PILLAR 3: KPI Performance — from calls + member_kpis
  SELECT
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_kpi_calls, v_kpi_deals, v_kpi_revenue
  FROM calls WHERE user_id = p_user_id;

  v_kpi_conv := CASE WHEN v_kpi_calls > 0
    THEN LEAST(ROUND((v_kpi_deals::numeric / v_kpi_calls) * 100, 1), 100)
    ELSE 0 END;

  v_kpi_verified := v_kpi_calls >= 10 AND v_kpi_deals >= 1;
  v_kpi_score := CASE
    WHEN v_kpi_verified THEN LEAST(
      (LEAST(v_kpi_calls::numeric / 20, 1) * 30) +
      (LEAST(v_kpi_deals::numeric / 5, 1) * 40) +
      (v_kpi_conv * 0.3), 100)
    ELSE LEAST(v_kpi_calls::numeric * 2 + v_kpi_deals * 10, 50)
  END;

  -- FINAL SCORE: Theory 25% + Simulation 35% + KPI 40%
  v_final := ROUND((v_theory_score * 0.25) + (v_sim_score * 0.35) + (v_kpi_score * 0.40), 1);

  -- Status
  IF v_theory_verified AND (v_sim_attempts >= 10 AND v_sim_avg >= 7.5) AND v_kpi_verified AND v_level >= 4 THEN
    v_status := 'Certified';
  ELSIF v_theory_verified OR (v_sim_attempts >= 5) OR v_kpi_deals >= 1 THEN
    v_status := 'Qualified';
  ELSE
    v_status := 'In Progress';
  END IF;

  -- Percentile: rank within same level
  SELECT ROUND(
    (SELECT count(*)::numeric FROM certification_status cs2
     JOIN user_level_status uls2 ON uls2.user_id = cs2.user_id
     WHERE uls2.current_level = v_level AND cs2.final_score <= v_final
    ) * 100.0 /
    GREATEST((SELECT count(*) FROM certification_status cs3
     JOIN user_level_status uls3 ON uls3.user_id = cs3.user_id
     WHERE uls3.current_level = v_level), 1)
  , 1) INTO v_percentile;

  -- Upsert
  INSERT INTO certification_status (
    user_id, current_level, certification_readiness_score,
    theory_score, theory_verified,
    simulation_score, simulation_avg, simulation_attempts, realtime_pass_count, realtime_verified,
    kpi_total_calls, kpi_deals_closed, kpi_revenue, kpi_conversion_rate, kpi_verified,
    final_score, percentile_rank, certification_title,
    certified_at, updated_at
  ) VALUES (
    p_user_id, v_level::text, v_final,
    v_theory_score, v_theory_verified,
    v_sim_score, v_sim_avg, v_sim_attempts, v_rt_pass, v_rt_verified,
    v_kpi_calls, v_kpi_deals, v_kpi_revenue, v_kpi_conv, v_kpi_verified,
    v_final, v_percentile, v_status,
    CASE WHEN v_status = 'Certified' THEN now() ELSE NULL END, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    current_level = EXCLUDED.current_level,
    certification_readiness_score = EXCLUDED.certification_readiness_score,
    theory_score = EXCLUDED.theory_score,
    theory_verified = EXCLUDED.theory_verified,
    simulation_score = EXCLUDED.simulation_score,
    simulation_avg = EXCLUDED.simulation_avg,
    simulation_attempts = EXCLUDED.simulation_attempts,
    realtime_pass_count = EXCLUDED.realtime_pass_count,
    realtime_verified = EXCLUDED.realtime_verified,
    kpi_total_calls = EXCLUDED.kpi_total_calls,
    kpi_deals_closed = EXCLUDED.kpi_deals_closed,
    kpi_revenue = EXCLUDED.kpi_revenue,
    kpi_conversion_rate = EXCLUDED.kpi_conversion_rate,
    kpi_verified = EXCLUDED.kpi_verified,
    final_score = EXCLUDED.final_score,
    percentile_rank = EXCLUDED.percentile_rank,
    certification_title = CASE WHEN certification_status.admin_override THEN certification_status.certification_title ELSE EXCLUDED.certification_title END,
    certified_at = CASE WHEN certification_status.certified_at IS NOT NULL THEN certification_status.certified_at ELSE EXCLUDED.certified_at END,
    updated_at = now();

  -- If certified, update profile
  IF v_status = 'Certified' THEN
    UPDATE profiles SET
      certified = true,
      certification_status = 'certified',
      updated_at = now()
    WHERE id = p_user_id AND certified = false;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'status', v_status,
    'final_score', v_final,
    'theory', jsonb_build_object('score', v_theory_score, 'verified', v_theory_verified),
    'simulation', jsonb_build_object('score', v_sim_score, 'avg', v_sim_avg, 'attempts', v_sim_attempts, 'rt_pass', v_rt_pass, 'rt_verified', v_rt_verified),
    'kpi', jsonb_build_object('calls', v_kpi_calls, 'deals', v_kpi_deals, 'revenue', v_kpi_revenue, 'conv', v_kpi_conv, 'verified', v_kpi_verified),
    'percentile', v_percentile,
    'level', v_level
  );
END;
$$;
