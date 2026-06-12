
-- 1. Add pipeline_id to calls
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS pipeline_id uuid;

-- 2. Commissions table
CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('opener', 'setter', 'closer')),
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own commissions"
  ON public.commissions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all commissions"
  ON public.commissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Users KPI snapshot (cached performance for routing)
CREATE TABLE IF NOT EXISTS public.users_kpi_snapshot (
  user_id uuid PRIMARY KEY,
  show_rate numeric NOT NULL DEFAULT 0,
  close_rate numeric NOT NULL DEFAULT 0,
  earnings_per_call numeric NOT NULL DEFAULT 0,
  performance_score numeric NOT NULL DEFAULT 0,
  total_calls int NOT NULL DEFAULT 0,
  total_revenue numeric NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users_kpi_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own kpi snapshot"
  ON public.users_kpi_snapshot FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all kpi snapshots"
  ON public.users_kpi_snapshot FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. DB function: recalculate KPI snapshot for a user from calls table
CREATE OR REPLACE FUNCTION public.recalc_user_kpi_snapshot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booked int;
  v_showed int;
  v_won int;
  v_revenue numeric;
  v_show_rate numeric;
  v_close_rate numeric;
  v_epc numeric;
  v_team_avg_epc numeric;
  v_score numeric;
BEGIN
  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_won, v_revenue
  FROM calls
  WHERE user_id = p_user_id;

  v_show_rate := CASE WHEN v_booked > 0 THEN LEAST(ROUND((v_showed::numeric / v_booked) * 100, 1), 100) ELSE 0 END;
  v_close_rate := CASE WHEN v_showed > 0 THEN LEAST(ROUND((v_won::numeric / v_showed) * 100, 1), 100) ELSE 0 END;
  v_epc := CASE WHEN v_showed > 0 THEN ROUND(v_revenue / v_showed, 2) ELSE 0 END;

  -- Team average EPC for normalization
  SELECT COALESCE(AVG(CASE WHEN s.earnings_per_call > 0 THEN s.earnings_per_call END), 1)
  INTO v_team_avg_epc
  FROM users_kpi_snapshot s;

  -- Performance score: weighted composite
  v_score := ROUND(
    (v_show_rate * 0.3) +
    (v_close_rate * 0.4) +
    (LEAST(v_epc / GREATEST(v_team_avg_epc, 1) * 100, 100) * 0.3)
  , 1);

  INSERT INTO users_kpi_snapshot (user_id, show_rate, close_rate, earnings_per_call, performance_score, total_calls, total_revenue, last_updated)
  VALUES (p_user_id, v_show_rate, v_close_rate, v_epc, v_score, v_booked, v_revenue, now())
  ON CONFLICT (user_id) DO UPDATE SET
    show_rate = EXCLUDED.show_rate,
    close_rate = EXCLUDED.close_rate,
    earnings_per_call = EXCLUDED.earnings_per_call,
    performance_score = EXCLUDED.performance_score,
    total_calls = EXCLUDED.total_calls,
    total_revenue = EXCLUDED.total_revenue,
    last_updated = now();

  -- Also sync to member_kpis
  INSERT INTO member_kpis (user_id, closing_rate, show_rate, revenue_closed, calls_handled, earnings_per_call, updated_at)
  VALUES (p_user_id, v_close_rate, v_show_rate, v_revenue, v_booked, v_epc, now())
  ON CONFLICT (user_id) DO UPDATE SET
    closing_rate = EXCLUDED.closing_rate,
    show_rate = EXCLUDED.show_rate,
    revenue_closed = EXCLUDED.revenue_closed,
    calls_handled = EXCLUDED.calls_handled,
    earnings_per_call = EXCLUDED.earnings_per_call,
    updated_at = now();
END;
$$;

-- 5. DB function: distribute commissions for a won call
CREATE OR REPLACE FUNCTION public.distribute_commissions(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_call record;
  v_stage text;
  v_rate numeric;
BEGIN
  SELECT * INTO v_call FROM calls WHERE id = p_call_id;
  IF NOT FOUND OR v_call.result != 'won' OR v_call.closed_at IS NULL THEN
    RETURN;
  END IF;

  -- Skip if commissions already exist
  IF EXISTS (SELECT 1 FROM commissions WHERE call_id = p_call_id) THEN
    RETURN;
  END IF;

  -- Opener commission (1%)
  IF v_call.opener_id IS NOT NULL THEN
    INSERT INTO commissions (call_id, user_id, role, amount)
    VALUES (p_call_id, v_call.opener_id, 'opener', ROUND(COALESCE(v_call.revenue, 0) * 0.01, 2));
  END IF;

  -- Setter commission (3-5% based on stage)
  IF v_call.setter_id IS NOT NULL THEN
    SELECT business_stage INTO v_stage FROM profiles WHERE id = v_call.setter_id;
    v_rate := CASE
      WHEN v_stage IN ('senior_associate', 'senior_setter') THEN 0.05
      ELSE 0.03
    END;
    INSERT INTO commissions (call_id, user_id, role, amount)
    VALUES (p_call_id, v_call.setter_id, 'setter', ROUND(COALESCE(v_call.revenue, 0) * v_rate, 2));
  END IF;

  -- Closer commission (8-12% based on stage)
  IF v_call.user_id IS NOT NULL THEN
    SELECT business_stage INTO v_stage FROM profiles WHERE id = v_call.user_id;
    v_rate := CASE
      WHEN v_stage = 'senior_manager' THEN 0.12
      WHEN v_stage = 'manager' THEN 0.10
      ELSE 0.08
    END;
    INSERT INTO commissions (call_id, user_id, role, amount)
    VALUES (p_call_id, v_call.user_id, 'closer', ROUND(COALESCE(v_call.revenue, 0) * v_rate, 2));
  END IF;

  -- Update commission_earned in member_kpis for all involved
  UPDATE member_kpis SET
    commission_earned = COALESCE((SELECT SUM(amount) FROM commissions WHERE user_id = member_kpis.user_id), 0),
    updated_at = now()
  WHERE user_id IN (v_call.opener_id, v_call.setter_id, v_call.user_id);
END;
$$;

-- 6. Performance-based lead routing function
CREATE OR REPLACE FUNCTION public.route_lead_to_best_closer(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_closer_id uuid;
BEGIN
  -- Select best available closer by performance_score, with capacity check
  SELECT p.id INTO v_closer_id
  FROM profiles p
  JOIN users_kpi_snapshot s ON s.user_id = p.id
  WHERE p.business_stage IN ('junior_manager', 'manager', 'senior_manager')
    AND p.placement_ready = true
    AND (
      SELECT count(*) FROM leads l
      WHERE l.closer_id = p.id
        AND l.stage NOT IN ('closed_won', 'closed_lost', 'cancelled', 'recycled', 'returned_to_pool')
    ) < 15  -- capacity limit
  ORDER BY s.performance_score DESC
  LIMIT 1;

  IF v_closer_id IS NOT NULL THEN
    UPDATE leads SET closer_id = v_closer_id, stage = 'assigned_closer', updated_at = now()
    WHERE id = p_lead_id;

    INSERT INTO lead_transitions (lead_id, previous_stage, new_stage, changed_by, reason)
    VALUES (p_lead_id, 'ready_for_closer', 'assigned_closer', v_closer_id, 'performance_routing – score-based assignment');

    INSERT INTO audit_logs (action, source_type, note, before_state, after_state)
    VALUES ('performance_route', 'system',
      format('Lead %s routed to closer %s by performance score', p_lead_id, v_closer_id),
      jsonb_build_object('lead_id', p_lead_id),
      jsonb_build_object('closer_id', v_closer_id));
  END IF;

  RETURN v_closer_id;
END;
$$;
