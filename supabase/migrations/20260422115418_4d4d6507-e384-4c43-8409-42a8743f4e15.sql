CREATE OR REPLACE FUNCTION public.get_revenue_acceleration_kpis(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => p_days);
  v_quiz_completed int;
  v_retarget_sends int;
  v_bookings_after_retarget int;
  v_reminder_sends int;
  v_appts_due int;
  v_appts_attended int;
  v_show_rate numeric;
  v_payment_at_risk int;
  v_payments_recovered int;
  v_commitments int;
  v_no_shows int;
  v_upsell_offers int;
BEGIN
  -- Only admin/owner roles may read
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO v_quiz_completed
  FROM public.leads WHERE quiz_completed_at >= v_since;

  SELECT count(*) INTO v_retarget_sends
  FROM public.outbound_events
  WHERE event_name LIKE 'retargeting.%' AND created_at >= v_since
    AND status IN ('sent','pending','processing');

  SELECT count(DISTINCT l.id) INTO v_bookings_after_retarget
  FROM public.leads l
  WHERE l.has_booking = true
    AND EXISTS (
      SELECT 1 FROM public.outbound_events oe
      WHERE oe.entity_id = l.id
        AND oe.event_name LIKE 'retargeting.%'
        AND oe.created_at >= v_since
    );

  SELECT count(*) INTO v_reminder_sends
  FROM public.outbound_events
  WHERE event_name LIKE 'appointment.reminder%' AND created_at >= v_since
    AND status IN ('sent','pending','processing');

  SELECT count(*) INTO v_appts_due
  FROM public.appointments
  WHERE starts_at >= v_since AND starts_at <= now();
  SELECT count(*) INTO v_appts_attended
  FROM public.appointments
  WHERE starts_at >= v_since AND starts_at <= now() AND attendance_flag = true;
  v_show_rate := CASE WHEN v_appts_due > 0
    THEN round((v_appts_attended::numeric / v_appts_due::numeric) * 100, 1)
    ELSE 0 END;

  SELECT count(*) INTO v_payment_at_risk
  FROM public.leads WHERE payment_status = 'at_risk';

  SELECT count(*) INTO v_payments_recovered
  FROM public.leads
  WHERE payment_status = 'paid'
    AND payment_recovery_state ? 'recovered_at'
    AND (payment_recovery_state->>'recovered_at')::timestamptz >= v_since;

  SELECT count(*) INTO v_commitments
  FROM public.appointment_commitments WHERE confirmed_at >= v_since;

  SELECT count(*) INTO v_no_shows
  FROM public.appointments
  WHERE no_show_detected_at >= v_since;

  SELECT count(*) INTO v_upsell_offers
  FROM public.upsell_offers WHERE created_at >= v_since;

  RETURN jsonb_build_object(
    'quiz_completed', v_quiz_completed,
    'retargeting_sends', v_retarget_sends,
    'bookings_after_retarget', v_bookings_after_retarget,
    'reminder_sends', v_reminder_sends,
    'show_rate_pct', v_show_rate,
    'payment_at_risk', v_payment_at_risk,
    'payments_recovered', v_payments_recovered,
    'commitments_confirmed', v_commitments,
    'no_shows', v_no_shows,
    'upsell_offers', v_upsell_offers
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revenue_acceleration_kpis(integer) TO authenticated;