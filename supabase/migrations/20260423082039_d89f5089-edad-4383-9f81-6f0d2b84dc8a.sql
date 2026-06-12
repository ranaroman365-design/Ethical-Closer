CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 1. governance_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.governance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  level TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system','mentor','director','owner','cron')),
  escalation_level INT NOT NULL DEFAULT 1,
  context JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_events_user ON public.governance_events(user_id);
CREATE INDEX IF NOT EXISTS idx_gov_events_unresolved ON public.governance_events(resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gov_events_type ON public.governance_events(event_type, severity);

ALTER TABLE public.governance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gov_events_select" ON public.governance_events;
CREATE POLICY "gov_events_select" ON public.governance_events FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

DROP POLICY IF EXISTS "gov_events_write" ON public.governance_events;
CREATE POLICY "gov_events_write" ON public.governance_events FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- ============================================================
-- 2. governance_actions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.governance_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.governance_events(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('warning','intervention','restriction','removal')),
  owner_level TEXT NOT NULL CHECK (owner_level IN ('L6','L7','L8')),
  owner_user_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','executed','cancelled','delayed')),
  executed_at TIMESTAMPTZ,
  executed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gov_actions_event ON public.governance_actions(event_id);
CREATE INDEX IF NOT EXISTS idx_gov_actions_pending ON public.governance_actions(status, created_at DESC);

ALTER TABLE public.governance_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gov_actions_all" ON public.governance_actions;
CREATE POLICY "gov_actions_all" ON public.governance_actions FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- ============================================================
-- 3. governance_overrides
-- ============================================================
CREATE TABLE IF NOT EXISTS public.governance_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  scope TEXT,
  created_by UUID NOT NULL,
  created_by_level TEXT NOT NULL CHECK (created_by_level IN ('L7','L8')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  validated BOOLEAN NOT NULL DEFAULT false,
  validated_at TIMESTAMPTZ,
  reverted BOOLEAN NOT NULL DEFAULT false,
  reverted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gov_overrides_active ON public.governance_overrides(user_id, expires_at) WHERE NOT reverted;

ALTER TABLE public.governance_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gov_overrides_select" ON public.governance_overrides;
CREATE POLICY "gov_overrides_select" ON public.governance_overrides FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

DROP POLICY IF EXISTS "gov_overrides_write" ON public.governance_overrides;
CREATE POLICY "gov_overrides_write" ON public.governance_overrides FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- ============================================================
-- 4. governance_data_integrity_log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.governance_data_integrity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pct_leads_with_origin NUMERIC,
  pct_deals_linked NUMERIC,
  pct_calls_tracked NUMERIC,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','warning','failed')),
  details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gov_integrity_recent ON public.governance_data_integrity_log(checked_at DESC);

ALTER TABLE public.governance_data_integrity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gov_integrity_read" ON public.governance_data_integrity_log;
CREATE POLICY "gov_integrity_read" ON public.governance_data_integrity_log FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- ============================================================
-- TRIGGER: action ladder from event
-- ============================================================
CREATE OR REPLACE FUNCTION public.governance_action_from_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action_type TEXT; v_owner_level TEXT;
BEGIN
  v_action_type := CASE NEW.severity
    WHEN 'low' THEN 'warning'
    WHEN 'medium' THEN 'intervention'
    WHEN 'high' THEN 'restriction'
    WHEN 'critical' THEN 'removal'
    ELSE 'warning' END;
  v_owner_level := CASE
    WHEN NEW.event_type = 'director_review' THEN 'L8'
    WHEN NEW.escalation_level >= 3 THEN 'L8'
    WHEN NEW.escalation_level = 2 THEN 'L7'
    ELSE 'L6' END;
  INSERT INTO public.governance_actions(event_id, action_type, owner_level, status)
  VALUES (NEW.id, v_action_type, v_owner_level, 'pending');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_governance_action_from_event ON public.governance_events;
CREATE TRIGGER trg_governance_action_from_event
  AFTER INSERT ON public.governance_events
  FOR EACH ROW EXECUTE FUNCTION public.governance_action_from_event();

-- ============================================================
-- DETECTION RPCS
-- ============================================================
CREATE OR REPLACE FUNCTION public.governance_detect_data_integrity()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pct_origin NUMERIC := 100;
  v_pct_deals NUMERIC := 100;
  v_pct_calls NUMERIC := 100;
  v_status TEXT := 'ok';
  v_total_leads INT;
  v_total_deals INT;
  v_total_calls INT;
BEGIN
  SELECT COUNT(*) INTO v_total_leads FROM public.leads WHERE created_at > now() - interval '30 days';
  IF v_total_leads > 0 THEN
    SELECT ROUND(100.0 * COUNT(DISTINCT lo.lead_id) / v_total_leads, 2) INTO v_pct_origin
      FROM public.lead_origins lo
      WHERE lo.lead_id IN (SELECT id FROM public.leads WHERE created_at > now() - interval '30 days');
  END IF;

  SELECT COUNT(*) INTO v_total_deals FROM public.funnel_events_v2
    WHERE event_type = 'DEAL_WON' AND created_at > now() - interval '30 days';
  IF v_total_deals > 0 THEN
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE lead_id IS NOT NULL) / v_total_deals, 2) INTO v_pct_deals
      FROM public.funnel_events_v2
      WHERE event_type = 'DEAL_WON' AND created_at > now() - interval '30 days';
  END IF;

  SELECT COUNT(*) INTO v_total_calls FROM public.calls WHERE created_at > now() - interval '30 days';
  IF v_total_calls > 0 THEN
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status IS NOT NULL) / v_total_calls, 2) INTO v_pct_calls
      FROM public.calls WHERE created_at > now() - interval '30 days';
  END IF;

  IF v_pct_origin < 70 OR v_pct_deals < 80 OR v_pct_calls < 80 THEN v_status := 'failed';
  ELSIF v_pct_origin < 90 OR v_pct_deals < 95 OR v_pct_calls < 95 THEN v_status := 'warning';
  END IF;

  INSERT INTO public.governance_data_integrity_log(pct_leads_with_origin, pct_deals_linked, pct_calls_tracked, status, details)
  VALUES (v_pct_origin, v_pct_deals, v_pct_calls, v_status,
          jsonb_build_object('total_leads', v_total_leads, 'total_deals', v_total_deals, 'total_calls', v_total_calls));

  IF v_status = 'failed' THEN
    INSERT INTO public.governance_events(event_type, severity, source, context)
    VALUES ('data_integrity_failure', 'high', 'cron',
            jsonb_build_object('pct_origin', v_pct_origin, 'pct_deals', v_pct_deals, 'pct_calls', v_pct_calls));
  END IF;

  RETURN jsonb_build_object('status', v_status, 'pct_leads_with_origin', v_pct_origin,
    'pct_deals_linked', v_pct_deals, 'pct_calls_tracked', v_pct_calls);
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_detect_underperformance()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT := 0; r RECORD;
BEGIN
  FOR r IN
    SELECT p.id AS user_id, p.career_level
      FROM public.profiles p
      LEFT JOIN public.calls c ON c.user_id = p.id AND c.created_at > now() - interval '14 days'
      WHERE p.career_level IN ('L1','L2','L3','L4','L5','L6')
      GROUP BY p.id, p.career_level
      HAVING COUNT(c.id) = 0
  LOOP
    IF EXISTS (SELECT 1 FROM public.governance_overrides
               WHERE user_id = r.user_id AND NOT reverted AND expires_at > now()) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.governance_events
               WHERE user_id = r.user_id AND event_type = 'underperformance'
                 AND created_at > now() - interval '7 days') THEN CONTINUE; END IF;
    INSERT INTO public.governance_events(user_id, level, event_type, severity, source, context)
    VALUES (r.user_id, r.career_level, 'underperformance', 'medium', 'cron',
            jsonb_build_object('reason', 'no_calls_14d'));
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('flagged', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_detect_director_review()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT := 0; r RECORD;
BEGIN
  FOR r IN SELECT p.id AS user_id FROM public.profiles p WHERE p.career_level = 'L7' LOOP
    IF (SELECT COUNT(*) FROM public.governance_events
        WHERE event_type = 'underperformance' AND severity IN ('medium','high')
          AND created_at > now() - interval '14 days') >= 3 THEN
      IF NOT EXISTS (SELECT 1 FROM public.governance_events
                     WHERE user_id = r.user_id AND event_type = 'director_review'
                       AND created_at > now() - interval '14 days') THEN
        INSERT INTO public.governance_events(user_id, level, event_type, severity, source, context)
        VALUES (r.user_id, 'L7', 'director_review', 'high', 'cron',
                jsonb_build_object('reason', 'team_underperformance'));
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('flagged', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_check_delayed_decisions()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total INT; v_critical INT;
BEGIN
  UPDATE public.governance_actions a
    SET status = 'delayed'
    FROM public.governance_events e
    WHERE a.event_id = e.id AND a.status = 'pending'
      AND ((e.severity IN ('high','critical') AND a.created_at < now() - interval '4 hours')
           OR (e.severity NOT IN ('high','critical') AND a.created_at < now() - interval '24 hours'));
  SELECT COUNT(*) INTO v_total FROM public.governance_actions WHERE status = 'delayed';
  SELECT COUNT(*) INTO v_critical FROM public.governance_actions a
    JOIN public.governance_events e ON e.id = a.event_id
    WHERE a.status = 'delayed' AND e.severity IN ('high','critical');
  RETURN jsonb_build_object('delayed_total', v_total, 'delayed_critical', v_critical);
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_expire_overrides()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reverted INT;
BEGIN
  WITH upd AS (
    UPDATE public.governance_overrides
      SET reverted = true, reverted_at = now()
      WHERE NOT reverted AND NOT validated AND expires_at < now()
      RETURNING 1)
  SELECT COUNT(*) INTO v_reverted FROM upd;
  RETURN jsonb_build_object('reverted', v_reverted);
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_dashboard_snapshot()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active_issues INT; v_high_severity INT; v_pending INT; v_delayed INT; v_overrides INT;
  v_integrity JSONB; v_recent_events JSONB; v_recent_actions JSONB;
BEGIN
  SELECT COUNT(*) INTO v_active_issues FROM public.governance_events WHERE NOT resolved;
  SELECT COUNT(*) INTO v_high_severity FROM public.governance_events
    WHERE NOT resolved AND severity IN ('high','critical');
  SELECT COUNT(*) INTO v_pending FROM public.governance_actions WHERE status = 'pending';
  SELECT COUNT(*) INTO v_delayed FROM public.governance_actions WHERE status = 'delayed';
  SELECT COUNT(*) INTO v_overrides FROM public.governance_overrides
    WHERE NOT reverted AND expires_at > now();

  SELECT to_jsonb(l.*) INTO v_integrity FROM public.governance_data_integrity_log l
    ORDER BY checked_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(e.*)), '[]'::jsonb) INTO v_recent_events
    FROM (SELECT id, user_id, level, event_type, severity, source, escalation_level, resolved, created_at
          FROM public.governance_events ORDER BY created_at DESC LIMIT 25) e;

  SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb) INTO v_recent_actions
    FROM (SELECT a.id, a.event_id, a.action_type, a.owner_level, a.status, a.created_at,
                 e.event_type, e.severity, e.user_id
          FROM public.governance_actions a
          JOIN public.governance_events e ON e.id = a.event_id
          ORDER BY a.created_at DESC LIMIT 25) a;

  RETURN jsonb_build_object(
    'active_issues', v_active_issues, 'high_severity', v_high_severity,
    'pending_actions', v_pending, 'delayed_actions', v_delayed,
    'active_overrides', v_overrides, 'data_integrity', v_integrity,
    'recent_events', v_recent_events, 'recent_actions', v_recent_actions);
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_run_all_detections()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_integrity JSONB; v_underperf JSONB; v_director JSONB; v_delayed JSONB; v_expired JSONB;
BEGIN
  v_integrity := public.governance_detect_data_integrity();
  v_underperf := public.governance_detect_underperformance();
  v_director := public.governance_detect_director_review();
  v_delayed := public.governance_check_delayed_decisions();
  v_expired := public.governance_expire_overrides();
  RETURN jsonb_build_object('integrity', v_integrity, 'underperformance', v_underperf,
    'director_review', v_director, 'delayed', v_delayed,
    'expired_overrides', v_expired, 'ran_at', now());
END;
$$;

DO $$ BEGIN PERFORM cron.unschedule('governance_daily_detections');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('governance_daily_detections', '30 3 * * *',
  $$ SELECT public.governance_run_all_detections(); $$);