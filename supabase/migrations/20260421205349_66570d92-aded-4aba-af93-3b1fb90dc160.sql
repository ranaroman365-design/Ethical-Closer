-- ============================================================
-- SPRINT 0: EVENT BACKFILL
-- ============================================================
CREATE OR REPLACE FUNCTION public.backfill_funnel_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leads int := 0;
  v_quiz int := 0;
  v_booked int := 0;
  v_showed int := 0;
  v_noshow int := 0;
  v_won int := 0;
BEGIN
  -- lead_created
  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT l.id, 'lead_created', l.email, l.created_at,
         jsonb_build_object('source', l.source, 'lead_quality', l.lead_quality),
         'backfill:lead_created:' || l.id::text, 'backfill'
  FROM leads l
  WHERE l.email IS NOT NULL
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_leads = ROW_COUNT;

  -- quiz_completed
  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT l.id, 'quiz_completed', l.email, COALESCE(l.first_action_at, l.created_at),
         jsonb_build_object('quiz_score', l.quiz_score, 'quiz_result', l.quiz_result),
         'backfill:quiz:' || l.id::text, 'backfill'
  FROM leads l
  WHERE l.quiz_score IS NOT NULL AND l.email IS NOT NULL
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_quiz = ROW_COUNT;

  -- booked
  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT a.lead_id, 'booked', l.email, a.created_at,
         jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'call_type', a.call_type),
         'backfill:booked:' || a.id::text, 'backfill'
  FROM appointments a
  LEFT JOIN leads l ON l.id = a.lead_id
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_booked = ROW_COUNT;

  -- showed_up
  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT a.lead_id, 'showed_up', l.email, COALESCE(a.call_started_at, a.starts_at),
         jsonb_build_object('appointment_id', a.id),
         'backfill:showed:' || a.id::text, 'backfill'
  FROM appointments a
  LEFT JOIN leads l ON l.id = a.lead_id
  WHERE a.attendance_flag = true OR a.call_started_at IS NOT NULL
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_showed = ROW_COUNT;

  -- no_show
  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT a.lead_id, 'no_show', l.email, COALESCE(a.no_show_detected_at, a.ends_at),
         jsonb_build_object('appointment_id', a.id),
         'backfill:noshow:' || a.id::text, 'backfill'
  FROM appointments a
  LEFT JOIN leads l ON l.id = a.lead_id
  WHERE a.no_show_detected_at IS NOT NULL
     OR (a.attendance_flag = false AND a.ends_at < now())
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_noshow = ROW_COUNT;

  -- deal_won (from call_outcomes with outcome=won)
  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, revenue, metadata, dedup_key, source_system)
  SELECT NULL::uuid, 'deal_won', NULL, co.created_at, COALESCE(co.deal_value, 0),
         jsonb_build_object('call_id', co.call_id, 'sold_offer', co.sold_offer),
         'backfill:won:' || co.id::text, 'backfill'
  FROM call_outcomes co
  WHERE co.outcome IN ('won','closed_won','sold')
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_won = ROW_COUNT;

  RETURN jsonb_build_object(
    'lead_created', v_leads,
    'quiz_completed', v_quiz,
    'booked', v_booked,
    'showed_up', v_showed,
    'no_show', v_noshow,
    'deal_won', v_won,
    'ran_at', now()
  );
END;
$$;

-- ============================================================
-- SPRINT 2: SYSTEM INTEGRITY LAYER
-- ============================================================
CREATE TABLE IF NOT EXISTS public.auto_fix_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  severity text NOT NULL DEFAULT 'medium',
  auto_apply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.auto_fix_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_code text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  detected_issue text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  proposed_fix text,
  fix_status text NOT NULL DEFAULT 'open',
  fixed_by uuid,
  fixed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auto_fix_incidents_status ON auto_fix_incidents(fix_status, severity);
CREATE INDEX IF NOT EXISTS idx_auto_fix_incidents_code ON auto_fix_incidents(incident_code);

CREATE TABLE IF NOT EXISTS public.auto_fix_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES auto_fix_incidents(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  action_result text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auto_fix_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_fix_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_fix_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read auto_fix_rules" ON auto_fix_rules FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));
CREATE POLICY "admins manage auto_fix_rules" ON auto_fix_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));

CREATE POLICY "admins read incidents" ON auto_fix_incidents FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));
CREATE POLICY "admins manage incidents" ON auto_fix_incidents FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));

CREATE POLICY "admins read action log" ON auto_fix_actions_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));
CREATE POLICY "admins manage action log" ON auto_fix_actions_log FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));

-- Seed rules
INSERT INTO auto_fix_rules (rule_code, title, description, severity, auto_apply) VALUES
  ('APPT_NO_BOOKED_EVENT','Appointment without booked event','Appointment exists but no canonical booked event was emitted','high', true),
  ('LEAD_NO_CREATED_EVENT','Lead without lead_created event','Lead row exists but lead_created event missing','medium', true),
  ('ORPHAN_APPT','Appointment with missing lead','Appointment references a lead_id that does not exist','critical', false),
  ('LEAD_MISSING_IDENTITY','Lead missing email','Lead has no email — cannot be tracked across systems','high', false),
  ('CALL_OUTCOME_NO_EVENT','Won deal without deal_won event','call_outcomes row marked won but no canonical event','high', true)
ON CONFLICT (rule_code) DO NOTHING;

-- Detection function
CREATE OR REPLACE FUNCTION public.detect_system_incidents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_total int;
BEGIN
  -- Resolve already-fixed/open incidents are not re-inserted (use entity_id+code uniqueness via NOT EXISTS)
  -- 1. Appointments without booked event
  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'APPT_NO_BOOKED_EVENT','appointment', a.id::text,
    'Appointment ' || a.id || ' has no booked event in funnel_events_v2',
    'high','Emit canonical booked event from appointment data',
    jsonb_build_object('lead_id', a.lead_id, 'starts_at', a.starts_at)
  FROM appointments a
  WHERE NOT EXISTS (
    SELECT 1 FROM funnel_events_v2 e
    WHERE e.event_type='booked'
      AND (e.metadata->>'appointment_id')::text = a.id::text
  )
  AND NOT EXISTS (
    SELECT 1 FROM auto_fix_incidents i
    WHERE i.incident_code='APPT_NO_BOOKED_EVENT' AND i.entity_id=a.id::text AND i.fix_status IN ('open','fixed')
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_total := v_inserted;

  -- 2. Leads without lead_created event
  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'LEAD_NO_CREATED_EVENT','lead', l.id::text,
    'Lead ' || l.id || ' has no lead_created event',
    'medium','Emit canonical lead_created event',
    jsonb_build_object('email', l.email)
  FROM leads l
  WHERE l.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM funnel_events_v2 e
      WHERE e.event_type='lead_created' AND e.lead_id = l.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM auto_fix_incidents i
      WHERE i.incident_code='LEAD_NO_CREATED_EVENT' AND i.entity_id=l.id::text AND i.fix_status IN ('open','fixed')
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_total := v_total + v_inserted;

  -- 3. Orphan appointments
  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'ORPHAN_APPT','appointment', a.id::text,
    'Appointment ' || a.id || ' references missing lead ' || a.lead_id,
    'critical','Manual review required — link appointment to existing lead or archive',
    jsonb_build_object('missing_lead_id', a.lead_id)
  FROM appointments a
  WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = a.lead_id)
    AND NOT EXISTS (
      SELECT 1 FROM auto_fix_incidents i
      WHERE i.incident_code='ORPHAN_APPT' AND i.entity_id=a.id::text AND i.fix_status='open'
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_total := v_total + v_inserted;

  -- 4. Leads missing identity
  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'LEAD_MISSING_IDENTITY','lead', l.id::text,
    'Lead ' || l.id || ' has no email',
    'high','Manual: enrich from session / source system',
    jsonb_build_object('source', l.source)
  FROM leads l
  WHERE l.email IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM auto_fix_incidents i
      WHERE i.incident_code='LEAD_MISSING_IDENTITY' AND i.entity_id=l.id::text AND i.fix_status='open'
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_total := v_total + v_inserted;

  -- 5. Won outcomes without deal_won event
  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'CALL_OUTCOME_NO_EVENT','call_outcome', co.id::text,
    'call_outcome ' || co.id || ' marked won but no deal_won event',
    'high','Emit canonical deal_won event',
    jsonb_build_object('call_id', co.call_id, 'deal_value', co.deal_value)
  FROM call_outcomes co
  WHERE co.outcome IN ('won','closed_won','sold')
    AND NOT EXISTS (
      SELECT 1 FROM funnel_events_v2 e
      WHERE e.event_type='deal_won' AND (e.metadata->>'call_id')::text = co.call_id::text
    )
    AND NOT EXISTS (
      SELECT 1 FROM auto_fix_incidents i
      WHERE i.incident_code='CALL_OUTCOME_NO_EVENT' AND i.entity_id=co.id::text AND i.fix_status IN ('open','fixed')
    );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_total := v_total + v_inserted;

  RETURN jsonb_build_object('new_incidents', v_total, 'ran_at', now());
END;
$$;

-- Safe auto-fix function
CREATE OR REPLACE FUNCTION public.apply_safe_auto_fixes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fixed int := 0;
  r record;
BEGIN
  -- APPT_NO_BOOKED_EVENT — auto fix
  FOR r IN
    SELECT i.* FROM auto_fix_incidents i
    JOIN auto_fix_rules ru ON ru.rule_code = i.incident_code
    WHERE i.fix_status='open' AND ru.auto_apply=true AND ru.is_active=true
      AND i.incident_code='APPT_NO_BOOKED_EVENT'
  LOOP
    INSERT INTO funnel_events_v2 (lead_id, event_type, timestamp, metadata, dedup_key, source_system)
    SELECT a.lead_id,'booked', a.created_at,
      jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at,'autofix', true),
      'autofix:booked:' || a.id::text,'autofix'
    FROM appointments a WHERE a.id::text = r.entity_id
    ON CONFLICT (dedup_key) DO NOTHING;

    UPDATE auto_fix_incidents SET fix_status='fixed', fixed_at=now(), fixed_by=auth.uid() WHERE id=r.id;
    INSERT INTO auto_fix_actions_log (incident_id, action_type, action_result, payload)
    VALUES (r.id,'auto_emit_event','success', jsonb_build_object('event_type','booked','entity_id', r.entity_id));
    v_fixed := v_fixed + 1;
  END LOOP;

  -- LEAD_NO_CREATED_EVENT — auto fix
  FOR r IN
    SELECT i.* FROM auto_fix_incidents i
    JOIN auto_fix_rules ru ON ru.rule_code = i.incident_code
    WHERE i.fix_status='open' AND ru.auto_apply=true AND ru.is_active=true
      AND i.incident_code='LEAD_NO_CREATED_EVENT'
  LOOP
    INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
    SELECT l.id,'lead_created', l.email, l.created_at,
      jsonb_build_object('source', l.source,'autofix', true),
      'autofix:lead_created:' || l.id::text,'autofix'
    FROM leads l WHERE l.id::text = r.entity_id
    ON CONFLICT (dedup_key) DO NOTHING;

    UPDATE auto_fix_incidents SET fix_status='fixed', fixed_at=now(), fixed_by=auth.uid() WHERE id=r.id;
    INSERT INTO auto_fix_actions_log (incident_id, action_type, action_result, payload)
    VALUES (r.id,'auto_emit_event','success', jsonb_build_object('event_type','lead_created','entity_id', r.entity_id));
    v_fixed := v_fixed + 1;
  END LOOP;

  -- CALL_OUTCOME_NO_EVENT — auto fix
  FOR r IN
    SELECT i.* FROM auto_fix_incidents i
    JOIN auto_fix_rules ru ON ru.rule_code = i.incident_code
    WHERE i.fix_status='open' AND ru.auto_apply=true AND ru.is_active=true
      AND i.incident_code='CALL_OUTCOME_NO_EVENT'
  LOOP
    INSERT INTO funnel_events_v2 (lead_id, event_type, timestamp, revenue, metadata, dedup_key, source_system)
    SELECT NULL::uuid,'deal_won', co.created_at, COALESCE(co.deal_value,0),
      jsonb_build_object('call_id', co.call_id,'sold_offer', co.sold_offer,'autofix', true),
      'autofix:won:' || co.id::text,'autofix'
    FROM call_outcomes co WHERE co.id::text = r.entity_id
    ON CONFLICT (dedup_key) DO NOTHING;

    UPDATE auto_fix_incidents SET fix_status='fixed', fixed_at=now(), fixed_by=auth.uid() WHERE id=r.id;
    INSERT INTO auto_fix_actions_log (incident_id, action_type, action_result, payload)
    VALUES (r.id,'auto_emit_event','success', jsonb_build_object('event_type','deal_won','entity_id', r.entity_id));
    v_fixed := v_fixed + 1;
  END LOOP;

  RETURN jsonb_build_object('fixed', v_fixed, 'ran_at', now());
END;
$$;

-- ============================================================
-- SPRINT 3: OPERATOR COACH
-- ============================================================
CREATE TABLE IF NOT EXISTS public.operator_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_email text NOT NULL,
  operator_role text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  benchmark_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_bottleneck text,
  coach_summary text,
  recommended_actions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_scorecards_email ON operator_scorecards(operator_email, created_at DESC);

CREATE TABLE IF NOT EXISTS public.operator_coaching_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_email text NOT NULL,
  operator_role text NOT NULL,
  coaching_type text NOT NULL DEFAULT 'auto',
  summary text,
  recommendations jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_op_coach_logs_email ON operator_coaching_logs(operator_email, created_at DESC);

ALTER TABLE operator_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_coaching_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read scorecards" ON operator_scorecards FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));
CREATE POLICY "admins manage scorecards" ON operator_scorecards FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));

CREATE POLICY "admins read coach logs" ON operator_coaching_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));
CREATE POLICY "admins manage coach logs" ON operator_coaching_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator'));

-- Build scorecards from canonical data
CREATE OR REPLACE FUNCTION public.build_operator_scorecards(p_period_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := now() - (p_period_days || ' days')::interval;
  v_end timestamptz := now();
  v_count int := 0;
  -- benchmarks
  v_setter_benchmark jsonb := '{"booking_rate":25,"show_rate":60,"qualification_rate":50}'::jsonb;
  v_closer_benchmark jsonb := '{"close_rate":25,"show_rate":70,"revenue_per_call":800}'::jsonb;
  r record;
  v_metrics jsonb;
  v_bottleneck text;
  v_actions jsonb;
  v_summary text;
BEGIN
  -- Setters: from leads.setter_id + appointments
  FOR r IN
    SELECT
      p.id AS user_id,
      p.email,
      COUNT(DISTINCT l.id) FILTER (WHERE l.created_at BETWEEN v_start AND v_end) AS leads_assigned,
      COUNT(DISTINCT l.id) FILTER (WHERE l.contact_count > 0 AND l.created_at BETWEEN v_start AND v_end) AS contacted,
      COUNT(DISTINCT l.id) FILTER (WHERE l.qualification_checklist IS NOT NULL AND l.created_at BETWEEN v_start AND v_end) AS qualified,
      COUNT(DISTINCT a.id) FILTER (WHERE a.created_at BETWEEN v_start AND v_end) AS booked,
      COUNT(DISTINCT a.id) FILTER (WHERE (a.attendance_flag=true OR a.call_started_at IS NOT NULL) AND a.created_at BETWEEN v_start AND v_end) AS showed
    FROM profiles p
    LEFT JOIN leads l ON l.setter_id = p.id
    LEFT JOIN appointments a ON a.setter_id = p.id
    WHERE p.email IS NOT NULL
    GROUP BY p.id, p.email
    HAVING COUNT(DISTINCT l.id) FILTER (WHERE l.created_at BETWEEN v_start AND v_end) > 0
        OR COUNT(DISTINCT a.id) FILTER (WHERE a.created_at BETWEEN v_start AND v_end) > 0
  LOOP
    DECLARE
      v_book_rate numeric := CASE WHEN r.contacted>0 THEN ROUND(r.booked::numeric*100/r.contacted,1) ELSE 0 END;
      v_show_rate numeric := CASE WHEN r.booked>0 THEN ROUND(r.showed::numeric*100/r.booked,1) ELSE 0 END;
      v_qual_rate numeric := CASE WHEN r.contacted>0 THEN ROUND(r.qualified::numeric*100/r.contacted,1) ELSE 0 END;
    BEGIN
      v_metrics := jsonb_build_object(
        'leads_assigned', r.leads_assigned,
        'contacted', r.contacted,
        'qualified', r.qualified,
        'booked', r.booked,
        'showed', r.showed,
        'booking_rate', v_book_rate,
        'show_rate', v_show_rate,
        'qualification_rate', v_qual_rate
      );

      -- Bottleneck identification
      IF v_book_rate < 25 THEN v_bottleneck := 'booking_rate';
      ELSIF v_show_rate < 60 THEN v_bottleneck := 'show_rate';
      ELSIF v_qual_rate < 50 THEN v_bottleneck := 'qualification_rate';
      ELSE v_bottleneck := 'none'; END IF;

      v_actions := CASE v_bottleneck
        WHEN 'booking_rate' THEN '["Tighten qualification questions","Use harder commitment frames before pitch","Reduce friction in calendar step"]'::jsonb
        WHEN 'show_rate' THEN '["Add 24h + 2h reminder sequence","Send personal voice note before call","Confirm intent at booking"]'::jsonb
        WHEN 'qualification_rate' THEN '["Apply EEG framework strictly","Use 3-question filter on opener","Disqualify faster"]'::jsonb
        ELSE '["Maintain current standard","Mentor lower-performing setters"]'::jsonb
      END;

      v_summary := format('Setter %s: %s leads, %s booked (%.1f%%), %s showed (%.1f%%). Primary bottleneck: %s.',
        r.email, r.leads_assigned, r.booked, v_book_rate, r.showed, v_show_rate, v_bottleneck);

      INSERT INTO operator_scorecards (operator_email, operator_role, period_start, period_end, metrics, benchmark_metrics, primary_bottleneck, coach_summary, recommended_actions)
      VALUES (r.email,'setter', v_start, v_end, v_metrics, v_setter_benchmark, v_bottleneck, v_summary, v_actions);
      v_count := v_count + 1;
    END;
  END LOOP;

  -- Closers: from calls + call_outcomes
  FOR r IN
    SELECT
      p.id AS user_id,
      p.email,
      COUNT(DISTINCT c.id) FILTER (WHERE c.created_at BETWEEN v_start AND v_end) AS calls_total,
      COUNT(DISTINCT c.id) FILTER (WHERE c.showed_at IS NOT NULL AND c.created_at BETWEEN v_start AND v_end) AS showed,
      COUNT(DISTINCT co.id) FILTER (WHERE co.outcome IN ('won','closed_won','sold') AND co.created_at BETWEEN v_start AND v_end) AS won,
      COUNT(DISTINCT co.id) FILTER (WHERE co.created_at BETWEEN v_start AND v_end) AS outcomes,
      COALESCE(SUM(co.deal_value) FILTER (WHERE co.outcome IN ('won','closed_won','sold') AND co.created_at BETWEEN v_start AND v_end),0) AS revenue
    FROM profiles p
    LEFT JOIN calls c ON c.user_id = p.id
    LEFT JOIN call_outcomes co ON co.user_id = p.id
    WHERE p.email IS NOT NULL
    GROUP BY p.id, p.email
    HAVING COUNT(DISTINCT c.id) FILTER (WHERE c.created_at BETWEEN v_start AND v_end) > 0
  LOOP
    DECLARE
      v_close_rate numeric := CASE WHEN r.outcomes>0 THEN ROUND(r.won::numeric*100/r.outcomes,1) ELSE 0 END;
      v_show_rate numeric := CASE WHEN r.calls_total>0 THEN ROUND(r.showed::numeric*100/r.calls_total,1) ELSE 0 END;
      v_rev_per_call numeric := CASE WHEN r.calls_total>0 THEN ROUND(r.revenue/r.calls_total,2) ELSE 0 END;
    BEGIN
      v_metrics := jsonb_build_object(
        'calls_total', r.calls_total,
        'showed', r.showed,
        'won', r.won,
        'outcomes_logged', r.outcomes,
        'revenue', r.revenue,
        'close_rate', v_close_rate,
        'show_rate', v_show_rate,
        'revenue_per_call', v_rev_per_call
      );

      IF v_close_rate < 25 THEN v_bottleneck := 'close_rate';
      ELSIF v_show_rate < 70 THEN v_bottleneck := 'show_rate';
      ELSIF v_rev_per_call < 800 THEN v_bottleneck := 'revenue_per_call';
      ELSE v_bottleneck := 'none'; END IF;

      v_actions := CASE v_bottleneck
        WHEN 'close_rate' THEN '["Drill objection handling daily","Review last 5 lost calls with mentor","Tighten ascension between offers"]'::jsonb
        WHEN 'show_rate' THEN '["Coordinate with setter on confirmation","Reduce time-to-call slot","Improve booking confirmation copy"]'::jsonb
        WHEN 'revenue_per_call' THEN '["Push higher tier first","Practice premium framing","Stop discounting"]'::jsonb
        ELSE '["Mentor closers with weaker close rate","Document winning frames"]'::jsonb
      END;

      v_summary := format('Closer %s: %s calls, %s won (%.1f%% close), %s revenue (%.0f €/call). Bottleneck: %s.',
        r.email, r.calls_total, r.won, v_close_rate, r.revenue, v_rev_per_call, v_bottleneck);

      INSERT INTO operator_scorecards (operator_email, operator_role, period_start, period_end, metrics, benchmark_metrics, primary_bottleneck, coach_summary, recommended_actions)
      VALUES (r.email,'closer', v_start, v_end, v_metrics, v_closer_benchmark, v_bottleneck, v_summary, v_actions);
      v_count := v_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('scorecards_built', v_count, 'period_start', v_start, 'period_end', v_end);
END;
$$;

-- Get latest coaching summary for a single operator
CREATE OR REPLACE FUNCTION public.get_operator_coaching_summary(p_operator_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card record;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'owner') OR has_role(auth.uid(),'administrator')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_card FROM operator_scorecards
  WHERE operator_email = p_operator_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_card IS NULL THEN
    RETURN jsonb_build_object('found', false, 'operator_email', p_operator_email);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'operator_email', v_card.operator_email,
    'operator_role', v_card.operator_role,
    'period_start', v_card.period_start,
    'period_end', v_card.period_end,
    'metrics', v_card.metrics,
    'benchmark_metrics', v_card.benchmark_metrics,
    'primary_bottleneck', v_card.primary_bottleneck,
    'coach_summary', v_card.coach_summary,
    'recommended_actions', v_card.recommended_actions,
    'generated_at', v_card.created_at
  );
END;
$$;