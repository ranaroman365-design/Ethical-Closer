-- Layer 33 — Voice Performance System (Phase 1, retry with renamed call_intent_analysis)

-- 1. SETTINGS
CREATE TABLE IF NOT EXISTS public.call_performance_settings (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_promote_enabled BOOLEAN NOT NULL DEFAULT false,
  ai_analysis_enabled BOOLEAN NOT NULL DEFAULT false,
  significance_p_value NUMERIC(4,3) NOT NULL DEFAULT 0.050,
  min_sample_size INT NOT NULL DEFAULT 100,
  attribution_window_hours INT NOT NULL DEFAULT 168,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT call_performance_settings_singleton CHECK (id = 1)
);
INSERT INTO public.call_performance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.call_performance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access on call perf settings" ON public.call_performance_settings FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

-- 2. CALL PERFORMANCE EVENTS
CREATE TABLE IF NOT EXISTS public.call_performance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL,
  lead_id UUID,
  operator_id UUID,
  funnel_id TEXT,
  source TEXT NOT NULL DEFAULT 'ai_setter' CHECK (source IN ('ai_setter','human','hybrid')),
  script_key TEXT,
  script_variant TEXT DEFAULT 'A',
  event_type TEXT NOT NULL CHECK (event_type IN (
    'dialed','answered','engaged','qualified','booked','showed','closed','no_answer','hangup','voicemail','failed'
  )),
  duration_seconds INT,
  revenue_amount NUMERIC(12,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cpe_call ON public.call_performance_events(call_id);
CREATE INDEX IF NOT EXISTS idx_cpe_script ON public.call_performance_events(script_key, script_variant);
CREATE INDEX IF NOT EXISTS idx_cpe_lead ON public.call_performance_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpe_operator ON public.call_performance_events(operator_id) WHERE operator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpe_event_type ON public.call_performance_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cpe_occurred ON public.call_performance_events(occurred_at DESC);
ALTER TABLE public.call_performance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read call perf events" ON public.call_performance_events FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin') OR public.has_role(auth.uid(),'analyst_readonly'));

-- 3. CALL INTENT ANALYSIS (Layer 33 — separate from existing call_analysis coaching table)
CREATE TABLE IF NOT EXISTS public.call_intent_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL UNIQUE,
  transcript TEXT,
  intent TEXT,
  objection TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive','neutral','negative','mixed')),
  qualification_score INT CHECK (qualification_score BETWEEN 0 AND 100),
  conversion_probability NUMERIC(4,3) CHECK (conversion_probability BETWEEN 0 AND 1),
  drop_off_point TEXT,
  callback_requested BOOLEAN DEFAULT false,
  analysis_source TEXT NOT NULL DEFAULT 'manual' CHECK (analysis_source IN ('manual','ai_lovable','ai_external')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cia_objection ON public.call_intent_analysis(objection) WHERE objection IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cia_sentiment ON public.call_intent_analysis(sentiment) WHERE sentiment IS NOT NULL;
ALTER TABLE public.call_intent_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read call intent" ON public.call_intent_analysis FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin') OR public.has_role(auth.uid(),'analyst_readonly'));

-- 4. SCRIPT VARIANTS REGISTRY
CREATE TABLE IF NOT EXISTS public.call_script_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_key TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'A',
  funnel_id TEXT,
  language TEXT NOT NULL DEFAULT 'de' CHECK (language IN ('de','en')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  variant_weight INT NOT NULL DEFAULT 50 CHECK (variant_weight BETWEEN 0 AND 100),
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (script_key, variant_key, funnel_id, language)
);
CREATE INDEX IF NOT EXISTS idx_csv_script ON public.call_script_variants(script_key);
ALTER TABLE public.call_script_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage script variants" ON public.call_script_variants FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));
CREATE POLICY "all read active scripts" ON public.call_script_variants FOR SELECT
  USING (active = true OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

-- 5. CALL STATS
CREATE TABLE IF NOT EXISTS public.call_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_key TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'A',
  funnel_id TEXT,
  dialed_count INT NOT NULL DEFAULT 0,
  answered_count INT NOT NULL DEFAULT 0,
  engaged_count INT NOT NULL DEFAULT 0,
  qualified_count INT NOT NULL DEFAULT 0,
  booked_count INT NOT NULL DEFAULT 0,
  showed_count INT NOT NULL DEFAULT 0,
  closed_count INT NOT NULL DEFAULT 0,
  hangup_count INT NOT NULL DEFAULT 0,
  no_answer_count INT NOT NULL DEFAULT 0,
  total_duration_seconds BIGINT NOT NULL DEFAULT 0,
  revenue_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  answer_rate NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN dialed_count>0 THEN answered_count::numeric/dialed_count ELSE 0 END) STORED,
  engagement_rate NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN answered_count>0 THEN engaged_count::numeric/answered_count ELSE 0 END) STORED,
  qualification_rate NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN engaged_count>0 THEN qualified_count::numeric/engaged_count ELSE 0 END) STORED,
  booking_rate NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN qualified_count>0 THEN booked_count::numeric/qualified_count ELSE 0 END) STORED,
  show_rate_after_call NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN booked_count>0 THEN showed_count::numeric/booked_count ELSE 0 END) STORED,
  close_rate_after_call NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN showed_count>0 THEN closed_count::numeric/showed_count ELSE 0 END) STORED,
  avg_duration_seconds NUMERIC(8,2) GENERATED ALWAYS AS (CASE WHEN answered_count>0 THEN total_duration_seconds::numeric/answered_count ELSE 0 END) STORED,
  revenue_per_call NUMERIC(12,4) GENERATED ALWAYS AS (CASE WHEN dialed_count>0 THEN revenue_total/dialed_count ELSE 0 END) STORED,
  revenue_per_answered_call NUMERIC(12,4) GENERATED ALWAYS AS (CASE WHEN answered_count>0 THEN revenue_total/answered_count ELSE 0 END) STORED,
  last_recomputed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (script_key, variant_key, funnel_id)
);
CREATE INDEX IF NOT EXISTS idx_cstats_script ON public.call_stats(script_key);
CREATE INDEX IF NOT EXISTS idx_cstats_rpc ON public.call_stats(revenue_per_call DESC);
CREATE INDEX IF NOT EXISTS idx_cstats_book ON public.call_stats(booking_rate DESC);
ALTER TABLE public.call_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read call stats" ON public.call_stats FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin') OR public.has_role(auth.uid(),'analyst_readonly'));

-- 6. OBJECTION STATS
CREATE TABLE IF NOT EXISTS public.call_objection_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_key TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'A',
  objection_type TEXT NOT NULL,
  occurrences INT NOT NULL DEFAULT 0,
  share_pct NUMERIC(5,4) NOT NULL DEFAULT 0,
  last_recomputed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (script_key, variant_key, objection_type)
);
CREATE INDEX IF NOT EXISTS idx_cos_script ON public.call_objection_stats(script_key);
ALTER TABLE public.call_objection_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read objection stats" ON public.call_objection_stats FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin') OR public.has_role(auth.uid(),'analyst_readonly'));

-- 7. AB DECISIONS
CREATE TABLE IF NOT EXISTS public.call_ab_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_key TEXT NOT NULL,
  winner_variant TEXT NOT NULL,
  loser_variants TEXT[] NOT NULL DEFAULT '{}',
  decision_type TEXT NOT NULL CHECK (decision_type IN ('auto','manual','reset')),
  p_value NUMERIC(6,5),
  sample_size INT,
  booking_lift NUMERIC(6,4),
  decided_by UUID,
  reason TEXT,
  applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cabd_script ON public.call_ab_decisions(script_key, created_at DESC);
ALTER TABLE public.call_ab_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage call ab decisions" ON public.call_ab_decisions FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

-- 8. RPC: record_call_event
CREATE OR REPLACE FUNCTION public.record_call_event(
  p_call_id UUID, p_event_type TEXT,
  p_lead_id UUID DEFAULT NULL, p_operator_id UUID DEFAULT NULL,
  p_funnel_id TEXT DEFAULT NULL, p_source TEXT DEFAULT 'ai_setter',
  p_script_key TEXT DEFAULT NULL, p_script_variant TEXT DEFAULT 'A',
  p_duration_seconds INT DEFAULT NULL, p_revenue NUMERIC DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_enabled BOOLEAN;
BEGIN
  SELECT enabled INTO v_enabled FROM call_performance_settings WHERE id = 1;
  IF NOT COALESCE(v_enabled,false) THEN RETURN NULL; END IF;
  INSERT INTO call_performance_events (
    call_id, event_type, lead_id, operator_id, funnel_id, source,
    script_key, script_variant, duration_seconds, revenue_amount, metadata
  ) VALUES (
    p_call_id, p_event_type, p_lead_id, p_operator_id, p_funnel_id, COALESCE(p_source,'ai_setter'),
    p_script_key, COALESCE(p_script_variant,'A'), p_duration_seconds, COALESCE(p_revenue,0), COALESCE(p_metadata,'{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 9. RPC: record_call_intent (upsert, writes to call_intent_analysis)
CREATE OR REPLACE FUNCTION public.record_call_intent(
  p_call_id UUID, p_intent TEXT DEFAULT NULL, p_objection TEXT DEFAULT NULL,
  p_sentiment TEXT DEFAULT NULL, p_qualification_score INT DEFAULT NULL,
  p_conversion_probability NUMERIC DEFAULT NULL, p_transcript TEXT DEFAULT NULL,
  p_drop_off_point TEXT DEFAULT NULL, p_callback_requested BOOLEAN DEFAULT NULL,
  p_analysis_source TEXT DEFAULT 'manual', p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_enabled BOOLEAN;
BEGIN
  SELECT enabled INTO v_enabled FROM call_performance_settings WHERE id = 1;
  IF NOT COALESCE(v_enabled,false) THEN RETURN NULL; END IF;
  INSERT INTO call_intent_analysis (
    call_id, intent, objection, sentiment, qualification_score, conversion_probability,
    transcript, drop_off_point, callback_requested, analysis_source, metadata
  ) VALUES (
    p_call_id, p_intent, p_objection, p_sentiment, p_qualification_score, p_conversion_probability,
    p_transcript, p_drop_off_point, COALESCE(p_callback_requested,false), COALESCE(p_analysis_source,'manual'), COALESCE(p_metadata,'{}'::jsonb)
  )
  ON CONFLICT (call_id) DO UPDATE SET
    intent = COALESCE(EXCLUDED.intent, call_intent_analysis.intent),
    objection = COALESCE(EXCLUDED.objection, call_intent_analysis.objection),
    sentiment = COALESCE(EXCLUDED.sentiment, call_intent_analysis.sentiment),
    qualification_score = COALESCE(EXCLUDED.qualification_score, call_intent_analysis.qualification_score),
    conversion_probability = COALESCE(EXCLUDED.conversion_probability, call_intent_analysis.conversion_probability),
    transcript = COALESCE(EXCLUDED.transcript, call_intent_analysis.transcript),
    drop_off_point = COALESCE(EXCLUDED.drop_off_point, call_intent_analysis.drop_off_point),
    callback_requested = COALESCE(EXCLUDED.callback_requested, call_intent_analysis.callback_requested),
    analysis_source = EXCLUDED.analysis_source,
    metadata = call_intent_analysis.metadata || EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 10. RPC: refresh_call_stats (Funnel + Objection heatmap)
CREATE OR REPLACE FUNCTION public.refresh_call_stats() RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows INT;
BEGIN
  WITH per_call AS (
    SELECT call_id,
      COALESCE(MAX(script_key), 'unknown') AS script_key,
      COALESCE(MAX(script_variant), 'A') AS variant_key,
      MAX(funnel_id) AS funnel_id,
      bool_or(event_type='dialed') AS dialed,
      bool_or(event_type='answered') AS answered,
      bool_or(event_type='engaged') AS engaged,
      bool_or(event_type='qualified') AS qualified,
      bool_or(event_type='booked') AS booked,
      bool_or(event_type='showed') AS showed,
      bool_or(event_type='closed') AS closed,
      bool_or(event_type='hangup') AS hangup,
      bool_or(event_type='no_answer') AS no_answer,
      COALESCE(MAX(duration_seconds),0) AS duration_seconds,
      COALESCE(SUM(revenue_amount) FILTER (WHERE event_type='closed'),0) AS revenue
    FROM call_performance_events GROUP BY call_id
  ), agg AS (
    SELECT script_key, variant_key, funnel_id,
      COUNT(*) FILTER (WHERE dialed) AS dialed_count,
      COUNT(*) FILTER (WHERE answered) AS answered_count,
      COUNT(*) FILTER (WHERE engaged) AS engaged_count,
      COUNT(*) FILTER (WHERE qualified) AS qualified_count,
      COUNT(*) FILTER (WHERE booked) AS booked_count,
      COUNT(*) FILTER (WHERE showed) AS showed_count,
      COUNT(*) FILTER (WHERE closed) AS closed_count,
      COUNT(*) FILTER (WHERE hangup) AS hangup_count,
      COUNT(*) FILTER (WHERE no_answer) AS no_answer_count,
      COALESCE(SUM(duration_seconds),0) AS total_duration_seconds,
      COALESCE(SUM(revenue),0) AS revenue_total
    FROM per_call GROUP BY script_key, variant_key, funnel_id
  )
  INSERT INTO call_stats (
    script_key, variant_key, funnel_id,
    dialed_count, answered_count, engaged_count, qualified_count,
    booked_count, showed_count, closed_count, hangup_count, no_answer_count,
    total_duration_seconds, revenue_total, last_recomputed_at
  )
  SELECT script_key, variant_key, funnel_id,
    dialed_count, answered_count, engaged_count, qualified_count,
    booked_count, showed_count, closed_count, hangup_count, no_answer_count,
    total_duration_seconds, revenue_total, now()
  FROM agg
  ON CONFLICT (script_key, variant_key, funnel_id) DO UPDATE SET
    dialed_count = EXCLUDED.dialed_count, answered_count = EXCLUDED.answered_count,
    engaged_count = EXCLUDED.engaged_count, qualified_count = EXCLUDED.qualified_count,
    booked_count = EXCLUDED.booked_count, showed_count = EXCLUDED.showed_count,
    closed_count = EXCLUDED.closed_count, hangup_count = EXCLUDED.hangup_count,
    no_answer_count = EXCLUDED.no_answer_count,
    total_duration_seconds = EXCLUDED.total_duration_seconds,
    revenue_total = EXCLUDED.revenue_total, last_recomputed_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  WITH joined AS (
    SELECT cpe.script_key, cpe.script_variant AS variant_key, ca.objection
    FROM call_performance_events cpe
    JOIN call_intent_analysis ca ON ca.call_id = cpe.call_id
    WHERE ca.objection IS NOT NULL AND cpe.script_key IS NOT NULL
  ), counts AS (
    SELECT script_key, variant_key, objection AS objection_type, COUNT(*)::INT AS occurrences
    FROM joined GROUP BY script_key, variant_key, objection
  ), totals AS (
    SELECT script_key, variant_key, SUM(occurrences)::INT AS total
    FROM counts GROUP BY script_key, variant_key
  )
  INSERT INTO call_objection_stats (script_key, variant_key, objection_type, occurrences, share_pct, last_recomputed_at)
  SELECT c.script_key, c.variant_key, c.objection_type, c.occurrences,
    CASE WHEN t.total>0 THEN c.occurrences::numeric/t.total ELSE 0 END, now()
  FROM counts c JOIN totals t USING (script_key, variant_key)
  ON CONFLICT (script_key, variant_key, objection_type) DO UPDATE SET
    occurrences = EXCLUDED.occurrences, share_pct = EXCLUDED.share_pct, last_recomputed_at = now();

  RETURN v_rows;
END; $$;

-- 11. RPC: evaluate_call_ab_significance
CREATE OR REPLACE FUNCTION public.evaluate_call_ab_significance(p_script_key TEXT)
RETURNS TABLE (script_key TEXT, winner_variant TEXT, loser_variant TEXT,
  winner_rate NUMERIC, loser_rate NUMERIC, lift NUMERIC,
  z_score NUMERIC, approx_p_value NUMERIC, total_sample INT, is_significant BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_min_n INT; v_p_thresh NUMERIC; best RECORD; worst RECORD;
  p_pool NUMERIC; se NUMERIC; z NUMERIC; p_val NUMERIC; total INT := 0; t NUMERIC; cdf NUMERIC;
BEGIN
  SELECT min_sample_size, significance_p_value INTO v_min_n, v_p_thresh FROM call_performance_settings WHERE id = 1;
  SELECT variant_key, SUM(dialed_count)::INT AS dialed_count, SUM(booked_count)::INT AS booked_count,
    CASE WHEN SUM(dialed_count)>0 THEN SUM(booked_count)::numeric/SUM(dialed_count) ELSE 0 END AS rate
  INTO best FROM call_stats WHERE call_stats.script_key = p_script_key
  GROUP BY variant_key ORDER BY rate DESC LIMIT 1;
  SELECT variant_key, SUM(dialed_count)::INT AS dialed_count, SUM(booked_count)::INT AS booked_count,
    CASE WHEN SUM(dialed_count)>0 THEN SUM(booked_count)::numeric/SUM(dialed_count) ELSE 0 END AS rate
  INTO worst FROM call_stats WHERE call_stats.script_key = p_script_key AND variant_key <> best.variant_key
  GROUP BY variant_key ORDER BY rate ASC LIMIT 1;
  IF best IS NULL OR worst IS NULL THEN RETURN; END IF;
  total := best.dialed_count + worst.dialed_count;
  IF total = 0 THEN RETURN; END IF;
  p_pool := (best.booked_count + worst.booked_count)::numeric / total;
  IF p_pool = 0 OR p_pool = 1 THEN se := 0;
  ELSE se := sqrt(p_pool*(1-p_pool)*(1.0/best.dialed_count + 1.0/worst.dialed_count)); END IF;
  IF se = 0 THEN z := 0; p_val := 1;
  ELSE
    z := (best.rate - worst.rate)/se;
    t := 1.0/(1.0 + 0.2316419*abs(z));
    cdf := 1 - (exp(-0.5*z*z)/sqrt(2*pi())) * (0.319381530*t - 0.356563782*power(t,2) + 1.781477937*power(t,3) - 1.821255978*power(t,4) + 1.330274429*power(t,5));
    p_val := 2*(1-cdf);
    IF p_val < 0 THEN p_val := 0; END IF;
    IF p_val > 1 THEN p_val := 1; END IF;
  END IF;
  script_key := p_script_key;
  winner_variant := best.variant_key;
  loser_variant := worst.variant_key;
  winner_rate := best.rate;
  loser_rate := worst.rate;
  lift := CASE WHEN worst.rate>0 THEN (best.rate-worst.rate)/worst.rate ELSE NULL END;
  z_score := z; approx_p_value := p_val; total_sample := total;
  is_significant := (total >= COALESCE(v_min_n,100) AND p_val <= COALESCE(v_p_thresh,0.05) AND best.rate > worst.rate);
  RETURN NEXT;
END; $$;

-- 12. RPC: apply_call_ab_winner
CREATE OR REPLACE FUNCTION public.apply_call_ab_winner(
  p_script_key TEXT, p_winner_variant TEXT, p_decision_type TEXT DEFAULT 'manual', p_reason TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_decision_id UUID; v_losers TEXT[]; v_eval RECORD;
BEGIN
  IF p_decision_type = 'manual' THEN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin')) THEN
      RAISE EXCEPTION 'Only admins can manually apply call A/B winners';
    END IF;
  END IF;
  SELECT array_agg(DISTINCT variant_key) INTO v_losers FROM call_script_variants
    WHERE script_key = p_script_key AND variant_key <> p_winner_variant;
  SELECT * INTO v_eval FROM evaluate_call_ab_significance(p_script_key) LIMIT 1;
  UPDATE call_script_variants SET variant_weight = CASE WHEN variant_key = p_winner_variant THEN 100 ELSE 0 END, updated_at = now()
    WHERE script_key = p_script_key;
  INSERT INTO call_ab_decisions (script_key, winner_variant, loser_variants, decision_type, p_value, sample_size, booking_lift, decided_by, reason, applied)
  VALUES (p_script_key, p_winner_variant, COALESCE(v_losers,'{}'), p_decision_type, v_eval.approx_p_value, v_eval.total_sample, v_eval.lift, auth.uid(), p_reason, true)
  RETURNING id INTO v_decision_id;
  RETURN v_decision_id;
END; $$;

-- 13. updated_at triggers
DROP TRIGGER IF EXISTS update_call_perf_settings_updated_at ON public.call_performance_settings;
CREATE TRIGGER update_call_perf_settings_updated_at BEFORE UPDATE ON public.call_performance_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_call_intent_analysis_updated_at ON public.call_intent_analysis;
CREATE TRIGGER update_call_intent_analysis_updated_at BEFORE UPDATE ON public.call_intent_analysis
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_call_script_variants_updated_at ON public.call_script_variants;
CREATE TRIGGER update_call_script_variants_updated_at BEFORE UPDATE ON public.call_script_variants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();