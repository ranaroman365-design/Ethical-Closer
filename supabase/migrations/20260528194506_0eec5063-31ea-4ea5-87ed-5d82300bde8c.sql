
-- ============================================================
-- SPRINT: 6 GAPS → GO-LIVE READY
-- ============================================================

-- ───── GAP 1 — Owner-Eskalations-Cron ─────
CREATE TABLE IF NOT EXISTS public.lead_owner_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  stage smallint NOT NULL CHECK (stage IN (1,2,3)),
  escalated_from_user_id uuid,
  escalated_to_user_id uuid,
  escalated_to_role text,
  trigger_reason text NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, stage)
);

GRANT SELECT, INSERT, UPDATE ON public.lead_owner_escalations TO authenticated;
GRANT ALL ON public.lead_owner_escalations TO service_role;
ALTER TABLE public.lead_owner_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see all escalations"
  ON public.lead_owner_escalations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops_admin'));

CREATE POLICY "Involved users see own escalations"
  ON public.lead_owner_escalations FOR SELECT TO authenticated
  USING (escalated_from_user_id = auth.uid() OR escalated_to_user_id = auth.uid());

CREATE POLICY "Admins insert escalations"
  ON public.lead_owner_escalations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops_admin'));

CREATE POLICY "Escalated user can resolve"
  ON public.lead_owner_escalations FOR UPDATE TO authenticated
  USING (escalated_to_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops_admin'));

CREATE INDEX IF NOT EXISTS idx_lead_owner_escalations_lead ON public.lead_owner_escalations(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_owner_escalations_unresolved ON public.lead_owner_escalations(resolved_at) WHERE resolved_at IS NULL;


-- ───── GAP 2 — No-Show Recovery +5min / +2h ─────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS recovery_5min_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovery_2h_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_appointments_recovery_pending
  ON public.appointments (no_show_detected_at)
  WHERE outcome = 'no_show' AND (recovery_5min_sent_at IS NULL OR recovery_2h_sent_at IS NULL);


-- ───── GAP 3 — Funnel-Separation Hard-Guard ─────
CREATE OR REPLACE FUNCTION public.funnel_separation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.outcome = 'no_show' AND COALESCE(OLD.outcome, '') <> 'no_show' THEN
    UPDATE public.communication_dispatch_log
       SET status = 'cancelled',
           error_message = COALESCE(error_message, '') || ' [funnel_guard: lead moved to no_show]'
     WHERE lead_id = NEW.lead_id
       AND status IN ('pending', 'scheduled', 'queued')
       AND (purpose ILIKE '%pre_call%' OR purpose ILIKE '%reminder%' OR event_key ILIKE '%pre_call%');

    INSERT INTO public.communication_dispatch_log (event_key, phase, purpose, lead_id, status, dedup_key, payload)
    VALUES (
      'funnel_separation_guard.no_show',
      'guard',
      'funnel_separation',
      NEW.lead_id,
      'sent',
      'funnel_guard:' || NEW.id::text,
      jsonb_build_object('appointment_id', NEW.id, 'triggered_at', now())
    )
    ON CONFLICT (dedup_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_funnel_separation_guard ON public.appointments;
CREATE TRIGGER trg_funnel_separation_guard
  AFTER UPDATE OF outcome ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.funnel_separation_guard();


-- ───── GAP 4 — Objection-Recovery Layer ─────
CREATE TABLE IF NOT EXISTS public.objection_recovery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  objection_code text NOT NULL CHECK (objection_code IN ('price','time','trust','partner','think_about_it','not_ready','other')),
  sequence_step smallint NOT NULL DEFAULT 1 CHECK (sequence_step BETWEEN 1 AND 3),
  next_action_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','converted')),
  triggered_by_user_id uuid,
  last_dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);

GRANT SELECT, INSERT, UPDATE ON public.objection_recovery_queue TO authenticated;
GRANT ALL ON public.objection_recovery_queue TO service_role;
ALTER TABLE public.objection_recovery_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see all objections"
  ON public.objection_recovery_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops_admin'));

CREATE POLICY "Closers see own lead objections"
  ON public.objection_recovery_queue FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.closer_id = auth.uid() OR l.setter_id = auth.uid() OR l.owner_id = auth.uid())));

CREATE POLICY "Closers insert objections for own leads"
  ON public.objection_recovery_queue FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.closer_id = auth.uid() OR l.setter_id = auth.uid() OR l.owner_id = auth.uid())));

CREATE POLICY "Owner roles update objections"
  ON public.objection_recovery_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops_admin')
         OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.closer_id = auth.uid() OR l.setter_id = auth.uid())));

CREATE INDEX IF NOT EXISTS idx_objection_recovery_due
  ON public.objection_recovery_queue (next_action_at)
  WHERE status = 'active';


-- ───── GAP 5 — Instant Combo-Trigger ─────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS combo_dispatched_at timestamptz;

ALTER TABLE public.ai_setter_settings
  ADD COLUMN IF NOT EXISTS instant_combo_enabled boolean NOT NULL DEFAULT false;


-- ───── GAP 6 — Tag-2 / Tag-4 Call-Tasks ─────
CREATE TABLE IF NOT EXISTS public.setter_call_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_user_id uuid,
  task_type text NOT NULL CHECK (task_type IN ('day2_call','day4_call')),
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','skipped','cancelled')),
  completed_at timestamptz,
  completed_by uuid,
  outcome_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, task_type)
);

GRANT SELECT, INSERT, UPDATE ON public.setter_call_tasks TO authenticated;
GRANT ALL ON public.setter_call_tasks TO service_role;
ALTER TABLE public.setter_call_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see all tasks"
  ON public.setter_call_tasks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops_admin'));

CREATE POLICY "Owners see own tasks"
  ON public.setter_call_tasks FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND (l.setter_id = auth.uid() OR l.owner_id = auth.uid())));

CREATE POLICY "Owners update own tasks"
  ON public.setter_call_tasks FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops_admin'));

CREATE POLICY "Admins insert tasks"
  ON public.setter_call_tasks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops_admin'));

CREATE INDEX IF NOT EXISTS idx_setter_call_tasks_due
  ON public.setter_call_tasks (scheduled_for)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_setter_call_tasks_owner
  ON public.setter_call_tasks (owner_user_id, status);


-- ───── Shared updated_at triggers ─────
DROP TRIGGER IF EXISTS trg_objection_recovery_updated ON public.objection_recovery_queue;
CREATE TRIGGER trg_objection_recovery_updated
  BEFORE UPDATE ON public.objection_recovery_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_setter_call_tasks_updated ON public.setter_call_tasks;
CREATE TRIGGER trg_setter_call_tasks_updated
  BEFORE UPDATE ON public.setter_call_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
