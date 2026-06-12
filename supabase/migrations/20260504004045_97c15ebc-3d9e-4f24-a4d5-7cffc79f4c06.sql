
CREATE OR REPLACE FUNCTION public.performance_revenue_kpis(
 p_days         integer DEFAULT 30,
 p_operator_id  uuid    DEFAULT NULL,
 p_level_filter integer DEFAULT NULL,
 p_funnel       text    DEFAULT NULL,
 p_source       text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
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
         OR (p_level_filter >= 4 AND p_level_filter <= 6
             AND l.closer_id IS NOT NULL
             AND public.stage_to_level((SELECT p.business_stage FROM profiles p WHERE p.id = l.closer_id)) = p_level_filter)
         OR (p_level_filter = 7
             AND (l.owner_id IS NOT NULL
                  AND public.stage_to_level((SELECT p.business_stage FROM profiles p WHERE p.id = l.owner_id)) = 7
                  OR l.closer_id IS NOT NULL
                  AND public.stage_to_level((SELECT p.business_stage FROM profiles p WHERE p.id = l.closer_id)) = 7))
         OR (p_level_filter = 8
             AND (l.owner_id IS NOT NULL
                  AND public.stage_to_level((SELECT p.business_stage FROM profiles p WHERE p.id = l.owner_id)) = 8
                  OR l.closer_id IS NOT NULL
                  AND public.stage_to_level((SELECT p.business_stage FROM profiles p WHERE p.id = l.closer_id)) = 8))
        );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;
