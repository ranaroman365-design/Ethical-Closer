CREATE OR REPLACE FUNCTION public.run_system_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dimensions jsonb := '[]'::jsonb;
  v_overall numeric := 0;
  v_score numeric;
  v_notes jsonb;
  v_total_leads int;
  v_leads_no_email int;
  v_leads_no_origin int;
  v_total_events int;
  v_events_24h int;
  v_total_appt int;
  v_appt_no_lead int;
  v_canonical_present int;
  v_processed_events_count int;
  v_audit_logs_24h int;
  v_break_glass_open int;
  v_booked_events int;
  v_canonical text[] := ARRAY['lead_created','quiz_started','quiz_completed','booked','show_up','no_show','call_completed','offer_made','deal_won','deal_lost','reschedule','payment_received'];
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  -- D1: Architecture
  v_score := 7; v_notes := '[]'::jsonb;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='current_stage') THEN
    v_score := v_score - 2;
    v_notes := v_notes || jsonb_build_object('severity','high','msg','leads.current_stage existiert – Shadow-State neben Event-System');
  END IF;
  v_dimensions := v_dimensions || jsonb_build_object('key','architecture','title','System Architecture','score',v_score,'max',10,'notes',v_notes);

  -- D2: Database Integrity
  v_score := 10; v_notes := '[]'::jsonb;
  SELECT count(*) INTO v_total_leads FROM leads;
  SELECT count(*) INTO v_leads_no_email FROM leads WHERE email IS NULL OR email = '';
  SELECT count(*) INTO v_leads_no_origin FROM leads WHERE origin_id IS NULL;
  SELECT count(*) INTO v_appt_no_lead FROM appointments WHERE lead_id IS NULL;
  IF v_total_leads > 0 AND v_leads_no_email::numeric / v_total_leads > 0.05 THEN
    v_score := v_score - 3;
    v_notes := v_notes || jsonb_build_object('severity','high','msg', v_leads_no_email || ' Leads ohne Email');
  END IF;
  IF v_total_leads > 0 AND v_leads_no_origin::numeric / v_total_leads > 0.20 THEN
    v_score := v_score - 2;
    v_notes := v_notes || jsonb_build_object('severity','medium','msg', v_leads_no_origin || ' Leads ohne origin_id');
  END IF;
  IF v_appt_no_lead > 0 THEN
    v_score := v_score - 2;
    v_notes := v_notes || jsonb_build_object('severity','high','msg', v_appt_no_lead || ' Appointments ohne lead_id');
  END IF;
  v_notes := v_notes || jsonb_build_object('metric','total_leads','value',v_total_leads);
  v_dimensions := v_dimensions || jsonb_build_object('key','database','title','Database Integrity','score',greatest(v_score,0),'max',10,'notes',v_notes);

  -- D3: Event System
  v_score := 0; v_notes := '[]'::jsonb;
  SELECT count(*) INTO v_total_events FROM funnel_events_v2;
  SELECT count(*) INTO v_events_24h FROM funnel_events_v2 WHERE timestamp > now() - interval '24 hours';
  SELECT count(*) INTO v_canonical_present FROM unnest(v_canonical) AS c WHERE EXISTS (SELECT 1 FROM funnel_events_v2 WHERE event_type = c);
  v_score := round((v_canonical_present::numeric / array_length(v_canonical,1)) * 10, 1);
  IF v_total_events = 0 THEN
    v_notes := v_notes || jsonb_build_object('severity','critical','msg','funnel_events_v2 ist LEER – kein Event-Tracking aktiv');
  ELSIF v_events_24h = 0 THEN
    v_notes := v_notes || jsonb_build_object('severity','high','msg','Keine Events in den letzten 24h');
  END IF;
  v_notes := v_notes || jsonb_build_object('metric','canonical_coverage', v_canonical_present || '/' || array_length(v_canonical,1));
  v_notes := v_notes || jsonb_build_object('metric','events_total', v_total_events);
  v_notes := v_notes || jsonb_build_object('metric','events_24h', v_events_24h);
  v_dimensions := v_dimensions || jsonb_build_object('key','events','title','Event System','score',v_score,'max',10,'notes',v_notes);

  -- D4: Funnel
  v_score := 7; v_notes := '[]'::jsonb;
  IF v_total_leads = 0 THEN
    v_score := 0;
    v_notes := v_notes || jsonb_build_object('severity','critical','msg','Keine Leads in DB');
  ELSE
    SELECT count(*) INTO v_total_appt FROM appointments;
    v_notes := v_notes || jsonb_build_object('metric','leads',v_total_leads,'appointments',v_total_appt);
    IF v_total_appt::numeric / v_total_leads < 0.10 THEN
      v_score := v_score - 3;
      v_notes := v_notes || jsonb_build_object('severity','medium','msg','Booking-Rate <10%');
    END IF;
  END IF;
  v_dimensions := v_dimensions || jsonb_build_object('key','funnel','title','Funnel & Conversion','score',greatest(v_score,0),'max',10,'notes',v_notes);

  -- D5: Booking
  v_score := 10; v_notes := '[]'::jsonb;
  SELECT count(*) INTO v_total_appt FROM appointments WHERE starts_at > now() - interval '30 days';
  v_notes := v_notes || jsonb_build_object('metric','appt_30d',v_total_appt);
  IF v_total_appt > 0 THEN
    SELECT count(*) INTO v_booked_events FROM funnel_events_v2 WHERE event_type = 'booked' AND timestamp > now() - interval '30 days';
    v_notes := v_notes || jsonb_build_object('metric','booked_events_30d',v_booked_events);
    IF v_booked_events = 0 OR abs(v_booked_events - v_total_appt)::numeric / v_total_appt > 0.20 THEN
      v_score := v_score - 4;
      v_notes := v_notes || jsonb_build_object('severity','high','msg','Booking↔Event Drift: '||v_total_appt||' Appts vs '||v_booked_events||' booked-Events');
    END IF;
  END IF;
  v_dimensions := v_dimensions || jsonb_build_object('key','booking','title','Booking System','score',greatest(v_score,0),'max',10,'notes',v_notes);

  -- D6: Tracking / Attribution
  v_score := 8; v_notes := '[]'::jsonb;
  IF v_leads_no_origin > 0 AND v_total_leads > 0 THEN
    v_score := v_score - round((v_leads_no_origin::numeric/v_total_leads)*8, 1);
    v_notes := v_notes || jsonb_build_object('severity','medium','msg', round((v_leads_no_origin::numeric/v_total_leads)*100,1)||'% Leads ohne Origin');
  END IF;
  v_dimensions := v_dimensions || jsonb_build_object('key','tracking','title','Performance Tracking','score',greatest(v_score,0),'max',10,'notes',v_notes);

  -- D7: GHL
  v_score := 7; v_notes := '[]'::jsonb;
  SELECT count(*) INTO v_processed_events_count FROM processed_events WHERE processed_at > now() - interval '7 days';
  v_notes := v_notes || jsonb_build_object('metric','processed_events_7d',v_processed_events_count);
  IF v_processed_events_count = 0 THEN
    v_score := v_score - 3;
    v_notes := v_notes || jsonb_build_object('severity','medium','msg','Keine processed_events in 7 Tagen – Outbound-Queue inaktiv?');
  END IF;
  v_dimensions := v_dimensions || jsonb_build_object('key','ghl','title','GHL Execution Layer','score',greatest(v_score,0),'max',10,'notes',v_notes);

  -- D8: UX
  v_score := 7; v_notes := '[]'::jsonb;
  v_notes := v_notes || jsonb_build_object('severity','info','msg','UI-Layer wird heuristisch bewertet – manuelles Review empfohlen');
  v_dimensions := v_dimensions || jsonb_build_object('key','ux','title','UI / UX','score',v_score,'max',10,'notes',v_notes);

  -- D9: Security
  v_score := 9; v_notes := '[]'::jsonb;
  SELECT count(*) INTO v_audit_logs_24h FROM audit_logs WHERE created_at > now() - interval '24 hours';
  SELECT count(*) INTO v_break_glass_open FROM break_glass_events WHERE status = 'active' AND expires_at > now();
  v_notes := v_notes || jsonb_build_object('metric','audit_logs_24h',v_audit_logs_24h);
  IF v_break_glass_open > 0 THEN
    v_score := v_score - 5;
    v_notes := v_notes || jsonb_build_object('severity','critical','msg', v_break_glass_open || ' aktive Break-Glass-Events!');
  END IF;
  v_dimensions := v_dimensions || jsonb_build_object('key','security','title','Security & Governance','score',greatest(v_score,0),'max',10,'notes',v_notes);

  -- D10: Scalability
  v_score := 7; v_notes := '[]'::jsonb;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='processed_events') THEN
    v_score := v_score + 1;
    v_notes := v_notes || jsonb_build_object('severity','info','msg','processed_events Idempotenz-Guard vorhanden');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='funnel_events_v2' AND column_name='dedup_key') THEN
    v_score := v_score + 1;
  END IF;
  v_dimensions := v_dimensions || jsonb_build_object('key','scalability','title','Scalability','score',least(v_score,10),'max',10,'notes',v_notes);

  -- Overall
  SELECT round(avg((d->>'score')::numeric), 2) INTO v_overall FROM jsonb_array_elements(v_dimensions) AS d;

  INSERT INTO system_audit_reports (report_type, overall_score, findings, recommendations, created_by)
  VALUES ('live', v_overall, v_dimensions, '[]'::jsonb, auth.uid());

  RETURN jsonb_build_object(
    'overall_score', v_overall,
    'generated_at', now(),
    'dimensions', v_dimensions,
    'verdict', CASE
      WHEN v_overall >= 8 THEN 'HEALTHY'
      WHEN v_overall >= 6 THEN 'NEEDS ATTENTION'
      WHEN v_overall >= 4 THEN 'AT RISK'
      ELSE 'CRITICAL'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_system_audit() TO authenticated;