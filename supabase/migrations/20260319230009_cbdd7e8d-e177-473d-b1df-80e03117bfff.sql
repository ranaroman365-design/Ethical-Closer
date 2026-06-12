
-- Mentor/Mentee assignment table
CREATE TABLE public.mentor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  mentee_id uuid NOT NULL,
  layer text NOT NULL DEFAULT 'setter',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE(mentor_id, mentee_id)
);

ALTER TABLE public.mentor_assignments ENABLE ROW LEVEL SECURITY;

-- Mentors can see their mentees
CREATE POLICY "Mentors read own assignments" ON public.mentor_assignments
  FOR SELECT TO authenticated
  USING (mentor_id = auth.uid() OR mentee_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Admins manage all
CREATE POLICY "Admins manage mentor assignments" ON public.mentor_assignments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Re-create triggers that may be missing
DROP TRIGGER IF EXISTS trigger_auto_update_kpis ON public.leads;
CREATE TRIGGER trigger_auto_update_kpis
  AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.auto_update_kpis_on_lead_transition();

DROP TRIGGER IF EXISTS trigger_auto_handover ON public.leads;
CREATE TRIGGER trigger_auto_handover
  AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW
  WHEN (NEW.stage = 'ready_for_closer' AND NEW.appointment_date IS NOT NULL)
  EXECUTE FUNCTION public.auto_handover_to_closer();

DROP TRIGGER IF EXISTS trigger_auto_post_milestone ON public.leads;
CREATE TRIGGER trigger_auto_post_milestone
  AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.auto_post_milestone();

DROP TRIGGER IF EXISTS trigger_auto_advance_phase ON public.member_progress;
CREATE TRIGGER trigger_auto_advance_phase
  AFTER INSERT OR UPDATE ON public.member_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_advance_phase();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
