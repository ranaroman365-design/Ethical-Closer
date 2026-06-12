-- ============================================================================
-- LAYER 34 — FULL FUNNEL INTELLIGENCE DASHBOARD
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.funnel_metrics_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_date DATE NOT NULL,
  origin TEXT NOT NULL DEFAULT 'all',
  funnel_key TEXT NOT NULL DEFAULT 'all',
  leads_created INTEGER NOT NULL DEFAULT 0,
  bookings_created INTEGER NOT NULL DEFAULT 0,
  shows_count INTEGER NOT NULL DEFAULT 0,
  no_shows_count INTEGER NOT NULL DEFAULT 0,
  closes_count INTEGER NOT NULL DEFAULT 0,
  revenue_cents BIGINT NOT NULL DEFAULT 0,
  lead_to_book_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN leads_created > 0 THEN ROUND((bookings_created::numeric / leads_created) * 100, 2) ELSE 0 END
  ) STORED,
  book_to_show_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN bookings_created > 0 THEN ROUND((shows_count::numeric / bookings_created) * 100, 2) ELSE 0 END
  ) STORED,
  show_to_close_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN shows_count > 0 THEN ROUND((closes_count::numeric / shows_count) * 100, 2) ELSE 0 END
  ) STORED,
  revenue_per_lead_cents BIGINT GENERATED ALWAYS AS (
    CASE WHEN leads_created > 0 THEN (revenue_cents / leads_created) ELSE 0 END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (metric_date, origin, funnel_key)
);
CREATE INDEX IF NOT EXISTS idx_fmd_date ON public.funnel_metrics_daily (metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_fmd_origin ON public.funnel_metrics_daily (origin);

CREATE TABLE IF NOT EXISTS public.performance_aggregates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('operator','message','call','funnel','origin')),
  scope_id TEXT NOT NULL,
  window_days INTEGER NOT NULL DEFAULT 30,
  attempts INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  conversion_rate NUMERIC GENERATED ALWAYS AS (
    CASE WHEN attempts > 0 THEN ROUND((successes::numeric / attempts) * 100, 2) ELSE 0 END
  ) STORED,
  revenue_cents BIGINT NOT NULL DEFAULT 0,
  revenue_per_attempt_cents BIGINT GENERATED ALWAYS AS (
    CASE WHEN attempts > 0 THEN (revenue_cents / attempts) ELSE 0 END
  ) STORED,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id, window_days)
);
CREATE INDEX IF NOT EXISTS idx_pa_scope ON public.performance_aggregates (scope, scope_id);

CREATE TABLE IF NOT EXISTS public.insight_findings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  finding_key TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  bottleneck TEXT NOT NULL,
  observed_value NUMERIC,
  threshold_value NUMERIC,
  message_de TEXT NOT NULL,
  message_en TEXT NOT NULL,
  recommendation TEXT,
  estimated_revenue_loss_cents BIGINT DEFAULT 0,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (finding_key, scope, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_if_severity ON public.insight_findings (severity, detected_at DESC) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS public.funnel_intelligence_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  threshold_show_rate_min NUMERIC NOT NULL DEFAULT 40.0,
  threshold_close_rate_min NUMERIC NOT NULL DEFAULT 15.0,
  threshold_lead_to_book_min NUMERIC NOT NULL DEFAULT 20.0,
  threshold_revenue_per_lead_cents BIGINT NOT NULL DEFAULT 5000,
  refresh_interval_minutes INTEGER NOT NULL DEFAULT 60,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

INSERT INTO public.funnel_intelligence_settings (enabled, notes)
SELECT false, 'Layer 34 Phase 1 — silent by default'
WHERE NOT EXISTS (SELECT 1 FROM public.funnel_intelligence_settings);

-- RLS
ALTER TABLE public.funnel_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_intelligence_settings ENABLE ROW LEVEL SECURITY;

-- Admin / Owner / ops_admin: full
CREATE POLICY "fmd_admin_all" ON public.funnel_metrics_daily FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

CREATE POLICY "pa_admin_all" ON public.performance_aggregates FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

CREATE POLICY "if_admin_all" ON public.insight_findings FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

CREATE POLICY "fis_admin_all" ON public.funnel_intelligence_settings FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

-- Director-View (analyst_readonly): aggregate read
CREATE POLICY "fmd_director_read" ON public.funnel_metrics_daily FOR SELECT
  USING (public.has_role(auth.uid(),'analyst_readonly'));

CREATE POLICY "pa_director_read" ON public.performance_aggregates FOR SELECT
  USING (public.has_role(auth.uid(),'analyst_readonly') AND scope IN ('funnel','origin','message','call'));

CREATE POLICY "if_director_read" ON public.insight_findings FOR SELECT
  USING (public.has_role(auth.uid(),'analyst_readonly'));

-- Operator: own scope only
CREATE POLICY "pa_operator_own" ON public.performance_aggregates FOR SELECT
  USING (scope = 'operator' AND scope_id = auth.uid()::text);

CREATE POLICY "if_operator_own" ON public.insight_findings FOR SELECT
  USING (scope = 'operator' AND scope_id = auth.uid()::text);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_funnel_metrics_daily(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows INTEGER := 0;
BEGIN
  INSERT INTO public.funnel_metrics_daily (metric_date, origin, funnel_key, leads_created, bookings_created, shows_count, no_shows_count, closes_count, revenue_cents)
  SELECT
    d::date,
    'all', 'all',
    COALESCE((SELECT COUNT(*) FROM public.leads l WHERE l.created_at::date = d::date), 0),
    COALESCE((SELECT COUNT(*) FROM public.calls c WHERE c.scheduled_at::date = d::date), 0),
    COALESCE((SELECT COUNT(*) FROM public.calls c WHERE c.scheduled_at::date = d::date AND c.outcome IN ('showed','closed_won','closed_lost')), 0),
    COALESCE((SELECT COUNT(*) FROM public.calls c WHERE c.scheduled_at::date = d::date AND c.outcome = 'no_show'), 0),
    COALESCE((SELECT COUNT(*) FROM public.calls c WHERE c.scheduled_at::date = d::date AND c.outcome = 'closed_won'), 0),
    COALESCE((SELECT SUM(COALESCE(c.revenue_cents, 0)) FROM public.calls c WHERE c.scheduled_at::date = d::date AND c.outcome = 'closed_won'), 0)
  FROM generate_series(CURRENT_DATE - (p_days || ' days')::interval, CURRENT_DATE, '1 day'::interval) d
  ON CONFLICT (metric_date, origin, funnel_key) DO UPDATE SET
    leads_created = EXCLUDED.leads_created,
    bookings_created = EXCLUDED.bookings_created,
    shows_count = EXCLUDED.shows_count,
    no_shows_count = EXCLUDED.no_shows_count,
    closes_count = EXCLUDED.closes_count,
    revenue_cents = EXCLUDED.revenue_cents,
    updated_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'refresh_funnel_metrics_daily soft-fail: %', SQLERRM;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_funnel_insights()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  SELECT * INTO v_settings FROM public.funnel_intelligence_settings LIMIT 1;
  IF v_settings IS NULL THEN RETURN 0; END IF;

  FOR r IN
    SELECT
      COALESCE(NULLIF(origin,''), 'all') AS origin,
      SUM(leads_created) AS leads,
      SUM(bookings_created) AS bookings,
      SUM(shows_count) AS shows,
      SUM(closes_count) AS closes,
      SUM(revenue_cents) AS revenue
    FROM public.funnel_metrics_daily
    WHERE metric_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY origin
  LOOP
    IF r.bookings > 0 THEN
      DECLARE v_show_rate NUMERIC := (r.shows::numeric / r.bookings) * 100;
      BEGIN
        IF v_show_rate < v_settings.threshold_show_rate_min THEN
          INSERT INTO public.insight_findings (finding_key, scope, scope_id, severity, bottleneck, observed_value, threshold_value, message_de, message_en, recommendation)
          VALUES ('show_rate_low_30d','origin', r.origin,
            CASE WHEN v_show_rate < (v_settings.threshold_show_rate_min/2) THEN 'critical' ELSE 'warning' END,
            'attendance', v_show_rate, v_settings.threshold_show_rate_min,
            format('Show-Rate für Origin "%s" liegt bei %s%% (unter %s%%).', r.origin, ROUND(v_show_rate,1), v_settings.threshold_show_rate_min),
            format('Show rate for origin "%s" is %s%% (below %s%%).', r.origin, ROUND(v_show_rate,1), v_settings.threshold_show_rate_min),
            'Reaktivierungs-Cohort booked_no_show prüfen + 24h/2h Reminder validieren.')
          ON CONFLICT (finding_key, scope, scope_id) DO UPDATE SET observed_value=EXCLUDED.observed_value, severity=EXCLUDED.severity, detected_at=now(), resolved_at=NULL;
          v_count := v_count + 1;
        END IF;
      END;
    END IF;

    IF r.shows > 0 THEN
      DECLARE v_close_rate NUMERIC := (r.closes::numeric / r.shows) * 100;
      BEGIN
        IF v_close_rate < v_settings.threshold_close_rate_min THEN
          INSERT INTO public.insight_findings (finding_key, scope, scope_id, severity, bottleneck, observed_value, threshold_value, message_de, message_en, recommendation)
          VALUES ('close_rate_low_30d','origin', r.origin,
            CASE WHEN v_close_rate < (v_settings.threshold_close_rate_min/2) THEN 'critical' ELSE 'warning' END,
            'closer', v_close_rate, v_settings.threshold_close_rate_min,
            format('Close-Rate für Origin "%s" liegt bei %s%% (unter %s%%).', r.origin, ROUND(v_close_rate,1), v_settings.threshold_close_rate_min),
            format('Close rate for origin "%s" is %s%% (below %s%%).', r.origin, ROUND(v_close_rate,1), v_settings.threshold_close_rate_min),
            'Closer-Performance + Objection-Heatmap (L33) prüfen, Coaching priorisieren.')
          ON CONFLICT (finding_key, scope, scope_id) DO UPDATE SET observed_value=EXCLUDED.observed_value, severity=EXCLUDED.severity, detected_at=now(), resolved_at=NULL;
          v_count := v_count + 1;
        END IF;
      END;
    END IF;

    IF r.leads > 0 THEN
      DECLARE v_l2b NUMERIC := (r.bookings::numeric / r.leads) * 100;
      BEGIN
        IF v_l2b < v_settings.threshold_lead_to_book_min THEN
          INSERT INTO public.insight_findings (finding_key, scope, scope_id, severity, bottleneck, observed_value, threshold_value, message_de, message_en, recommendation)
          VALUES ('lead_to_book_low_30d','origin', r.origin,
            'warning', 'setter', v_l2b, v_settings.threshold_lead_to_book_min,
            format('Lead→Booking für "%s" bei %s%% (unter %s%%).', r.origin, ROUND(v_l2b,1), v_settings.threshold_lead_to_book_min),
            format('Lead→Booking for "%s" is %s%% (below %s%%).', r.origin, ROUND(v_l2b,1), v_settings.threshold_lead_to_book_min),
            'Setter-Kapazität + Response-SLA + Lead-Quality-Score prüfen.')
          ON CONFLICT (finding_key, scope, scope_id) DO UPDATE SET observed_value=EXCLUDED.observed_value, detected_at=now(), resolved_at=NULL;
          v_count := v_count + 1;
        END IF;
      END;
    END IF;
  END LOOP;

  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'detect_funnel_insights soft-fail: %', SQLERRM;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.funnel_intelligence_view(
  p_window_days INTEGER DEFAULT 30,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN := public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin');
  v_is_director BOOLEAN := public.has_role(auth.uid(),'analyst_readonly');
  v_payload JSONB;
  v_top JSONB;
  v_findings JSONB;
  v_daily JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT to_jsonb(t) INTO v_top FROM (
    SELECT
      COALESCE(SUM(leads_created),0) AS leads,
      COALESCE(SUM(bookings_created),0) AS bookings,
      COALESCE(SUM(shows_count),0) AS shows,
      COALESCE(SUM(closes_count),0) AS closes,
      COALESCE(SUM(revenue_cents),0) AS revenue_cents,
      CASE WHEN SUM(leads_created)>0 THEN ROUND((SUM(bookings_created)::numeric/SUM(leads_created))*100,2) ELSE 0 END AS lead_to_book,
      CASE WHEN SUM(bookings_created)>0 THEN ROUND((SUM(shows_count)::numeric/SUM(bookings_created))*100,2) ELSE 0 END AS book_to_show,
      CASE WHEN SUM(shows_count)>0 THEN ROUND((SUM(closes_count)::numeric/SUM(shows_count))*100,2) ELSE 0 END AS show_to_close,
      CASE WHEN SUM(leads_created)>0 THEN (SUM(revenue_cents)/SUM(leads_created)) ELSE 0 END AS revenue_per_lead_cents
    FROM public.funnel_metrics_daily
    WHERE metric_date >= CURRENT_DATE - (p_window_days || ' days')::interval
  ) t;

  SELECT jsonb_agg(jsonb_build_object(
    'date', metric_date,'leads', leads_created,'bookings', bookings_created,
    'shows', shows_count,'closes', closes_count,'revenue_cents', revenue_cents
  ) ORDER BY metric_date) INTO v_daily
  FROM (
    SELECT metric_date,
      SUM(leads_created) AS leads_created,
      SUM(bookings_created) AS bookings_created,
      SUM(shows_count) AS shows_count,
      SUM(closes_count) AS closes_count,
      SUM(revenue_cents) AS revenue_cents
    FROM public.funnel_metrics_daily
    WHERE metric_date >= CURRENT_DATE - (p_window_days || ' days')::interval
    GROUP BY metric_date ORDER BY metric_date
  ) s;

  IF v_is_admin OR v_is_director THEN
    SELECT jsonb_agg(to_jsonb(f)) INTO v_findings FROM (
      SELECT * FROM public.insight_findings WHERE resolved_at IS NULL
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, detected_at DESC LIMIT 50
    ) f;
  ELSE
    SELECT jsonb_agg(to_jsonb(f)) INTO v_findings FROM (
      SELECT * FROM public.insight_findings
      WHERE resolved_at IS NULL AND scope='operator' AND scope_id=auth.uid()::text LIMIT 20
    ) f;
  END IF;

  v_payload := jsonb_build_object(
    'window_days', p_window_days,
    'role', CASE WHEN v_is_admin THEN 'admin' WHEN v_is_director THEN 'director' ELSE 'operator' END,
    'top_kpis', COALESCE(v_top,'{}'::jsonb),
    'daily', COALESCE(v_daily,'[]'::jsonb),
    'findings', COALESCE(v_findings,'[]'::jsonb),
    'generated_at', now()
  );

  RETURN v_payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_funnel_metrics_daily(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_funnel_insights() TO authenticated;
GRANT EXECUTE ON FUNCTION public.funnel_intelligence_view(INTEGER, UUID) TO authenticated;