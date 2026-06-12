
CREATE OR REPLACE FUNCTION public.get_full_lead_context(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  lead_row record;
  v_unit_name text;
BEGIN
  SELECT
    l.*,
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
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT ou.unit_name INTO v_unit_name
  FROM operator_units ou WHERE ou.id = lead_row.unit_id;

  result := jsonb_build_object(
    'identity', jsonb_build_object(
      'id', lead_row.id, 'name', lead_row.name, 'email', lead_row.email,
      'phone', lead_row.phone, 'source', lead_row.source,
      'source_funnel', lead_row.source_funnel, 'funnel_id', lead_row.funnel_id,
      'stage', lead_row.stage, 'lead_status', lead_row.lead_status,
      'lead_level', lead_row.lead_level, 'created_at', lead_row.created_at,
      'updated_at', lead_row.updated_at, 'owner_name', lead_row.owner_name,
      'owner_id', lead_row.owner_id, 'setter_name', lead_row.setter_name,
      'setter_id', lead_row.setter_id, 'closer_name', lead_row.closer_name,
      'closer_id', lead_row.closer_id, 'unit_id', lead_row.unit_id,
      'unit_name', v_unit_name, 'referrer_user_id', lead_row.referrer_user_id,
      'priority_flag', lead_row.priority_flag, 'has_booking', lead_row.has_booking,
      'booking_status', lead_row.booking_status
    ),
    'quiz', jsonb_build_object(
      'quiz_score', lead_row.quiz_score, 'quiz_result', lead_row.quiz_result,
      'quiz_funnel_source', lead_row.quiz_funnel_source, 'quiz_answers', lead_row.quiz_answers,
      'lead_score', lead_row.lead_score, 'lead_quality', lead_row.lead_quality,
      'scored_at', lead_row.scored_at, 'qualification_score', lead_row.qualification_score,
      'qualification_bucket', lead_row.qualification_bucket, 'qualification_path', lead_row.qualification_path,
      'setter_budget_readiness', lead_row.setter_budget_readiness,
      'setter_decision_readiness', lead_row.setter_decision_readiness,
      'setter_problem_clarity', lead_row.setter_problem_clarity,
      'setter_recommendation', lead_row.setter_recommendation,
      'setter_qualification_score', lead_row.setter_qualification_score
    ),
    'appointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
        'appointment_status', a.appointment_status, 'call_type', a.call_type,
        'attendance_flag', a.attendance_flag, 'late_flag', a.late_flag,
        'outcome', a.outcome, 'qualification_result', a.qualification_result,
        'setter_id', a.setter_id, 'closer_id', a.closer_id,
        'assigned_operator_id', a.assigned_operator_id,
        'current_owner_id', a.current_owner_id, 'current_owner_role', a.current_owner_role,
        'setter_name', ps2.full_name, 'closer_name', pc2.full_name,
        'video_call_link', a.video_call_link, 'booking_source', a.booking_source,
        'meeting_id', a.meeting_id, 'lead_id', a.lead_id,
        'pricing_tier', a.pricing_tier, 'priority_price', a.priority_price,
        'rescheduled_from_id', a.rescheduled_from_id, 'rescheduled_to_id', a.rescheduled_to_id,
        'rescheduled_at', a.rescheduled_at, 'no_show_detected_at', a.no_show_detected_at,
        'call_started_at', a.call_started_at, 'completed_at', a.completed_at,
        'setter_notes', a.setter_notes, 'created_at', a.created_at
      ) ORDER BY a.starts_at DESC)
      FROM appointments a
      LEFT JOIN profiles ps2 ON ps2.id = a.setter_id
      LEFT JOIN profiles pc2 ON pc2.id = a.closer_id
      WHERE a.lead_id = p_lead_id
    ), '[]'::jsonb),
    'calls', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'created_at', c.created_at, 'result', c.result,
        'objection_type', c.objection_type, 'revenue', c.revenue,
        'deal_size', c.deal_size, 'duration', c.duration,
        'user_id', c.user_id, 'closer_name', pcc.full_name,
        'payment_link_id', c.payment_link_id, 'appointment_id', c.appointment_id,
        'call_type', c.call_type, 'status', c.status
      ) ORDER BY c.created_at DESC)
      FROM calls c
      LEFT JOIN profiles pcc ON pcc.id = c.user_id
      WHERE c.lead_id = p_lead_id
        AND NOT COALESCE(c.is_simulation, false)
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pl.id, 'amount', pl.amount, 'currency', pl.currency,
        'status', pl.status, 'deal_type', pl.deal_type,
        'payment_type', pl.payment_type, 'offer_title', pl.offer_title,
        'payment_url', pl.payment_url, 'created_at', pl.created_at,
        'sent_at', pl.sent_at, 'opened_at', pl.opened_at,
        'paid_at', pl.paid_at, 'expires_at', pl.expires_at,
        'refunded_at', pl.refunded_at, 'closer_id', pl.closer_id,
        'closer_name', ppl.full_name,
        'net_amount', pl.net_amount, 'stripe_fee', pl.stripe_fee
      ) ORDER BY pl.created_at DESC)
      FROM payment_links pl
      LEFT JOIN profiles ppl ON ppl.id = pl.closer_id
      WHERE pl.lead_id = p_lead_id
    ), '[]'::jsonb),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cm.id, 'user_id', cm.user_id, 'user_name', pcm.full_name,
        'role', cm.role, 'amount', cm.amount,
        'source_type', cm.source_type, 'payout_status', cm.payout_status,
        'created_at', cm.created_at, 'eligible_at', cm.eligible_at,
        'paid_at', cm.paid_at
      ) ORDER BY cm.created_at DESC)
      FROM commissions cm
      LEFT JOIN profiles pcm ON pcm.id = cm.user_id
      WHERE cm.lead_id = p_lead_id
    ), '[]'::jsonb),
    'touchpoints', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ce.id, 'event_key', ce.event_key,
        'channel', ce.channel, 'template_key', ce.template_key,
        'status', ce.status, 'dispatched_at', ce.dispatched_at,
        'outcome', ce.outcome, 'fallback_used', ce.fallback_used
      ) ORDER BY ce.dispatched_at DESC NULLS LAST)
      FROM communication_events ce
      WHERE ce.lead_id = p_lead_id
    ), '[]'::jsonb),
    'revenue', jsonb_build_object(
      'outcome', lead_row.outcome, 'close_reason', lead_row.close_reason,
      'deal_value', lead_row.deal_value, 'payment_status', lead_row.payment_status,
      'closed_at', lead_row.closed_at, 'follow_up_date', lead_row.follow_up_date
    ),
    'notes', jsonb_build_object(
      'setter_notes', lead_row.setter_notes, 'closer_notes', lead_row.closer_notes,
      'setter_call_outcome', lead_row.setter_call_outcome,
      'setter_recommendation', lead_row.setter_recommendation
    )
  );

  RETURN result;
END;
$$;
