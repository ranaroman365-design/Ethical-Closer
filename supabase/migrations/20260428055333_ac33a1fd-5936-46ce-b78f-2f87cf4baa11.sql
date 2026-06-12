-- ============================================================
-- Layer 30: Level-Based Messaging Engine (Safe Foundation)
-- Strictly additive. Silent by default. No automated sends.
-- ============================================================

-- 1. Settings (global + per operator)
CREATE TABLE IF NOT EXISTS public.level_messaging_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'operator')),
  scope_operator_id UUID NULL,
  scope_funnel_key TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  test_mode BOOLEAN NOT NULL DEFAULT true,
  enabled_message_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  enabled_levels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT level_messaging_settings_operator_scope_chk
    CHECK (
      (scope = 'global' AND scope_operator_id IS NULL)
      OR (scope = 'operator' AND scope_operator_id IS NOT NULL)
    ),
  CONSTRAINT level_messaging_settings_unique_scope
    UNIQUE (scope, scope_operator_id, scope_funnel_key)
);

-- 2. Templates
CREATE TABLE IF NOT EXISTS public.level_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  level TEXT NOT NULL CHECK (level IN ('L0','L1','L2','L3','L4','L5','L6','L7','L8')),
  message_type TEXT NOT NULL CHECK (message_type IN ('onboarding','progress','promotion','warning')),
  trigger_event TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms','whatsapp','email','voice','in_app')),
  timing TEXT NOT NULL DEFAULT 'immediate' CHECK (timing IN ('immediate','delayed','event_based')),
  delay_minutes INTEGER NULL,
  subject_de TEXT NULL,
  subject_en TEXT NULL,
  body_de TEXT NOT NULL,
  body_en TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  scope_funnel_key TEXT NULL,
  scope_operator_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_level_message_templates_lookup
  ON public.level_message_templates (level, message_type, active);

-- 3. Jobs
CREATE TABLE IF NOT EXISTS public.level_message_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  lead_id UUID NULL,
  level TEXT NOT NULL,
  message_type TEXT NOT NULL,
  template_key TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  channel TEXT NOT NULL,
  run_after TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent_stub','sent','skipped','failed','cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  scope_operator_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_level_message_jobs_due
  ON public.level_message_jobs (status, run_after);
CREATE INDEX IF NOT EXISTS idx_level_message_jobs_user
  ON public.level_message_jobs (user_id);

-- 4. Events (audit log)
CREATE TABLE IF NOT EXISTS public.level_message_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  lead_id UUID NULL,
  level TEXT NULL,
  message_type TEXT NULL,
  template_key TEXT NULL,
  event_type TEXT NOT NULL,
  channel TEXT NULL,
  scope_operator_id UUID NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_level_message_events_user
  ON public.level_message_events (user_id, created_at DESC);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE TRIGGER trg_level_messaging_settings_updated
  BEFORE UPDATE ON public.level_messaging_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_level_message_templates_updated
  BEFORE UPDATE ON public.level_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_level_message_jobs_updated
  BEFORE UPDATE ON public.level_message_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.level_messaging_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_message_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_message_events ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "lvlmsg_settings_admin_all" ON public.level_messaging_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "lvlmsg_templates_admin_all" ON public.level_message_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "lvlmsg_jobs_admin_all" ON public.level_message_jobs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "lvlmsg_events_admin_all" ON public.level_message_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- L6+ scoped read/write on own operator scope
CREATE POLICY "lvlmsg_settings_l6_own" ON public.level_messaging_settings
  FOR ALL TO authenticated
  USING (
    scope = 'operator'
    AND scope_operator_id = auth.uid()
  )
  WITH CHECK (
    scope = 'operator'
    AND scope_operator_id = auth.uid()
  );

CREATE POLICY "lvlmsg_templates_l6_own" ON public.level_message_templates
  FOR ALL TO authenticated
  USING (scope_operator_id = auth.uid())
  WITH CHECK (scope_operator_id = auth.uid());

CREATE POLICY "lvlmsg_jobs_l6_own" ON public.level_message_jobs
  FOR SELECT TO authenticated
  USING (scope_operator_id = auth.uid());

CREATE POLICY "lvlmsg_events_l6_own" ON public.level_message_events
  FOR SELECT TO authenticated
  USING (scope_operator_id = auth.uid());

-- Seed global settings (disabled, test mode)
INSERT INTO public.level_messaging_settings (scope, enabled, test_mode, notes)
VALUES ('global', false, true, 'Layer 30 foundation — silent until explicit opt-in')
ON CONFLICT DO NOTHING;