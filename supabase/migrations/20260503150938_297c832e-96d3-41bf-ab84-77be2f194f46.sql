-- Drop existing function with old param name
DROP FUNCTION IF EXISTS public.stage_to_level(text);

-- Recreate with correct param name
CREATE OR REPLACE FUNCTION public.stage_to_level(p_stage text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(lower(trim(p_stage)), 'prospect')
    WHEN 'prospect'         THEN 0
    WHEN 'applicant'        THEN 0
    WHEN 'opener'           THEN 1
    WHEN 'trainee'          THEN 1
    WHEN 'setter'           THEN 2
    WHEN 'associate_setter' THEN 2
    WHEN 'associate'        THEN 2
    WHEN 'senior_associate' THEN 3
    WHEN 'senior_setter'    THEN 3
    WHEN 'junior_manager'   THEN 4
    WHEN 'manager'          THEN 5
    WHEN 'senior_manager'   THEN 6
    WHEN 'senior_closer'    THEN 6
    WHEN 'director'         THEN 7
    WHEN 'partner'          THEN 8
    ELSE 0
  END;
$$;

GRANT EXECUTE ON FUNCTION public.stage_to_level(text) TO authenticated;

-- Central KPI function
CREATE OR REPLACE FUNCTION public.performance_revenue_kpis(
  p_days          integer DEFAULT 30,
  p_operator_id   uuid    DEFAULT NULL,
  p_level_filter  integer DEFAULT NULL,
  p_funnel        text    DEFAULT NULL,
  p_source        text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'traffic',    COUNT(*),
    'engagement', COUNT(*) FILTER (WHERE COALESCE(lead_score, 0) > 0 OR has_booking = true),
    'booking',    COUNT(*) FILTER (WHERE has_booking = true),
    'setter',     COUNT(*) FILTER (WHERE setter_call_outcome IS NOT NULL),
    'showing',    COUNT(*) FILTER (WHERE total_calls_attended > 0),
    'closer',     COUNT(*) FILTER (WHERE closer_id IS NOT NULL OR outcome IS NOT NULL),
    'offer',      COUNT(*) FILTER (WHERE deal_value IS NOT NULL OR outcome IN ('won','lost')),
    'revenue',    COUNT(*) FILTER (WHERE outcome = 'won' OR payment_status = 'paid'),
    'revenue_cents', COALESCE(SUM(deal_value) FILTER (WHERE outcome = 'won' OR payment_status = 'paid'), 0),
    'window_days', p_days,
    'generated_at', now()
  ) INTO v_result
  FROM leads l
  WHERE l.created_at >= v_since
    AND COALESCE(l.is_simulation, false) = false
    AND l.name NOT ILIKE 'test%'
    AND l.name NOT ILIKE '%kein lead%'
    AND (p_operator_id IS NULL
         OR l.owner_id = p_operator_id
         OR l.setter_id = p_operator_id
         OR l.closer_id = p_operator_id)
    AND (p_funnel IS NULL OR l.source = p_funnel)
    AND (p_source IS NULL OR l.source = p_source)
    AND (p_level_filter IS NULL
         OR (p_level_filter <= 3
             AND l.setter_id IS NOT NULL
             AND public.stage_to_level((SELECT p.business_stage FROM profiles p WHERE p.id = l.setter_id)) = p_level_filter)
         OR (p_level_filter >= 4 AND p_level_filter <= 7
             AND l.closer_id IS NOT NULL
             AND public.stage_to_level((SELECT p.business_stage FROM profiles p WHERE p.id = l.closer_id)) = p_level_filter)
         OR (p_level_filter >= 8)
        );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.performance_revenue_kpis(integer, uuid, integer, text, text) TO authenticated;

-- Extended stage leads with pagination + level filter
CREATE OR REPLACE FUNCTION public.get_performance_stage_leads(
  p_stage_key    text,
  p_time_range   integer DEFAULT 30,
  p_funnel       text    DEFAULT NULL,
  p_operator_id  uuid    DEFAULT NULL,
  p_user_id      uuid    DEFAULT NULL,
  p_level_filter integer DEFAULT NULL,
  p_source       text    DEFAULT NULL,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
RETURNS TABLE(
  lead_id           uuid,
  name              text,
  email             text,
  phone             text,
  source            text,
  funnel_id         text,
  current_stage     text,
  created_at        timestamptz,
  lead_score        integer,
  quiz_status       text,
  has_booking       boolean,
  appointment_at    timestamptz,
  setter_id         uuid,
  setter_name       text,
  closer_id         uuid,
  closer_name       text,
  attendance_status text,
  call_outcome      text,
  revenue_status    text,
  deal_value        numeric,
  payment_status    text,
  heat              text,
  total_count       bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      l.id, l.name, l.email, l.phone, l.source, l.funnel_id,
      l.stage, l.created_at, l.lead_score, l.has_booking,
      l.setter_id, l.closer_id, l.setter_call_outcome, l.outcome,
      l.deal_value, l.payment_status, l.appointment_date,
      l.no_show_flag, l.total_calls_attended, l.owner_id, l.is_simulation
    FROM leads l
    WHERE l.created_at >= (now() - (p_time_range || ' days')::interval)
      AND COALESCE(l.is_simulation, false) = false
      AND l.name NOT ILIKE 'test%'
      AND l.name NOT ILIKE '%kein lead%'
      AND (p_funnel IS NULL OR l.source = p_funnel)
      AND (p_source IS NULL OR l.source = p_source)
      AND (p_operator_id IS NULL OR l.owner_id = p_operator_id OR l.setter_id = p_operator_id OR l.closer_id = p_operator_id)
      AND (p_user_id IS NULL OR l.owner_id = p_user_id OR l.setter_id = p_user_id OR l.closer_id = p_user_id)
      AND (p_level_filter IS NULL
           OR (p_level_filter <= 3
               AND l.setter_id IS NOT NULL
               AND public.stage_to_level((SELECT p.business_stage FROM profiles p WHERE p.id = l.setter_id)) = p_level_filter)
           OR (p_level_filter >= 4 AND p_level_filter <= 7
               AND l.closer_id IS NOT NULL
               AND public.stage_to_level((SELECT p.business_stage FROM profiles p WHERE p.id = l.closer_id)) = p_level_filter)
           OR (p_level_filter >= 8)
          )
  ),
  stage_filtered AS (
    SELECT b.* FROM base b
    WHERE CASE p_stage_key
      WHEN 'landing' THEN true
      WHEN 'traffic' THEN true
      WHEN 'engagement' THEN COALESCE(b.lead_score, 0) > 0 OR b.has_booking = true
      WHEN 'booking' THEN b.has_booking = true
      WHEN 'setter' THEN b.setter_call_outcome IS NOT NULL
      WHEN 'showing' THEN b.total_calls_attended > 0
      WHEN 'closer' THEN b.closer_id IS NOT NULL OR b.outcome IS NOT NULL
      WHEN 'offer' THEN b.deal_value IS NOT NULL OR b.outcome IN ('won','lost')
      WHEN 'revenue' THEN b.outcome = 'won' OR b.payment_status = 'paid'
      ELSE true
    END
  )
  SELECT
    sf.id AS lead_id,
    sf.name, sf.email, sf.phone, sf.source, sf.funnel_id,
    sf.stage AS current_stage, sf.created_at, sf.lead_score,
    CASE WHEN COALESCE(sf.lead_score, 0) > 0 THEN 'completed' ELSE 'not_started' END AS quiz_status,
    sf.has_booking,
    sf.appointment_date::timestamptz AS appointment_at,
    sf.setter_id, ps.full_name AS setter_name,
    sf.closer_id, pc.full_name AS closer_name,
    CASE
      WHEN sf.total_calls_attended > 0 THEN 'showed'
      WHEN sf.no_show_flag = true THEN 'no_show'
      WHEN sf.has_booking THEN 'pending'
      ELSE NULL
    END AS attendance_status,
    sf.outcome AS call_outcome,
    CASE
      WHEN sf.outcome = 'won' OR sf.payment_status = 'paid' THEN 'closed'
      WHEN sf.outcome = 'lost' THEN 'lost'
      WHEN sf.outcome IS NOT NULL THEN sf.outcome
      ELSE NULL
    END AS revenue_status,
    sf.deal_value, sf.payment_status,
    CASE
      WHEN sf.has_booking OR COALESCE(sf.lead_score, 0) >= 70 THEN 'hot'
      WHEN COALESCE(sf.lead_score, 0) >= 30 THEN 'warm'
      ELSE 'cold'
    END AS heat,
    COUNT(*) OVER () AS total_count
  FROM stage_filtered sf
  LEFT JOIN profiles ps ON ps.id = sf.setter_id
  LEFT JOIN profiles pc ON pc.id = sf.closer_id
  ORDER BY sf.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
