
-- 1. Add assigned_operator_id to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS assigned_operator_id UUID REFERENCES auth.users(id);

-- Backfill from current_owner_id
UPDATE public.appointments
SET assigned_operator_id = COALESCE(current_owner_id, setter_id)
WHERE assigned_operator_id IS NULL;

-- 2. Create assignment history table
CREATE TABLE public.appointment_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL,
  previous_operator_id UUID,
  new_operator_id UUID NOT NULL,
  reassigned_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read assignment history"
  ON public.appointment_assignment_history FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert assignment history"
  ON public.appointment_assignment_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reassigned_by);

CREATE INDEX idx_assignment_history_appointment ON public.appointment_assignment_history(appointment_id);
CREATE INDEX idx_appointments_assigned_operator ON public.appointments(assigned_operator_id);

-- 3. Function to get assignable operators for a given user
-- Returns self + all profiles sharing the same director_id or having director_id = the user
-- For L6+ (current_phase >= 6), returns all team members under their director tree
CREATE OR REPLACE FUNCTION public.get_assignable_operators(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  email TEXT,
  current_phase INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT p.id, p.current_phase, p.director_id
    FROM profiles p
    WHERE p.id = p_user_id
  )
  SELECT DISTINCT prof.id, prof.full_name, prof.email, prof.current_phase
  FROM profiles prof, caller c
  WHERE prof.member_status IS DISTINCT FROM 'inactive'
    AND (
      -- Self
      prof.id = c.id
      -- Same director tree (siblings under same director)
      OR (c.director_id IS NOT NULL AND prof.director_id = c.director_id AND prof.current_phase <= c.current_phase)
      -- Direct reports (director_id points to caller)
      OR prof.director_id = c.id
    )
  ORDER BY prof.current_phase DESC, prof.full_name;
$$;
