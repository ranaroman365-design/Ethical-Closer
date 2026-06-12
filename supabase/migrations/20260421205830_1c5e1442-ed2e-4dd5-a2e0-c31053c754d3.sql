-- ============================================================
-- Recreate backfill_funnel_events with CANONICAL event names
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
  v_won int := 0;
  v_lost int := 0;
BEGIN
  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT l.id, 'lead_created', l.email, l.created_at,
         jsonb_build_object('source', l.source, 'lead_quality', l.lead_quality),
         'backfill:lead_created:' || l.id::text, 'backfill'
  FROM leads l
  WHERE l.email IS NOT NULL
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_leads = ROW_COUNT;

  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT l.id, 'quiz_completed', l.email, COALESCE(l.first_action_at, l.created_at),
         jsonb_build_object('quiz_score', l.quiz_score, 'quiz_result', l.quiz_result),
         'backfill:quiz:' || l.id::text, 'backfill'
  FROM leads l
  WHERE l.quiz_score IS NOT NULL AND l.email IS NOT NULL
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_quiz = ROW_COUNT;

  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT a.lead_id, 'call_booked', l.email, a.created_at,
         jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at, 'call_type', a.call_type),
         'backfill:call_booked:' || a.id::text, 'backfill'
  FROM appointments a
  LEFT JOIN leads l ON l.id = a.lead_id
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_booked = ROW_COUNT;

  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT a.lead_id, 'show_up', l.email, COALESCE(a.call_started_at, a.starts_at),
         jsonb_build_object('appointment_id', a.id),
         'backfill:show_up:' || a.id::text, 'backfill'
  FROM appointments a
  LEFT JOIN leads l ON l.id = a.lead_id
  WHERE a.attendance_flag = true OR a.call_started_at IS NOT NULL
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_showed = ROW_COUNT;

  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, revenue, metadata, dedup_key, source_system)
  SELECT NULL::uuid, 'deal_won', NULL, co.created_at, COALESCE(co.deal_value, 0),
         jsonb_build_object('call_id', co.call_id, 'sold_offer', co.sold_offer),
         'backfill:won:' || co.id::text, 'backfill'
  FROM call_outcomes co
  WHERE co.outcome IN ('won','closed_won','sold')
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_won = ROW_COUNT;

  INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, timestamp, metadata, dedup_key, source_system)
  SELECT NULL::uuid, 'deal_lost', NULL, co.created_at,
         jsonb_build_object('call_id', co.call_id, 'lost_reason', co.lost_reason),
         'backfill:lost:' || co.id::text, 'backfill'
  FROM call_outcomes co
  WHERE co.outcome IN ('lost','closed_lost','no_sale')
  ON CONFLICT (dedup_key) DO NOTHING;
  GET DIAGNOSTICS v_lost = ROW_COUNT;

  RETURN jsonb_build_object(
    'lead_created', v_leads,
    'quiz_completed', v_quiz,
    'call_booked', v_booked,
    'show_up', v_showed,
    'deal_won', v_won,
    'deal_lost', v_lost,
    'ran_at', now()
  );
END;
$$;

-- ============================================================
-- Detect canonical incidents using correct event names
-- ============================================================
CREATE OR REPLACE FUNCTION public.detect_system_incidents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
  v_total int := 0;
BEGIN
  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'APPT_NO_BOOKED_EVENT','appointment', a.id::text,
    'Appointment ' || a.id || ' has no call_booked event',
    'high','Emit canonical call_booked event from appointment data',
    jsonb_build_object('lead_id', a.lead_id, 'starts_at', a.starts_at)
  FROM appointments a
  WHERE NOT EXISTS (
    SELECT 1 FROM funnel_events_v2 e
    WHERE e.event_type='call_booked'
      AND (e.metadata->>'appointment_id')::text = a.id::text
  )
  AND NOT EXISTS (
    SELECT 1 FROM auto_fix_incidents i
    WHERE i.incident_code='APPT_NO_BOOKED_EVENT' AND i.entity_id=a.id::text AND i.fix_status IN ('open','fixed')
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT; v_total := v_inserted;

  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'LEAD_NO_CREATED_EVENT','lead', l.id::text,
    'Lead ' || l.id || ' has no lead_created event',
    'medium','Emit canonical lead_created event',
    jsonb_build_object('email', l.email)
  FROM leads l
  WHERE l.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM funnel_events_v2 e WHERE e.event_type='lead_created' AND e.lead_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM auto_fix_incidents i WHERE i.incident_code='LEAD_NO_CREATED_EVENT' AND i.entity_id=l.id::text AND i.fix_status IN ('open','fixed'));
  GET DIAGNOSTICS v_inserted = ROW_COUNT; v_total := v_total + v_inserted;

  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'ORPHAN_APPT','appointment', a.id::text,
    'Appointment ' || a.id || ' references missing lead ' || a.lead_id,
    'critical','Manual review required',
    jsonb_build_object('missing_lead_id', a.lead_id)
  FROM appointments a
  WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = a.lead_id)
    AND NOT EXISTS (SELECT 1 FROM auto_fix_incidents i WHERE i.incident_code='ORPHAN_APPT' AND i.entity_id=a.id::text AND i.fix_status='open');
  GET DIAGNOSTICS v_inserted = ROW_COUNT; v_total := v_total + v_inserted;

  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'LEAD_MISSING_IDENTITY','lead', l.id::text,
    'Lead ' || l.id || ' has no email',
    'high','Manual: enrich from session / source system',
    jsonb_build_object('source', l.source)
  FROM leads l
  WHERE l.email IS NULL
    AND NOT EXISTS (SELECT 1 FROM auto_fix_incidents i WHERE i.incident_code='LEAD_MISSING_IDENTITY' AND i.entity_id=l.id::text AND i.fix_status='open');
  GET DIAGNOSTICS v_inserted = ROW_COUNT; v_total := v_total + v_inserted;

  INSERT INTO auto_fix_incidents (incident_code, entity_type, entity_id, detected_issue, severity, proposed_fix, metadata)
  SELECT 'CALL_OUTCOME_NO_EVENT','call_outcome', co.id::text,
    'call_outcome ' || co.id || ' marked won but no deal_won event',
    'high','Emit canonical deal_won event',
    jsonb_build_object('call_id', co.call_id, 'deal_value', co.deal_value)
  FROM call_outcomes co
  WHERE co.outcome IN ('won','closed_won','sold')
    AND NOT EXISTS (SELECT 1 FROM funnel_events_v2 e WHERE e.event_type='deal_won' AND (e.metadata->>'call_id')::text = co.call_id::text)
    AND NOT EXISTS (SELECT 1 FROM auto_fix_incidents i WHERE i.incident_code='CALL_OUTCOME_NO_EVENT' AND i.entity_id=co.id::text AND i.fix_status IN ('open','fixed'));
  GET DIAGNOSTICS v_inserted = ROW_COUNT; v_total := v_total + v_inserted;

  RETURN jsonb_build_object('new_incidents', v_total, 'ran_at', now());
END;
$$;

-- ============================================================
-- Fix auto-fix function to use canonical event names
-- ============================================================
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
  FOR r IN
    SELECT i.* FROM auto_fix_incidents i
    JOIN auto_fix_rules ru ON ru.rule_code = i.incident_code
    WHERE i.fix_status='open' AND ru.auto_apply=true AND ru.is_active=true
      AND i.incident_code='APPT_NO_BOOKED_EVENT'
  LOOP
    INSERT INTO funnel_events_v2 (lead_id, event_type, timestamp, metadata, dedup_key, source_system)
    SELECT a.lead_id,'call_booked', a.created_at,
      jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at,'autofix', true),
      'autofix:call_booked:' || a.id::text,'autofix'
    FROM appointments a WHERE a.id::text = r.entity_id
    ON CONFLICT (dedup_key) DO NOTHING;

    UPDATE auto_fix_incidents SET fix_status='fixed', fixed_at=now(), fixed_by=auth.uid() WHERE id=r.id;
    INSERT INTO auto_fix_actions_log (incident_id, action_type, action_result, payload)
    VALUES (r.id,'auto_emit_event','success', jsonb_build_object('event_type','call_booked','entity_id', r.entity_id));
    v_fixed := v_fixed + 1;
  END LOOP;

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