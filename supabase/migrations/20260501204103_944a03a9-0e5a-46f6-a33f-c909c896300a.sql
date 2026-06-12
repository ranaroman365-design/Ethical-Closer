
-- 1. Stage leads RPC
CREATE OR REPLACE FUNCTION public.get_performance_stage_leads(
  p_stage_key text,
  p_time_range integer DEFAULT 30,
  p_funnel text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  lead_id uuid,
  name text,
  email text,
  phone text,
  source text,
  funnel_id text,
  current_stage text,
  created_at timestamptz,
  lead_score integer,
  quiz_status text,
  has_booking boolean,
  appointment_at timestamptz,
  setter_id uuid,
  setter_name text,
  closer_id uuid,
  closer_name text,
  attendance_status text,
  call_outcome text,
  revenue_status text,
  deal_value numeric,
  payment_status text,
  heat text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      l.id,
      l.name,
      l.email,
      l.phone,
      l.source,
      l.funnel_id,
      l.stage,
      l.created_at,
      l.lead_score,
      l.has_booking,
      l.setter_id,
      l.closer_id,
      l.setter_call_outcome,
      l.outcome,
      l.deal_value,
      l.payment_status,
      l.appointment_date,
      l.no_show_flag,
      l.total_calls_attended,
      l.owner_id,
      l.is_simulation
    FROM leads l
    WHERE l.created_at >= (now() - (p_time_range || ' days')::interval)
      AND COALESCE(l.is_simulation, false) = false
      AND l.name NOT ILIKE 'test%'
      AND l.name NOT ILIKE '%kein lead%'
      AND (p_funnel IS NULL OR l.source = p_funnel)
      AND (p_operator_id IS NULL OR l.owner_id = p_operator_id OR l.setter_id = p_operator_id OR l.closer_id = p_operator_id)
      AND (p_user_id IS NULL OR l.owner_id = p_user_id OR l.setter_id = p_user_id OR l.closer_id = p_user_id)
  ),
  stage_filtered AS (
    SELECT b.* FROM base b
    WHERE
      CASE p_stage_key
        WHEN 'landing' THEN true  -- all leads land
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
    sf.name,
    sf.email,
    sf.phone,
    sf.source,
    sf.funnel_id,
    sf.stage AS current_stage,
    sf.created_at,
    sf.lead_score,
    CASE
      WHEN COALESCE(sf.lead_score, 0) > 0 THEN 'completed'
      ELSE 'not_started'
    END AS quiz_status,
    sf.has_booking,
    sf.appointment_date::timestamptz AS appointment_at,
    sf.setter_id,
    ps.full_name AS setter_name,
    sf.closer_id,
    pc.full_name AS closer_name,
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
    sf.deal_value,
    sf.payment_status,
    CASE
      WHEN sf.has_booking OR COALESCE(sf.lead_score, 0) >= 70 THEN 'hot'
      WHEN COALESCE(sf.lead_score, 0) >= 30 THEN 'warm'
      ELSE 'cold'
    END AS heat
  FROM stage_filtered sf
  LEFT JOIN profiles ps ON ps.id = sf.setter_id
  LEFT JOIN profiles pc ON pc.id = sf.closer_id
  ORDER BY sf.created_at DESC
  LIMIT 500;
$$;

-- 2. Lead detail RPC
CREATE OR REPLACE FUNCTION public.get_performance_lead_detail(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  lead_row record;
BEGIN
  -- Identity
  SELECT
    l.id, l.name, l.email, l.phone, l.source, l.funnel_id,
    l.stage, l.created_at, l.lead_score, l.has_booking,
    l.outcome, l.deal_value, l.payment_status, l.referral_code,
    l.setter_id, l.closer_id, l.owner_id,
    l.setter_call_outcome, l.appointment_date,
    l.no_show_flag, l.total_calls_attended, l.total_calls_booked,
    ps.full_name AS setter_name,
    pc.full_name AS closer_name,
    po.full_name AS owner_name
  INTO lead_row
  FROM leads l
  LEFT JOIN profiles ps ON ps.id = l.setter_id
  LEFT JOIN profiles pc ON pc.id = l.closer_id
  LEFT JOIN profiles po ON po.id = l.owner_id
  WHERE l.id = p_lead_id;

  IF lead_row IS NULL THEN
    RETURN jsonb_build_object('error', 'lead_not_found');
  END IF;

  result := jsonb_build_object(
    'identity', jsonb_build_object(
      'id', lead_row.id,
      'name', lead_row.name,
      'email', lead_row.email,
      'phone', lead_row.phone,
      'source', lead_row.source,
      'funnel_id', lead_row.funnel_id,
      'stage', lead_row.stage,
      'created_at', lead_row.created_at,
      'lead_score', lead_row.lead_score,
      'referral_code', lead_row.referral_code,
      'setter_name', lead_row.setter_name,
      'closer_name', lead_row.closer_name,
      'owner_name', lead_row.owner_name
    ),
    'appointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'starts_at', a.starts_at,
        'appointment_status', a.appointment_status,
        'attendance_flag', a.attendance_flag,
        'outcome', a.outcome,
        'setter_id', a.setter_id,
        'closer_id', a.closer_id,
        'current_owner_role', a.current_owner_role,
        'rescheduled_from_id', a.rescheduled_from_id,
        'setter_name', ps2.full_name,
        'closer_name', pc2.full_name
      ) ORDER BY a.starts_at DESC)
      FROM appointments a
      LEFT JOIN profiles ps2 ON ps2.id = a.setter_id
      LEFT JOIN profiles pc2 ON pc2.id = a.closer_id
      WHERE a.lead_id = p_lead_id
    ), '[]'::jsonb),
    'calls', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'created_at', c.created_at,
        'result', c.result,
        'objection_type', c.objection_type,
        'revenue', c.revenue,
        'deal_size', c.deal_size,
        'notes', c.notes,
        'user_id', c.user_id,
        'closer_name', pcc.full_name
      ) ORDER BY c.created_at DESC)
      FROM calls c
      LEFT JOIN profiles pcc ON pcc.id = c.user_id
      WHERE c.lead_id = p_lead_id
    ), '[]'::jsonb),
    'revenue', jsonb_build_object(
      'outcome', lead_row.outcome,
      'deal_value', lead_row.deal_value,
      'payment_status', lead_row.payment_status
    ),
    'touchpoints', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'event_key', d.event_key,
        'channel', d.primary_channel,
        'template_key', d.template_key,
        'status', d.status,
        'dispatched_at', d.dispatched_at,
        'outcome', d.outcome,
        'fallback_used', d.fallback_used
      ) ORDER BY d.dispatched_at DESC)
      FROM communication_dispatch_log d
      WHERE d.lead_id = p_lead_id
    ), '[]'::jsonb)
  );

  RETURN result;
END;
$$;
