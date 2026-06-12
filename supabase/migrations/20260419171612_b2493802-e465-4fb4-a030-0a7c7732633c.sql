
CREATE TABLE IF NOT EXISTS public.community_placement_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  company_name text,
  deal_type text,
  description text,
  compensation_model text,
  compensation_range text,
  required_credit_level integer DEFAULT 3,
  location_type text,
  industry text,
  is_active boolean DEFAULT true,
  is_exclusive boolean DEFAULT false,
  posted_by uuid,
  expires_at timestamptz,
  applications_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.community_placement_opportunities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.community_placement_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.community_placement_opportunities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  motivation text,
  status text DEFAULT 'pending',
  applied_at timestamptz DEFAULT now(),
  UNIQUE(opportunity_id, user_id)
);
ALTER TABLE public.community_placement_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_cpo" ON public.community_placement_opportunities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write_cpo_ins" ON public.community_placement_opportunities
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_write_cpo_upd" ON public.community_placement_opportunities
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "own_read_cpa" ON public.community_placement_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert_cpa" ON public.community_placement_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_read_cpa" ON public.community_placement_applications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin_update_cpa" ON public.community_placement_applications
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.increment_cpo_app_count(_opportunity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.community_placement_opportunities
     SET applications_count = COALESCE(applications_count, 0) + 1
   WHERE id = _opportunity_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.increment_cpo_app_count(uuid) TO authenticated;

INSERT INTO public.community_placement_opportunities
  (title, company_name, deal_type, description, compensation_model, compensation_range, required_credit_level, location_type, industry, is_active, is_exclusive)
VALUES
  ('Senior Closer — B2B SaaS','PartnerCo GmbH','closer_role','Wir suchen einen erfahrenen Closer für unser DACH-Team.','commission','10–15% Provision',3,'remote','SaaS',true,false),
  ('Setter gesucht — High-Ticket Coaching',NULL,'setter_role','Etablierter Coach sucht Setter für 5-stellige Programme.','retainer','2.500€/Monat + Bonus',2,'remote','Coaching',true,false),
  ('Partnership: Joint Venture Closer-Agentur',NULL,'partnership','ETC-exklusive Partnerschaft für erfahrene Closer.','hybrid','Umsatzbeteiligung nach Absprache',4,'remote','Agency',true,true);
