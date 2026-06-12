
-- ═══════════════════════════════════════════════════════════════
-- 1. REVENUE TRUTH VIEW — Single Source of Truth for all revenue
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.revenue_truth_view AS
WITH payment_revenue AS (
  SELECT 
    pl.id AS source_id,
    'payment_link' AS source_type,
    pl.lead_id,
    pl.closer_id,
    l.setter_id,
    l.unit_id AS operator_unit_id,
    l.assigned_operator_id,
    pl.amount::numeric / 100.0 AS revenue_amount,  -- cents to EUR
    pl.currency,
    pl.paid_at AS revenue_at,
    pl.offer_title AS product,
    pl.call_id,
    pl.appointment_id
  FROM public.payment_links pl
  LEFT JOIN public.leads l ON l.id = pl.lead_id
  WHERE pl.status = 'paid' AND pl.paid_at IS NOT NULL
),
call_revenue AS (
  SELECT 
    c.id AS source_id,
    'call' AS source_type,
    c.lead_id,
    c.user_id AS closer_id,
    l.setter_id,
    l.unit_id AS operator_unit_id,
    l.assigned_operator_id,
    c.revenue AS revenue_amount,
    'EUR' AS currency,
    c.closed_at AS revenue_at,
    c.offer_type AS product,
    c.id AS call_id,
    c.appointment_id
  FROM public.calls c
  LEFT JOIN public.leads l ON l.id = c.lead_id
  WHERE c.result = 'won' 
    AND c.revenue > 0 
    AND c.is_simulation = false
    -- Exclude if already counted via payment_link
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_links pl 
      WHERE pl.call_id = c.id AND pl.status = 'paid'
    )
),
funnel_revenue AS (
  SELECT
    fe.id AS source_id,
    'funnel_event' AS source_type,
    NULL::uuid AS lead_id,
    NULL::uuid AS closer_id,
    NULL::uuid AS setter_id,
    NULL::uuid AS operator_unit_id,
    NULL::uuid AS assigned_operator_id,
    fe.revenue AS revenue_amount,
    'EUR' AS currency,
    fe.timestamp AS revenue_at,
    NULL::text AS product,
    NULL::uuid AS call_id,
    NULL::uuid AS appointment_id
  FROM public.funnel_events_v2 fe
  WHERE fe.event_type = 'deal_won'
    AND fe.revenue > 0
    -- Exclude if matched to a payment or call already
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_links pl 
      WHERE pl.status = 'paid' AND pl.paid_at IS NOT NULL
        AND lower(pl.email) = lower(fe.origin_email)
        AND ABS(EXTRACT(EPOCH FROM (pl.paid_at - fe.timestamp))) < 86400
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.result = 'won' AND c.is_simulation = false
        AND c.revenue > 0
        AND ABS(EXTRACT(EPOCH FROM (c.closed_at - fe.timestamp))) < 86400
    )
)
SELECT * FROM payment_revenue
UNION ALL
SELECT * FROM call_revenue
UNION ALL
SELECT * FROM funnel_revenue;

-- ═══════════════════════════════════════════════════════════════
-- 2. UPDATE real_appointments_view to include missing columns
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.real_appointments_view AS
SELECT 
  a.id, a.lead_id, a.call_type, a.appointment_status, a.starts_at, a.ends_at,
  a.setter_id, a.payment_status, a.booking_source, a.acknowledged_at, a.completed_at,
  a.outcome, a.qualification_result, a.setter_notes, a.created_at, a.updated_at,
  a.priority_price, a.pricing_tier, a.video_call_link, a.join_clicked_at,
  a.call_started_at, a.call_completed_at, a.call_status, a.attendance_flag, a.late_flag,
  a.setter_reminder_sent_at, a.sla_escalated_at, a.no_show_detected_at, a.reminders_state,
  a.reservation_expires_at, a.stripe_checkout_session_id, a.stripe_payment_intent_id,
  a.fastlane_amount_cents, a.origin_source, a.attribution_snapshot, a.traffic_owner,
  a.closer_id, a.current_owner_id, a.current_owner_role,
  a.original_owner_id, a.original_owner_role,
  a.reassigned_at, a.reassigned_by, a.reassignment_reason,
  a.locked_closer_id, a.locked_at,
  a.booking_timezone, a.booking_utc_offset, a.original_local_date, a.original_local_time,
  a.assigned_operator_id, a.operator_unit_id,
  a.rescheduled_from_id, a.rescheduled_to_id, a.rescheduled_at
FROM public.appointments a
WHERE EXISTS (
  SELECT 1 FROM public.leads l 
  WHERE l.id = a.lead_id 
  AND NOT public.is_test_lead(l.is_simulation, l.source, l.name)
);

-- ═══════════════════════════════════════════════════════════════
-- 3. PAYMENT TRUTH VIEW
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.payment_truth_view AS
SELECT 
  pl.id AS payment_id,
  pl.lead_id,
  pl.closer_id,
  l.setter_id,
  l.unit_id AS operator_unit_id,
  l.assigned_operator_id,
  pl.amount,
  pl.net_amount,
  pl.stripe_fee,
  pl.status AS payment_status,
  pl.paid_at,
  pl.offer_title,
  pl.deal_type,
  pl.payment_type,
  pl.created_at,
  -- Chain completeness flags
  pl.paid_at IS NOT NULL AS has_payment,
  EXISTS (SELECT 1 FROM public.calls c WHERE c.payment_link_id = pl.id AND c.result = 'won') AS has_revenue_record,
  EXISTS (SELECT 1 FROM public.commissions cm WHERE cm.call_id IN (SELECT c.id FROM public.calls c WHERE c.payment_link_id = pl.id)) AS has_commissions,
  l.lead_status,
  l.payment_status AS lead_payment_status
FROM public.payment_links pl
LEFT JOIN public.leads l ON l.id = pl.lead_id;

-- ═══════════════════════════════════════════════════════════════
-- 4. CANONICAL OWNER ROLE FUNCTION
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.canonical_owner_role(p_level int)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_level
    WHEN 1 THEN 'opener'
    WHEN 2 THEN 'associate_setter'
    WHEN 3 THEN 'senior_setter'
    WHEN 4 THEN 'junior_closer'
    WHEN 5 THEN 'managing_closer'
    WHEN 6 THEN 'senior_closer'
    WHEN 7 THEN 'director'
    WHEN 8 THEN 'admin'
    ELSE 'setter'
  END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5. GO-LIVE CONSISTENCY CHECK RPC
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.go_live_consistency_check()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_score int := 10;
  v_count int;
  v_detail jsonb;
BEGIN
  -- Only admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner')) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  -- CHECK 1: Leads without operator unit
  SELECT count(*) INTO v_count FROM leads WHERE is_simulation = false AND unit_id IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'check', 'leads_without_unit', 'count', v_count, 
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );
  IF v_count > 0 THEN v_score := v_score - 1; END IF;

  -- CHECK 2: Leads without assigned_operator
  SELECT count(*) INTO v_count FROM leads WHERE is_simulation = false AND assigned_operator_id IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'check', 'leads_without_operator', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );
  IF v_count > 0 THEN v_score := v_score - 1; END IF;

  -- CHECK 3: Appointments without operator_unit_id
  SELECT count(*) INTO v_count FROM appointments a
  JOIN leads l ON l.id = a.lead_id
  WHERE NOT is_test_lead(l.is_simulation, l.source, l.name)
  AND a.operator_unit_id IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'check', 'appointments_without_unit', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );
  IF v_count > 0 THEN v_score := v_score - 1; END IF;

  -- CHECK 4: Appointments without current_owner_role
  SELECT count(*) INTO v_count FROM appointments a
  JOIN leads l ON l.id = a.lead_id
  WHERE NOT is_test_lead(l.is_simulation, l.source, l.name)
  AND a.current_owner_role IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'check', 'appointments_missing_owner_role', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );
  IF v_count > 0 THEN v_score := v_score - 1; END IF;

  -- CHECK 5: Non-canonical owner roles
  SELECT count(*) INTO v_count FROM appointments
  WHERE current_owner_role IS NOT NULL 
  AND current_owner_role NOT IN ('opener','associate_setter','senior_setter','junior_closer','managing_closer','senior_closer','director','admin','setter');
  v_checks := v_checks || jsonb_build_object(
    'check', 'non_canonical_owner_roles', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );
  IF v_count > 0 THEN v_score := v_score - 1; END IF;

  -- CHECK 6: Payments without revenue record
  SELECT count(*) INTO v_count FROM payment_links pl
  WHERE pl.status = 'paid' AND pl.paid_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM calls c WHERE c.payment_link_id = pl.id AND c.result = 'won');
  v_checks := v_checks || jsonb_build_object(
    'check', 'payments_without_revenue_record', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END
  );

  -- CHECK 7: Revenue without commissions
  SELECT count(*) INTO v_count FROM calls c
  WHERE c.result = 'won' AND c.revenue > 0 AND c.is_simulation = false
  AND NOT EXISTS (SELECT 1 FROM commissions cm WHERE cm.call_id = c.id);
  v_checks := v_checks || jsonb_build_object(
    'check', 'revenue_without_commissions', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'warn' END
  );

  -- CHECK 8: Test data in production
  SELECT count(*) INTO v_count FROM leads 
  WHERE is_simulation = true;
  v_checks := v_checks || jsonb_build_object(
    'check', 'simulation_leads_present', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'info' END
  );

  -- CHECK 9: Simulation calls
  SELECT count(*) INTO v_count FROM calls WHERE is_simulation = true;
  v_checks := v_checks || jsonb_build_object(
    'check', 'simulation_calls_present', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'info' END
  );

  -- CHECK 10: Dashboard cross-validation (leads vs appointments counts)
  SELECT jsonb_build_object(
    'total_real_leads', (SELECT count(*) FROM leads WHERE is_simulation = false),
    'total_real_appointments', (SELECT count(*) FROM real_appointments_view),
    'leads_with_bookings', (SELECT count(DISTINCT lead_id) FROM real_appointments_view),
    'no_shows', (SELECT count(*) FROM real_appointments_view WHERE appointment_status = 'no_show'),
    'attended', (SELECT count(*) FROM real_appointments_view WHERE attendance_flag = true),
    'total_revenue', (SELECT COALESCE(sum(revenue_amount), 0) FROM revenue_truth_view),
    'total_commissions', (SELECT COALESCE(sum(amount), 0) FROM commissions WHERE is_simulation = false)
  ) INTO v_detail;
  v_checks := v_checks || jsonb_build_object(
    'check', 'cross_dashboard_snapshot', 'detail', v_detail, 'status', 'info'
  );

  -- CHECK 11: Reschedule integrity
  SELECT count(*) INTO v_count FROM appointments 
  WHERE rescheduled_to_id IS NOT NULL AND appointment_status NOT IN ('rescheduled','superseded','cancelled');
  v_checks := v_checks || jsonb_build_object(
    'check', 'reschedule_integrity', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  -- CHECK 12: Lead-Appointment linkage
  SELECT count(*) INTO v_count FROM appointments a
  WHERE a.lead_id IS NULL;
  v_checks := v_checks || jsonb_build_object(
    'check', 'orphan_appointments', 'count', v_count,
    'status', CASE WHEN v_count = 0 THEN 'pass' ELSE 'fail' END
  );

  RETURN jsonb_build_object(
    'score', v_score,
    'max_score', 10,
    'checked_at', now(),
    'checks', v_checks,
    'recommendation', CASE 
      WHEN v_score >= 9 THEN 'GREEN'
      WHEN v_score >= 7 THEN 'YELLOW'
      ELSE 'RED'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.go_live_consistency_check() TO authenticated;
