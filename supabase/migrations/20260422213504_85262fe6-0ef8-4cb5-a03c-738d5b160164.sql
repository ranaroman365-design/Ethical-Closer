
-- 1) Config table (own table, does NOT touch product_config payout truth)
CREATE TABLE IF NOT EXISTS public.perf_integrity_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_leads int NOT NULL DEFAULT 50,
  min_booked int NOT NULL DEFAULT 10,
  min_showed int NOT NULL DEFAULT 5,
  suspicious_book_high_factor numeric NOT NULL DEFAULT 2.0,
  suspicious_show_low_factor  numeric NOT NULL DEFAULT 0.5,
  suspicious_close_high_pct   numeric NOT NULL DEFAULT 80,
  suspicious_close_low_volume int     NOT NULL DEFAULT 5,
  suspicious_lead_high_low_conv_pct numeric NOT NULL DEFAULT 1.0,
  singleton boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT perf_integrity_config_singleton UNIQUE (singleton)
);

ALTER TABLE public.perf_integrity_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf viewers read integrity config" ON public.perf_integrity_config;
CREATE POLICY "perf viewers read integrity config"
ON public.perf_integrity_config FOR SELECT
TO authenticated
USING (public.is_perf_viewer(auth.uid()));

INSERT INTO public.perf_integrity_config (singleton)
SELECT true
WHERE NOT EXISTS (SELECT 1 FROM public.perf_integrity_config);

-- 2) Eligibility check
CREATE OR REPLACE FUNCTION public.perf_operator_eligibility(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(_days,1));
  v_min_leads int; v_min_booked int; v_min_showed int;
  v_rows jsonb;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT min_leads, min_booked, min_showed
    INTO v_min_leads, v_min_booked, v_min_showed
    FROM public.perf_integrity_config LIMIT 1;
  v_min_leads  := COALESCE(v_min_leads, 50);
  v_min_booked := COALESCE(v_min_booked, 10);
  v_min_showed := COALESCE(v_min_showed, 5);

  WITH ev AS (
    SELECT
      origin_email AS op,
      COALESCE(SUM((event_type='lead_created')::int),0)                AS leads,
      COALESCE(SUM((event_type IN ('booked','call_booked'))::int),0)   AS booked,
      COALESCE(SUM((event_type IN ('showed','show_up'))::int),0)       AS showed,
      COALESCE(SUM((event_type IN ('closed_won','deal_won'))::int),0)  AS won
    FROM public.funnel_events_v2
    WHERE timestamp >= v_since AND origin_email IS NOT NULL
    GROUP BY origin_email
  )
  SELECT jsonb_agg(jsonb_build_object(
    'operator_email', op,
    'leads', leads, 'booked', booked, 'showed', showed, 'won', won,
    'eligible', (leads >= v_min_leads AND booked >= v_min_booked AND showed >= v_min_showed),
    'reasons', (
         CASE WHEN leads  < v_min_leads  THEN jsonb_build_array('leads<'  || v_min_leads)  ELSE '[]'::jsonb END
      || CASE WHEN booked < v_min_booked THEN jsonb_build_array('booked<' || v_min_booked) ELSE '[]'::jsonb END
      || CASE WHEN showed < v_min_showed THEN jsonb_build_array('showed<' || v_min_showed) ELSE '[]'::jsonb END
    ),
    'label', CASE
      WHEN leads < v_min_leads OR booked < v_min_booked OR showed < v_min_showed
        THEN 'insufficient_data' ELSE 'ok' END
  )) INTO v_rows FROM ev;

  RETURN jsonb_build_object(
    'days', _days,
    'thresholds', jsonb_build_object(
      'min_leads', v_min_leads, 'min_booked', v_min_booked, 'min_showed', v_min_showed
    ),
    'operators', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

-- 3) Suspicious pattern detection
CREATE OR REPLACE FUNCTION public.perf_suspicious_patterns(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(_days,1));
  v_book_high_f numeric; v_show_low_f numeric;
  v_close_high_pct numeric; v_close_low_vol int;
  v_lead_high_low_conv numeric;
  v_med_book numeric; v_med_show numeric; v_med_close numeric; v_med_leads numeric;
  v_rows jsonb;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT suspicious_book_high_factor, suspicious_show_low_factor,
         suspicious_close_high_pct, suspicious_close_low_volume,
         suspicious_lead_high_low_conv_pct
    INTO v_book_high_f, v_show_low_f, v_close_high_pct, v_close_low_vol, v_lead_high_low_conv
    FROM public.perf_integrity_config LIMIT 1;
  v_book_high_f       := COALESCE(v_book_high_f, 2.0);
  v_show_low_f        := COALESCE(v_show_low_f, 0.5);
  v_close_high_pct    := COALESCE(v_close_high_pct, 80);
  v_close_low_vol     := COALESCE(v_close_low_vol, 5);
  v_lead_high_low_conv:= COALESCE(v_lead_high_low_conv, 1.0);

  WITH ev AS (
    SELECT
      origin_email AS op,
      COALESCE(SUM((event_type='lead_created')::int),0)                AS leads,
      COALESCE(SUM((event_type='quiz_completed')::int),0)              AS quiz,
      COALESCE(SUM((event_type IN ('booked','call_booked'))::int),0)   AS booked,
      COALESCE(SUM((event_type IN ('showed','show_up'))::int),0)       AS showed,
      COALESCE(SUM((event_type IN ('closed_won','deal_won'))::int),0)  AS won
    FROM public.funnel_events_v2
    WHERE timestamp >= v_since AND origin_email IS NOT NULL
    GROUP BY origin_email
  ),
  rates AS (
    SELECT op, leads, quiz, booked, showed, won,
      CASE WHEN quiz>0   THEN booked::numeric/quiz*100  ELSE NULL END AS booking_rate,
      CASE WHEN booked>0 THEN showed::numeric/booked*100 ELSE NULL END AS show_rate,
      CASE WHEN showed>0 THEN won::numeric/showed*100   ELSE NULL END AS close_rate
    FROM ev
  ),
  meds AS (
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY booking_rate) AS m_book,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY show_rate)    AS m_show,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY close_rate)   AS m_close,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY leads::numeric) AS m_leads
    FROM rates
  )
  SELECT m_book, m_show, m_close, m_leads
    INTO v_med_book, v_med_show, v_med_close, v_med_leads FROM meds;

  WITH ev AS (
    SELECT
      origin_email AS op,
      COALESCE(SUM((event_type='lead_created')::int),0)                AS leads,
      COALESCE(SUM((event_type='quiz_completed')::int),0)              AS quiz,
      COALESCE(SUM((event_type IN ('booked','call_booked'))::int),0)   AS booked,
      COALESCE(SUM((event_type IN ('showed','show_up'))::int),0)       AS showed,
      COALESCE(SUM((event_type IN ('closed_won','deal_won'))::int),0)  AS won
    FROM public.funnel_events_v2
    WHERE timestamp >= v_since AND origin_email IS NOT NULL
    GROUP BY origin_email
  ),
  rates AS (
    SELECT op, leads, quiz, booked, showed, won,
      CASE WHEN quiz>0   THEN booked::numeric/quiz*100  ELSE NULL END AS booking_rate,
      CASE WHEN booked>0 THEN showed::numeric/booked*100 ELSE NULL END AS show_rate,
      CASE WHEN showed>0 THEN won::numeric/showed*100   ELSE NULL END AS close_rate
    FROM ev
  )
  SELECT jsonb_agg(jsonb_build_object(
    'operator_email', op,
    'leads', leads, 'booked', booked, 'showed', showed, 'won', won,
    'booking_rate', ROUND(COALESCE(booking_rate,0),1),
    'show_rate',    ROUND(COALESCE(show_rate,0),1),
    'close_rate',   ROUND(COALESCE(close_rate,0),1),
    'flags', (
      CASE WHEN booking_rate IS NOT NULL AND v_med_book IS NOT NULL
                AND show_rate IS NOT NULL AND v_med_show IS NOT NULL
                AND booking_rate >= v_med_book * v_book_high_f
                AND show_rate    <= v_med_show * v_show_low_f
           THEN jsonb_build_array('book_high_show_low') ELSE '[]'::jsonb END
   || CASE WHEN close_rate IS NOT NULL
                AND close_rate >= v_close_high_pct
                AND showed     <  v_close_low_vol
           THEN jsonb_build_array('close_high_low_volume') ELSE '[]'::jsonb END
   || CASE WHEN v_med_leads IS NOT NULL
                AND leads >= v_med_leads * 2
                AND COALESCE(close_rate,0) < v_lead_high_low_conv
           THEN jsonb_build_array('high_volume_low_conversion') ELSE '[]'::jsonb END
    ),
    'suspicious', (
         (booking_rate IS NOT NULL AND v_med_book IS NOT NULL AND show_rate IS NOT NULL AND v_med_show IS NOT NULL
            AND booking_rate >= v_med_book * v_book_high_f
            AND show_rate    <= v_med_show * v_show_low_f)
      OR (close_rate IS NOT NULL AND close_rate >= v_close_high_pct AND showed < v_close_low_vol)
      OR (v_med_leads IS NOT NULL AND leads >= v_med_leads * 2 AND COALESCE(close_rate,0) < v_lead_high_low_conv)
    )
  )) INTO v_rows FROM rates;

  RETURN jsonb_build_object(
    'days', _days,
    'medians', jsonb_build_object(
      'booking_rate', ROUND(COALESCE(v_med_book,0),1),
      'show_rate',    ROUND(COALESCE(v_med_show,0),1),
      'close_rate',   ROUND(COALESCE(v_med_close,0),1),
      'leads',        ROUND(COALESCE(v_med_leads,0),1)
    ),
    'operators', COALESCE(v_rows,'[]'::jsonb)
  );
END;
$$;

-- 4) Combined integrity scan
CREATE OR REPLACE FUNCTION public.perf_integrity_scan(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_elig jsonb;
  v_susp jsonb;
  v_combined jsonb;
  v_n_total int := 0; v_n_eligible int := 0; v_n_suspicious int := 0;
BEGIN
  IF NOT public.is_perf_viewer(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_elig := public.perf_operator_eligibility(_days);
  v_susp := public.perf_suspicious_patterns(_days);

  WITH e AS (
    SELECT * FROM jsonb_to_recordset(v_elig->'operators')
      AS x(operator_email text, leads int, booked int, showed int, won int, eligible boolean, reasons jsonb, label text)
  ),
  s AS (
    SELECT * FROM jsonb_to_recordset(v_susp->'operators')
      AS x(operator_email text, leads int, booked int, showed int, won int,
           booking_rate numeric, show_rate numeric, close_rate numeric, flags jsonb, suspicious boolean)
  )
  SELECT jsonb_agg(jsonb_build_object(
    'operator_email', e.operator_email,
    'leads', e.leads, 'booked', e.booked, 'showed', e.showed, 'won', e.won,
    'eligible', e.eligible,
    'reasons',  e.reasons,
    'booking_rate', s.booking_rate,
    'show_rate',    s.show_rate,
    'close_rate',   s.close_rate,
    'suspicious_flags', COALESCE(s.flags,'[]'::jsonb),
    'suspicious',       COALESCE(s.suspicious, false),
    'reliability_label', CASE
      WHEN NOT e.eligible AND COALESCE(s.suspicious,false) THEN 'insufficient_and_suspicious'
      WHEN NOT e.eligible THEN 'insufficient_data'
      WHEN COALESCE(s.suspicious,false) THEN 'suspicious_pattern'
      WHEN e.booked > 0 AND e.showed = 0 THEN 'incomplete_funnel'
      ELSE 'ok'
    END
  )) INTO v_combined
  FROM e LEFT JOIN s ON s.operator_email = e.operator_email;

  v_combined := COALESCE(v_combined,'[]'::jsonb);
  SELECT count(*),
         count(*) FILTER (WHERE (x->>'eligible')::boolean),
         count(*) FILTER (WHERE (x->>'suspicious')::boolean)
    INTO v_n_total, v_n_eligible, v_n_suspicious
    FROM jsonb_array_elements(v_combined) x;

  RETURN jsonb_build_object(
    'days', _days,
    'thresholds', v_elig->'thresholds',
    'medians',    v_susp->'medians',
    'summary', jsonb_build_object(
      'operators_total',      v_n_total,
      'operators_eligible',   v_n_eligible,
      'operators_suspicious', v_n_suspicious
    ),
    'operators', v_combined
  );
END;
$$;

-- 5) Permissions
REVOKE ALL ON FUNCTION public.perf_operator_eligibility(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perf_suspicious_patterns(integer)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.perf_integrity_scan(integer)       FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perf_operator_eligibility(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_suspicious_patterns(integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.perf_integrity_scan(integer)       TO authenticated;
