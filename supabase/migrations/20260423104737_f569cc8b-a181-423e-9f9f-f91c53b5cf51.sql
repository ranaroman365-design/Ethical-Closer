
-- Layer 25 — Capacity Control & Lead Protection (ADDITIVE)

-- 1) Closer capacity
CREATE TABLE IF NOT EXISTS public.closer_capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_id uuid NOT NULL UNIQUE,
  max_daily_calls integer NOT NULL DEFAULT 5,
  max_weekly_calls integer NOT NULL DEFAULT 25,
  warn_threshold_pct integer NOT NULL DEFAULT 90,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.closer_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Closer reads own capacity"
  ON public.closer_capacity FOR SELECT TO authenticated
  USING (closer_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_admin'));

CREATE POLICY "Admin manages closer capacity"
  ON public.closer_capacity FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_admin'));

-- 2) Setter SLA (additive columns on existing table)
ALTER TABLE public.setter_capacity
  ADD COLUMN IF NOT EXISTS response_sla_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS warn_threshold_pct integer NOT NULL DEFAULT 90;

-- 3) Booking waitlist
CREATE TABLE IF NOT EXISTS public.booking_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  preferred_date date,
  preferred_slot_type text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','offered','converted','expired','cancelled')),
  notified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_waitlist_status ON public.booking_waitlist(status, created_at);
CREATE INDEX IF NOT EXISTS idx_booking_waitlist_lead ON public.booking_waitlist(lead_id);
ALTER TABLE public.booking_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert waitlist (booking flow)"
  ON public.booking_waitlist FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admin manages waitlist"
  ON public.booking_waitlist FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_admin'));

-- 4) Capacity incidents
CREATE TABLE IF NOT EXISTS public.capacity_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('closer','setter','funnel')),
  subject_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('safe','warning','overloaded')),
  metric text NOT NULL,
  metric_value numeric,
  threshold numeric,
  detail text,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_capacity_incidents_open ON public.capacity_incidents(status, created_at DESC);
ALTER TABLE public.capacity_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators read capacity incidents"
  ON public.capacity_incidents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_admin'));

CREATE POLICY "Operators manage capacity incidents"
  ON public.capacity_incidents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_admin'));

-- 5) capacity_status — single source of truth
CREATE OR REPLACE FUNCTION public.capacity_status()
RETURNS TABLE (
  scope text,
  subject_id uuid,
  subject_name text,
  booked integer,
  capacity integer,
  utilization_pct integer,
  backlog integer,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_start timestamptz := date_trunc('day', now());
  today_end   timestamptz := today_start + interval '1 day';
BEGIN
  RETURN QUERY
  SELECT
    'closer'::text,
    cc.closer_id,
    COALESCE(p.full_name, 'Closer'),
    COALESCE(bk.cnt, 0)::int AS booked,
    cc.max_daily_calls AS capacity,
    CASE WHEN cc.max_daily_calls > 0
         THEN LEAST(100, ROUND(COALESCE(bk.cnt,0)::numeric * 100 / cc.max_daily_calls))::int
         ELSE 0 END AS utilization_pct,
    0::int AS backlog,
    CASE
      WHEN cc.max_daily_calls = 0 THEN 'safe'
      WHEN COALESCE(bk.cnt,0) >= cc.max_daily_calls THEN 'overloaded'
      WHEN COALESCE(bk.cnt,0)::numeric * 100 / cc.max_daily_calls >= cc.warn_threshold_pct THEN 'warning'
      ELSE 'safe'
    END
  FROM public.closer_capacity cc
  LEFT JOIN public.profiles p ON p.id = cc.closer_id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt
    FROM public.appointments a
    JOIN public.leads l ON l.id = a.lead_id
    WHERE l.closer_id = cc.closer_id
      AND a.starts_at >= today_start AND a.starts_at < today_end
      AND a.appointment_status NOT IN ('cancelled')
  ) bk ON true
  WHERE cc.is_active

  UNION ALL

  SELECT
    'setter'::text,
    sc.setter_id,
    COALESCE(p.full_name, 'Setter'),
    COALESCE(asg.cnt, 0)::int,
    sc.max_daily_leads,
    CASE WHEN sc.max_daily_leads > 0
         THEN LEAST(100, ROUND(COALESCE(asg.cnt,0)::numeric * 100 / sc.max_daily_leads))::int
         ELSE 0 END,
    COALESCE(bl.cnt, 0)::int,
    CASE
      WHEN sc.max_daily_leads = 0 THEN 'safe'
      WHEN COALESCE(asg.cnt,0) >= sc.max_daily_leads THEN 'overloaded'
      WHEN COALESCE(asg.cnt,0)::numeric * 100 / sc.max_daily_leads >= sc.warn_threshold_pct THEN 'warning'
      ELSE 'safe'
    END
  FROM public.setter_capacity sc
  LEFT JOIN public.profiles p ON p.id = sc.setter_id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt FROM public.leads l
    WHERE l.setter_id = sc.setter_id
      AND l.created_at >= today_start
  ) asg ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt FROM public.leads l
    WHERE l.setter_id = sc.setter_id
      AND l.stage IN ('assigned_setter','setter_attempting','setter_no_response','backlog')
  ) bl ON true
  WHERE sc.is_active;
END;
$$;
GRANT EXECUTE ON FUNCTION public.capacity_status() TO authenticated;

-- 6) try_reserve_slot — atomic, race-safe; enforces hard rule
CREATE OR REPLACE FUNCTION public.try_reserve_slot(p_slot_id uuid)
RETURNS TABLE (success boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_cur int;
BEGIN
  SELECT max_bookings, current_bookings INTO v_max, v_cur
  FROM public.availability_slots
  WHERE id = p_slot_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'slot_not_found'; RETURN;
  END IF;

  IF v_cur >= v_max THEN
    RETURN QUERY SELECT false, 'slot_full'; RETURN;
  END IF;

  UPDATE public.availability_slots
    SET current_bookings = current_bookings + 1, updated_at = now()
    WHERE id = p_slot_id;

  RETURN QUERY SELECT true, 'reserved';
END;
$$;
GRANT EXECUTE ON FUNCTION public.try_reserve_slot(uuid) TO anon, authenticated;

-- 7) detect_capacity_overload — open deduped incidents
CREATE OR REPLACE FUNCTION public.detect_capacity_overload()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  FOR r IN SELECT * FROM public.capacity_status() WHERE status IN ('warning','overloaded') LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.capacity_incidents
      WHERE scope = r.scope AND subject_id = r.subject_id
        AND status = 'open' AND severity = r.status
        AND created_at > date_trunc('day', now())
    ) THEN
      INSERT INTO public.capacity_incidents (scope, subject_id, severity, metric, metric_value, threshold, detail)
      VALUES (
        r.scope, r.subject_id, r.status, 'utilization_pct',
        r.utilization_pct, r.capacity,
        format('%s at %s%% (%s/%s)', r.subject_name, r.utilization_pct, r.booked, r.capacity)
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.detect_capacity_overload() TO authenticated;
