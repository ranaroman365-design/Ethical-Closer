
-- Talent OS Audit Log
CREATE TABLE public.talent_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'score_computed','flag_created','flag_resolved',
    'action_created','action_updated','action_resolved',
    'diagnostic_changed'
  )),
  event_key text,
  old_value jsonb,
  new_value jsonb,
  triggered_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_talent_audit_user ON public.talent_audit_log(user_id, created_at DESC);
CREATE INDEX idx_talent_audit_type ON public.talent_audit_log(event_type, created_at DESC);

ALTER TABLE public.talent_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins see all
CREATE POLICY "Admins read all audit logs"
ON public.talent_audit_log FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- L6+ see team audit logs
CREATE POLICY "L6 team reads audit logs"
ON public.talent_audit_log FOR SELECT
USING (
  public.is_operator_l6plus(auth.uid())
  AND public.is_in_team_scope(user_id, auth.uid())
);

-- System insert only (no direct user inserts)
CREATE POLICY "System inserts audit logs"
ON public.talent_audit_log FOR INSERT
WITH CHECK (true);

-- Trigger: talent_flags → audit log
CREATE OR REPLACE FUNCTION public.trg_talent_flag_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO talent_audit_log(user_id, event_type, event_key, new_value, triggered_by)
    VALUES (NEW.user_id, 'flag_created', NEW.flag_key,
      jsonb_build_object('flag_type', NEW.flag_type, 'title', NEW.title, 'details', NEW.details),
      NULL);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.resolved_at IS NOT NULL AND OLD.resolved_at IS NULL THEN
    INSERT INTO talent_audit_log(user_id, event_type, event_key, old_value, new_value)
    VALUES (NEW.user_id, 'flag_resolved', NEW.flag_key,
      jsonb_build_object('title', OLD.title),
      jsonb_build_object('resolved_at', NEW.resolved_at));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER talent_flag_audit_trigger
AFTER INSERT OR UPDATE ON public.talent_flags
FOR EACH ROW EXECUTE FUNCTION public.trg_talent_flag_audit();

-- Trigger: talent_actions → audit log
CREATE OR REPLACE FUNCTION public.trg_talent_action_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO talent_audit_log(user_id, event_type, event_key, new_value, triggered_by, note)
    VALUES (NEW.user_id, 'action_created', NEW.action_type,
      jsonb_build_object('title', NEW.title, 'description', NEW.description, 'status', NEW.status, 'due_date', NEW.due_date),
      NEW.created_by, NEW.title);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('completed','dismissed') AND OLD.status NOT IN ('completed','dismissed') THEN
      INSERT INTO talent_audit_log(user_id, event_type, event_key, old_value, new_value)
      VALUES (NEW.user_id, 'action_resolved', NEW.action_type,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status, 'resolved_at', NEW.resolved_at));
    ELSE
      INSERT INTO talent_audit_log(user_id, event_type, event_key, old_value, new_value)
      VALUES (NEW.user_id, 'action_updated', NEW.action_type,
        jsonb_build_object('status', OLD.status, 'title', OLD.title),
        jsonb_build_object('status', NEW.status, 'title', NEW.title));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER talent_action_audit_trigger
AFTER INSERT OR UPDATE ON public.talent_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_talent_action_audit();
