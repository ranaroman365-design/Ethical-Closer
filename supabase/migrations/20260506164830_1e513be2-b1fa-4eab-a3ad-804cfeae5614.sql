
CREATE OR REPLACE FUNCTION public.performance_revenue_kpis(
  p_days integer DEFAULT 30,
  p_operator_id uuid DEFAULT NULL,
  p_funnel text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_level_filter integer DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_since timestamptz;
  v_traffic bigint;
  v_engagement bigint;
  v_booking bigint;
  v_setter bigint;
  v_showing bigint;
  v_closer bigint;
  v_offer bigint;
  v_revenue_count bigint;
  v_revenue_total numeric;
  v_source_dist json;
BEGIN
  v_since := now() - (p_days || ' days')::interval;

  -- Stage counts from leads
  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.stage IS NOT NULL AND l.stage NOT IN ('new','unknown','')), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.has_booking = true), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.setter_id IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.total_calls_attended > 0), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.outcome IN ('closed_won','offer_made','payment_pending')), 0),
    COALESCE(COUNT(*) FILTER (WHERE l.outcome = 'closed_won'), 0)
  INTO v_traffic, v_engagement, v_booking, v_setter, v_closer, v_offer, v_revenue_count
  FROM leads l
  WHERE l.created_at >= v_since
    AND (p_operator_id IS NULL OR l.setter_id = p_operator_id OR l.closer_id = p_operator_id OR l.owner_id = p_operator_id)
    AND (p_funnel IS NULL OR l.source ILIKE '%' || p_funnel || '%')
    AND (p_source IS NULL OR l.source = p_source)
    AND l.is_simulation IS NOT TRUE;

  -- Shows from appointments (canonical)
  SELECT COUNT(DISTINCT a.lead_id)
  INTO v_showing
  FROM appointments a
  JOIN leads l2 ON l2.id = a.lead_id
  WHERE a.starts_at >= v_since
    AND a.attendance_flag = true
    AND (p_operator_id IS NULL OR l2.setter_id = p_operator_id OR l2.closer_id = p_operator_id OR l2.owner_id = p_operator_id)
    AND (p_funnel IS NULL OR l2.source ILIKE '%' || p_funnel || '%')
    AND (p_source IS NULL OR l2.source = p_source)
    AND l2.is_simulation IS NOT TRUE;

  -- Confirmed revenue from calls (canonical revenue truth)
  SELECT COALESCE(SUM(c.revenue), 0)
  INTO v_revenue_total
  FROM calls c
  WHERE c.created_at >= v_since
    AND c.result = 'closed_won'
    AND (p_operator_id IS NULL OR c.user_id = p_operator_id);

  -- Source distribution
  SELECT COALESCE(json_agg(row_to_json(sd)), '[]'::json)
  INTO v_source_dist
  FROM (
    SELECT
      COALESCE(l.source, 'unknown') as source,
      COUNT(*) as lead_count,
      COUNT(*) FILTER (WHERE l.has_booking = true) as booked,
      COUNT(*) FILTER (WHERE l.outcome = 'closed_won') as closed,
      ROUND(CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE l.has_booking = true)::numeric / COUNT(*)) * 100 ELSE 0 END, 1) as booking_rate,
      ROUND(CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE l.outcome = 'closed_won')::numeric / COUNT(*)) * 100 ELSE 0 END, 1) as close_rate
    FROM leads l
    WHERE l.created_at >= v_since
      AND (p_operator_id IS NULL OR l.setter_id = p_operator_id OR l.closer_id = p_operator_id OR l.owner_id = p_operator_id)
      AND (p_funnel IS NULL OR l.source ILIKE '%' || p_funnel || '%')
      AND (p_source IS NULL OR l.source = p_source)
      AND l.is_simulation IS NOT TRUE
    GROUP BY l.source
    ORDER BY COUNT(*) DESC
    LIMIT 20
  ) sd;

  -- Build result
  SELECT json_build_object(
    'traffic', v_traffic,
    'engagement', v_engagement,
    'booking', v_booking,
    'setter', v_setter,
    'showing', v_showing,
    'closer', v_closer,
    'offer', v_offer,
    'revenue', v_revenue_count,
    'booking_rate', CASE WHEN v_traffic > 0 THEN ROUND((v_booking::numeric / v_traffic) * 100, 1) ELSE 0 END,
    'show_rate', CASE WHEN v_booking > 0 THEN ROUND((v_showing::numeric / v_booking) * 100, 1) ELSE 0 END,
    'close_rate', CASE WHEN v_showing > 0 THEN ROUND((v_revenue_count::numeric / v_showing) * 100, 1) ELSE 0 END,
    'revenue_total', v_revenue_total,
    'source_distribution', v_source_dist
  ) INTO result;

  RETURN result;
END;
$$;
