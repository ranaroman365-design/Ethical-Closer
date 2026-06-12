-- Community v2 — Conversion Engine: dedicated path progress + tracking helpers

CREATE TABLE IF NOT EXISTS public.community_path_progress (
  user_id UUID PRIMARY KEY,
  current_step SMALLINT NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 4),
  steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
  progress_pct SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  upgrade_clicked_at TIMESTAMPTZ NULL,
  upgrade_converted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpp_progress ON public.community_path_progress (progress_pct DESC);
CREATE INDEX IF NOT EXISTS idx_cpp_completed_at ON public.community_path_progress (completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cpp_last_activity ON public.community_path_progress (last_activity_at DESC);

ALTER TABLE public.community_path_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cpp_user_read_own" ON public.community_path_progress;
CREATE POLICY "cpp_user_read_own"
  ON public.community_path_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "cpp_user_insert_own" ON public.community_path_progress;
CREATE POLICY "cpp_user_insert_own"
  ON public.community_path_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "cpp_user_update_own" ON public.community_path_progress;
CREATE POLICY "cpp_user_update_own"
  ON public.community_path_progress FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "cpp_admin_read_all" ON public.community_path_progress;
CREATE POLICY "cpp_admin_read_all"
  ON public.community_path_progress FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.fn_cpp_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.last_activity_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cpp_touch ON public.community_path_progress;
CREATE TRIGGER trg_cpp_touch
  BEFORE UPDATE ON public.community_path_progress
  FOR EACH ROW EXECUTE FUNCTION public.fn_cpp_touch_updated_at();

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_events_user_insert_own" ON public.community_events;
CREATE POLICY "community_events_user_insert_own"
  ON public.community_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "community_events_user_read_own" ON public.community_events;
CREATE POLICY "community_events_user_read_own"
  ON public.community_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.community_v2_conversion_funnel(days_window INT DEFAULT 30)
RETURNS TABLE (
  community_entries BIGINT,
  paths_started BIGINT,
  paths_completed BIGINT,
  upgrades_clicked BIGINT,
  upgrades_converted BIGINT,
  community_to_path_rate NUMERIC,
  path_completion_rate NUMERIC,
  completion_to_upgrade_rate NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ev AS (
    SELECT event_type, user_id
    FROM public.community_events
    WHERE created_at >= now() - (days_window || ' days')::interval
      AND event_type IN (
        'community_entry','path_started','path_step_completed',
        'path_completed','upgrade_viewed','upgrade_clicked','upgrade_converted'
      )
  )
  SELECT
    COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'community_entry')      AS community_entries,
    COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'path_started')         AS paths_started,
    COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'path_completed')       AS paths_completed,
    COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'upgrade_clicked')      AS upgrades_clicked,
    COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'upgrade_converted')    AS upgrades_converted,
    ROUND(
      NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'path_started'), 0)::NUMERIC
      / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'community_entry'), 0)::NUMERIC * 100, 1
    ) AS community_to_path_rate,
    ROUND(
      NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'path_completed'), 0)::NUMERIC
      / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'path_started'), 0)::NUMERIC * 100, 1
    ) AS path_completion_rate,
    ROUND(
      NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'upgrade_converted'), 0)::NUMERIC
      / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'path_completed'), 0)::NUMERIC * 100, 1
    ) AS completion_to_upgrade_rate
  FROM ev;
$$;

REVOKE ALL ON FUNCTION public.community_v2_conversion_funnel(INT) FROM public;
GRANT EXECUTE ON FUNCTION public.community_v2_conversion_funnel(INT) TO authenticated;