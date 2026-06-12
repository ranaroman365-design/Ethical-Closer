
-- 1. Create follow_ups table (needed by mark-no-show-and-recover Stage 3)
CREATE TABLE IF NOT EXISTS public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'call_task',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  notes TEXT,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own follow_ups"
  ON public.follow_ups FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own follow_ups"
  ON public.follow_ups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own follow_ups"
  ON public.follow_ups FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to follow_ups"
  ON public.follow_ups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Auto-generate call tasks in daily_tasks when Day 2 / Day 3 touchpoints fire
CREATE OR REPLACE FUNCTION public.generate_call_task_on_touchpoint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
  v_owner_id UUID;
  v_task_title TEXT;
  v_task_desc TEXT;
  v_due DATE;
  v_priority INT;
BEGIN
  -- Only act on Day 2 (TP6) and Day 3/4 (TP7) touchpoints going to sent status
  IF NEW.touchpoint_code NOT IN ('TP6_DAY_2', 'TP7_DAY_3_FINAL') THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('sent_stub', 'sent') THEN
    RETURN NEW;
  END IF;
  -- Skip if old status was already sent
  IF OLD.status IN ('sent_stub', 'sent') THEN
    RETURN NEW;
  END IF;

  -- Get lead info
  SELECT id, name, email, phone, owner_id
    INTO v_lead
    FROM leads
    WHERE id = NEW.lead_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_owner_id := v_lead.owner_id;
  -- If no owner, skip (no one to assign to)
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.touchpoint_code = 'TP6_DAY_2' THEN
    v_task_title := 'Anruf: ' || COALESCE(split_part(v_lead.name, ' ', 1), v_lead.email);
    v_task_desc := 'Tag 2 Follow-up: Lead hat noch nicht gebucht. Bitte anrufen und Termin vereinbaren. Tel: ' || COALESCE(v_lead.phone, 'k.A.');
    v_due := CURRENT_DATE;
    v_priority := 2; -- high
  ELSIF NEW.touchpoint_code = 'TP7_DAY_3_FINAL' THEN
    v_task_title := 'Finaler Anruf: ' || COALESCE(split_part(v_lead.name, ' ', 1), v_lead.email);
    v_task_desc := 'Tag 3/4 letzter Versuch: Lead hat nach mehreren Touchpoints nicht gebucht. Letzter Anruf. Tel: ' || COALESCE(v_lead.phone, 'k.A.');
    v_due := CURRENT_DATE;
    v_priority := 1; -- critical
  END IF;

  -- Idempotency: don't duplicate
  IF EXISTS (
    SELECT 1 FROM daily_tasks
    WHERE related_id = NEW.lead_id
      AND related_table = 'leads'
      AND task_type = 'call_task'
      AND task_title = v_task_title
      AND task_status = 'pending'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO daily_tasks (
    user_id, role, task_type, task_title, task_description,
    task_status, priority, due_date, related_id, related_table
  ) VALUES (
    v_owner_id, 'member', 'call_task', v_task_title, v_task_desc,
    'pending', v_priority, v_due, NEW.lead_id, 'leads'
  );

  RETURN NEW;
END;
$$;

-- Trigger on lead_activation_jobs status update
DROP TRIGGER IF EXISTS trg_call_task_on_touchpoint ON public.lead_activation_jobs;
CREATE TRIGGER trg_call_task_on_touchpoint
  AFTER UPDATE OF status ON public.lead_activation_jobs
  FOR EACH ROW
  WHEN (NEW.status IN ('sent_stub', 'sent'))
  EXECUTE FUNCTION public.generate_call_task_on_touchpoint();

-- 3. Auto-generate call task when No-Show Stage 3 attendance event is logged
CREATE OR REPLACE FUNCTION public.generate_call_task_for_no_show()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt RECORD;
  v_lead RECORD;
  v_task_title TEXT;
BEGIN
  -- Only for no_show_recovery_stage_3 events
  IF NEW.event_type <> 'no_show_recovery_stage_3' THEN
    RETURN NEW;
  END IF;

  -- Get appointment + setter
  SELECT a.id, a.setter_id, a.lead_id
    INTO v_appt
    FROM appointments a
    WHERE a.id = NEW.appointment_id;

  IF NOT FOUND OR v_appt.setter_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, name, email, phone INTO v_lead
    FROM leads WHERE id = v_appt.lead_id;

  v_task_title := 'No-Show Anruf: ' || COALESCE(split_part(v_lead.name, ' ', 1), v_lead.email);

  -- Idempotency
  IF EXISTS (
    SELECT 1 FROM daily_tasks
    WHERE related_id = v_appt.lead_id
      AND task_type = 'call_task'
      AND task_title = v_task_title
      AND task_status = 'pending'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO daily_tasks (
    user_id, role, task_type, task_title, task_description,
    task_status, priority, due_date, related_id, related_table
  ) VALUES (
    v_appt.setter_id, 'member', 'call_task', v_task_title,
    'No-Show Recovery: Termin verpasst. Bitte anrufen und neuen Termin vereinbaren. Tel: ' || COALESCE(v_lead.phone, 'k.A.'),
    'pending', 1, CURRENT_DATE, v_appt.lead_id, 'leads'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_task_on_no_show ON public.attendance_events;
CREATE TRIGGER trg_call_task_on_no_show
  AFTER INSERT ON public.attendance_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'no_show_recovery_stage_3')
  EXECUTE FUNCTION public.generate_call_task_for_no_show();
