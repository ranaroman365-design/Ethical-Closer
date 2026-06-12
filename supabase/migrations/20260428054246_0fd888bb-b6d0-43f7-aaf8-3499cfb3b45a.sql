
-- ═══════════════════════════════════════════════════════════════════════
-- LAYER 29 — Lead Activation Touchpoint System (Phase 1 foundation)
-- Strictly additive. Silent until per-funnel opt-in.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. SETTINGS (global + per-funnel)
CREATE TABLE IF NOT EXISTS public.lead_activation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','funnel')),
  funnel_key text,
  lead_activation_enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  allowed_hours_start int NOT NULL DEFAULT 8,
  allowed_hours_end int NOT NULL DEFAULT 21,
  allowed_hours_tz text NOT NULL DEFAULT 'Europe/Berlin',
  default_channel_per_phase jsonb NOT NULL DEFAULT '{"entry":"email","activation":"whatsapp","pre_booking":"whatsapp","reactivation":"email"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, funnel_key)
);

-- Seed the global row exactly once.
INSERT INTO public.lead_activation_settings (scope, funnel_key)
SELECT 'global', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.lead_activation_settings WHERE scope = 'global' AND funnel_key IS NULL);

-- 2. TEMPLATES (per-touchpoint message body)
CREATE TABLE IF NOT EXISTS public.lead_activation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global','funnel','operator')),
  funnel_key text,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  touchpoint_code text NOT NULL CHECK (touchpoint_code IN (
    'TP1_LEAD_CREATED','TP2_IMMEDIATE_WHATSAPP','TP3_PLUS_15M','TP4_PLUS_2H',
    'TP5_PLUS_24H','TP6_DAY_2','TP7_DAY_3_FINAL',
    'TP8_DAY_7_REACTIVATION','TP9_DAY_14_REACTIVATION'
  )),
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms')),
  language text NOT NULL DEFAULT 'de',
  subject text,
  body text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_activation_templates_lookup_idx
  ON public.lead_activation_templates (touchpoint_code, language, scope);

-- 3. JOBS (one row per scheduled touchpoint per lead)
CREATE TABLE IF NOT EXISTS public.lead_activation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  funnel_key text,
  touchpoint_code text NOT NULL,
  channel text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent_stub','sent','cancelled','skipped','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, touchpoint_code)
);
CREATE INDEX IF NOT EXISTS lead_activation_jobs_due_idx
  ON public.lead_activation_jobs (status, scheduled_for)
  WHERE status = 'pending';

-- 4. EVENTS (append-only audit log)
CREATE TABLE IF NOT EXISTS public.lead_activation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.lead_activation_jobs(id) ON DELETE SET NULL,
  funnel_key text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_activation_events_lead_idx
  ON public.lead_activation_events (lead_id, created_at DESC);

-- Touch trigger
CREATE OR REPLACE FUNCTION public.touch_lead_activation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS lead_activation_settings_touch ON public.lead_activation_settings;
CREATE TRIGGER lead_activation_settings_touch BEFORE UPDATE ON public.lead_activation_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_lead_activation_updated_at();

DROP TRIGGER IF EXISTS lead_activation_templates_touch ON public.lead_activation_templates;
CREATE TRIGGER lead_activation_templates_touch BEFORE UPDATE ON public.lead_activation_templates
FOR EACH ROW EXECUTE FUNCTION public.touch_lead_activation_updated_at();

DROP TRIGGER IF EXISTS lead_activation_jobs_touch ON public.lead_activation_jobs;
CREATE TRIGGER lead_activation_jobs_touch BEFORE UPDATE ON public.lead_activation_jobs
FOR EACH ROW EXECUTE FUNCTION public.touch_lead_activation_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- AUTO-SCHEDULE on lead insert. Always fills 'pending' rows; processor
-- decides whether to actually send (gated by enabled + test_mode).
-- This is SAFE: pending rows do nothing on their own.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.schedule_lead_activation_jobs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Skip simulations and rows missing required contact info.
  IF NEW.is_simulation IS TRUE THEN RETURN NEW; END IF;
  IF NEW.email IS NULL AND NEW.phone IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.lead_activation_jobs (lead_id, funnel_key, touchpoint_code, channel, scheduled_for)
  VALUES
    (NEW.id, NEW.source_funnel, 'TP1_LEAD_CREATED',          'email',    NEW.created_at + interval '0 minutes'),
    (NEW.id, NEW.source_funnel, 'TP2_IMMEDIATE_WHATSAPP',    'whatsapp', NEW.created_at + interval '2 minutes'),
    (NEW.id, NEW.source_funnel, 'TP3_PLUS_15M',              'whatsapp', NEW.created_at + interval '15 minutes'),
    (NEW.id, NEW.source_funnel, 'TP4_PLUS_2H',               'sms',      NEW.created_at + interval '2 hours'),
    (NEW.id, NEW.source_funnel, 'TP5_PLUS_24H',              'whatsapp', NEW.created_at + interval '24 hours'),
    (NEW.id, NEW.source_funnel, 'TP6_DAY_2',                 'whatsapp', NEW.created_at + interval '2 days'),
    (NEW.id, NEW.source_funnel, 'TP7_DAY_3_FINAL',           'whatsapp', NEW.created_at + interval '3 days'),
    (NEW.id, NEW.source_funnel, 'TP8_DAY_7_REACTIVATION',    'email',    NEW.created_at + interval '7 days'),
    (NEW.id, NEW.source_funnel, 'TP9_DAY_14_REACTIVATION',   'email',    NEW.created_at + interval '14 days')
  ON CONFLICT (lead_id, touchpoint_code) DO NOTHING;

  INSERT INTO public.lead_activation_events (lead_id, funnel_key, event_type, payload)
  VALUES (NEW.id, NEW.source_funnel, 'jobs_scheduled', jsonb_build_object('count', 9));

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let activation scheduling break lead creation.
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_layer29_schedule ON public.leads;
CREATE TRIGGER leads_layer29_schedule
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.schedule_lead_activation_jobs();

-- Cancel pending jobs when a lead becomes booked.
CREATE OR REPLACE FUNCTION public.cancel_lead_activation_on_book()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.has_booking IS DISTINCT FROM OLD.has_booking AND NEW.has_booking = true THEN
    UPDATE public.lead_activation_jobs
       SET status = 'cancelled',
           last_error = 'lead_booked'
     WHERE lead_id = NEW.id AND status = 'pending';
    INSERT INTO public.lead_activation_events (lead_id, funnel_key, event_type, payload)
    VALUES (NEW.id, NEW.source_funnel, 'jobs_cancelled_on_book', '{}'::jsonb);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS leads_layer29_cancel_on_book ON public.leads;
CREATE TRIGGER leads_layer29_cancel_on_book
AFTER UPDATE OF has_booking ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.cancel_lead_activation_on_book();

-- ═══════════════════════════════════════════════════════════════════════
-- RLS — Admin full · L6+ own scope · L5- denied
-- Reuses existing helpers: public.has_role(uid,'admin') + profiles.current_phase
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.lead_activation_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activation_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activation_events    ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_l6_plus(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT current_phase >= 6 FROM public.profiles WHERE id = _uid),
    false
  );
$$;

-- settings: admin full; L6 read-only on global + funnel rows
DROP POLICY IF EXISTS la_settings_admin_all ON public.lead_activation_settings;
CREATE POLICY la_settings_admin_all ON public.lead_activation_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS la_settings_l6_read ON public.lead_activation_settings;
CREATE POLICY la_settings_l6_read ON public.lead_activation_settings
  FOR SELECT TO authenticated
  USING (public.is_l6_plus(auth.uid()));

-- templates: admin full; L6 read all + write only operator-scope rows of their own
DROP POLICY IF EXISTS la_tpl_admin_all ON public.lead_activation_templates;
CREATE POLICY la_tpl_admin_all ON public.lead_activation_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS la_tpl_l6_read ON public.lead_activation_templates;
CREATE POLICY la_tpl_l6_read ON public.lead_activation_templates
  FOR SELECT TO authenticated
  USING (public.is_l6_plus(auth.uid()));

DROP POLICY IF EXISTS la_tpl_l6_write_own ON public.lead_activation_templates;
CREATE POLICY la_tpl_l6_write_own ON public.lead_activation_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_l6_plus(auth.uid()) AND scope = 'operator' AND operator_id = auth.uid());

DROP POLICY IF EXISTS la_tpl_l6_update_own ON public.lead_activation_templates;
CREATE POLICY la_tpl_l6_update_own ON public.lead_activation_templates
  FOR UPDATE TO authenticated
  USING (public.is_l6_plus(auth.uid()) AND scope = 'operator' AND operator_id = auth.uid())
  WITH CHECK (scope = 'operator' AND operator_id = auth.uid());

DROP POLICY IF EXISTS la_tpl_l6_delete_own ON public.lead_activation_templates;
CREATE POLICY la_tpl_l6_delete_own ON public.lead_activation_templates
  FOR DELETE TO authenticated
  USING (public.is_l6_plus(auth.uid()) AND scope = 'operator' AND operator_id = auth.uid());

-- jobs: admin full; L6 read jobs whose lead is in their funnel (owner_id or setter/closer match)
DROP POLICY IF EXISTS la_jobs_admin_all ON public.lead_activation_jobs;
CREATE POLICY la_jobs_admin_all ON public.lead_activation_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS la_jobs_l6_read_own_scope ON public.lead_activation_jobs;
CREATE POLICY la_jobs_l6_read_own_scope ON public.lead_activation_jobs
  FOR SELECT TO authenticated
  USING (
    public.is_l6_plus(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_activation_jobs.lead_id
        AND (l.owner_id = auth.uid() OR l.setter_id = auth.uid() OR l.closer_id = auth.uid())
    )
  );

-- events: same scope rule as jobs
DROP POLICY IF EXISTS la_events_admin_all ON public.lead_activation_events;
CREATE POLICY la_events_admin_all ON public.lead_activation_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS la_events_l6_read_own_scope ON public.lead_activation_events;
CREATE POLICY la_events_l6_read_own_scope ON public.lead_activation_events
  FOR SELECT TO authenticated
  USING (
    public.is_l6_plus(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_activation_events.lead_id
        AND (l.owner_id = auth.uid() OR l.setter_id = auth.uid() OR l.closer_id = auth.uid())
    )
  );
