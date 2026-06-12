
-- Director Applications table
CREATE TABLE public.director_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_name text NOT NULL,
  offer_type text NOT NULL DEFAULT '',
  price_point text DEFAULT '',
  monthly_revenue text DEFAULT '',
  lead_source text DEFAULT '',
  team_size text DEFAULT '',
  expected_hires text DEFAULT '',
  sales_problem text DEFAULT '',
  values_alignment boolean DEFAULT false,
  ethical_filter_passed boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.director_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own director applications" ON public.director_applications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users read own director applications" ON public.director_applications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage director applications" ON public.director_applications
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Director Offers table
CREATE TABLE public.director_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  director_id uuid NOT NULL,
  offer_name text NOT NULL,
  price_range text DEFAULT '',
  target_audience text DEFAULT '',
  lead_quality text DEFAULT 'warm',
  sales_cycle text DEFAULT '',
  conversion_goal text DEFAULT '',
  required_level text DEFAULT 'junior_manager',
  min_awareness_score numeric DEFAULT 70,
  max_pressure_index numeric DEFAULT 30,
  preferred_industries text[] DEFAULT '{}',
  language text DEFAULT 'Deutsch',
  status text NOT NULL DEFAULT 'active',
  closers_assigned integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.director_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors manage own offers" ON public.director_offers
  FOR ALL TO authenticated USING (director_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  WITH CHECK (director_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated read active offers" ON public.director_offers
  FOR SELECT TO authenticated USING (status = 'active' OR director_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- Director Team Assignments
CREATE TABLE public.director_team_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  director_id uuid NOT NULL,
  closer_id uuid NOT NULL,
  offer_id uuid REFERENCES public.director_offers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  performance_score numeric DEFAULT 0,
  revenue_generated numeric DEFAULT 0,
  UNIQUE(director_id, closer_id, offer_id)
);

ALTER TABLE public.director_team_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directors manage own team" ON public.director_team_assignments
  FOR ALL TO authenticated USING (director_id = auth.uid() OR closer_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  WITH CHECK (director_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- Partner Profiles table
CREATE TABLE public.partner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  company_name text NOT NULL DEFAULT '',
  partner_type text NOT NULL DEFAULT 'standard',
  revenue_share_pct numeric DEFAULT 20,
  total_offers integer DEFAULT 0,
  total_closers integer DEFAULT 0,
  total_revenue numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners read own profile" ON public.partner_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage partner profiles" ON public.partner_profiles
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Partners update own profile" ON public.partner_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
