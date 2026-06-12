
-- =========================================================================
-- ETC FUNNEL EVENT TRUTH LAYER
-- Canonical events: booked | showed | closed_won
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS event_logs_canonical_idem_uidx
  ON public.event_logs (event_name, ((payload->>'idempotency_key')))
  WHERE event_name IN ('booked','showed','closed_won')
    AND payload ? 'idempotency_key';

CREATE INDEX IF NOT EXISTS event_logs_canonical_lookup_idx
  ON public.event_logs (event_name, created_at)
  WHERE event_name IN ('booked','showed','closed_won');

-- Helper: idempotent canonical emitter (uses NOT EXISTS guard, safe for partial idx)
CREATE OR REPLACE FUNCTION public.emit_canonical_funnel_event(
  p_event_name text,
  p_ref_type   text,
  p_ref_id     uuid,
  p_email      text,
  p_payload    jsonb DEFAULT '{}'::jsonb,
  p_created_at timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idem text := p_ref_type || ':' || p_ref_id::text;
BEGIN
  IF p_event_name NOT IN ('booked','showed','closed_won') THEN
    RAISE EXCEPTION 'invalid canonical event %', p_event_name;
  END IF;

  INSERT INTO public.event_logs (event_name, email, payload, status, created_at)
  SELECT
    p_event_name,
    p_email,
    p_payload || jsonb_build_object(
      'idempotency_key', v_idem,
      'ref_type', p_ref_type,
      'ref_id', p_ref_id,
      'canonical', true,
      'source', 'trigger'
    ),
    'received',
    p_created_at
  WHERE NOT EXISTS (
    SELECT 1 FROM public.event_logs
    WHERE event_name = p_event_name
      AND payload->>'idempotency_key' = v_idem
  );
END;
$$;

-- 3a) BOOKED on appointment INSERT
CREATE OR REPLACE FUNCTION public.tg_emit_booked_on_appointment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  SELECT l.email INTO v_email FROM public.leads l WHERE l.id = NEW.lead_id;
  PERFORM public.emit_canonical_funnel_event(
    'booked','appointment',NEW.id,v_email,
    jsonb_build_object(
      'lead_id',NEW.lead_id,'setter_id',NEW.setter_id,
      'starts_at',NEW.starts_at,'call_type',NEW.call_type,
      'booking_source',NEW.booking_source
    ),
    COALESCE(NEW.created_at, now())
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_emit_booked ON public.appointments;
CREATE TRIGGER trg_emit_booked
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_booked_on_appointment_insert();

-- 3b) SHOWED on appointment UPDATE
CREATE OR REPLACE FUNCTION public.tg_emit_showed_on_appointment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text; v_now boolean; v_was boolean;
BEGIN
  v_now := COALESCE(NEW.attendance_flag,false) OR NEW.call_completed_at IS NOT NULL;
  v_was := COALESCE(OLD.attendance_flag,false) OR OLD.call_completed_at IS NOT NULL;
  IF v_now AND NOT v_was THEN
    SELECT l.email INTO v_email FROM public.leads l WHERE l.id = NEW.lead_id;
    PERFORM public.emit_canonical_funnel_event(
      'showed','appointment',NEW.id,v_email,
      jsonb_build_object(
        'lead_id',NEW.lead_id,'setter_id',NEW.setter_id,
        'call_completed_at',NEW.call_completed_at,
        'attendance_flag',NEW.attendance_flag
      ),
      COALESCE(NEW.call_completed_at, now())
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_emit_showed ON public.appointments;
CREATE TRIGGER trg_emit_showed
AFTER UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_showed_on_appointment_update();

-- 3c) CLOSED_WON on call INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.tg_emit_closed_won_on_call()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF NEW.result = 'won' AND (TG_OP = 'INSERT' OR COALESCE(OLD.result,'') <> 'won') THEN
    SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = NEW.user_id;
    PERFORM public.emit_canonical_funnel_event(
      'closed_won','call',NEW.id,v_email,
      jsonb_build_object(
        'user_id',NEW.user_id,'revenue',NEW.revenue,
        'deal_size',NEW.deal_size,'closed_at',NEW.closed_at,
        'pipeline_id',NEW.pipeline_id
      ),
      COALESCE(NEW.closed_at, NEW.created_at, now())
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_emit_closed_won ON public.calls;
CREATE TRIGGER trg_emit_closed_won
AFTER INSERT OR UPDATE OF result ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.tg_emit_closed_won_on_call();

-- =========================================================================
-- BACKFILL last 90 days
-- =========================================================================

-- booked
INSERT INTO public.event_logs (event_name, email, payload, status, created_at)
SELECT 'booked', l.email,
  jsonb_build_object(
    'idempotency_key','appointment:'||a.id::text,
    'ref_type','appointment','ref_id',a.id,
    'lead_id',a.lead_id,'setter_id',a.setter_id,
    'starts_at',a.starts_at,'call_type',a.call_type,
    'booking_source',a.booking_source,
    'canonical',true,'source','backfill'
  ),
  'received', a.created_at
FROM public.appointments a
LEFT JOIN public.leads l ON l.id = a.lead_id
WHERE a.created_at > now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_logs e
    WHERE e.event_name='booked'
      AND e.payload->>'idempotency_key' = 'appointment:'||a.id::text
  );

-- showed
INSERT INTO public.event_logs (event_name, email, payload, status, created_at)
SELECT 'showed', l.email,
  jsonb_build_object(
    'idempotency_key','appointment:'||a.id::text,
    'ref_type','appointment','ref_id',a.id,
    'lead_id',a.lead_id,'setter_id',a.setter_id,
    'call_completed_at',a.call_completed_at,
    'attendance_flag',a.attendance_flag,
    'canonical',true,'source','backfill'
  ),
  'received', COALESCE(a.call_completed_at, a.created_at)
FROM public.appointments a
LEFT JOIN public.leads l ON l.id = a.lead_id
WHERE (a.attendance_flag = true OR a.call_completed_at IS NOT NULL)
  AND COALESCE(a.call_completed_at, a.created_at) > now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_logs e
    WHERE e.event_name='showed'
      AND e.payload->>'idempotency_key' = 'appointment:'||a.id::text
  );

-- closed_won
INSERT INTO public.event_logs (event_name, email, payload, status, created_at)
SELECT 'closed_won', p.email,
  jsonb_build_object(
    'idempotency_key','call:'||c.id::text,
    'ref_type','call','ref_id',c.id,
    'user_id',c.user_id,'revenue',c.revenue,
    'deal_size',c.deal_size,'closed_at',c.closed_at,
    'pipeline_id',c.pipeline_id,
    'canonical',true,'source','backfill'
  ),
  'received', COALESCE(c.closed_at, c.created_at)
FROM public.calls c
LEFT JOIN public.profiles p ON p.id = c.user_id
WHERE c.result = 'won'
  AND COALESCE(c.closed_at, c.created_at) > now() - interval '90 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_logs e
    WHERE e.event_name='closed_won'
      AND e.payload->>'idempotency_key' = 'call:'||c.id::text
  );
