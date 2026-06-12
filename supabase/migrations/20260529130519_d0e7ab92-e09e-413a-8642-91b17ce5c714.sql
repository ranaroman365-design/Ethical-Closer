
-- ─────────────────────────────────────────────────────────────
-- P0-1: Dedup-Cleanup + Unique Index on communication_dispatch_log
-- ─────────────────────────────────────────────────────────────

-- Null out older duplicate dedup_keys (keep newest by id)
WITH dups AS (
  SELECT id, dedup_key,
    ROW_NUMBER() OVER (PARTITION BY dedup_key ORDER BY created_at DESC NULLS LAST, id DESC) AS rn
  FROM public.communication_dispatch_log
  WHERE dedup_key IS NOT NULL
)
UPDATE public.communication_dispatch_log c
SET dedup_key = NULL
FROM dups
WHERE c.id = dups.id AND dups.rn > 1;

-- Partial unique index (only enforce on non-null dedup_keys)
CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_log_dedup_key
  ON public.communication_dispatch_log(dedup_key)
  WHERE dedup_key IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- P1-6: Recovery pause controls on leads
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS recovery_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_paused_by uuid,
  ADD COLUMN IF NOT EXISTS recovery_pause_reason text;

CREATE INDEX IF NOT EXISTS idx_leads_recovery_paused
  ON public.leads(recovery_paused_at)
  WHERE recovery_paused_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- P1-5: Objection recovery queue — allow re-open after completed
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.objection_recovery_queue'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%(lead_id)%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.objection_recovery_queue DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

DROP INDEX IF EXISTS public.objection_recovery_queue_lead_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_objection_queue_active_lead
  ON public.objection_recovery_queue(lead_id)
  WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────
-- P0-3: Canonical should_dispatch consent/suppression guard
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.should_dispatch(
  _lead_id uuid,
  _channel text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
BEGIN
  SELECT id, email, phone,
         do_not_contact,
         suppressed_at,
         unsubscribed_at,
         whatsapp_unresponsive,
         consent_phone,
         recovery_paused_at,
         conversion_state
  INTO v_lead
  FROM public.leads
  WHERE id = _lead_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Global blocks
  IF v_lead.do_not_contact IS TRUE THEN RETURN false; END IF;
  IF v_lead.suppressed_at IS NOT NULL THEN RETURN false; END IF;
  IF v_lead.unsubscribed_at IS NOT NULL THEN RETURN false; END IF;
  IF v_lead.recovery_paused_at IS NOT NULL THEN RETURN false; END IF;
  IF v_lead.conversion_state IN ('closed_won','closed_lost','unresponsive') THEN
    RETURN false;
  END IF;

  -- Channel-specific
  IF _channel IN ('sms','whatsapp','call','voice') THEN
    IF v_lead.phone IS NULL OR v_lead.phone = '' THEN RETURN false; END IF;
    IF v_lead.consent_phone IS FALSE THEN RETURN false; END IF;
    IF _channel = 'whatsapp' AND v_lead.whatsapp_unresponsive IS TRUE THEN
      RETURN false;
    END IF;
    IF _channel IN ('sms','call','voice','whatsapp') AND EXISTS (
      SELECT 1 FROM public.user_consents
      WHERE lead_id = _lead_id AND channel = _channel AND consent_given = false
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF _channel = 'email' THEN
    IF v_lead.email IS NULL OR v_lead.email = '' THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM public.suppressed_emails WHERE email = v_lead.email) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.should_dispatch(uuid, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- P0-2: Owner-escalation candidates (safe server-side filter)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_escalation_candidates(
  _max_age_hours int DEFAULT 48
) RETURNS TABLE (
  lead_id uuid,
  owner_id uuid,
  setter_id uuid,
  created_at timestamptz,
  age_minutes int,
  conversion_state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.owner_id,
    l.setter_id,
    l.created_at,
    EXTRACT(EPOCH FROM (now() - l.created_at))::int / 60,
    l.conversion_state::text
  FROM public.leads l
  WHERE l.first_action_at IS NULL
    AND l.created_at <= now() - interval '4 hours'
    AND l.created_at >= now() - (_max_age_hours || ' hours')::interval
    AND l.conversion_state NOT IN ('closed_won','closed_lost','unresponsive')
    AND l.recovery_paused_at IS NULL
    AND l.do_not_contact IS NOT TRUE
    AND l.suppressed_at IS NULL
  ORDER BY l.created_at ASC
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.get_escalation_candidates(int) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- P1-3: Auto-enqueue setter_call_tasks on no-show
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_enqueue_setter_call_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.outcome = 'no_show'
     AND (OLD.outcome IS DISTINCT FROM NEW.outcome)
     AND NEW.lead_id IS NOT NULL THEN

    IF NOT EXISTS (
      SELECT 1 FROM public.setter_call_tasks
      WHERE appointment_id = NEW.id AND status IN ('open','in_progress')
    ) THEN
      INSERT INTO public.setter_call_tasks (
        appointment_id, lead_id, setter_id, task_type, status, due_at
      ) VALUES (
        NEW.id, NEW.lead_id, NEW.setter_id, 'no_show_followup', 'open',
        now() + interval '2 hours'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_setter_call_task_no_show ON public.appointments;
CREATE TRIGGER trg_enqueue_setter_call_task_no_show
  AFTER UPDATE OF outcome ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enqueue_setter_call_task();

-- Documentation
COMMENT ON FUNCTION public.should_dispatch(uuid, text) IS
  'Layer 55 canonical consent/suppression guard. MUST be called before any dispatch insert.';
COMMENT ON FUNCTION public.get_escalation_candidates(int) IS
  'Layer 55 canonical escalation candidate filter — excludes terminal states + paused leads server-side.';
COMMENT ON INDEX public.ux_dispatch_log_dedup_key IS
  'Layer 55 P0 fix — enforces dedup_key uniqueness for ON CONFLICT in funnel_separation_guard.';
