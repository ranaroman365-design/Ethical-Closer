DO $$
DECLARE
  v_batch text := 'sim_2026_04_23';
  v_setter uuid := '799c768e-8956-45b0-8f21-61aece8748cb';
  v_closer uuid := '834ad989-1cf6-4dc1-8527-192adc613451';
  v_offer_id uuid;
  v_lead_id uuid;
  v_appt_id uuid;
  v_call_id uuid;
  i int;
  v_intent text;
  v_score int;
  v_complete_quiz bool;
  v_book bool;
  v_show bool;
  v_won bool;
  v_revenue numeric;
  v_starts timestamptz;
BEGIN
  SELECT id INTO v_offer_id FROM monetization_offers WHERE offer_key='booster' LIMIT 1;

  FOR i IN 1..100 LOOP
    IF i <= 25 THEN v_intent := 'high'; v_score := 70 + (random()*30)::int;
    ELSIF i <= 65 THEN v_intent := 'medium'; v_score := 40 + (random()*30)::int;
    ELSE v_intent := 'low'; v_score := 10 + (random()*30)::int;
    END IF;

    v_complete_quiz := (random() < 0.60);
    v_book := v_complete_quiz AND (random() < 0.50);
    v_show := v_book AND (random() < 0.60);
    v_won := v_show AND (random() < 0.30);

    INSERT INTO leads (name, email, phone, source, stage, is_simulation, simulation_batch_id,
      lead_score, lead_quality, quiz_funnel_source, qualification_checklist)
    VALUES ('Sim User '||i, 'testuser+'||i||'@test.com', '+49170000'||lpad(i::text,4,'0'),
      'qa_simulation', 'new', true, v_batch, v_score,
      CASE WHEN v_score>=70 THEN 'A' WHEN v_score>=40 THEN 'B' ELSE 'C' END,
      'closing', jsonb_build_object('intent', v_intent))
    RETURNING id INTO v_lead_id;

    INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, email, event_source, metadata)
    VALUES (v_lead_id, 'lead_created', 'testuser+'||i||'@test.com', 'testuser+'||i||'@test.com', 'simulation',
            jsonb_build_object('batch', v_batch, 'intent', v_intent));

    IF v_complete_quiz THEN
      UPDATE leads SET stage='quiz_completed', quiz_score=v_score,
        quiz_result=CASE WHEN v_score>=70 THEN 'high' WHEN v_score>=40 THEN 'mid' ELSE 'low' END,
        quiz_answers=jsonb_build_object('answered', true, 'score', v_score)
      WHERE id=v_lead_id;
      INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, email, event_source, metadata)
      VALUES (v_lead_id, 'quiz_completed', 'testuser+'||i||'@test.com', 'testuser+'||i||'@test.com', 'simulation',
              jsonb_build_object('batch', v_batch, 'score', v_score));
    END IF;

    IF v_book THEN
      v_starts := now() - (random()*7 || ' days')::interval + (random()*8 || ' hours')::interval;
      INSERT INTO appointments (lead_id, call_type, appointment_status, starts_at, ends_at,
        setter_id, booking_source, payment_status, call_status, origin_source)
      VALUES (v_lead_id, 'standard', 'booked', v_starts, v_starts + interval '45 minutes',
        v_setter, 'simulation', 'none', 'scheduled', 'qa_sim')
      RETURNING id INTO v_appt_id;

      UPDATE leads SET stage='booked', has_booking=true, booking_id=v_appt_id, appointment_date=v_starts WHERE id=v_lead_id;
      INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, email, event_source, metadata)
      VALUES (v_lead_id, 'call_booked', 'testuser+'||i||'@test.com', 'testuser+'||i||'@test.com', 'simulation',
              jsonb_build_object('batch', v_batch, 'appointment_id', v_appt_id));
      INSERT INTO event_logs (event_name, payload, status)
      VALUES ('booked', jsonb_build_object('lead_id', v_lead_id, 'appointment_id', v_appt_id, 'idempotency_key', 'sim_'||v_appt_id), 'logged');

      UPDATE leads SET stage='in_pool' WHERE id=v_lead_id;
      UPDATE leads SET stage='assigned_setter', setter_id=v_setter WHERE id=v_lead_id;
      UPDATE leads SET stage='setter_contacting' WHERE id=v_lead_id;
      UPDATE leads SET stage='setter_qualified' WHERE id=v_lead_id;
      UPDATE leads SET stage='ready_for_closer' WHERE id=v_lead_id;
      UPDATE leads SET stage='assigned_closer', closer_id=v_closer WHERE id=v_lead_id;

      IF v_show THEN
        v_revenue := CASE WHEN v_won THEN 1600 + (random()*4000)::int ELSE 0 END;
        UPDATE leads SET stage='closer_in_progress' WHERE id=v_lead_id;
        UPDATE leads SET stage='offer_made' WHERE id=v_lead_id;

        INSERT INTO calls (user_id, call_type, offer_type, funnel_stage, status,
          booked_at, scheduled_for, showed_at, closed_at,
          result, revenue, deal_size, price_point, is_simulation, simulation_batch_id)
        VALUES (v_lead_id, 'closer', 'high_ticket', v_batch,
          CASE WHEN v_won THEN 'closed_won' ELSE 'closed_lost' END,
          v_starts - interval '1 day', v_starts,
          v_starts + interval '2 minutes', v_starts + interval '50 minutes',
          CASE WHEN v_won THEN 'won' ELSE 'lost' END,
          v_revenue, v_revenue, 1600, false, v_batch)
        RETURNING id INTO v_call_id;

        UPDATE appointments SET attendance_flag=true, call_status='completed',
          call_completed_at=v_starts + interval '50 minutes',
          completed_at=v_starts + interval '50 minutes',
          outcome='attended', appointment_status='completed'
        WHERE id=v_appt_id;

        INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, email, event_source, metadata)
        VALUES (v_lead_id, 'show_up', 'testuser+'||i||'@test.com', 'testuser+'||i||'@test.com', 'simulation',
                jsonb_build_object('batch', v_batch));
        INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, email, revenue, event_source, metadata)
        VALUES (v_lead_id, 'offer_made', 'testuser+'||i||'@test.com', 'testuser+'||i||'@test.com', v_revenue, 'simulation',
                jsonb_build_object('batch', v_batch, 'call_id', v_call_id));

        IF v_won THEN
          UPDATE leads SET stage='closed_won', deal_value=v_revenue, outcome='won', closed_at=now() WHERE id=v_lead_id;
          INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, email, revenue, event_source, metadata)
          VALUES (v_lead_id, 'deal_won', 'testuser+'||i||'@test.com', 'testuser+'||i||'@test.com', v_revenue, 'simulation',
                  jsonb_build_object('batch', v_batch));
          INSERT INTO trigger_log (user_id, trigger_type, offer_key, accepted, accepted_at, context)
          VALUES (v_lead_id, 'post_purchase_upgrade', 'booster', true, now(), 'simulation');
          IF v_offer_id IS NOT NULL THEN
            INSERT INTO offer_impressions (user_id, offer_id, action, context)
            VALUES (v_lead_id, v_offer_id, 'shown', 'sim_post_purchase'),
                   (v_lead_id, v_offer_id, 'clicked', 'sim_post_purchase'),
                   (v_lead_id, v_offer_id, 'converted', 'sim_post_purchase');
          END IF;
        ELSE
          UPDATE leads SET stage='closed_lost', outcome='lost', closed_at=now() WHERE id=v_lead_id;
          INSERT INTO funnel_events_v2 (lead_id, event_type, origin_email, email, event_source, metadata)
          VALUES (v_lead_id, 'deal_lost', 'testuser+'||i||'@test.com', 'testuser+'||i||'@test.com', 'simulation',
                  jsonb_build_object('batch', v_batch));
        END IF;
      ELSE
        UPDATE appointments SET attendance_flag=false, call_status='no_show',
          no_show_detected_at=now(), appointment_status='no_show', outcome='no_show'
        WHERE id=v_appt_id;
        UPDATE leads SET stage='returned_to_pool' WHERE id=v_lead_id;
      END IF;
    END IF;

    INSERT INTO audit_logs (action, source_type, note, metadata)
    VALUES ('sim_lead_processed', 'simulation', 'Sim user '||i||' intent='||v_intent,
            jsonb_build_object('batch', v_batch, 'lead_id', v_lead_id));
  END LOOP;
END$$;