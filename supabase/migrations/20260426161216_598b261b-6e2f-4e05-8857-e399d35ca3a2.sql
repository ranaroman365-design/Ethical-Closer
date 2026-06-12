-- ============================================================
-- TASK 3: Activate lead_assignments trail (idempotent)
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS lead_assignments_unique_active
  ON public.lead_assignments (lead_id, user_id, lead_type);

CREATE OR REPLACE FUNCTION public.log_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.setter_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.setter_id IS DISTINCT FROM OLD.setter_id) THEN
    INSERT INTO public.lead_assignments (lead_id, user_id, lead_type, status, assigned_at)
    VALUES (NEW.id, NEW.setter_id, 'setter', 'assigned', now())
    ON CONFLICT (lead_id, user_id, lead_type) DO NOTHING;
  END IF;

  IF NEW.closer_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.closer_id IS DISTINCT FROM OLD.closer_id) THEN
    INSERT INTO public.lead_assignments (lead_id, user_id, lead_type, status, assigned_at)
    VALUES (NEW.id, NEW.closer_id, 'closer', 'assigned', now())
    ON CONFLICT (lead_id, user_id, lead_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_lead_assignment ON public.leads;
CREATE TRIGGER trg_log_lead_assignment
AFTER INSERT OR UPDATE OF setter_id, closer_id ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.log_lead_assignment();

-- One-time backfill
INSERT INTO public.lead_assignments (lead_id, user_id, lead_type, status, assigned_at)
SELECT id, setter_id, 'setter', 'assigned', COALESCE(updated_at, created_at, now())
FROM public.leads
WHERE setter_id IS NOT NULL
ON CONFLICT (lead_id, user_id, lead_type) DO NOTHING;

INSERT INTO public.lead_assignments (lead_id, user_id, lead_type, status, assigned_at)
SELECT id, closer_id, 'closer', 'assigned', COALESCE(updated_at, created_at, now())
FROM public.leads
WHERE closer_id IS NOT NULL
ON CONFLICT (lead_id, user_id, lead_type) DO NOTHING;

-- ============================================================
-- TASK 2: Enforce outcome before call completion (48h fallback)
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_call_outcome_before_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_outcome_exists boolean;
  v_age_hours numeric;
BEGIN
  IF NEW.status NOT IN ('completed', 'closed') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_simulation, false) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.call_outcomes WHERE call_id = NEW.id) INTO v_outcome_exists;
  IF v_outcome_exists THEN
    RETURN NEW;
  END IF;

  v_age_hours := EXTRACT(EPOCH FROM (now() - COALESCE(NEW.created_at, now()))) / 3600.0;
  IF v_age_hours >= 48 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'CALL_OUTCOME_REQUIRED: cannot mark call % as completed without a call_outcomes row (age %.1fh < 48h fallback)', NEW.id, v_age_hours
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_call_outcome ON public.calls;
CREATE TRIGGER trg_enforce_call_outcome
BEFORE UPDATE OF status ON public.calls
FOR EACH ROW
EXECUTE FUNCTION public.enforce_call_outcome_before_completion();