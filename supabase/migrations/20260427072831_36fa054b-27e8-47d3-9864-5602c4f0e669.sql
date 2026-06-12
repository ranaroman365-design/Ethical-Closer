
-- =============================================================
-- A/B Funnel Test Infrastructure (sequential, winner-promotion)
-- =============================================================

-- 1) Test registry
CREATE TABLE IF NOT EXISTS public.ab_funnel_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_key text NOT NULL UNIQUE,
  test_number int NOT NULL,
  champion_funnel public.funnel_source_t NOT NULL,
  challenger_funnel public.funnel_source_t NOT NULL,
  primary_kpi text NOT NULL DEFAULT 'revenue_per_lead',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','aborted')),
  winner public.funnel_source_t NULL,
  min_sample_size int NOT NULL DEFAULT 400,
  min_duration_days int NOT NULL DEFAULT 14,
  significance_threshold numeric NOT NULL DEFAULT 0.95,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  promoted_at timestamptz NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CHECK (champion_funnel <> challenger_funnel)
);

-- Only one running test at a time
CREATE UNIQUE INDEX IF NOT EXISTS ab_funnel_tests_one_running
  ON public.ab_funnel_tests ((1)) WHERE status = 'running';

-- 2) Sticky bucket assignments
CREATE TABLE IF NOT EXISTS public.ab_funnel_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.ab_funnel_tests(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('champion','challenger')),
  assigned_funnel public.funnel_source_t NOT NULL,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, session_id)
);

CREATE INDEX IF NOT EXISTS ab_funnel_assignments_lead ON public.ab_funnel_assignments(lead_id);
CREATE INDEX IF NOT EXISTS ab_funnel_assignments_test ON public.ab_funnel_assignments(test_id, bucket);

-- 3) RLS
ALTER TABLE public.ab_funnel_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_funnel_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ab_tests_admin_all ON public.ab_funnel_tests;
CREATE POLICY ab_tests_admin_all ON public.ab_funnel_tests
  FOR ALL USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
  );

DROP POLICY IF EXISTS ab_tests_authenticated_read ON public.ab_funnel_tests;
CREATE POLICY ab_tests_authenticated_read ON public.ab_funnel_tests
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS ab_assign_admin_all ON public.ab_funnel_assignments;
CREATE POLICY ab_assign_admin_all ON public.ab_funnel_assignments
  FOR ALL USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')
  );

DROP POLICY IF EXISTS ab_assign_anon_insert ON public.ab_funnel_assignments;
CREATE POLICY ab_assign_anon_insert ON public.ab_funnel_assignments
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS ab_assign_authenticated_read ON public.ab_funnel_assignments;
CREATE POLICY ab_assign_authenticated_read ON public.ab_funnel_assignments
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 4) Active test helper
CREATE OR REPLACE FUNCTION public.ab_active_test()
RETURNS public.ab_funnel_tests
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.ab_funnel_tests WHERE status='running' LIMIT 1;
$$;

-- 5) Deterministic 50/50 splitter
-- session_id stays sticky; first hit decides bucket; immutable after.
CREATE OR REPLACE FUNCTION public.ab_assign_funnel(
  p_session_id text,
  p_page_funnel public.funnel_source_t
) RETURNS public.funnel_source_t
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_test public.ab_funnel_tests%ROWTYPE;
  v_existing public.ab_funnel_assignments%ROWTYPE;
  v_bucket text;
  v_funnel public.funnel_source_t;
  v_hash bigint;
BEGIN
  -- No active test → page funnel wins (immutable behaviour preserved)
  SELECT * INTO v_test FROM public.ab_funnel_tests WHERE status='running' LIMIT 1;
  IF NOT FOUND THEN
    RETURN p_page_funnel;
  END IF;

  -- Page must be one of the two arms; otherwise pass-through
  IF p_page_funnel <> v_test.champion_funnel AND p_page_funnel <> v_test.challenger_funnel THEN
    RETURN p_page_funnel;
  END IF;

  -- Sticky lookup
  SELECT * INTO v_existing
  FROM public.ab_funnel_assignments
  WHERE test_id = v_test.id AND session_id = p_session_id;
  IF FOUND THEN
    RETURN v_existing.assigned_funnel;
  END IF;

  -- Deterministic 50/50 (SHA-256 → low byte parity)
  v_hash := ('x' || substr(encode(digest(v_test.test_key || ':' || p_session_id, 'sha256'), 'hex'), 1, 8))::bit(32)::bigint;
  IF (v_hash % 2) = 0 THEN
    v_bucket := 'champion'; v_funnel := v_test.champion_funnel;
  ELSE
    v_bucket := 'challenger'; v_funnel := v_test.challenger_funnel;
  END IF;

  INSERT INTO public.ab_funnel_assignments(test_id, session_id, bucket, assigned_funnel)
  VALUES (v_test.id, p_session_id, v_bucket, v_funnel)
  ON CONFLICT (test_id, session_id) DO NOTHING;

  RETURN v_funnel;
END $$;

GRANT EXECUTE ON FUNCTION public.ab_assign_funnel(text, public.funnel_source_t) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ab_active_test() TO authenticated;

-- 6) Link assignment to lead (called once lead row exists)
CREATE OR REPLACE FUNCTION public.ab_link_assignment(
  p_session_id text,
  p_lead_id uuid
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.ab_funnel_assignments a
     SET lead_id = p_lead_id
   FROM public.ab_funnel_tests t
   WHERE a.test_id = t.id
     AND t.status = 'running'
     AND a.session_id = p_session_id
     AND a.lead_id IS NULL;
$$;
GRANT EXECUTE ON FUNCTION public.ab_link_assignment(text, uuid) TO anon, authenticated;

-- 7) KPI view per test × bucket
CREATE OR REPLACE VIEW public.ab_test_kpis
WITH (security_invoker = true) AS
SELECT
  t.id                                                    AS test_id,
  t.test_key,
  t.test_number,
  a.bucket,
  a.assigned_funnel                                       AS funnel_source,
  COUNT(DISTINCT l.id)                                    AS leads,
  COUNT(DISTINCT ap.id)                                   AS bookings,
  COUNT(DISTINCT ap.id) FILTER (WHERE ap.attendance_flag) AS shows,
  COUNT(DISTINCT l.id) FILTER (
    WHERE l.outcome = 'closed_won'
       OR EXISTS (SELECT 1 FROM public.appointments x
                  WHERE x.lead_id = l.id AND x.payment_status='paid')
  )                                                       AS deals,
  COALESCE(SUM(ap.fastlane_amount_cents)
           FILTER (WHERE ap.payment_status='paid'),0)/100.0 AS revenue,
  ROUND(COUNT(DISTINCT ap.id)::numeric
        / NULLIF(COUNT(DISTINCT l.id),0), 4)              AS booking_rate,
  ROUND(COUNT(DISTINCT ap.id) FILTER (WHERE ap.attendance_flag)::numeric
        / NULLIF(COUNT(DISTINCT ap.id),0), 4)             AS show_rate,
  ROUND(COUNT(DISTINCT l.id) FILTER (
    WHERE l.outcome='closed_won'
       OR EXISTS (SELECT 1 FROM public.appointments x
                  WHERE x.lead_id = l.id AND x.payment_status='paid'))::numeric
        / NULLIF(COUNT(DISTINCT ap.id) FILTER (WHERE ap.attendance_flag),0), 4) AS close_rate,
  ROUND((COALESCE(SUM(ap.fastlane_amount_cents)
                  FILTER (WHERE ap.payment_status='paid'),0)/100.0)
        / NULLIF(COUNT(DISTINCT l.id),0), 2)              AS revenue_per_lead
FROM public.ab_funnel_tests t
JOIN public.ab_funnel_assignments a ON a.test_id = t.id
LEFT JOIN public.leads l            ON l.id = a.lead_id
LEFT JOIN public.appointments ap    ON ap.lead_id = l.id
GROUP BY t.id, t.test_key, t.test_number, a.bucket, a.assigned_funnel;

-- 8) Significance / decision view
CREATE OR REPLACE VIEW public.ab_test_significance
WITH (security_invoker = true) AS
WITH agg AS (
  SELECT
    t.id AS test_id, t.test_key, t.status, t.min_sample_size, t.min_duration_days,
    t.started_at,
    MAX(CASE WHEN k.bucket='champion'  THEN k.leads END)            AS leads_a,
    MAX(CASE WHEN k.bucket='challenger' THEN k.leads END)           AS leads_b,
    MAX(CASE WHEN k.bucket='champion'  THEN k.revenue_per_lead END) AS rpl_a,
    MAX(CASE WHEN k.bucket='challenger' THEN k.revenue_per_lead END) AS rpl_b,
    MAX(CASE WHEN k.bucket='champion'  THEN k.close_rate END)       AS close_a,
    MAX(CASE WHEN k.bucket='challenger' THEN k.close_rate END)      AS close_b
  FROM public.ab_funnel_tests t
  LEFT JOIN public.ab_test_kpis k ON k.test_id = t.id
  GROUP BY t.id, t.test_key, t.status, t.min_sample_size, t.min_duration_days, t.started_at
)
SELECT
  test_id, test_key, status,
  COALESCE(leads_a,0) AS leads_a,
  COALESCE(leads_b,0) AS leads_b,
  rpl_a, rpl_b,
  ROUND( ((COALESCE(rpl_b,0) - COALESCE(rpl_a,0)) / NULLIF(rpl_a,0)) * 100, 1) AS rpl_lift_pct,
  close_a, close_b,
  EXTRACT(EPOCH FROM (now() - started_at))/86400.0 AS days_running,
  CASE
    WHEN status <> 'running' THEN status
    WHEN COALESCE(leads_a,0) + COALESCE(leads_b,0) < min_sample_size THEN 'COLLECTING'
    WHEN started_at IS NOT NULL AND now() - started_at < (min_duration_days || ' days')::interval THEN 'COLLECTING'
    WHEN COALESCE(rpl_b,0) > COALESCE(rpl_a,0) THEN 'READY_TO_CALL_CHALLENGER'
    WHEN COALESCE(rpl_a,0) > COALESCE(rpl_b,0) THEN 'READY_TO_CALL_CHAMPION'
    ELSE 'TIE'
  END AS decision_state
FROM agg;

-- 9) Winner promotion: only one active → next eligible to start
CREATE OR REPLACE FUNCTION public.ab_promote_winner(
  p_test_key text,
  p_winner public.funnel_source_t
) RETURNS public.ab_funnel_tests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_test public.ab_funnel_tests%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Only admin/owner may promote winners';
  END IF;

  SELECT * INTO v_test FROM public.ab_funnel_tests WHERE test_key = p_test_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Test not found: %', p_test_key; END IF;
  IF v_test.status <> 'running' THEN RAISE EXCEPTION 'Test % not running (status=%)', p_test_key, v_test.status; END IF;
  IF p_winner <> v_test.champion_funnel AND p_winner <> v_test.challenger_funnel THEN
    RAISE EXCEPTION 'Winner % not part of test arms', p_winner;
  END IF;

  UPDATE public.ab_funnel_tests
     SET status='completed', winner=p_winner,
         completed_at=now(), promoted_at=now()
   WHERE id=v_test.id
   RETURNING * INTO v_test;

  -- Promote the winner as champion of the next pending test (sequential)
  UPDATE public.ab_funnel_tests
     SET champion_funnel = p_winner
   WHERE status='pending'
     AND test_number = v_test.test_number + 1;

  RETURN v_test;
END $$;
GRANT EXECUTE ON FUNCTION public.ab_promote_winner(text, public.funnel_source_t) TO authenticated;

-- 10) Start next test (admin only)
CREATE OR REPLACE FUNCTION public.ab_start_test(p_test_key text)
RETURNS public.ab_funnel_tests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_test public.ab_funnel_tests%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner')) THEN
    RAISE EXCEPTION 'Only admin/owner may start tests';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ab_funnel_tests WHERE status='running') THEN
    RAISE EXCEPTION 'Another test is already running — promote winner first';
  END IF;
  UPDATE public.ab_funnel_tests
     SET status='running', started_at=now()
   WHERE test_key=p_test_key AND status='pending'
   RETURNING * INTO v_test;
  IF NOT FOUND THEN RAISE EXCEPTION 'Test % not pending', p_test_key; END IF;
  RETURN v_test;
END $$;
GRANT EXECUTE ON FUNCTION public.ab_start_test(text) TO authenticated;

-- 11) Seed the three planned tests (idempotent)
INSERT INTO public.ab_funnel_tests (test_key, test_number, champion_funnel, challenger_funnel, primary_kpi, notes)
VALUES
  ('test_1_apply_vs_qualify',     1, 'apply_direct',      'qualify_filter',    'close_rate',       'PDF Test 1: Lead → closed_won'),
  ('test_2_winner_vs_highincome', 2, 'apply_direct',      'high_income_angle', 'revenue_per_lead', 'PDF Test 2: Winner of Test 1 vs high_income'),
  ('test_3_winner_vs_webinar',    3, 'apply_direct',      'webinar_entry',     'show_rate_x_close','PDF Test 3: Winner of Test 2 vs webinar')
ON CONFLICT (test_key) DO NOTHING;
