
-- ============================================
-- 1. USER TIMEBOX TABLE
-- Tracks time windows per level for booster logic
-- ============================================
CREATE TABLE public.user_timebox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  current_level int NOT NULL DEFAULT 0,
  level_started_at timestamptz NOT NULL DEFAULT now(),
  timebox_weeks int NOT NULL DEFAULT 10,
  behind_schedule boolean NOT NULL DEFAULT false,
  booster_active boolean NOT NULL DEFAULT false,
  booster_activated_at timestamptz,
  last_checked_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_timebox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own timebox" ON public.user_timebox
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System manage timebox" ON public.user_timebox
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- 2. ESCALATION ALERTS TABLE
-- Filtered insights for Directors (L7) and Partners (L8)
-- ============================================
CREATE TABLE public.escalation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL DEFAULT 'info',
  severity text NOT NULL DEFAULT 'warning',
  target_role text NOT NULL DEFAULT 'director',
  target_user_id uuid,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'system',
  source_entity_id uuid,
  source_entity_type text,
  metadata jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.escalation_alerts ENABLE ROW LEVEL SECURITY;

-- Directors see director-level alerts, Partners see all
CREATE POLICY "Directors read own escalations" ON public.escalation_alerts
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (target_user_id = auth.uid())
    OR (target_role = 'director' AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND business_stage IN ('director', 'partner')
    ))
    OR (target_role = 'partner' AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND business_stage = 'partner'
    ))
  );

CREATE POLICY "Admins manage escalations" ON public.escalation_alerts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Directors resolve own escalations" ON public.escalation_alerts
  FOR UPDATE TO authenticated
  USING (
    target_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND business_stage IN ('director', 'partner')
    )
  );

-- ============================================
-- 3. RADIANT TRIGGERS TABLE
-- Tracks when Radiant should surface for a user
-- ============================================
CREATE TABLE public.radiant_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trigger_type text NOT NULL DEFAULT 'performance_drop',
  trigger_reason text NOT NULL DEFAULT '',
  dismissed boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz,
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '14 days'),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.radiant_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own radiant triggers" ON public.radiant_triggers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users dismiss own triggers" ON public.radiant_triggers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System manage radiant triggers" ON public.radiant_triggers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================
-- 4. DETECTION FUNCTION: check_timebox_and_triggers
-- Called by evaluate-thresholds edge function
-- ============================================
CREATE OR REPLACE FUNCTION public.check_timebox_and_triggers(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_timebox record;
  v_level int;
  v_weeks_elapsed numeric;
  v_kpi record;
  v_prev_kpi record;
  v_triggers_created int := 0;
  v_behind boolean := false;
  v_booster boolean := false;
BEGIN
  -- Get or create timebox
  SELECT * INTO v_timebox FROM user_timebox WHERE user_id = p_user_id;
  
  SELECT COALESCE(uls.current_level, 0) INTO v_level
  FROM user_level_status uls WHERE uls.user_id = p_user_id;

  IF v_timebox IS NULL THEN
    INSERT INTO user_timebox (user_id, current_level, level_started_at, timebox_weeks)
    VALUES (p_user_id, COALESCE(v_level, 0), now(), CASE WHEN COALESCE(v_level, 0) <= 4 THEN 10 ELSE 8 END)
    RETURNING * INTO v_timebox;
  END IF;

  -- If level changed, reset timebox
  IF v_timebox.current_level != v_level THEN
    UPDATE user_timebox SET
      current_level = v_level,
      level_started_at = now(),
      behind_schedule = false,
      booster_active = false,
      booster_activated_at = NULL,
      timebox_weeks = CASE WHEN v_level <= 4 THEN 10 ELSE 8 END,
      updated_at = now()
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object('reset', true, 'new_level', v_level);
  END IF;

  -- Calculate weeks elapsed
  v_weeks_elapsed := EXTRACT(EPOCH FROM (now() - v_timebox.level_started_at)) / 604800.0;

  -- Check behind_schedule
  IF v_weeks_elapsed > v_timebox.timebox_weeks AND NOT v_timebox.behind_schedule THEN
    v_behind := true;
    v_booster := true;
    
    UPDATE user_timebox SET
      behind_schedule = true,
      booster_active = true,
      booster_activated_at = now(),
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- Check KPI trends for Radiant triggers
  SELECT * INTO v_kpi FROM member_kpis WHERE user_id = p_user_id;
  
  IF v_kpi IS NOT NULL THEN
    -- Performance drop: closing_rate dropped below threshold
    IF COALESCE(v_kpi.closing_rate, 0) < 15 AND v_level >= 3 THEN
      INSERT INTO radiant_triggers (user_id, trigger_type, trigger_reason, metadata)
      SELECT p_user_id, 'performance_drop', 'Close Rate unter 15% — Radiant kann helfen',
        jsonb_build_object('closing_rate', v_kpi.closing_rate, 'level', v_level)
      WHERE NOT EXISTS (
        SELECT 1 FROM radiant_triggers
        WHERE user_id = p_user_id AND trigger_type = 'performance_drop'
          AND dismissed = false AND expires_at > now()
      );
      v_triggers_created := v_triggers_created + 1;
    END IF;

    -- Inactivity: no calls in 14+ days
    IF NOT EXISTS (
      SELECT 1 FROM calls WHERE user_id = p_user_id AND created_at > now() - interval '14 days'
    ) AND v_level >= 1 THEN
      INSERT INTO radiant_triggers (user_id, trigger_type, trigger_reason, metadata)
      SELECT p_user_id, 'inactivity', 'Keine Aktivität seit 14+ Tagen',
        jsonb_build_object('last_activity', (SELECT MAX(created_at) FROM calls WHERE user_id = p_user_id))
      WHERE NOT EXISTS (
        SELECT 1 FROM radiant_triggers
        WHERE user_id = p_user_id AND trigger_type = 'inactivity'
          AND dismissed = false AND expires_at > now()
      );
      v_triggers_created := v_triggers_created + 1;
    END IF;

    -- Booster active → also trigger radiant
    IF v_booster THEN
      INSERT INTO radiant_triggers (user_id, trigger_type, trigger_reason, metadata)
      SELECT p_user_id, 'booster_active', 'Zeitfenster überschritten — Booster aktiviert',
        jsonb_build_object('weeks_elapsed', ROUND(v_weeks_elapsed, 1), 'timebox_weeks', v_timebox.timebox_weeks)
      WHERE NOT EXISTS (
        SELECT 1 FROM radiant_triggers
        WHERE user_id = p_user_id AND trigger_type = 'booster_active'
          AND dismissed = false AND expires_at > now()
      );
      v_triggers_created := v_triggers_created + 1;
    END IF;
  END IF;

  UPDATE user_timebox SET last_checked_at = now() WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'weeks_elapsed', ROUND(v_weeks_elapsed, 1),
    'behind_schedule', v_behind OR v_timebox.behind_schedule,
    'booster_active', v_booster OR v_timebox.booster_active,
    'radiant_triggers_created', v_triggers_created
  );
END;
$$;

-- ============================================
-- 5. ESCALATION DETECTION FUNCTION
-- Scans for conditions and creates filtered alerts
-- ============================================
CREATE OR REPLACE FUNCTION public.detect_escalations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_alerts_created int := 0;
  v_lead record;
  v_stuck_count int;
  v_inactive_setters uuid[];
  v_pipeline_drop boolean := false;
BEGIN
  -- 1. LEADS STUCK > 48h in early stages
  FOR v_lead IN
    SELECT id, name, stage, setter_id, updated_at
    FROM leads
    WHERE stage IN ('assigned_setter', 'setter_contacting', 'setter_attempting')
      AND updated_at < now() - interval '48 hours'
      AND stage NOT IN ('closed_won', 'closed_lost', 'cancelled', 'recycled')
      AND NOT is_simulation
    LIMIT 20
  LOOP
    INSERT INTO escalation_alerts (alert_type, severity, target_role, title, description, source_entity_id, source_entity_type, metadata)
    SELECT 'lead_stuck', 'warning', 'director',
      'Lead-Stau erkannt',
      format('Lead "%s" ist seit >48h im Status "%s" ohne Fortschritt.', v_lead.name, v_lead.stage),
      v_lead.id, 'lead',
      jsonb_build_object('lead_id', v_lead.id, 'stage', v_lead.stage, 'setter_id', v_lead.setter_id, 'hours_stuck', ROUND(EXTRACT(EPOCH FROM (now() - v_lead.updated_at))/3600))
    WHERE NOT EXISTS (
      SELECT 1 FROM escalation_alerts
      WHERE source_entity_id = v_lead.id AND alert_type = 'lead_stuck' AND status = 'open'
    );
    v_alerts_created := v_alerts_created + 1;
  END LOOP;

  -- 2. SETTER INACTIVITY: no activity in 7+ days
  SELECT array_agg(DISTINCT p.id) INTO v_inactive_setters
  FROM profiles p
  WHERE p.business_stage IN ('setter', 'associate_setter', 'senior_associate')
    AND NOT EXISTS (
      SELECT 1 FROM leads l
      WHERE (l.setter_id = p.id OR l.owner_id = p.id)
        AND l.updated_at > now() - interval '7 days'
    )
    AND NOT EXISTS (
      SELECT 1 FROM calls c WHERE c.user_id = p.id AND c.created_at > now() - interval '7 days'
    );

  IF v_inactive_setters IS NOT NULL THEN
    FOREACH v_lead.setter_id IN ARRAY v_inactive_setters
    LOOP
      INSERT INTO escalation_alerts (alert_type, severity, target_role, title, description, source_entity_id, source_entity_type, metadata)
      SELECT 'setter_inactive', 'warning', 'director',
        'Setter-Inaktivität erkannt',
        'Ein Setter zeigt seit 7+ Tagen keine Aktivität.',
        v_lead.setter_id, 'user',
        jsonb_build_object('setter_id', v_lead.setter_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM escalation_alerts
        WHERE source_entity_id = v_lead.setter_id AND alert_type = 'setter_inactive' AND status = 'open'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  END IF;

  -- 3. PIPELINE DROP: conversion rate dropped significantly (compare last 7d vs previous 7d)
  DECLARE
    v_recent_won int;
    v_recent_total int;
    v_prev_won int;
    v_prev_total int;
    v_recent_rate numeric;
    v_prev_rate numeric;
  BEGIN
    SELECT
      count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
      count(*) FILTER (WHERE showed_at IS NOT NULL)
    INTO v_recent_won, v_recent_total
    FROM calls WHERE created_at > now() - interval '7 days' AND NOT is_simulation;

    SELECT
      count(*) FILTER (WHERE closed_at IS NOT NULL AND result = 'won'),
      count(*) FILTER (WHERE showed_at IS NOT NULL)
    INTO v_prev_won, v_prev_total
    FROM calls WHERE created_at BETWEEN now() - interval '14 days' AND now() - interval '7 days' AND NOT is_simulation;

    v_recent_rate := CASE WHEN v_recent_total > 0 THEN (v_recent_won::numeric / v_recent_total) * 100 ELSE 0 END;
    v_prev_rate := CASE WHEN v_prev_total > 0 THEN (v_prev_won::numeric / v_prev_total) * 100 ELSE 0 END;

    IF v_prev_rate > 0 AND v_recent_rate < v_prev_rate * 0.7 AND v_prev_total >= 5 THEN
      INSERT INTO escalation_alerts (alert_type, severity, target_role, title, description, metadata)
      SELECT 'pipeline_drop', 'critical', 'partner',
        'Conversion-Drop im System erkannt',
        format('Close Rate fiel von %.0f%% auf %.0f%% (letzte 7 Tage vs. Vorwoche).', v_prev_rate, v_recent_rate),
        jsonb_build_object('recent_rate', v_recent_rate, 'previous_rate', v_prev_rate, 'drop_pct', ROUND((1 - v_recent_rate / GREATEST(v_prev_rate, 0.01)) * 100))
      WHERE NOT EXISTS (
        SELECT 1 FROM escalation_alerts
        WHERE alert_type = 'pipeline_drop' AND status = 'open' AND created_at > now() - interval '24 hours'
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
  END;

  -- 4. HIGH VALUE OPPORTUNITY: deal_value > 10k
  FOR v_lead IN
    SELECT id, name, deal_value, closer_id
    FROM leads
    WHERE deal_value >= 10000
      AND stage IN ('assigned_closer', 'closer_in_progress', 'offer_made')
      AND NOT is_simulation
    LIMIT 10
  LOOP
    INSERT INTO escalation_alerts (alert_type, severity, target_role, title, description, source_entity_id, source_entity_type, metadata)
    SELECT 'high_value_deal', 'info', 'partner',
      'High-Value Opportunity',
      format('Deal "%s" mit Wert €%s in Pipeline.', v_lead.name, v_lead.deal_value),
      v_lead.id, 'lead',
      jsonb_build_object('deal_value', v_lead.deal_value, 'closer_id', v_lead.closer_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM escalation_alerts
      WHERE source_entity_id = v_lead.id AND alert_type = 'high_value_deal' AND status = 'open'
    );
    v_alerts_created := v_alerts_created + 1;
  END LOOP;

  RETURN jsonb_build_object('alerts_created', v_alerts_created);
END;
$$;
