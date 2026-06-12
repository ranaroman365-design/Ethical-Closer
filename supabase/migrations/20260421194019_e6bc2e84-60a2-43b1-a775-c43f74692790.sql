DROP FUNCTION IF EXISTS public.get_performance_dashboard(date, date);

CREATE FUNCTION public.get_performance_dashboard(
  start_date date,
  end_date date
)
RETURNS TABLE (
  origin_email text,
  origin_display_name text,
  leads bigint,
  quiz_completed bigint,
  bookings bigint,
  shows bigint,
  offers bigint,
  sales bigint,
  losses bigint,
  revenue numeric,
  spend numeric,
  quiz_rate numeric,
  booking_rate numeric,
  show_rate numeric,
  offer_rate numeric,
  closing_rate numeric,
  offer_to_close_rate numeric,
  lead_to_sale_rate numeric,
  cpl numeric,
  cpql numeric,
  cac numeric,
  roas numeric,
  primary_bottleneck_type text,
  primary_bottleneck_metric text,
  primary_bottleneck_value numeric,
  bottleneck_summary text,
  recommended_focus text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_spend numeric;
  v_cfg performance_budget_config%ROWTYPE;
BEGIN
  IF NOT (public.is_perf_viewer() OR public.is_perf_editor()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_days := GREATEST(1, (end_date - start_date) + 1);

  SELECT * INTO v_cfg
  FROM performance_budget_config
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_days <= 1 THEN
    v_spend := COALESCE(v_cfg.daily_budget_per_origin, 0);
  ELSIF v_days <= 7 THEN
    v_spend := COALESCE(v_cfg.weekly_budget_per_origin, 0);
  ELSE
    v_spend := COALESCE(v_cfg.monthly_budget_per_origin, 0);
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      fe.origin_email,
      MAX(fe.origin_display_name) AS origin_display_name,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'lead_created'    THEN fe.lead_id END) AS leads,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'quiz_completed'  THEN fe.lead_id END) AS quiz_completed,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'call_booked'     THEN fe.lead_id END) AS bookings,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'show_up'         THEN fe.lead_id END) AS shows,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'offer_made'      THEN fe.lead_id END) AS offers,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'deal_won'        THEN fe.lead_id END) AS sales,
      COUNT(DISTINCT CASE WHEN fe.event_type = 'deal_lost'       THEN fe.lead_id END) AS losses,
      COALESCE(SUM(CASE WHEN fe.event_type = 'deal_won' THEN fe.revenue ELSE 0 END), 0) AS revenue
    FROM funnel_events_v2 fe
    WHERE fe.timestamp >= start_date::timestamptz
      AND fe.timestamp <  (end_date + 1)::timestamptz
    GROUP BY fe.origin_email
  ),
  derived AS (
    SELECT
      a.*,
      v_spend AS spend,
      CASE WHEN a.leads     > 0 THEN a.quiz_completed::numeric / a.leads     END AS quiz_rate,
      CASE WHEN a.leads     > 0 THEN a.bookings::numeric       / a.leads     END AS booking_rate,
      CASE WHEN a.bookings  > 0 THEN a.shows::numeric          / a.bookings  END AS show_rate,
      CASE WHEN a.shows     > 0 THEN a.offers::numeric         / a.shows     END AS offer_rate,
      CASE WHEN a.shows     > 0 THEN a.sales::numeric          / a.shows     END AS closing_rate,
      CASE WHEN a.offers    > 0 THEN a.sales::numeric          / a.offers    END AS offer_to_close_rate,
      CASE WHEN a.leads     > 0 THEN a.sales::numeric          / a.leads     END AS lead_to_sale_rate,
      CASE WHEN a.leads          > 0 THEN v_spend / a.leads          END AS cpl,
      CASE WHEN a.quiz_completed > 0 THEN v_spend / a.quiz_completed END AS cpql,
      CASE WHEN a.sales          > 0 THEN v_spend / a.sales          END AS cac,
      CASE WHEN v_spend          > 0 THEN a.revenue / v_spend        END AS roas
    FROM agg a
  )
  SELECT
    d.origin_email,
    d.origin_display_name,
    d.leads, d.quiz_completed, d.bookings, d.shows, d.offers, d.sales, d.losses,
    d.revenue, d.spend,
    d.quiz_rate, d.booking_rate, d.show_rate, d.offer_rate, d.closing_rate,
    d.offer_to_close_rate, d.lead_to_sale_rate,
    d.cpl, d.cpql, d.cac, d.roas,
    CASE
      WHEN d.leads = 0 THEN 'NO_DATA'
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN 'TRAFFIC_OR_FRONTEND_FUNNEL'
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN 'BOOKING_CONVERSION'
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN 'SETTER_OR_SHOW_UP_PROCESS'
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN 'CLOSER_QUALIFICATION_OR_OFFER_CREATION'
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN 'CLOSING_OR_OFFER_CONVERSION'
      ELSE 'NO_CLEAR_BOTTLENECK'
    END AS primary_bottleneck_type,
    CASE
      WHEN d.leads = 0 THEN NULL
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN 'quiz_rate'
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN 'booking_rate'
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN 'show_rate'
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN 'offer_rate'
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN 'closing_rate'
      ELSE NULL
    END AS primary_bottleneck_metric,
    CASE
      WHEN d.leads = 0 THEN NULL
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN d.quiz_rate
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN d.booking_rate
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN d.show_rate
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN d.offer_rate
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN d.closing_rate
      ELSE NULL
    END AS primary_bottleneck_value,
    CASE
      WHEN d.leads = 0 THEN 'No funnel events in this period'
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN 'Weak front-end conversion before quiz completion'
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN 'Too many leads fail before booking'
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN 'Booked leads do not attend reliably'
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN 'Calls happen but too few offers are made'
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN 'Offers or calls do not convert into sales efficiently'
      ELSE 'No dominant bottleneck detected'
    END AS bottleneck_summary,
    CASE
      WHEN d.leads = 0 THEN 'Verify event ingestion and origin attribution'
      WHEN d.quiz_rate    IS NOT NULL AND d.quiz_rate    < 0.50 THEN 'Check traffic quality, ad-message match and quiz entry friction'
      WHEN d.booking_rate IS NOT NULL AND d.booking_rate < 0.15 THEN 'Check landing page, CTA clarity and booking flow'
      WHEN d.show_rate    IS NOT NULL AND d.show_rate    < 0.60 THEN 'Check setter expectation-setting, reminders and commitment process'
      WHEN d.offer_rate   IS NOT NULL AND d.offer_rate   < 0.60 THEN 'Check lead quality, call control and qualification-to-offer logic'
      WHEN d.closing_rate IS NOT NULL AND d.closing_rate < 0.20 THEN 'Check closer performance, offer strength and objection handling'
      ELSE 'Scale carefully and monitor changes'
    END AS recommended_focus
  FROM derived d
  ORDER BY d.revenue DESC NULLS LAST, d.origin_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_performance_dashboard(date, date) TO authenticated;