
-- System settings table for master switches
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL DEFAULT 'false'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage system_settings" ON public.system_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can read system_settings" ON public.system_settings FOR SELECT TO authenticated USING (true);

INSERT INTO public.system_settings (setting_key, setting_value) VALUES
  ('employer_dashboard_enabled', 'false'::jsonb),
  ('realtime_simulator_enabled', 'false'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  contact_email text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage companies" ON public.companies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Company users table (must be created before companies RLS that references it)
CREATE TABLE IF NOT EXISTS public.company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage company_users" ON public.company_users FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can read own company link" ON public.company_users FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Now add the company read policy that references company_users
CREATE POLICY "Company users can read own company" ON public.companies FOR SELECT TO authenticated USING (
  id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid())
);

-- Employer saved profiles
CREATE TABLE IF NOT EXISTS public.employer_saved_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, candidate_user_id)
);
ALTER TABLE public.employer_saved_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company users manage saved profiles" ON public.employer_saved_profiles FOR ALL TO authenticated USING (
  company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid())
) WITH CHECK (
  company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admins manage all saved profiles" ON public.employer_saved_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Employer contact requests
CREATE TABLE IF NOT EXISTS public.employer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  candidate_user_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company users manage own contacts" ON public.employer_contacts FOR ALL TO authenticated USING (
  company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid())
  OR candidate_user_id = auth.uid()
) WITH CHECK (
  company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admins manage all contacts" ON public.employer_contacts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Employer job listings
CREATE TABLE IF NOT EXISTS public.employer_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  requirements text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employer_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company users manage own jobs" ON public.employer_jobs FOR ALL TO authenticated USING (
  company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid())
) WITH CHECK (
  company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid())
);
CREATE POLICY "Admins manage all jobs" ON public.employer_jobs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- KPI verifications
CREATE TABLE IF NOT EXISTS public.kpi_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calls_completed int NOT NULL DEFAULT 0,
  deals_closed int NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0,
  revenue_generated numeric NOT NULL DEFAULT 0,
  proof_reference text,
  proof_status text NOT NULL DEFAULT 'pending',
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kpi_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own verifications" ON public.kpi_verifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own verifications" ON public.kpi_verifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage all verifications" ON public.kpi_verifications FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add employer_visibility_enabled to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS employer_visibility_enabled boolean NOT NULL DEFAULT false;
