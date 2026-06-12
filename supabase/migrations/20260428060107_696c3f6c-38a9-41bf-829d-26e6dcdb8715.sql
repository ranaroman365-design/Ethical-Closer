-- ============================================================
-- Layer 31: Unified Message Library (Registry Pattern)
-- Single source of truth for all templates across L27/28/29/30.
-- A/B-ready via variant_key + variant_weight.
-- ============================================================

-- 1. Add birthday column to profiles (nullable, opt-in)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthday DATE NULL,
  ADD COLUMN IF NOT EXISTS birthday_message_opt_in BOOLEAN NOT NULL DEFAULT false;

-- 2. Central message registry
CREATE TABLE IF NOT EXISTS public.message_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN (
    'lead_activation','pre_booking','post_booking','attendance',
    'no_show','reactivation','level_progression','promotion',
    'retention','special_events'
  )),
  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'lead_created','inactivity','time_delay','appointment_booked',
    'no_show','level_entered','upgrade_available','birthday'
  )),
  channel TEXT NOT NULL CHECK (channel IN ('sms','whatsapp','email','voice','in_app')),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','funnel','operator')),
  scope_funnel_key TEXT NULL,
  scope_operator_id UUID NULL,
  level TEXT NULL CHECK (level IS NULL OR level IN ('L0','L1','L2','L3','L4','L5','L6','L7','L8')),
  variant_key TEXT NOT NULL DEFAULT 'A',
  variant_weight INTEGER NOT NULL DEFAULT 100 CHECK (variant_weight BETWEEN 0 AND 100),
  timing TEXT NOT NULL DEFAULT 'immediate' CHECK (timing IN ('immediate','delayed','event_based','scheduled')),
  delay_minutes INTEGER NULL,
  subject_de TEXT NULL,
  subject_en TEXT NULL,
  body_de TEXT NOT NULL,
  body_en TEXT NOT NULL,
  cta_label_de TEXT NULL,
  cta_label_en TEXT NULL,
  cta_link_var TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_library_unique_variant
    UNIQUE (template_key, variant_key, scope, scope_operator_id, scope_funnel_key)
);

CREATE INDEX IF NOT EXISTS idx_message_library_lookup
  ON public.message_library (phase, trigger_event, channel, active);
CREATE INDEX IF NOT EXISTS idx_message_library_scope
  ON public.message_library (scope, scope_operator_id);

-- 3. Settings (single global row + per-operator overrides)
CREATE TABLE IF NOT EXISTS public.message_library_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','operator')),
  scope_operator_id UUID NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  test_mode BOOLEAN NOT NULL DEFAULT true,
  birthday_cron_enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_phases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_library_settings_scope_chk CHECK (
    (scope = 'global' AND scope_operator_id IS NULL)
    OR (scope = 'operator' AND scope_operator_id IS NOT NULL)
  ),
  CONSTRAINT message_library_settings_unique UNIQUE (scope, scope_operator_id)
);

-- 4. Send log (A/B performance attribution)
CREATE TABLE IF NOT EXISTS public.message_library_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL,
  lead_id UUID NULL,
  template_key TEXT NOT NULL,
  variant_key TEXT NOT NULL,
  phase TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  channel TEXT NOT NULL,
  scope_operator_id UUID NULL,
  status TEXT NOT NULL CHECK (status IN ('rendered','sent_stub','sent','skipped','failed')),
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_text TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_lib_log_template
  ON public.message_library_send_log (template_key, variant_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_lib_log_user
  ON public.message_library_send_log (user_id);

-- 5. Triggers
CREATE TRIGGER trg_message_library_updated
  BEFORE UPDATE ON public.message_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_message_library_settings_updated
  BEFORE UPDATE ON public.message_library_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.message_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_library_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_library_send_log ENABLE ROW LEVEL SECURITY;

-- Admin
CREATE POLICY "msglib_admin_all" ON public.message_library
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "msglib_settings_admin_all" ON public.message_library_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "msglib_log_admin_all" ON public.message_library_send_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- L6+: read all global, write own operator scope
CREATE POLICY "msglib_l6_read_global" ON public.message_library
  FOR SELECT TO authenticated
  USING (scope = 'global' OR scope_operator_id = auth.uid());

CREATE POLICY "msglib_l6_write_own" ON public.message_library
  FOR INSERT TO authenticated
  WITH CHECK (scope = 'operator' AND scope_operator_id = auth.uid());

CREATE POLICY "msglib_l6_update_own" ON public.message_library
  FOR UPDATE TO authenticated
  USING (scope = 'operator' AND scope_operator_id = auth.uid())
  WITH CHECK (scope = 'operator' AND scope_operator_id = auth.uid());

CREATE POLICY "msglib_l6_delete_own" ON public.message_library
  FOR DELETE TO authenticated
  USING (scope = 'operator' AND scope_operator_id = auth.uid());

CREATE POLICY "msglib_settings_l6_own" ON public.message_library_settings
  FOR ALL TO authenticated
  USING (scope = 'operator' AND scope_operator_id = auth.uid())
  WITH CHECK (scope = 'operator' AND scope_operator_id = auth.uid());

CREATE POLICY "msglib_log_l6_own" ON public.message_library_send_log
  FOR SELECT TO authenticated
  USING (scope_operator_id = auth.uid());

-- Seed global settings (disabled, test mode)
INSERT INTO public.message_library_settings (scope, enabled, test_mode, birthday_cron_enabled, notes)
VALUES ('global', false, true, false, 'Layer 31 registry — silent until opt-in')
ON CONFLICT DO NOTHING;