-- ═══════════════════════════════════════════════════════════
-- 1. FIX RPC OVERLOAD: Drop the OLD 8-param version
-- ═══════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.create_manual_appointment(
  uuid, timestamptz, timestamptz, text, boolean, text, uuid, text
);

-- ═══════════════════════════════════════════════════════════
-- 2. REASSIGNMENT VISIBILITY: Add tracking columns
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reassigned_to_appointment_id uuid REFERENCES public.appointments(id),
  ADD COLUMN IF NOT EXISTS reassigned_from_appointment_id uuid REFERENCES public.appointments(id),
  ADD COLUMN IF NOT EXISTS retain_original_block boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_appointments_reassigned_to ON public.appointments(reassigned_to_appointment_id) WHERE reassigned_to_appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_reassigned_from ON public.appointments(reassigned_from_appointment_id) WHERE reassigned_from_appointment_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- 3. TEST LEAD SYSTEM
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_test_lead boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_is_test_lead ON public.leads(is_test_lead) WHERE is_test_lead = true;

-- ═══════════════════════════════════════════════════════════
-- 4. CAPACITY MODEL
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_capacity_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  custom_daily_capacity integer,
  max_daily_capacity integer NOT NULL DEFAULT 6,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_capacity_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view capacity"
  ON public.user_capacity_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can update own capacity"
  ON public.user_capacity_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own capacity"
  ON public.user_capacity_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Admins/L6+ can manage all capacity (via has_role or level check)
CREATE POLICY "Admins can manage all capacity"
  ON public.user_capacity_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM public.user_level_status WHERE user_id = auth.uid() AND current_level >= 6)
  );

CREATE INDEX IF NOT EXISTS idx_user_capacity_user ON public.user_capacity_settings(user_id);