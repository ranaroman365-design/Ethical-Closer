-- ============================================================================
-- WhatsApp Admin Alert System (L6+) — schema, RLS, settings, triggers
-- ============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. attendance_settings: add WA alert config
ALTER TABLE public.attendance_settings
  ADD COLUMN IF NOT EXISTS whatsapp_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hot_lead_threshold INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS high_value_threshold INTEGER NOT NULL DEFAULT 16;

-- 2. admin_alert_recipients
CREATE TABLE IF NOT EXISTS public.admin_alert_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE,
  whatsapp_e164   TEXT NOT NULL,
  events_enabled  TEXT[] NOT NULL DEFAULT ARRAY['HOT_LEAD','BOOKED_CALL','NO_SHOW','HIGH_VALUE_LEAD']::TEXT[],
  quiet_hours_start SMALLINT,           -- hour 0-23, NULL = no quiet hours
  quiet_hours_end   SMALLINT,
  timezone        TEXT NOT NULL DEFAULT 'Europe/Berlin',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_alert_recipients_qh_range CHECK (
    (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
    OR (quiet_hours_start BETWEEN 0 AND 23 AND quiet_hours_end BETWEEN 0 AND 23)
  ),
  CONSTRAINT admin_alert_recipients_phone_format CHECK (whatsapp_e164 ~ '^\+[1-9][0-9]{6,14}$')
);
CREATE INDEX IF NOT EXISTS idx_admin_alert_recipients_active ON public.admin_alert_recipients(active) WHERE active = TRUE;

ALTER TABLE public.admin_alert_recipients ENABLE ROW LEVEL SECURITY;

-- Helper: is_admin via existing has_role (admin/owner/administrator)
CREATE POLICY "alert_recipients_self_select" ON public.admin_alert_recipients
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator'));

CREATE POLICY "alert_recipients_self_insert" ON public.admin_alert_recipients
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "alert_recipients_self_update" ON public.admin_alert_recipients
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "alert_recipients_self_delete" ON public.admin_alert_recipients
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER admin_alert_recipients_updated_at
  BEFORE UPDATE ON public.admin_alert_recipients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. admin_alert_log
CREATE TABLE IF NOT EXISTS public.admin_alert_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL,        -- HOT_LEAD | BOOKED_CALL | NO_SHOW | HIGH_VALUE_LEAD
  lead_id         UUID,
  appointment_id  UUID,
  recipient_user_id UUID NOT NULL,
  to_whatsapp     TEXT NOT NULL,
  body            TEXT NOT NULL,
  action_token    TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  twilio_sid      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed|stub|skipped
  skip_reason     TEXT,
  replied_action  TEXT,
  replied_at      TIMESTAMPTZ,
  payload         JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_alert_log_event ON public.admin_alert_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alert_log_recipient ON public.admin_alert_log(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alert_log_action_token ON public.admin_alert_log(action_token);

ALTER TABLE public.admin_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_log_self_or_admin_select" ON public.admin_alert_log
  FOR SELECT TO authenticated
  USING (auth.uid() = recipient_user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'administrator'));

-- writes only via service role / edge fn — no insert/update/delete policies for users

-- 4. lead_alert_dedup
CREATE TABLE IF NOT EXISTS public.lead_alert_dedup (
  lead_id     UUID NOT NULL,
  event_type  TEXT NOT NULL,
  fired_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, event_type)
);
ALTER TABLE public.lead_alert_dedup ENABLE ROW LEVEL SECURITY;
-- No policies → only service role can read/write.

-- 5. Helper: dispatch via pg_net to emit-admin-alert
CREATE OR REPLACE FUNCTION public.dispatch_admin_alert(
  p_event_type TEXT,
  p_lead_id UUID,
  p_appointment_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT := 'https://pjufhxzjgdnhvuuvltjn.supabase.co/functions/v1/emit-admin-alert';
  v_anon TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon),
    body := jsonb_build_object(
      'event_type', p_event_type,
      'lead_id', p_lead_id,
      'appointment_id', p_appointment_id,
      'payload', p_payload
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- never break the originating insert/update because of an alert dispatch
  RAISE WARNING 'dispatch_admin_alert failed: %', SQLERRM;
END;
$$;

-- 6. Trigger: leads → HOT_LEAD / HIGH_VALUE_LEAD
CREATE OR REPLACE FUNCTION public.trg_leads_alert_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hot INT;
  v_hv  INT;
  v_score INT;
  v_old_score INT;
BEGIN
  SELECT hot_lead_threshold, high_value_threshold
    INTO v_hot, v_hv
  FROM public.attendance_settings WHERE scope='global' LIMIT 1;
  IF v_hot IS NULL THEN v_hot := 14; END IF;
  IF v_hv  IS NULL THEN v_hv  := 16; END IF;

  v_score := COALESCE(NEW.qualification_score, 0);
  v_old_score := CASE WHEN TG_OP='UPDATE' THEN COALESCE(OLD.qualification_score,0) ELSE 0 END;

  -- HIGH_VALUE first (more specific)
  IF v_score >= v_hv AND v_old_score < v_hv THEN
    PERFORM public.dispatch_admin_alert('HIGH_VALUE_LEAD', NEW.id, NULL, jsonb_build_object('score', v_score));
  ELSIF v_score >= v_hot AND v_old_score < v_hot THEN
    PERFORM public.dispatch_admin_alert('HOT_LEAD', NEW.id, NULL, jsonb_build_object('score', v_score));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_alert_score ON public.leads;
CREATE TRIGGER leads_alert_score
  AFTER INSERT OR UPDATE OF qualification_score ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_leads_alert_score();

-- 7. Trigger: appointments → BOOKED_CALL
CREATE OR REPLACE FUNCTION public.trg_appointments_alert_booked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.dispatch_admin_alert('BOOKED_CALL', NEW.lead_id, NEW.id, jsonb_build_object('starts_at', NEW.starts_at));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_alert_booked ON public.appointments;
CREATE TRIGGER appointments_alert_booked
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appointments_alert_booked();

-- 8. Trigger: appointments → NO_SHOW
CREATE OR REPLACE FUNCTION public.trg_appointments_alert_noshow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.no_show_detected_at IS NOT NULL AND OLD.no_show_detected_at IS NULL THEN
    PERFORM public.dispatch_admin_alert('NO_SHOW', NEW.lead_id, NEW.id, jsonb_build_object('starts_at', NEW.starts_at));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_alert_noshow ON public.appointments;
CREATE TRIGGER appointments_alert_noshow
  AFTER UPDATE OF no_show_detected_at ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appointments_alert_noshow();