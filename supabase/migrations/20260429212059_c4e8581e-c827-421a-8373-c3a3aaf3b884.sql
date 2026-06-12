-- ============================================================
-- CAPACITY ENGINE PHASE 1 — SCHEMA ONLY (additive, non-breaking)
-- ============================================================

-- 1. setter_capacity_settings
CREATE TABLE IF NOT EXISTS public.setter_capacity_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  working_hours JSONB NOT NULL DEFAULT '[
    {"weekday":1,"start":"09:00","end":"18:00"},
    {"weekday":2,"start":"09:00","end":"18:00"},
    {"weekday":3,"start":"09:00","end":"18:00"},
    {"weekday":4,"start":"09:00","end":"18:00"},
    {"weekday":5,"start":"09:00","end":"18:00"}
  ]'::jsonb,
  max_per_day INTEGER NOT NULL DEFAULT 10 CHECK (max_per_day >= 0 AND max_per_day <= 100),
  max_per_hour INTEGER NOT NULL DEFAULT 2 CHECK (max_per_hour >= 0 AND max_per_hour <= 20),
  buffer_minutes INTEGER NOT NULL DEFAULT 15 CHECK (buffer_minutes >= 0 AND buffer_minutes <= 240),
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_duration_minutes IN (15, 30, 45, 60)),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_setter_capacity_settings_operator ON public.setter_capacity_settings(operator_id);
CREATE INDEX IF NOT EXISTS idx_setter_capacity_settings_active ON public.setter_capacity_settings(is_active) WHERE is_active = true;

ALTER TABLE public.setter_capacity_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators view own capacity settings"
  ON public.setter_capacity_settings FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators upsert own capacity settings"
  ON public.setter_capacity_settings FOR INSERT TO authenticated
  WITH CHECK (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators update own capacity settings"
  ON public.setter_capacity_settings FOR UPDATE TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete capacity settings"
  ON public.setter_capacity_settings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. setter_calendar_blocks
CREATE TABLE IF NOT EXISTS public.setter_calendar_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN ('vacation','recurring_weekly','ad_hoc','sick','training')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  recurrence_pattern JSONB,
  reason TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT block_time_valid CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_blocks_operator ON public.setter_calendar_blocks(operator_id);
CREATE INDEX IF NOT EXISTS idx_calendar_blocks_window ON public.setter_calendar_blocks(starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_calendar_blocks_type ON public.setter_calendar_blocks(block_type);

ALTER TABLE public.setter_calendar_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators view own blocks, L6+/admin view all"
  ON public.setter_calendar_blocks FOR SELECT TO authenticated
  USING (
    operator_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_level_status uls WHERE uls.user_id = auth.uid() AND uls.current_level >= 6)
  );
CREATE POLICY "Operators insert own blocks"
  ON public.setter_calendar_blocks FOR INSERT TO authenticated
  WITH CHECK (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators update own blocks"
  ON public.setter_calendar_blocks FOR UPDATE TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators delete own blocks"
  ON public.setter_calendar_blocks FOR DELETE TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3. external_calendar_sources (STUB)
CREATE TABLE IF NOT EXISTS public.external_calendar_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_calendar','outlook','apple_calendar','ical')),
  external_account_email TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','pending','active','error')),
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  cached_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (operator_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_ext_cal_operator ON public.external_calendar_sources(operator_id);
CREATE INDEX IF NOT EXISTS idx_ext_cal_status ON public.external_calendar_sources(status) WHERE status = 'active';

ALTER TABLE public.external_calendar_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators view own ext sources, admin all"
  ON public.external_calendar_sources FOR SELECT TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators upsert own ext sources"
  ON public.external_calendar_sources FOR INSERT TO authenticated
  WITH CHECK (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Operators update own ext sources"
  ON public.external_calendar_sources FOR UPDATE TO authenticated
  USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete ext sources"
  ON public.external_calendar_sources FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. updated_at triggers
DROP TRIGGER IF EXISTS trg_capacity_settings_updated ON public.setter_capacity_settings;
CREATE TRIGGER trg_capacity_settings_updated
  BEFORE UPDATE ON public.setter_capacity_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_calendar_blocks_updated ON public.setter_calendar_blocks;
CREATE TRIGGER trg_calendar_blocks_updated
  BEFORE UPDATE ON public.setter_calendar_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ext_cal_updated ON public.external_calendar_sources;
CREATE TRIGGER trg_ext_cal_updated
  BEFORE UPDATE ON public.external_calendar_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. View: eligible operators (L4+ active, with default profile fallback)
CREATE OR REPLACE VIEW public.v_capacity_eligible_operators
WITH (security_invoker = true) AS
SELECT
  uls.user_id AS operator_id,
  uls.current_level,
  p.full_name AS display_name,
  p.member_status,
  COALESCE(scs.is_active, true) AS is_active,
  COALESCE(scs.timezone, 'Europe/Berlin') AS timezone,
  COALESCE(scs.working_hours, '[
    {"weekday":1,"start":"09:00","end":"18:00"},
    {"weekday":2,"start":"09:00","end":"18:00"},
    {"weekday":3,"start":"09:00","end":"18:00"},
    {"weekday":4,"start":"09:00","end":"18:00"},
    {"weekday":5,"start":"09:00","end":"18:00"}
  ]'::jsonb) AS working_hours,
  COALESCE(scs.max_per_day, 10) AS max_per_day,
  COALESCE(scs.max_per_hour, 2) AS max_per_hour,
  COALESCE(scs.buffer_minutes, 15) AS buffer_minutes,
  COALESCE(scs.slot_duration_minutes, 30) AS slot_duration_minutes,
  (scs.id IS NOT NULL) AS has_explicit_profile
FROM public.user_level_status uls
JOIN public.profiles p ON p.id = uls.user_id
LEFT JOIN public.setter_capacity_settings scs ON scs.operator_id = uls.user_id
WHERE uls.current_level >= 4
  AND p.member_status = 'enrolled';

GRANT SELECT ON public.v_capacity_eligible_operators TO authenticated;