
-- Fix performance_revenue_kpis: replace the >= 8 catch-all with proper L7/L8 filtering
CREATE OR REPLACE FUNCTION public.performance_revenue_kpis(
 p_operator_id uuid,
 p_range       text    DEFAULT '30d',
 p_funnel      text    DEFAULT NULL,
 p_source      text    DEFAULT NULL,
 p_level_filter integer DEFAULT NULL,
 p_user_id     uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_from  timestamptz;
 v_result jsonb;
BEGIN
 v_from := CASE p_range
   WHEN '7d'  THEN now() - interval '7 days'
   WHEN '14d' THEN now() - interval '14 days'
   WHEN '30d' THEN now() - interval '30 days'
   WHEN '90d' THEN now() - interval '90 days'
   ELSE now() - interval '30 days'
 END;

 SELECT jsonb_build_object(
   'total_leads',     COUNT(*)::int,
   'total_booked',    COUNT(*) FILTER (WHERE l.stage IN ('booked','showed','closed_won','converted_to_L1'))::int,
   'total_showed',    COUNT(*) FILTER (WHERE l.stage IN ('showed','closed_won','converted_to_L1'))::int,
   'total_closed',    COUNT(*) FILTER (WHERE l.stage IN ('closed_won','converted_to_L1'))::int,
   'total_no_show',   COUNT(*) FILTER (WHERE l.stage = 'no_show')::int,
   'total_revenue',   COALESCE(SUM(l.deal_value) FILTER (WHERE l.stage IN ('closed_won','converted_to_L1')), 0)::numeric,
   'booking_rate',    CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE l.stage IN ('booked','showed','closed_won','converted_to_L1'))::numeric / COUNT(*)::numeric * 100, 1) ELSE 0 END,
   'show_rate',       CASE WHEN COUNT(*) FILTER (WHERE l.stage IN ('booked','showed','closed_won','converted_to_L1')) > 0
                       THEN ROUND(COUNT(*) FILTER (WHERE l.stage IN ('showed','closed_won','converted_to_L1'))::numeric / COUNT(*) FILTER (WHERE l.stage IN ('booked','showed','closed_won','converted_to_L1'))::numeric * 100, 1) ELSE 0 END,
   'close_rate',      CASE WHEN COUNT(*) FILTER (WHERE l.stage IN ('showed','closed_won','converted_to_L1')) > 0
                       THEN ROUND(COUNT(*) FILTER (WHERE l.stage IN ('closed_won','converted_to_L1'))::numeric / COUNT(*) FILTER (WHERE l.stage IN ('showed','closed_won','converted_to_L1'))::numeric * 100, 1) ELSE 0 END,
   'avg_deal_value',  COALESCE(ROUND(AVG(l.deal_value) FILTER (WHERE l.stage IN ('closed_won','converted_to_L1')), 0), 0)::numeric
 ) INTO v_result
 FROM leads l
 WHERE l.created_at >= v_from
    AND (l.owner_id = p_operator_id
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

-- Fix get_performance_stage_leads: same L7/L8 fix
CREATE OR REPLACE FUNCTION public.get_performance_stage_leads(
 p_operator_id  uuid    DEFAULT NULL,
 p_user_id      uuid    DEFAULT NULL,
 p_range        text    DEFAULT '30d',
 p_funnel       text    DEFAULT NULL,
 p_source       text    DEFAULT NULL,
 p_level_filter integer DEFAULT NULL,
 p_stage_key    text    DEFAULT 'all',
 p_page         integer DEFAULT 1,
 p_page_size    integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
 v_from   timestamptz;
 v_offset integer;
BEGIN
 v_from := CASE p_range
   WHEN '7d'  THEN now() - interval '7 days'
   WHEN '14d' THEN now() - interval '14 days'
   WHEN '30d' THEN now() - interval '30 days'
   WHEN '90d' THEN now() - interval '90 days'
   ELSE now() - interval '30 days'
 END;
 v_offset := (GREATEST(p_page, 1) - 1) * p_page_size;

 RETURN (
   WITH base AS (
     SELECT l.id, l.name, l.email, l.phone, l.source,
            l.stage, l.lead_score, l.lead_quality,
            l.setter_id, l.closer_id, l.owner_id,
            l.created_at, l.appointment_date,
            l.deal_value, l.qualification_score,
            l.total_no_shows,
            l.conversion_state
     FROM leads l
     WHERE l.created_at >= v_from
       AND (p_funnel IS NULL OR l.source = p_funnel)
       AND (p_source IS NULL OR l.source = p_source)
       AND (p_operator_id IS NULL OR l.owner_id = p_operator_id OR l.setter_id = p_operator_id OR l.closer_id = p_operator_id)
       AND (p_user_id IS NULL OR l.owner_id = p_user_id OR l.setter_id = p_user_id OR l.closer_id = p_user_id)
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
           )
   ),
   stage_filtered AS (
     SELECT b.* FROM base b
     WHERE CASE p_stage_key
       WHEN 'landing' THEN true
       WHEN 'quiz'    THEN b.qualification_score IS NOT NULL
       WHEN 'booked'  THEN b.stage IN ('booked','showed','closed_won','converted_to_L1','no_show')
       WHEN 'showed'  THEN b.stage IN ('showed','closed_won','converted_to_L1')
       WHEN 'closed'  THEN b.stage IN ('closed_won','converted_to_L1')
       WHEN 'no_show' THEN b.stage = 'no_show'
       ELSE true
     END
   ),
   total AS (SELECT COUNT(*)::int AS cnt FROM stage_filtered),
   paged AS (
     SELECT * FROM stage_filtered
     ORDER BY created_at DESC
     LIMIT p_page_size OFFSET v_offset
   )
   SELECT jsonb_build_object(
     'total', (SELECT cnt FROM total),
     'page',  p_page,
     'page_size', p_page_size,
     'rows', COALESCE(jsonb_agg(to_jsonb(paged.*) ORDER BY paged.created_at DESC), '[]'::jsonb)
   ) FROM paged
 );
END;
$$;
