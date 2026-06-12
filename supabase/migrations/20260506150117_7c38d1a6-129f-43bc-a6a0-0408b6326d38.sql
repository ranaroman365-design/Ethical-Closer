
-- Drop existing function with old signature
DROP FUNCTION IF EXISTS public.performance_revenue_kpis(uuid, text, text, text, integer, uuid);

-- Create with correct signature matching frontend usage
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
BEGIN
  v_since := now() - (p_days || ' days')::interval;

  SELECT json_build_object(
    'traffic',    COALESCE(COUNT(*), 0),
    'engagement', COALESCE(COUNT(*) FILTER (WHERE l.stage IS NOT NULL AND l.stage NOT IN ('new','unknown','')), 0),
    'booking',    COALESCE(COUNT(*) FILTER (WHERE l.has_booking = true), 0),
    'setter',     COALESCE(COUNT(*) FILTER (WHERE l.setter_id IS NOT NULL), 0),
    'showing',    (
      SELECT COUNT(DISTINCT a.lead_id)
      FROM appointments a
      JOIN leads l2 ON l2.id = a.lead_id
      WHERE a.starts_at >= v_since
        AND a.attendance_flag = true
        AND (p_operator_id IS NULL OR l2.setter_id = p_operator_id OR l2.closer_id = p_operator_id OR l2.owner_id = p_operator_id)
        AND (p_funnel IS NULL OR l2.source ILIKE '%' || p_funnel || '%')
        AND (p_source IS NULL OR l2.source = p_source)
    ),
    'closer',     COALESCE(COUNT(*) FILTER (WHERE l.total_calls_attended > 0), 0),
    'offer',      COALESCE(COUNT(*) FILTER (WHERE l.outcome IN ('closed_won','offer_made','payment_pending')), 0),
    'revenue',    COALESCE(COUNT(*) FILTER (WHERE l.outcome = 'closed_won'), 0)
  ) INTO result
  FROM leads l
  WHERE l.created_at >= v_since
    AND (p_operator_id IS NULL OR l.setter_id = p_operator_id OR l.closer_id = p_operator_id OR l.owner_id = p_operator_id)
    AND (p_funnel IS NULL OR l.source ILIKE '%' || p_funnel || '%')
    AND (p_source IS NULL OR l.source = p_source)
    AND l.is_simulation IS NOT TRUE;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.performance_revenue_kpis(integer, uuid, text, text, integer, uuid) TO authenticated;
