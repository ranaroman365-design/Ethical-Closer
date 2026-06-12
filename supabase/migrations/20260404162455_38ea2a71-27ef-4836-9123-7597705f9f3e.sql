
-- =====================================================
-- SPRINT 1: Booking & Assignment Data Model
-- =====================================================

-- 1. Unique index on normalized leads.email
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email_unique
  ON public.leads (LOWER(TRIM(email)))
  WHERE email IS NOT NULL;

-- 2. Extend leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_funnel text,
  ADD COLUMN IF NOT EXISTS has_booking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_id uuid,
  ADD COLUMN IF NOT EXISTS next_action_type text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority_flag boolean NOT NULL DEFAULT false;

UPDATE public.leads SET source_funnel = quiz_funnel_source WHERE source_funnel IS NULL AND quiz_funnel_source IS NOT NULL;

-- 3. Appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  call_type text NOT NULL DEFAULT 'standard',
  appointment_status text NOT NULL DEFAULT 'booked',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  setter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_status text NOT NULL DEFAULT 'none',
  booking_source text DEFAULT 'internal',
  acknowledged_at timestamptz,
  completed_at timestamptz,
  outcome text,
  qualification_result text,
  setter_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON public.appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_setter_id ON public.appointments(setter_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(appointment_status);
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON public.appointments(starts_at);

-- 4. Availability slots table
CREATE TABLE IF NOT EXISTS public.availability_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  slot_type text NOT NULL DEFAULT 'standard',
  is_active boolean NOT NULL DEFAULT true,
  max_bookings integer NOT NULL DEFAULT 1,
  current_bookings integer NOT NULL DEFAULT 0,
  visible_order integer NOT NULL DEFAULT 0,
  eligible_setter_group text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_availability_slots_date ON public.availability_slots(date);
CREATE INDEX IF NOT EXISTS idx_availability_slots_type ON public.availability_slots(slot_type);

-- 5. Setter capacity table
CREATE TABLE IF NOT EXISTS public.setter_capacity (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  max_daily_leads integer NOT NULL DEFAULT 2,
  priority_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_setter_capacity_setter_id ON public.setter_capacity(setter_id);

-- 6. FK for leads.booking_id
ALTER TABLE public.leads
  ADD CONSTRAINT leads_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.appointments(id) ON DELETE SET NULL;

-- 7. Updated_at triggers
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_availability_slots_updated_at
  BEFORE UPDATE ON public.availability_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_setter_capacity_updated_at
  BEFORE UPDATE ON public.setter_capacity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. RLS on appointments
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Setters see own appointments or admins see all"
  ON public.appointments FOR SELECT TO authenticated
  USING (setter_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrator', 'owner', 'ops_admin')));

CREATE POLICY "Setters update own appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (setter_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrator', 'owner', 'ops_admin')));

CREATE POLICY "Admins insert appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrator', 'owner', 'ops_admin', 'automation_service')));

CREATE POLICY "Service role manages appointments"
  ON public.appointments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9. RLS on availability_slots
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active slots"
  ON public.availability_slots FOR SELECT USING (is_active = true);

CREATE POLICY "Admins manage slots"
  ON public.availability_slots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrator', 'owner', 'ops_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrator', 'owner', 'ops_admin')));

CREATE POLICY "Service role manages slots"
  ON public.availability_slots FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10. RLS on setter_capacity
ALTER TABLE public.setter_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Setters see own capacity or admins see all"
  ON public.setter_capacity FOR SELECT TO authenticated
  USING (setter_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrator', 'owner', 'ops_admin')));

CREATE POLICY "Admins manage setter capacity"
  ON public.setter_capacity FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrator', 'owner', 'ops_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'administrator', 'owner', 'ops_admin')));

CREATE POLICY "Service role manages setter capacity"
  ON public.setter_capacity FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 11. Validation trigger for call_type (replaces CHECK constraint)
CREATE OR REPLACE FUNCTION public.validate_appointment_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.call_type NOT IN ('standard', 'priority') THEN
    RAISE EXCEPTION 'Invalid call_type: %', NEW.call_type;
  END IF;
  IF NEW.appointment_status NOT IN ('booked', 'confirmed', 'completed', 'no_show', 'cancelled', 'rescheduled', 'superseded') THEN
    RAISE EXCEPTION 'Invalid appointment_status: %', NEW.appointment_status;
  END IF;
  IF NEW.payment_status NOT IN ('none', 'pending', 'paid', 'refunded') THEN
    RAISE EXCEPTION 'Invalid payment_status: %', NEW.payment_status;
  END IF;
  IF NEW.outcome IS NOT NULL AND NEW.outcome NOT IN ('attended', 'no_show', 'cancelled', 'rescheduled') THEN
    RAISE EXCEPTION 'Invalid outcome: %', NEW.outcome;
  END IF;
  IF NEW.qualification_result IS NOT NULL AND NEW.qualification_result NOT IN ('qualified', 'not_qualified', 'follow_up_needed') THEN
    RAISE EXCEPTION 'Invalid qualification_result: %', NEW.qualification_result;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_appointment_fields_trigger
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_fields();
