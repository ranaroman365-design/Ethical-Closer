
-- 1. Add lifecycle columns to calls table
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS showed_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS opener_id uuid,
  ADD COLUMN IF NOT EXISTS revenue numeric DEFAULT 0;

-- 2. Unique constraint to prevent duplicate bookings
ALTER TABLE public.calls
  ADD CONSTRAINT calls_lead_scheduled_unique UNIQUE (user_id, scheduled_for);

-- 3. Data integrity logs table
CREATE TABLE IF NOT EXISTS public.data_integrity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  violation_type text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_integrity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read integrity logs"
  ON public.data_integrity_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Validation trigger: enforce call lifecycle ordering
CREATE OR REPLACE FUNCTION public.validate_call_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- showed_at must be >= booked_at
  IF NEW.showed_at IS NOT NULL AND NEW.booked_at IS NULL THEN
    INSERT INTO data_integrity_logs (table_name, record_id, violation_type, details)
    VALUES ('calls', NEW.id, 'showed_without_booked',
      jsonb_build_object('showed_at', NEW.showed_at, 'booked_at', NEW.booked_at));
    NEW.showed_at := NULL;
  END IF;

  IF NEW.showed_at IS NOT NULL AND NEW.booked_at IS NOT NULL AND NEW.showed_at < NEW.booked_at THEN
    INSERT INTO data_integrity_logs (table_name, record_id, violation_type, details)
    VALUES ('calls', NEW.id, 'showed_before_booked',
      jsonb_build_object('showed_at', NEW.showed_at, 'booked_at', NEW.booked_at));
    NEW.showed_at := NULL;
  END IF;

  -- closed_at must be >= showed_at
  IF NEW.closed_at IS NOT NULL AND NEW.showed_at IS NULL THEN
    INSERT INTO data_integrity_logs (table_name, record_id, violation_type, details)
    VALUES ('calls', NEW.id, 'closed_without_showed',
      jsonb_build_object('closed_at', NEW.closed_at, 'showed_at', NEW.showed_at));
    NEW.closed_at := NULL;
  END IF;

  IF NEW.closed_at IS NOT NULL AND NEW.showed_at IS NOT NULL AND NEW.closed_at < NEW.showed_at THEN
    INSERT INTO data_integrity_logs (table_name, record_id, violation_type, details)
    VALUES ('calls', NEW.id, 'closed_before_showed',
      jsonb_build_object('closed_at', NEW.closed_at, 'showed_at', NEW.showed_at));
    NEW.closed_at := NULL;
  END IF;

  -- Sync status field with lifecycle timestamps
  IF NEW.closed_at IS NOT NULL AND NEW.result = 'won' THEN
    NEW.status := 'closed_won';
  ELSIF NEW.closed_at IS NOT NULL THEN
    NEW.status := 'closed_lost';
  ELSIF NEW.no_show_at IS NOT NULL THEN
    NEW.status := 'no_show';
  ELSIF NEW.showed_at IS NOT NULL THEN
    NEW.status := 'showed';
  ELSIF NEW.booked_at IS NOT NULL THEN
    NEW.status := 'booked';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_call_lifecycle
  BEFORE INSERT OR UPDATE ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_call_lifecycle();

-- 5. Replace KPI calculation function to use calls table with strict logic
CREATE OR REPLACE FUNCTION public.auto_update_kpis_on_lead_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_booked int;
  v_showed int;
  v_closed_won int;
  v_closed_total int;
  v_cancelled int;
  v_total_revenue numeric;
  v_show_rate numeric;
  v_close_rate numeric;
  v_storno_rate numeric;
BEGIN
  v_user_id := COALESCE(NEW.closer_id, NEW.setter_id, NEW.owner_id);
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  -- Count from calls table (single source of truth)
  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    count(*) FILTER (WHERE closed_at IS NOT NULL),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_closed_won, v_closed_total, v_total_revenue
  FROM calls
  WHERE user_id = v_user_id;

  -- Cancelled leads count (from leads table)
  SELECT count(*) INTO v_cancelled
  FROM leads
  WHERE (closer_id = v_user_id OR setter_id = v_user_id OR owner_id = v_user_id)
    AND stage = 'cancelled';

  -- Calculate rates with strict logic and 100% cap
  v_show_rate := CASE WHEN v_booked > 0
    THEN LEAST(ROUND((v_showed::numeric / v_booked) * 100, 1), 100)
    ELSE 0 END;

  v_close_rate := CASE WHEN v_showed > 0
    THEN LEAST(ROUND((v_closed_won::numeric / v_showed) * 100, 1), 100)
    ELSE 0 END;

  v_storno_rate := CASE WHEN v_closed_won > 0
    THEN LEAST(ROUND((v_cancelled::numeric / v_closed_won) * 100, 1), 100)
    ELSE 0 END;

  -- Upsert KPIs
  INSERT INTO member_kpis (user_id, closing_rate, show_rate, storno_rate, calls_handled, revenue_closed, updated_at)
  VALUES (
    v_user_id,
    v_close_rate,
    v_show_rate,
    v_storno_rate,
    v_booked,
    v_total_revenue,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    closing_rate = EXCLUDED.closing_rate,
    show_rate = EXCLUDED.show_rate,
    storno_rate = EXCLUDED.storno_rate,
    calls_handled = EXCLUDED.calls_handled,
    revenue_closed = EXCLUDED.revenue_closed,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- 6. Also trigger KPI recalc when calls table changes
CREATE OR REPLACE FUNCTION public.recalc_kpis_from_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_booked int;
  v_showed int;
  v_closed_won int;
  v_closed_total int;
  v_total_revenue numeric;
  v_show_rate numeric;
  v_close_rate numeric;
BEGIN
  v_user_id := NEW.user_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT
    count(*) FILTER (WHERE booked_at IS NOT NULL),
    count(*) FILTER (WHERE showed_at IS NOT NULL),
    count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
    count(*) FILTER (WHERE closed_at IS NOT NULL),
    COALESCE(SUM(CASE WHEN closed_at IS NOT NULL AND result = 'won' THEN COALESCE(revenue, deal_size, 0) ELSE 0 END), 0)
  INTO v_booked, v_showed, v_closed_won, v_closed_total, v_total_revenue
  FROM calls
  WHERE user_id = v_user_id;

  v_show_rate := CASE WHEN v_booked > 0
    THEN LEAST(ROUND((v_showed::numeric / v_booked) * 100, 1), 100)
    ELSE 0 END;

  v_close_rate := CASE WHEN v_showed > 0
    THEN LEAST(ROUND((v_closed_won::numeric / v_showed) * 100, 1), 100)
    ELSE 0 END;

  INSERT INTO member_kpis (user_id, closing_rate, show_rate, calls_handled, revenue_closed, updated_at)
  VALUES (v_user_id, v_close_rate, v_show_rate, v_booked, v_total_revenue, now())
  ON CONFLICT (user_id) DO UPDATE SET
    closing_rate = EXCLUDED.closing_rate,
    show_rate = EXCLUDED.show_rate,
    calls_handled = EXCLUDED.calls_handled,
    revenue_closed = EXCLUDED.revenue_closed,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalc_kpis_from_call
  AFTER INSERT OR UPDATE ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.recalc_kpis_from_call();
