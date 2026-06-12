-- Layer 32 — Message Performance System (Phase 1)

-- 1. SETTINGS
CREATE TABLE IF NOT EXISTS public.message_performance_settings (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_promote_enabled BOOLEAN NOT NULL DEFAULT false,
  significance_p_value NUMERIC(4,3) NOT NULL DEFAULT 0.050,
  min_sample_size INT NOT NULL DEFAULT 100,
  attribution_window_hours INT NOT NULL DEFAULT 72,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_performance_settings_singleton CHECK (id = 1)
);
INSERT INTO public.message_performance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.message_performance_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access on perf settings" ON public.message_performance_settings FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

-- 2. PERFORMANCE EVENTS
CREATE TABLE IF NOT EXISTS public.message_performance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'A',
  message_send_id UUID,
  lead_id UUID,
  funnel_id TEXT,
  operator_id UUID,
  channel TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent','delivered','opened','clicked','replied','converted','bounced','failed','suppressed')),
  revenue_amount NUMERIC(12,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mpe_template_variant ON public.message_performance_events(template_key, variant_key);
CREATE INDEX IF NOT EXISTS idx_mpe_lead ON public.message_performance_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpe_occurred ON public.message_performance_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpe_event_type ON public.message_performance_events(event_type);
CREATE INDEX IF NOT EXISTS idx_mpe_funnel ON public.message_performance_events(funnel_id) WHERE funnel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpe_operator ON public.message_performance_events(operator_id) WHERE operator_id IS NOT NULL;
ALTER TABLE public.message_performance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read perf events" ON public.message_performance_events FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin') OR public.has_role(auth.uid(),'analyst_readonly'));

-- 3. AGGREGATED STATS
CREATE TABLE IF NOT EXISTS public.message_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'A',
  funnel_id TEXT,
  sent_count INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  opened_count INT NOT NULL DEFAULT 0,
  clicked_count INT NOT NULL DEFAULT 0,
  replied_count INT NOT NULL DEFAULT 0,
  converted_count INT NOT NULL DEFAULT 0,
  revenue_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  delivery_rate NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN sent_count>0 THEN delivered_count::numeric/sent_count ELSE 0 END) STORED,
  open_rate NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN delivered_count>0 THEN opened_count::numeric/delivered_count ELSE 0 END) STORED,
  click_rate NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN opened_count>0 THEN clicked_count::numeric/opened_count ELSE 0 END) STORED,
  reply_rate NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN delivered_count>0 THEN replied_count::numeric/delivered_count ELSE 0 END) STORED,
  conversion_rate NUMERIC(5,4) GENERATED ALWAYS AS (CASE WHEN sent_count>0 THEN converted_count::numeric/sent_count ELSE 0 END) STORED,
  revenue_per_message NUMERIC(12,4) GENERATED ALWAYS AS (CASE WHEN sent_count>0 THEN revenue_total/sent_count ELSE 0 END) STORED,
  last_recomputed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_key, variant_key, funnel_id)
);
CREATE INDEX IF NOT EXISTS idx_mstats_template ON public.message_stats(template_key);
CREATE INDEX IF NOT EXISTS idx_mstats_conv_rate ON public.message_stats(conversion_rate DESC);
CREATE INDEX IF NOT EXISTS idx_mstats_rev ON public.message_stats(revenue_per_message DESC);
ALTER TABLE public.message_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read stats" ON public.message_stats FOR SELECT
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin') OR public.has_role(auth.uid(),'analyst_readonly'));

-- 4. AB DECISIONS
CREATE TABLE IF NOT EXISTS public.message_ab_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  winner_variant TEXT NOT NULL,
  loser_variants TEXT[] NOT NULL DEFAULT '{}',
  decision_type TEXT NOT NULL CHECK (decision_type IN ('auto','manual','reset')),
  p_value NUMERIC(6,5),
  sample_size INT,
  conversion_lift NUMERIC(6,4),
  decided_by UUID,
  reason TEXT,
  applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_abd_template ON public.message_ab_decisions(template_key, created_at DESC);
ALTER TABLE public.message_ab_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin full access ab decisions" ON public.message_ab_decisions FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));

-- 5. record_message_event
CREATE OR REPLACE FUNCTION public.record_message_event(
  p_template_key TEXT, p_variant_key TEXT, p_event_type TEXT,
  p_message_send_id UUID DEFAULT NULL, p_lead_id UUID DEFAULT NULL,
  p_funnel_id TEXT DEFAULT NULL, p_operator_id UUID DEFAULT NULL,
  p_channel TEXT DEFAULT NULL, p_revenue NUMERIC DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_enabled BOOLEAN;
BEGIN
  SELECT enabled INTO v_enabled FROM message_performance_settings WHERE id = 1;
  IF NOT COALESCE(v_enabled,false) THEN RETURN NULL; END IF;
  INSERT INTO message_performance_events (template_key, variant_key, event_type, message_send_id, lead_id, funnel_id, operator_id, channel, revenue_amount, metadata)
  VALUES (p_template_key, COALESCE(p_variant_key,'A'), p_event_type, p_message_send_id, p_lead_id, p_funnel_id, p_operator_id, p_channel, COALESCE(p_revenue,0), COALESCE(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 6. attribute_conversion_to_message
CREATE OR REPLACE FUNCTION public.attribute_conversion_to_message(
  p_lead_id UUID, p_revenue NUMERIC DEFAULT 0, p_funnel_id TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_window_hours INT; v_last RECORD; v_event_id UUID;
BEGIN
  SELECT attribution_window_hours INTO v_window_hours FROM message_performance_settings WHERE id = 1;
  v_window_hours := COALESCE(v_window_hours,72);
  SELECT template_key, variant_key, funnel_id, operator_id, channel, message_send_id INTO v_last
  FROM message_performance_events
  WHERE lead_id = p_lead_id AND event_type IN ('sent','delivered','opened','clicked')
    AND occurred_at >= now() - (v_window_hours || ' hours')::interval
  ORDER BY occurred_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO message_performance_events (template_key, variant_key, event_type, lead_id, funnel_id, operator_id, channel, revenue_amount, message_send_id, metadata)
  VALUES (v_last.template_key, v_last.variant_key, 'converted', p_lead_id, COALESCE(p_funnel_id,v_last.funnel_id), v_last.operator_id, v_last.channel, COALESCE(p_revenue,0), v_last.message_send_id,
    jsonb_build_object('attribution','last_touch_window','window_hours',v_window_hours))
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END; $$;

-- 7. refresh_message_stats
CREATE OR REPLACE FUNCTION public.refresh_message_stats() RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows INT;
BEGIN
  WITH agg AS (
    SELECT template_key, variant_key, funnel_id,
      COUNT(*) FILTER (WHERE event_type='sent') AS sent_count,
      COUNT(*) FILTER (WHERE event_type='delivered') AS delivered_count,
      COUNT(*) FILTER (WHERE event_type='opened') AS opened_count,
      COUNT(*) FILTER (WHERE event_type='clicked') AS clicked_count,
      COUNT(*) FILTER (WHERE event_type='replied') AS replied_count,
      COUNT(*) FILTER (WHERE event_type='converted') AS converted_count,
      COALESCE(SUM(revenue_amount) FILTER (WHERE event_type='converted'),0) AS revenue_total
    FROM message_performance_events
    GROUP BY template_key, variant_key, funnel_id
  )
  INSERT INTO message_stats (template_key, variant_key, funnel_id, sent_count, delivered_count, opened_count, clicked_count, replied_count, converted_count, revenue_total, last_recomputed_at)
  SELECT template_key, variant_key, funnel_id, sent_count, delivered_count, opened_count, clicked_count, replied_count, converted_count, revenue_total, now() FROM agg
  ON CONFLICT (template_key, variant_key, funnel_id) DO UPDATE SET
    sent_count = EXCLUDED.sent_count, delivered_count = EXCLUDED.delivered_count,
    opened_count = EXCLUDED.opened_count, clicked_count = EXCLUDED.clicked_count,
    replied_count = EXCLUDED.replied_count, converted_count = EXCLUDED.converted_count,
    revenue_total = EXCLUDED.revenue_total, last_recomputed_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END; $$;

-- 8. evaluate_ab_significance (z-test for proportions)
CREATE OR REPLACE FUNCTION public.evaluate_ab_significance(p_template_key TEXT)
RETURNS TABLE (template_key TEXT, winner_variant TEXT, loser_variant TEXT, winner_rate NUMERIC, loser_rate NUMERIC, lift NUMERIC, z_score NUMERIC, approx_p_value NUMERIC, total_sample INT, is_significant BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_min_n INT; v_p_thresh NUMERIC; best RECORD; worst RECORD; p_pool NUMERIC; se NUMERIC; z NUMERIC; p_val NUMERIC; total INT := 0; t NUMERIC; cdf NUMERIC;
BEGIN
  SELECT min_sample_size, significance_p_value INTO v_min_n, v_p_thresh FROM message_performance_settings WHERE id = 1;
  SELECT variant_key, SUM(sent_count)::INT AS sent_count, SUM(converted_count)::INT AS converted_count,
    CASE WHEN SUM(sent_count)>0 THEN SUM(converted_count)::numeric/SUM(sent_count) ELSE 0 END AS conv_rate
  INTO best FROM message_stats WHERE message_stats.template_key = p_template_key
  GROUP BY variant_key ORDER BY conv_rate DESC LIMIT 1;
  SELECT variant_key, SUM(sent_count)::INT AS sent_count, SUM(converted_count)::INT AS converted_count,
    CASE WHEN SUM(sent_count)>0 THEN SUM(converted_count)::numeric/SUM(sent_count) ELSE 0 END AS conv_rate
  INTO worst FROM message_stats WHERE message_stats.template_key = p_template_key AND variant_key <> best.variant_key
  GROUP BY variant_key ORDER BY conv_rate ASC LIMIT 1;
  IF best IS NULL OR worst IS NULL THEN RETURN; END IF;
  total := best.sent_count + worst.sent_count;
  IF total = 0 THEN RETURN; END IF;
  p_pool := (best.converted_count + worst.converted_count)::numeric / total;
  IF p_pool = 0 OR p_pool = 1 THEN se := 0;
  ELSE se := sqrt(p_pool*(1-p_pool)*(1.0/best.sent_count + 1.0/worst.sent_count)); END IF;
  IF se = 0 THEN z := 0; p_val := 1;
  ELSE
    z := (best.conv_rate - worst.conv_rate)/se;
    -- Abramowitz & Stegun normal CDF approx
    t := 1.0/(1.0 + 0.2316419*abs(z));
    cdf := 1 - (exp(-0.5*z*z)/sqrt(2*pi())) * (0.319381530*t - 0.356563782*power(t,2) + 1.781477937*power(t,3) - 1.821255978*power(t,4) + 1.330274429*power(t,5));
    p_val := 2*(1-cdf);
    IF p_val < 0 THEN p_val := 0; END IF;
    IF p_val > 1 THEN p_val := 1; END IF;
  END IF;
  template_key := p_template_key;
  winner_variant := best.variant_key;
  loser_variant := worst.variant_key;
  winner_rate := best.conv_rate;
  loser_rate := worst.conv_rate;
  lift := CASE WHEN worst.conv_rate>0 THEN (best.conv_rate-worst.conv_rate)/worst.conv_rate ELSE NULL END;
  z_score := z;
  approx_p_value := p_val;
  total_sample := total;
  is_significant := (total >= COALESCE(v_min_n,100) AND p_val <= COALESCE(v_p_thresh,0.05) AND best.conv_rate > worst.conv_rate);
  RETURN NEXT;
END; $$;

-- 9. apply_ab_winner
CREATE OR REPLACE FUNCTION public.apply_ab_winner(
  p_template_key TEXT, p_winner_variant TEXT, p_decision_type TEXT DEFAULT 'manual', p_reason TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_decision_id UUID; v_losers TEXT[]; v_eval RECORD;
BEGIN
  IF p_decision_type = 'manual' THEN
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin')) THEN
      RAISE EXCEPTION 'Only admins can manually apply A/B winners';
    END IF;
  END IF;
  SELECT array_agg(DISTINCT variant_key) INTO v_losers FROM message_library
    WHERE template_key = p_template_key AND variant_key <> p_winner_variant;
  SELECT * INTO v_eval FROM evaluate_ab_significance(p_template_key) LIMIT 1;
  UPDATE message_library SET variant_weight = CASE WHEN variant_key = p_winner_variant THEN 100 ELSE 0 END, updated_at = now()
    WHERE template_key = p_template_key;
  INSERT INTO message_ab_decisions (template_key, winner_variant, loser_variants, decision_type, p_value, sample_size, conversion_lift, decided_by, reason, applied)
  VALUES (p_template_key, p_winner_variant, COALESCE(v_losers,'{}'), p_decision_type, v_eval.approx_p_value, v_eval.total_sample, v_eval.lift, auth.uid(), p_reason, true)
  RETURNING id INTO v_decision_id;
  RETURN v_decision_id;
END; $$;

-- 10. updated_at trigger
DROP TRIGGER IF EXISTS update_perf_settings_updated_at ON public.message_performance_settings;
CREATE TRIGGER update_perf_settings_updated_at BEFORE UPDATE ON public.message_performance_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();