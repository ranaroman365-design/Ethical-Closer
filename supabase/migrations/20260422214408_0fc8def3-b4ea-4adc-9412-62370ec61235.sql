CREATE OR REPLACE FUNCTION public.perf_funnel_completeness(_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_since timestamptz := now() - make_interval(days => GREATEST(1, _days));
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_perf_viewer(v_uid) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  WITH per_op AS (
    SELECT
      COALESCE(NULLIF(operator_email, ''), 'unassigned') AS operator_email,
      count(*) FILTER (WHERE event_name = 'lead_created')                                       AS leads,
      count(*) FILTER (WHERE event_name IN ('booked','booking_created','call_booked','appointment_booked')) AS booked,
      count(*) FILTER (WHERE event_name IN ('showed','SHOWED_UP','call_completed'))             AS showed,
      count(*) FILTER (WHERE event_name IN ('closed_won','purchase_completed','sale'))          AS won
    FROM public.funnel_events_v2
    WHERE created_at >= v_since
    GROUP BY 1
  ),
  shaped AS (
    SELECT
      operator_email,
      leads, booked, showed, won,
      -- present / missing critical events
      array_remove(ARRAY[
        CASE WHEN leads  > 0 THEN 'lead_created' END,
        CASE WHEN booked > 0 THEN 'booked'        END,
        CASE WHEN showed > 0 THEN 'showed'        END,
        CASE WHEN won    > 0 THEN 'closed_won'    END
      ], NULL) AS present_events,
      array_remove(ARRAY[
        CASE WHEN leads  = 0 THEN 'lead_created' END,
        CASE WHEN booked = 0 THEN 'booked'        END,
        CASE WHEN showed = 0 THEN 'showed'        END,
        CASE WHEN won    = 0 THEN 'closed_won'    END
      ], NULL) AS missing_events,
      -- which rates are unreliable because their inputs are zero
      array_remove(ARRAY[
        CASE WHEN leads  = 0 OR booked = 0 THEN 'booking_rate' END,
        CASE WHEN booked = 0 OR showed = 0 THEN 'show_rate'    END,
        CASE WHEN showed = 0 OR won    = 0 THEN 'close_rate'   END,
        CASE WHEN leads  = 0 OR won    = 0 THEN 'lead_to_sale' END
      ], NULL) AS unreliable_metrics
    FROM per_op
  )
  SELECT jsonb_build_object(
    'days', _days,
    'generated_at', now(),
    'summary', jsonb_build_object(
      'operators_total',    count(*),
      'operators_complete', count(*) FILTER (WHERE array_length(missing_events,1) IS NULL),
      'operators_partial',  count(*) FILTER (WHERE array_length(missing_events,1) BETWEEN 1 AND 3),
      'operators_empty',    count(*) FILTER (WHERE array_length(present_events,1) IS NULL)
    ),
    'operators', COALESCE(jsonb_agg(
      jsonb_build_object(
        'operator_email',     operator_email,
        'leads',              leads,
        'booked',             booked,
        'showed',             showed,
        'won',                won,
        'present_events',     to_jsonb(present_events),
        'missing_events',     to_jsonb(missing_events),
        'unreliable_metrics', to_jsonb(unreliable_metrics),
        'coverage_label',     CASE
          WHEN array_length(present_events,1) IS NULL THEN 'empty'
          WHEN array_length(missing_events,1) IS NULL THEN 'complete'
          ELSE 'partial'
        END
      )
      ORDER BY array_length(missing_events,1) DESC NULLS LAST, leads DESC
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM shaped;

  RETURN COALESCE(v_result, jsonb_build_object('days', _days, 'operators', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.perf_funnel_completeness(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perf_funnel_completeness(int) TO authenticated;