CREATE OR REPLACE FUNCTION public.perf_bottleneck_diagnose(_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_since timestamptz := now() - make_interval(days => GREATEST(1, _days));
  v_integrity jsonb;
  v_result jsonb;
  v_bench_quiz numeric; v_bench_book numeric; v_bench_show numeric; v_bench_close numeric;
  v_bench_quiz_q3 numeric; v_bench_book_q3 numeric; v_bench_show_q3 numeric; v_bench_close_q3 numeric;
  v_bench_deal numeric;
BEGIN
  IF v_uid IS NULL OR NOT public.is_perf_viewer(v_uid) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Pull integrity scan once; use it as the gating + confidence input.
  v_integrity := public.perf_integrity_scan(_days);
  IF v_integrity ? 'error' THEN
    RETURN jsonb_build_object('error', v_integrity->>'error');
  END IF;

  -- Per-operator raw funnel counts from canonical truth (with legacy fallback).
  WITH per_op AS (
    SELECT
      COALESCE(NULLIF(origin_email, ''), 'unassigned')                                       AS operator_email,
      count(*) FILTER (WHERE event_type IN ('lead_created'))                                  AS leads,
      count(*) FILTER (WHERE event_type IN ('quiz_completed'))                                AS quiz,
      count(*) FILTER (WHERE event_type IN ('booked','call_booked','booking_created','appointment_booked')) AS booked,
      count(*) FILTER (WHERE event_type IN ('showed','SHOWED_UP','show_up','call_completed')) AS showed,
      count(*) FILTER (WHERE event_type IN ('closed_won','deal_won','purchase_completed','sale')) AS won,
      coalesce(sum(revenue) FILTER (WHERE event_type IN ('closed_won','deal_won','purchase_completed','sale')), 0) AS revenue
    FROM public.funnel_events_v2
    WHERE created_at >= v_since
    GROUP BY 1
  ),
  rates AS (
    SELECT
      p.operator_email,
      p.leads, p.quiz, p.booked, p.showed, p.won, p.revenue,
      CASE WHEN p.leads  > 0 THEN p.quiz   ::numeric / p.leads  END AS quiz_rate,
      CASE WHEN p.quiz   > 0 THEN p.booked ::numeric / p.quiz   END AS booking_rate,
      CASE WHEN p.booked > 0 THEN p.showed ::numeric / p.booked END AS show_rate,
      CASE WHEN p.showed > 0 THEN p.won    ::numeric / p.showed END AS close_rate,
      CASE WHEN p.won    > 0 THEN p.revenue::numeric / p.won    END AS avg_deal_value
    FROM per_op p
  ),
  -- Bring in integrity metadata per operator
  integrity_ops AS (
    SELECT
      (j->>'operator_email')::text                       AS operator_email,
      (j->>'reliability_label')::text                    AS reliability_label,
      coalesce((j->>'eligible')::boolean, false)         AS eligible,
      coalesce((j->>'suspicious')::boolean, false)       AS suspicious
    FROM jsonb_array_elements(v_integrity->'operators') j
  ),
  joined AS (
    SELECT
      r.*,
      coalesce(i.reliability_label, 'insufficient_data') AS reliability_label,
      coalesce(i.eligible, false)                        AS eligible,
      coalesce(i.suspicious, false)                      AS suspicious
    FROM rates r
    LEFT JOIN integrity_ops i USING (operator_email)
  ),
  -- Benchmarks computed only over eligible AND non-suspicious operators.
  bench AS (
    SELECT
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY quiz_rate)      FILTER (WHERE eligible AND NOT suspicious AND quiz_rate    IS NOT NULL) AS m_quiz,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY booking_rate)   FILTER (WHERE eligible AND NOT suspicious AND booking_rate IS NOT NULL) AS m_book,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY show_rate)      FILTER (WHERE eligible AND NOT suspicious AND show_rate    IS NOT NULL) AS m_show,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY close_rate)     FILTER (WHERE eligible AND NOT suspicious AND close_rate   IS NOT NULL) AS m_close,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY quiz_rate)      FILTER (WHERE eligible AND NOT suspicious AND quiz_rate    IS NOT NULL) AS q3_quiz,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY booking_rate)   FILTER (WHERE eligible AND NOT suspicious AND booking_rate IS NOT NULL) AS q3_book,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY show_rate)      FILTER (WHERE eligible AND NOT suspicious AND show_rate    IS NOT NULL) AS q3_show,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY close_rate)     FILTER (WHERE eligible AND NOT suspicious AND close_rate   IS NOT NULL) AS q3_close,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY avg_deal_value) FILTER (WHERE eligible AND NOT suspicious AND avg_deal_value IS NOT NULL) AS m_deal
    FROM joined
  )
  SELECT m_quiz, m_book, m_show, m_close, q3_quiz, q3_book, q3_show, q3_close, m_deal
  INTO   v_bench_quiz, v_bench_book, v_bench_show, v_bench_close,
         v_bench_quiz_q3, v_bench_book_q3, v_bench_show_q3, v_bench_close_q3,
         v_bench_deal
  FROM bench;

  -- Per-operator diagnosis with gap, lost wins, lost revenue, primary bottleneck, confidence, actions.
  WITH per_op AS (
    SELECT
      COALESCE(NULLIF(origin_email, ''), 'unassigned')                                       AS operator_email,
      count(*) FILTER (WHERE event_type IN ('lead_created'))                                  AS leads,
      count(*) FILTER (WHERE event_type IN ('quiz_completed'))                                AS quiz,
      count(*) FILTER (WHERE event_type IN ('booked','call_booked','booking_created','appointment_booked')) AS booked,
      count(*) FILTER (WHERE event_type IN ('showed','SHOWED_UP','show_up','call_completed')) AS showed,
      count(*) FILTER (WHERE event_type IN ('closed_won','deal_won','purchase_completed','sale')) AS won,
      coalesce(sum(revenue) FILTER (WHERE event_type IN ('closed_won','deal_won','purchase_completed','sale')), 0) AS revenue
    FROM public.funnel_events_v2
    WHERE created_at >= v_since
    GROUP BY 1
  ),
  integrity_ops AS (
    SELECT
      (j->>'operator_email')::text                                                          AS operator_email,
      coalesce((j->>'reliability_label')::text, 'insufficient_data')                        AS reliability_label,
      coalesce((j->>'eligible')::boolean, false)                                            AS eligible,
      coalesce((j->>'suspicious')::boolean, false)                                          AS suspicious,
      coalesce(j->'reasons', '[]'::jsonb)                                                   AS reasons
    FROM jsonb_array_elements(v_integrity->'operators') j
  ),
  diag AS (
    SELECT
      p.operator_email,
      p.leads, p.quiz, p.booked, p.showed, p.won, p.revenue,
      CASE WHEN p.leads  > 0 THEN p.quiz   ::numeric / p.leads  END AS quiz_rate,
      CASE WHEN p.quiz   > 0 THEN p.booked ::numeric / p.quiz   END AS booking_rate,
      CASE WHEN p.booked > 0 THEN p.showed ::numeric / p.booked END AS show_rate,
      CASE WHEN p.showed > 0 THEN p.won    ::numeric / p.showed END AS close_rate,
      coalesce(CASE WHEN p.won > 0 THEN p.revenue::numeric / p.won END, v_bench_deal, 0) AS avg_deal_value,
      coalesce(i.reliability_label, 'insufficient_data') AS reliability_label,
      coalesce(i.eligible, false)                        AS eligible,
      coalesce(i.suspicious, false)                      AS suspicious,
      coalesce(i.reasons, '[]'::jsonb)                   AS reasons
    FROM per_op p
    LEFT JOIN integrity_ops i USING (operator_email)
  ),
  scored AS (
    SELECT
      d.*,
      -- Stage gaps (only positive deficits matter)
      GREATEST(coalesce(v_bench_quiz, 0)  - coalesce(d.quiz_rate,    0), 0) AS gap_quiz,
      GREATEST(coalesce(v_bench_book, 0)  - coalesce(d.booking_rate, 0), 0) AS gap_book,
      GREATEST(coalesce(v_bench_show, 0)  - coalesce(d.show_rate,    0), 0) AS gap_show,
      GREATEST(coalesce(v_bench_close,0)  - coalesce(d.close_rate,   0), 0) AS gap_close
    FROM diag d
  ),
  impacted AS (
    SELECT
      s.*,
      -- Traffic / quiz: lost leads-to-quiz cascading to wins
      (s.gap_quiz  * s.leads)
        * coalesce(v_bench_book, 0)
        * coalesce(v_bench_show, 0)
        * coalesce(v_bench_close,0) AS lost_wins_traffic,
      -- Booking: lost bookings cascading to wins
      (s.gap_book  * s.quiz)
        * coalesce(v_bench_show, 0)
        * coalesce(v_bench_close,0) AS lost_wins_booking,
      -- Show: lost shows cascading to wins
      (s.gap_show  * s.booked)
        * coalesce(v_bench_close,0) AS lost_wins_show,
      -- Close: lost wins directly
      (s.gap_close * s.showed)      AS lost_wins_close
    FROM scored s
  ),
  per_op_diag AS (
    SELECT
      i.*,
      i.lost_wins_traffic * i.avg_deal_value AS lost_rev_traffic,
      i.lost_wins_booking * i.avg_deal_value AS lost_rev_booking,
      i.lost_wins_show    * i.avg_deal_value AS lost_rev_show,
      i.lost_wins_close   * i.avg_deal_value AS lost_rev_close
    FROM impacted i
  ),
  classified AS (
    SELECT
      p.*,
      -- Pick stage with biggest revenue impact (after integrity gate)
      CASE
        WHEN p.reliability_label = 'insufficient_data'             THEN 'insufficient_data'
        WHEN p.reliability_label = 'insufficient_and_suspicious'   THEN 'suspicious_data'
        WHEN p.reliability_label = 'incomplete_funnel'
             AND (p.booked = 0 OR p.showed = 0 OR p.won = 0)       THEN 'incomplete_funnel'
        WHEN GREATEST(p.lost_rev_traffic, p.lost_rev_booking, p.lost_rev_show, p.lost_rev_close) <= 0
                                                                    THEN 'no_meaningful_gap'
        WHEN p.lost_rev_close   >= GREATEST(p.lost_rev_traffic, p.lost_rev_booking, p.lost_rev_show)
                                                                    THEN 'closing_problem'
        WHEN p.lost_rev_show    >= GREATEST(p.lost_rev_traffic, p.lost_rev_booking, p.lost_rev_close)
                                                                    THEN 'setting_show_problem'
        WHEN p.lost_rev_booking >= GREATEST(p.lost_rev_traffic, p.lost_rev_show, p.lost_rev_close)
                                                                    THEN 'booking_problem'
        ELSE                                                            'traffic_problem'
      END AS primary_bottleneck,
      CASE
        WHEN p.reliability_label IN ('insufficient_data','insufficient_and_suspicious') THEN 'blocked'
        WHEN p.reliability_label = 'suspicious_pattern'                                 THEN 'low_confidence'
        WHEN p.reliability_label = 'incomplete_funnel'                                  THEN 'low_confidence'
        WHEN p.eligible AND p.leads >= 100 AND p.booked >= 20 AND p.showed >= 10        THEN 'high_confidence'
        WHEN p.eligible                                                                 THEN 'medium_confidence'
        ELSE                                                                                'low_confidence'
      END AS confidence
    FROM per_op_diag p
  ),
  shaped AS (
    SELECT
      c.operator_email,
      c.leads, c.quiz, c.booked, c.showed, c.won, c.revenue,
      c.reliability_label, c.eligible, c.suspicious, c.reasons,
      c.confidence,
      c.primary_bottleneck,
      -- Stage detail block
      jsonb_build_object(
        'quiz_rate',    c.quiz_rate,    'quiz_benchmark',    v_bench_quiz,
        'booking_rate', c.booking_rate, 'booking_benchmark', v_bench_book,
        'show_rate',    c.show_rate,    'show_benchmark',    v_bench_show,
        'close_rate',   c.close_rate,   'close_benchmark',   v_bench_close,
        'avg_deal_value', c.avg_deal_value
      ) AS stages,
      -- The gap and impact for the PRIMARY bottleneck
      CASE c.primary_bottleneck
        WHEN 'closing_problem'      THEN c.gap_close
        WHEN 'setting_show_problem' THEN c.gap_show
        WHEN 'booking_problem'      THEN c.gap_book
        WHEN 'traffic_problem'      THEN c.gap_quiz
        ELSE 0 END AS primary_gap,
      CASE c.primary_bottleneck
        WHEN 'closing_problem'      THEN c.close_rate
        WHEN 'setting_show_problem' THEN c.show_rate
        WHEN 'booking_problem'      THEN c.booking_rate
        WHEN 'traffic_problem'      THEN c.quiz_rate
        ELSE NULL END AS primary_actual,
      CASE c.primary_bottleneck
        WHEN 'closing_problem'      THEN v_bench_close
        WHEN 'setting_show_problem' THEN v_bench_show
        WHEN 'booking_problem'      THEN v_bench_book
        WHEN 'traffic_problem'      THEN v_bench_quiz
        ELSE NULL END AS primary_benchmark,
      GREATEST(c.lost_rev_traffic, c.lost_rev_booking, c.lost_rev_show, c.lost_rev_close) AS estimated_lost_revenue,
      GREATEST(c.lost_wins_traffic, c.lost_wins_booking, c.lost_wins_show, c.lost_wins_close) AS estimated_lost_wins,
      jsonb_build_object(
        'traffic',  jsonb_build_object('lost_revenue', round(c.lost_rev_traffic::numeric, 2), 'lost_wins', round(c.lost_wins_traffic::numeric, 2)),
        'booking',  jsonb_build_object('lost_revenue', round(c.lost_rev_booking::numeric, 2), 'lost_wins', round(c.lost_wins_booking::numeric, 2)),
        'show',     jsonb_build_object('lost_revenue', round(c.lost_rev_show::numeric,    2), 'lost_wins', round(c.lost_wins_show::numeric,    2)),
        'close',    jsonb_build_object('lost_revenue', round(c.lost_rev_close::numeric,   2), 'lost_wins', round(c.lost_wins_close::numeric,   2))
      ) AS impact_per_stage,
      -- Prescriptive action layer
      CASE c.primary_bottleneck
        WHEN 'traffic_problem' THEN jsonb_build_object(
          'cause', 'Schwache Top-of-Funnel-Conversion (Lead/Quiz)',
          'leverage', 'Anzeigen, Landingpage, Quiz-Einstieg',
          'actions', jsonb_build_array(
            'Anzeigen-Targeting + Creative-Match prüfen',
            'Landingpage-Message-Match überarbeiten',
            'Quiz-Einstieg vereinfachen (weniger Friction)',
            'Traffic-Quelle auf Lead-Qualität auditieren'))
        WHEN 'booking_problem' THEN jsonb_build_object(
          'cause', 'Quiz wird abgeschlossen, aber Termin wird nicht gebucht',
          'leverage', 'Quiz-Result-Page, CTA, Calendar-Step',
          'actions', jsonb_build_array(
            'Quiz-Result-Page → Calendar-CTA klarer machen',
            'Booking-Page Friction reduzieren',
            'Pre-Booking-Vertrauen erhöhen (Proof, Mechanik)',
            'Slot-Verfügbarkeit & Time-to-Book prüfen'))
        WHEN 'setting_show_problem' THEN jsonb_build_object(
          'cause', 'Termine werden gebucht, aber zu wenige erscheinen',
          'leverage', 'Reminder-Sequenz, Setter-Disziplin, Confirmation',
          'actions', jsonb_build_array(
            'Reminder-Kette 24h / 2h / 15m verifizieren',
            'Confirmation-Call durch Setter einführen',
            'Pre-Call-Framing & Erwartung schärfen',
            'Attendance-Markierung im Workflow durchsetzen'))
        WHEN 'closing_problem' THEN jsonb_build_object(
          'cause', 'Genug Shows, aber Close-Rate unter Cohort-Median',
          'leverage', 'Closer-Performance, Offer, Lead-Qualität',
          'actions', jsonb_build_array(
            'Call-Recordings reviewen + Top-3-Fehler isolieren',
            'Objection-Handling-Drill für die häufigsten Einwände',
            'Offer-Positioning und Preisanker schärfen',
            'Lead-Qualifikation vor dem Call prüfen'))
        WHEN 'no_meaningful_gap' THEN jsonb_build_object(
          'cause', 'Keine Stage liegt signifikant unter Benchmark',
          'leverage', 'Volumen / Skalierung statt Optimierung',
          'actions', jsonb_build_array('Volumen erhöhen statt Conversion drücken'))
        WHEN 'insufficient_data' THEN jsonb_build_object(
          'cause', 'Zu wenig Daten für eine belastbare Diagnose',
          'leverage', 'Datenvolumen erhöhen',
          'actions', jsonb_build_array('Mindestschwellen erreichen, dann erneut diagnostizieren'))
        WHEN 'incomplete_funnel' THEN jsonb_build_object(
          'cause', 'Funnel-Daten unvollständig (kanonische Events fehlen)',
          'leverage', 'Event-Tracking & Attendance-Disziplin',
          'actions', jsonb_build_array('Fehlende kanonische Events instrumentieren / Attendance markieren'))
        WHEN 'suspicious_data' THEN jsonb_build_object(
          'cause', 'Pattern weicht stark vom Cohort-Median ab',
          'leverage', 'Daten-Validierung',
          'actions', jsonb_build_array('Booking/Show-Disziplin und Lead-Quellen prüfen'))
        ELSE jsonb_build_object('cause', '—', 'leverage', '—', 'actions', '[]'::jsonb)
      END AS recommendation
    FROM classified c
  )
  SELECT jsonb_build_object(
    'days', _days,
    'generated_at', now(),
    'benchmarks', jsonb_build_object(
      'median', jsonb_build_object(
        'quiz_rate', v_bench_quiz, 'booking_rate', v_bench_book,
        'show_rate', v_bench_show, 'close_rate',   v_bench_close
      ),
      'top_quartile', jsonb_build_object(
        'quiz_rate', v_bench_quiz_q3, 'booking_rate', v_bench_book_q3,
        'show_rate', v_bench_show_q3, 'close_rate',   v_bench_close_q3
      ),
      'avg_deal_value_cohort_median', v_bench_deal
    ),
    'global', jsonb_build_object(
      'operators_total',     count(*),
      'operators_diagnosed', count(*) FILTER (WHERE primary_bottleneck IN ('traffic_problem','booking_problem','setting_show_problem','closing_problem')),
      'operators_blocked',   count(*) FILTER (WHERE confidence = 'blocked'),
      'total_lost_revenue',  coalesce(round(sum(estimated_lost_revenue) FILTER (WHERE confidence <> 'blocked')::numeric, 2), 0),
      'most_common_bottleneck', (
        SELECT primary_bottleneck FROM shaped
         WHERE primary_bottleneck IN ('traffic_problem','booking_problem','setting_show_problem','closing_problem')
         GROUP BY primary_bottleneck
         ORDER BY count(*) DESC, sum(estimated_lost_revenue) DESC
         LIMIT 1
      ),
      'distribution', (
        SELECT coalesce(jsonb_object_agg(primary_bottleneck, n), '{}'::jsonb)
          FROM (SELECT primary_bottleneck, count(*) AS n FROM shaped GROUP BY primary_bottleneck) d
      ),
      'top_opportunities', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'operator_email', operator_email,
          'primary_bottleneck', primary_bottleneck,
          'estimated_lost_revenue', round(estimated_lost_revenue::numeric, 2),
          'confidence', confidence
        ) ORDER BY estimated_lost_revenue DESC), '[]'::jsonb)
          FROM (
            SELECT * FROM shaped
             WHERE confidence <> 'blocked'
               AND primary_bottleneck IN ('traffic_problem','booking_problem','setting_show_problem','closing_problem')
             ORDER BY estimated_lost_revenue DESC
             LIMIT 3
          ) t
      )
    ),
    'operators', coalesce(jsonb_agg(
      jsonb_build_object(
        'operator_email',          operator_email,
        'reliability_label',       reliability_label,
        'eligible',                eligible,
        'suspicious',              suspicious,
        'confidence',              confidence,
        'primary_bottleneck',      primary_bottleneck,
        'primary_actual',          primary_actual,
        'primary_benchmark',       primary_benchmark,
        'primary_gap_pct_points',  round((coalesce(primary_gap, 0) * 100)::numeric, 2),
        'estimated_lost_revenue',  round(estimated_lost_revenue::numeric, 2),
        'estimated_lost_wins',     round(estimated_lost_wins::numeric, 2),
        'volume', jsonb_build_object('leads', leads, 'quiz', quiz, 'booked', booked, 'showed', showed, 'won', won, 'revenue', revenue),
        'stages',           stages,
        'impact_per_stage', impact_per_stage,
        'recommendation',   recommendation,
        'reasons',          reasons
      )
      ORDER BY estimated_lost_revenue DESC
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM shaped;

  RETURN coalesce(v_result, jsonb_build_object('days', _days, 'operators', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.perf_bottleneck_diagnose(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perf_bottleneck_diagnose(int) TO authenticated;