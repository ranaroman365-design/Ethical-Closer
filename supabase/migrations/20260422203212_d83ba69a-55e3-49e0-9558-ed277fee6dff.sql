CREATE OR REPLACE FUNCTION public.fn_appointment_to_funnel_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email   text;
  v_revenue numeric := 0;
BEGIN
  SELECT lower(l.email) INTO v_email FROM public.leads l WHERE l.id = NEW.lead_id;
  IF v_email IS NULL OR position('@' in v_email) < 2 THEN
    RETURN NEW;
  END IF;

  -- 1. call_booked (only on INSERT)
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.funnel_events_v2
      (lead_id, event_type, origin_email, "timestamp", revenue, metadata, dedup_key, source_system)
    VALUES
      (NEW.lead_id, 'call_booked', v_email, NEW.created_at, 0,
       jsonb_build_object('appointment_id', NEW.id, 'starts_at', NEW.starts_at,
                          'call_type', NEW.call_type, 'pricing_tier', NEW.pricing_tier),
       'appt:'||NEW.id::text||':booked', 'appointments_trigger')
    ON CONFLICT (dedup_key) DO NOTHING;
  END IF;

  -- 2. show_up
  IF (TG_OP = 'INSERT' OR
      COALESCE(OLD.attendance_flag,false) IS DISTINCT FROM COALESCE(NEW.attendance_flag,false) OR
      COALESCE(OLD.call_started_at,'epoch'::timestamptz) IS DISTINCT FROM COALESCE(NEW.call_started_at,'epoch'::timestamptz) OR
      COALESCE(OLD.call_status,'') IS DISTINCT FROM COALESCE(NEW.call_status,''))
     AND (NEW.attendance_flag = true
          OR NEW.call_started_at IS NOT NULL
          OR NEW.call_status IN ('completed','in_progress')) THEN
    INSERT INTO public.funnel_events_v2
      (lead_id, event_type, origin_email, "timestamp", revenue, metadata, dedup_key, source_system)
    VALUES
      (NEW.lead_id, 'show_up', v_email,
       COALESCE(NEW.call_started_at, NEW.starts_at, now()), 0,
       jsonb_build_object('appointment_id', NEW.id),
       'appt:'||NEW.id::text||':show', 'appointments_trigger')
    ON CONFLICT (dedup_key) DO NOTHING;
  END IF;

  -- 3. deal_won / deal_lost
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.outcome,'') IS DISTINCT FROM COALESCE(NEW.outcome,'') THEN
    IF NEW.outcome = 'won' THEN
      v_revenue := COALESCE(NEW.priority_price, 0);
      INSERT INTO public.funnel_events_v2
        (lead_id, event_type, origin_email, "timestamp", revenue, metadata, dedup_key, source_system)
      VALUES
        (NEW.lead_id, 'deal_won', v_email,
         COALESCE(NEW.call_completed_at, NEW.call_started_at, now()), v_revenue,
         jsonb_build_object('appointment_id', NEW.id, 'pricing_tier', NEW.pricing_tier),
         'appt:'||NEW.id::text||':won', 'appointments_trigger')
      ON CONFLICT (dedup_key) DO NOTHING;
    ELSIF NEW.outcome = 'lost' THEN
      INSERT INTO public.funnel_events_v2
        (lead_id, event_type, origin_email, "timestamp", revenue, metadata, dedup_key, source_system)
      VALUES
        (NEW.lead_id, 'deal_lost', v_email,
         COALESCE(NEW.call_completed_at, NEW.call_started_at, now()), 0,
         jsonb_build_object('appointment_id', NEW.id),
         'appt:'||NEW.id::text||':lost', 'appointments_trigger')
      ON CONFLICT (dedup_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_to_funnel_events ON public.appointments;
CREATE TRIGGER trg_appointment_to_funnel_events
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fn_appointment_to_funnel_events();

-- Backfill (idempotent via dedup_key)
INSERT INTO public.funnel_events_v2
  (lead_id, event_type, origin_email, "timestamp", revenue, metadata, dedup_key, source_system)
SELECT a.lead_id, 'call_booked', lower(l.email), a.created_at, 0,
       jsonb_build_object('appointment_id', a.id, 'starts_at', a.starts_at,
                          'call_type', a.call_type, 'pricing_tier', a.pricing_tier),
       'appt:'||a.id::text||':booked', 'appointments_backfill'
FROM public.appointments a
JOIN public.leads l ON l.id = a.lead_id
WHERE l.email IS NOT NULL AND position('@' in l.email) > 1
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO public.funnel_events_v2
  (lead_id, event_type, origin_email, "timestamp", revenue, metadata, dedup_key, source_system)
SELECT a.lead_id, 'show_up', lower(l.email),
       COALESCE(a.call_started_at, a.starts_at), 0,
       jsonb_build_object('appointment_id', a.id),
       'appt:'||a.id::text||':show', 'appointments_backfill'
FROM public.appointments a
JOIN public.leads l ON l.id = a.lead_id
WHERE (a.attendance_flag = true OR a.call_started_at IS NOT NULL OR a.call_status IN ('completed','in_progress'))
  AND l.email IS NOT NULL AND position('@' in l.email) > 1
ON CONFLICT (dedup_key) DO NOTHING;

INSERT INTO public.funnel_events_v2
  (lead_id, event_type, origin_email, "timestamp", revenue, metadata, dedup_key, source_system)
SELECT a.lead_id,
       CASE WHEN a.outcome = 'won' THEN 'deal_won' ELSE 'deal_lost' END,
       lower(l.email),
       COALESCE(a.call_completed_at, a.call_started_at, a.starts_at),
       CASE WHEN a.outcome = 'won' THEN COALESCE(a.priority_price, 0) ELSE 0 END,
       jsonb_build_object('appointment_id', a.id, 'pricing_tier', a.pricing_tier),
       'appt:'||a.id::text||':'||a.outcome,
       'appointments_backfill'
FROM public.appointments a
JOIN public.leads l ON l.id = a.lead_id
WHERE a.outcome IN ('won','lost')
  AND l.email IS NOT NULL AND position('@' in l.email) > 1
ON CONFLICT (dedup_key) DO NOTHING;