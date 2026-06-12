
-- Placement opportunities table
CREATE TABLE public.placement_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company text NOT NULL,
  industry text NOT NULL,
  offer_type text NOT NULL,
  commission_model text NOT NULL,
  call_volume text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'interview', 'placed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.placement_opportunities ENABLE ROW LEVEL SECURITY;

-- Members who are placement_ready can read
CREATE POLICY "Placement ready members read opportunities" ON public.placement_opportunities
FOR SELECT TO authenticated
USING (
  (SELECT placement_ready FROM public.profiles WHERE id = auth.uid()) = true
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins manage opportunities" ON public.placement_opportunities
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Attach trigger for handle_new_user (it was missing from triggers)
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
