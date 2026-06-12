-- 1. CORE TABLE
CREATE TABLE IF NOT EXISTS public.funnel_events_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  origin_email TEXT NOT NULL,
  origin_display_name TEXT NULL,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT funnel_events_v2_event_type_chk CHECK (event_type IN (
    'lead_created','quiz_completed','call_booked','show_up','offer_made','deal_won','deal_lost'
  )),
  CONSTRAINT funnel_events_v2_revenue_chk CHECK (revenue >= 0),
  CONSTRAINT funnel_events_v2_email_chk CHECK (position('@' in origin_email) > 1)
);

CREATE OR REPLACE FUNCTION public.fn_funnel_events_normalize_email()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.origin_email := lower(trim(NEW.origin_email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_funnel_events_v2_normalize ON public.funnel_events_v2;
CREATE TRIGGER trg_funnel_events_v2_normalize
  BEFORE INSERT OR UPDATE ON public.funnel_events_v2
  FOR EACH ROW EXECUTE FUNCTION public.fn_funnel_events_normalize_email();

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_fev2_timestamp    ON public.funnel_events_v2 ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_fev2_event_type   ON public.funnel_events_v2 (event_type);
CREATE INDEX IF NOT EXISTS idx_fev2_origin_email ON public.funnel_events_v2 (origin_email);
CREATE INDEX IF NOT EXISTS idx_fev2_origin_time  ON public.funnel_events_v2 (origin_email, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_fev2_event_time   ON public.funnel_events_v2 (event_type, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_fev2_lead_event   ON public.funnel_events_v2 (lead_id, event_type);

-- 3. LEAD ORIGIN IMMUTABILITY
CREATE TABLE IF NOT EXISTS public.lead_origins (
  lead_id UUID PRIMARY KEY,
  origin_email TEXT NOT NULL,
  origin_display_name TEXT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lead_origins_email_chk CHECK (position('@' in origin_email) > 1)
);
CREATE INDEX IF NOT EXISTS idx_lead_origins_email ON public.lead_origins (origin_email);

CREATE OR REPLACE FUNCTION public.fn_enforce_lead_origin()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE existing_email TEXT;
BEGIN
  SELECT origin_email INTO existing_email FROM public.lead_origins WHERE lead_id = NEW.lead_id;
  IF existing_email IS NULL THEN
    INSERT INTO public.lead_origins (lead_id, origin_email, origin_display_name, first_seen_at)
    VALUES (NEW.lead_id, NEW.origin_email, NEW.origin_display_name, NEW."timestamp")
    ON CONFLICT (lead_id) DO NOTHING;
  ELSIF existing_email <> NEW.origin_email THEN
    RAISE EXCEPTION 'Origin mismatch for lead %: locked to % but got %',
      NEW.lead_id, existing_email, NEW.origin_email USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_funnel_events_v2_enforce_origin ON public.funnel_events_v2;
CREATE TRIGGER trg_funnel_events_v2_enforce_origin
  BEFORE INSERT ON public.funnel_events_v2
  FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_lead_origin();

-- 4. EQUAL BUDGET CONFIG
CREATE TABLE IF NOT EXISTS public.performance_budget_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_budget_per_origin   NUMERIC(12,2) NOT NULL DEFAULT 0,
  weekly_budget_per_origin  NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_budget_per_origin NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_perf_budget_active
  ON public.performance_budget_config (is_active) WHERE is_active = true;

INSERT INTO public.performance_budget_config (daily_budget_per_origin, weekly_budget_per_origin, monthly_budget_per_origin, is_active)
SELECT 100, 700, 3000, true
WHERE NOT EXISTS (SELECT 1 FROM public.performance_budget_config WHERE is_active = true);

-- 5. VIEW: stage counts
CREATE OR REPLACE VIEW public.v_funnel_stage_counts AS
SELECT
  origin_email,
  MAX(origin_display_name) AS origin_display_name,
  date("timestamp") AS report_date,
  COUNT(DISTINCT lead_id) FILTER (WHERE event_type = 'lead_created')   AS leads,
  COUNT(DISTINCT lead_id) FILTER (WHERE event_type = 'quiz_completed') AS quiz_completed,
  COUNT(DISTINCT lead_id) FILTER (WHERE event_type = 'call_booked')    AS bookings,
  COUNT(DISTINCT lead_id) FILTER (WHERE event_type = 'show_up')        AS shows,
  COUNT(DISTINCT lead_id) FILTER (WHERE event_type = 'offer_made')     AS offers,
  COUNT(DISTINCT lead_id) FILTER (WHERE event_type = 'deal_won')       AS sales,
  COUNT(DISTINCT lead_id) FILTER (WHERE event_type = 'deal_lost')      AS losses
FROM public.funnel_events_v2
GROUP BY origin_email, date("timestamp");

-- 6. VIEW: revenue by origin
CREATE OR REPLACE VIEW public.v_funnel_revenue_by_origin AS
SELECT
  origin_email,
  MAX(origin_display_name) AS origin_display_name,
  date("timestamp") AS report_date,
  COALESCE(SUM(revenue) FILTER (WHERE event_type = 'deal_won'), 0) AS revenue
FROM public.funnel_events_v2
GROUP BY origin_email, date("timestamp");

-- 7. VIEW: combined daily dashboard
CREATE OR REPLACE VIEW public.v_performance_dashboard AS
SELECT
  s.origin_email, s.origin_display_name, s.report_date,
  s.leads, s.quiz_completed, s.bookings, s.shows, s.offers, s.sales, s.losses,
  COALESCE(r.revenue, 0) AS revenue
FROM public.v_funnel_stage_counts s
LEFT JOIN public.v_funnel_revenue_by_origin r
  ON r.origin_email = s.origin_email AND r.report_date = s.report_date;

-- 8. RPC
CREATE OR REPLACE FUNCTION public.get_performance_dashboard(
  start_date DATE,
  end_date   DATE
)
RETURNS TABLE (
  origin_email TEXT, origin_display_name TEXT,
  leads BIGINT, quiz_completed BIGINT, bookings BIGINT, shows BIGINT,
  offers BIGINT, sales BIGINT, losses BIGINT,
  revenue NUMERIC, spend NUMERIC,
  quiz_rate NUMERIC, booking_rate NUMERIC, show_rate NUMERIC, offer_rate NUMERIC,
  closing_rate NUMERIC, offer_to_close_rate NUMERIC, lead_to_sale_rate NUMERIC,
  cpl NUMERIC, cpql NUMERIC, cac NUMERIC, roas NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_days   INT;
  v_daily  NUMERIC := 0;
  v_weekly NUMERIC := 0;
  v_monthly NUMERIC := 0;
  v_spend  NUMERIC := 0;
BEGIN
  IF NOT (public.is_perf_viewer(v_uid) OR public.is_perf_editor(v_uid)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_days := GREATEST(1, (end_date - start_date) + 1);

  SELECT daily_budget_per_origin, weekly_budget_per_origin, monthly_budget_per_origin
    INTO v_daily, v_weekly, v_monthly
  FROM public.performance_budget_config WHERE is_active = true LIMIT 1;

  v_spend := CASE
    WHEN v_days = 1               THEN COALESCE(v_daily,   0)
    WHEN v_days BETWEEN 2 AND 7   THEN COALESCE(v_weekly,  0)
    WHEN v_days BETWEEN 8 AND 30  THEN COALESCE(v_monthly, 0)
    ELSE COALESCE(v_daily, 0) * v_days
  END;

  RETURN QUERY
  WITH agg AS (
    SELECT
      fe.origin_email,
      MAX(fe.origin_display_name) AS origin_display_name,
      COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type = 'lead_created')   AS leads,
      COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type = 'quiz_completed') AS quiz_completed,
      COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type = 'call_booked')    AS bookings,
      COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type = 'show_up')        AS shows,
      COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type = 'offer_made')     AS offers,
      COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type = 'deal_won')       AS sales,
      COUNT(DISTINCT fe.lead_id) FILTER (WHERE fe.event_type = 'deal_lost')      AS losses,
      COALESCE(SUM(fe.revenue) FILTER (WHERE fe.event_type = 'deal_won'), 0)     AS revenue
    FROM public.funnel_events_v2 fe
    WHERE date(fe."timestamp") BETWEEN start_date AND end_date
    GROUP BY fe.origin_email
  )
  SELECT
    a.origin_email, a.origin_display_name,
    a.leads, a.quiz_completed, a.bookings, a.shows, a.offers, a.sales, a.losses,
    a.revenue, v_spend,
    CASE WHEN a.leads    > 0 THEN a.quiz_completed::NUMERIC / a.leads    END,
    CASE WHEN a.leads    > 0 THEN a.bookings::NUMERIC       / a.leads    END,
    CASE WHEN a.bookings > 0 THEN a.shows::NUMERIC          / a.bookings END,
    CASE WHEN a.shows    > 0 THEN a.offers::NUMERIC         / a.shows    END,
    CASE WHEN a.shows    > 0 THEN a.sales::NUMERIC          / a.shows    END,
    CASE WHEN a.offers   > 0 THEN a.sales::NUMERIC          / a.offers   END,
    CASE WHEN a.leads    > 0 THEN a.sales::NUMERIC          / a.leads    END,
    CASE WHEN a.leads          > 0 THEN v_spend / a.leads          END,
    CASE WHEN a.quiz_completed > 0 THEN v_spend / a.quiz_completed END,
    CASE WHEN a.sales          > 0 THEN v_spend / a.sales          END,
    CASE WHEN v_spend          > 0 THEN a.revenue / v_spend        END
  FROM agg a
  ORDER BY a.revenue DESC;
END;
$$;

-- 10. RLS
ALTER TABLE public.funnel_events_v2          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_origins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_budget_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf_viewer_read_funnel_events_v2" ON public.funnel_events_v2;
CREATE POLICY "perf_viewer_read_funnel_events_v2"
  ON public.funnel_events_v2 FOR SELECT TO authenticated
  USING (public.is_perf_viewer(auth.uid()) OR public.is_perf_editor(auth.uid()));

DROP POLICY IF EXISTS "perf_editor_write_funnel_events_v2" ON public.funnel_events_v2;
CREATE POLICY "perf_editor_write_funnel_events_v2"
  ON public.funnel_events_v2 FOR INSERT TO authenticated
  WITH CHECK (public.is_perf_editor(auth.uid()));

DROP POLICY IF EXISTS "perf_viewer_read_lead_origins" ON public.lead_origins;
CREATE POLICY "perf_viewer_read_lead_origins"
  ON public.lead_origins FOR SELECT TO authenticated
  USING (public.is_perf_viewer(auth.uid()) OR public.is_perf_editor(auth.uid()));

DROP POLICY IF EXISTS "perf_editor_write_lead_origins" ON public.lead_origins;
CREATE POLICY "perf_editor_write_lead_origins"
  ON public.lead_origins FOR ALL TO authenticated
  USING (public.is_perf_editor(auth.uid())) WITH CHECK (public.is_perf_editor(auth.uid()));

DROP POLICY IF EXISTS "perf_viewer_read_budget" ON public.performance_budget_config;
CREATE POLICY "perf_viewer_read_budget"
  ON public.performance_budget_config FOR SELECT TO authenticated
  USING (public.is_perf_viewer(auth.uid()) OR public.is_perf_editor(auth.uid()));

DROP POLICY IF EXISTS "perf_editor_write_budget" ON public.performance_budget_config;
CREATE POLICY "perf_editor_write_budget"
  ON public.performance_budget_config FOR ALL TO authenticated
  USING (public.is_perf_editor(auth.uid())) WITH CHECK (public.is_perf_editor(auth.uid()));

GRANT EXECUTE ON FUNCTION public.get_performance_dashboard(DATE, DATE) TO authenticated;