
-- 1. Extend appointments with tracking columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS join_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS call_status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS attendance_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS late_flag boolean DEFAULT false;

-- Index for no-show detection cron
CREATE INDEX IF NOT EXISTS idx_appointments_call_status_starts
  ON public.appointments (call_status, starts_at)
  WHERE call_status = 'scheduled';

-- 2. Extend leads with call counters
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS total_calls_booked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_calls_attended integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_no_shows integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_call_status text;

-- 3. Create setter_performance table
CREATE TABLE IF NOT EXISTS public.setter_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setter_id uuid NOT NULL,
  period_start date NOT NULL DEFAULT CURRENT_DATE,
  calls_assigned integer NOT NULL DEFAULT 0,
  calls_attended integer NOT NULL DEFAULT 0,
  calls_no_show integer NOT NULL DEFAULT 0,
  calls_qualified integer NOT NULL DEFAULT 0,
  calls_closed integer NOT NULL DEFAULT 0,
  show_rate numeric GENERATED ALWAYS AS (
    CASE WHEN calls_assigned > 0 THEN round(calls_attended::numeric / calls_assigned, 4) ELSE 0 END
  ) STORED,
  qualification_rate numeric GENERATED ALWAYS AS (
    CASE WHEN calls_attended > 0 THEN round(calls_qualified::numeric / calls_attended, 4) ELSE 0 END
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (setter_id, period_start)
);

ALTER TABLE public.setter_performance ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own performance
CREATE POLICY "Users can view own setter performance"
  ON public.setter_performance FOR SELECT TO authenticated
  USING (auth.uid() = setter_id);

-- Admins can view all (via has_role)
CREATE POLICY "Admins can view all setter performance"
  ON public.setter_performance FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only service role inserts/updates (no user policy needed)

-- 4. Trigger: auto-update updated_at on setter_performance
CREATE TRIGGER update_setter_performance_updated_at
  BEFORE UPDATE ON public.setter_performance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Function: record join click on appointment
CREATE OR REPLACE FUNCTION public.record_join_click(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starts_at timestamptz;
BEGIN
  UPDATE public.appointments
  SET join_clicked_at = now()
  WHERE id = p_appointment_id
    AND join_clicked_at IS NULL
  RETURNING starts_at INTO v_starts_at;

  -- Set late_flag if clicked > 5 min after start
  IF v_starts_at IS NOT NULL AND now() > v_starts_at + interval '5 minutes' THEN
    UPDATE public.appointments
    SET late_flag = true
    WHERE id = p_appointment_id;
  END IF;
END;
$$;

-- 6. Function: detect no-shows (called by cron)
CREATE OR REPLACE FUNCTION public.detect_no_shows()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.appointments
    SET call_status = 'no_show',
        attendance_flag = false
    WHERE call_status = 'scheduled'
      AND starts_at < now() - interval '10 minutes'
      AND join_clicked_at IS NULL
    RETURNING lead_id
  )
  SELECT count(*) INTO v_count FROM updated;

  -- Update lead counters
  UPDATE public.leads l
  SET total_no_shows = total_no_shows + sub.cnt,
      last_call_status = 'no_show'
  FROM (
    SELECT lead_id, count(*) as cnt
    FROM public.appointments
    WHERE call_status = 'no_show'
      AND attendance_flag = false
    GROUP BY lead_id
  ) sub
  WHERE l.id = sub.lead_id
    AND l.total_no_shows < sub.cnt;

  RETURN v_count;
END;
$$;
