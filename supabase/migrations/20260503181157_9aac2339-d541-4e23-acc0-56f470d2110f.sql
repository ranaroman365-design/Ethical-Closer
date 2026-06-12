
-- 1. the_close_user_types
CREATE TABLE public.the_close_user_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('closer', 'partner')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  subscription_tier TEXT NOT NULL DEFAULT 'silver' 
    CHECK (subscription_tier IN ('silver', 'gold', 'platinum', 'black')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.the_close_user_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tc_ut_public_read" ON public.the_close_user_types FOR SELECT USING (true);
CREATE POLICY "tc_ut_own_insert" ON public.the_close_user_types FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tc_ut_own_update" ON public.the_close_user_types FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tc_ut_own_delete" ON public.the_close_user_types FOR DELETE USING (auth.uid() = user_id);

-- 2. closer_profiles
CREATE TABLE public.closer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT NOT NULL,
  headline TEXT,
  location TEXT,
  languages TEXT[] DEFAULT '{}',
  experience_years INTEGER DEFAULT 0,
  industries TEXT[] DEFAULT '{}',
  avg_deal_size TEXT,
  closing_rate TEXT,
  total_closes INTEGER DEFAULT 0,
  bio TEXT,
  profile_image_url TEXT,
  linkedin_url TEXT,
  availability TEXT DEFAULT 'available' 
    CHECK (availability IN ('available', 'open', 'unavailable')),
  is_public BOOLEAN DEFAULT true,
  priority_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.closer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_public_read" ON public.closer_profiles FOR SELECT USING (is_public = true);
CREATE POLICY "cp_own_insert" ON public.closer_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cp_own_update" ON public.closer_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "cp_own_delete" ON public.closer_profiles FOR DELETE USING (auth.uid() = user_id);

-- 3. tc_partner_profiles (prefixed to avoid conflict with existing partner_profiles)
CREATE TABLE public.tc_partner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  industry TEXT,
  company_size TEXT,
  website_url TEXT,
  description TEXT,
  logo_url TEXT,
  avg_deal_size TEXT,
  looking_for TEXT[],
  is_verified BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.tc_partner_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tcp_public_read" ON public.tc_partner_profiles FOR SELECT USING (is_public = true);
CREATE POLICY "tcp_own_insert" ON public.tc_partner_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tcp_own_update" ON public.tc_partner_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "tcp_own_delete" ON public.tc_partner_profiles FOR DELETE USING (auth.uid() = user_id);

-- 4. etc_badges
CREATE TABLE public.etc_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL CHECK (badge_type IN (
    'etc_certified', 'etc_closer_gold', 'etc_champion', 'etc_top_performer'
  )),
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  kpi_closes INTEGER,
  kpi_revenue TEXT,
  kpi_period TEXT,
  is_active BOOLEAN DEFAULT true,
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  notes TEXT
);
ALTER TABLE public.etc_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eb_public_read" ON public.etc_badges FOR SELECT USING (is_active = true);
CREATE POLICY "eb_partner_insert" ON public.etc_badges FOR INSERT 
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.the_close_user_types WHERE role = 'partner'));
CREATE POLICY "eb_partner_update" ON public.etc_badges FOR UPDATE
  USING (auth.uid() IN (SELECT user_id FROM public.the_close_user_types WHERE role = 'partner'));

-- 5. kpi_submissions
CREATE TABLE public.kpi_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_type TEXT NOT NULL CHECK (submission_type IN (
    'badge_application', 'champion_claim', 'monthly_update'
  )),
  closes_count INTEGER NOT NULL DEFAULT 0,
  revenue_total TEXT,
  period_start DATE,
  period_end DATE,
  evidence_urls TEXT[] DEFAULT '{}',
  partner_confirmation UUID,
  status TEXT DEFAULT 'submitted' 
    CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected')),
  reviewer_note TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
ALTER TABLE public.kpi_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ks_own_read" ON public.kpi_submissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ks_own_insert" ON public.kpi_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. tc_job_offers
CREATE TABLE public.tc_job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.tc_partner_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('closer', 'setter', 'sales_manager', 'other')),
  deal_size_min INTEGER,
  deal_size_max INTEGER,
  commission_type TEXT,
  commission_rate TEXT,
  industry TEXT,
  location_type TEXT DEFAULT 'remote' 
    CHECK (location_type IN ('remote', 'hybrid', 'onsite')),
  location TEXT,
  languages TEXT[] DEFAULT '{}',
  description TEXT,
  requirements TEXT,
  min_experience_years INTEGER DEFAULT 0,
  requires_etc_badge BOOLEAN DEFAULT false,
  visibility TEXT DEFAULT 'gold' 
    CHECK (visibility IN ('silver', 'gold', 'platinum', 'black')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  applications_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);
ALTER TABLE public.tc_job_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tjo_public_read" ON public.tc_job_offers FOR SELECT USING (status = 'active');
CREATE POLICY "tjo_partner_insert" ON public.tc_job_offers FOR INSERT 
  WITH CHECK (partner_id IN (SELECT id FROM public.tc_partner_profiles WHERE user_id = auth.uid()));
CREATE POLICY "tjo_partner_update" ON public.tc_job_offers FOR UPDATE 
  USING (partner_id IN (SELECT id FROM public.tc_partner_profiles WHERE user_id = auth.uid()));
CREATE POLICY "tjo_partner_delete" ON public.tc_job_offers FOR DELETE 
  USING (partner_id IN (SELECT id FROM public.tc_partner_profiles WHERE user_id = auth.uid()));

-- 7. tc_job_applications
CREATE TABLE public.tc_job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.tc_job_offers(id) ON DELETE CASCADE,
  closer_id UUID NOT NULL REFERENCES public.closer_profiles(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT DEFAULT 'sent' 
    CHECK (status IN ('sent', 'viewed', 'shortlisted', 'declined', 'hired')),
  applied_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id, closer_id)
);
ALTER TABLE public.tc_job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tja_closer_own" ON public.tc_job_applications FOR ALL USING (
  closer_id IN (SELECT id FROM public.closer_profiles WHERE user_id = auth.uid())
);
CREATE POLICY "tja_partner_read" ON public.tc_job_applications FOR SELECT USING (
  job_id IN (
    SELECT id FROM public.tc_job_offers WHERE partner_id IN (
      SELECT id FROM public.tc_partner_profiles WHERE user_id = auth.uid()
    )
  )
);

-- 8. tc_direct_contacts
CREATE TABLE public.tc_direct_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.users(id),
  to_user_id UUID NOT NULL REFERENCES auth.users(id),
  message TEXT NOT NULL,
  job_offer_id UUID REFERENCES public.tc_job_offers(id),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'read', 'replied', 'declined')),
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);
ALTER TABLE public.tc_direct_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tdc_parties_read" ON public.tc_direct_contacts FOR SELECT 
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "tdc_auth_insert" ON public.tc_direct_contacts FOR INSERT 
  WITH CHECK (auth.uid() = from_user_id);

-- 9. Priority score function
CREATE OR REPLACE FUNCTION public.calculate_priority_score(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_tier TEXT;
  v_badge_count INTEGER;
  v_score INTEGER := 0;
BEGIN
  SELECT subscription_tier INTO v_tier 
  FROM public.the_close_user_types 
  WHERE user_id = p_user_id AND role = 'closer';
  
  v_score := CASE v_tier
    WHEN 'silver'   THEN 0
    WHEN 'gold'     THEN 40
    WHEN 'platinum' THEN 70
    WHEN 'black'    THEN 100
    ELSE 0
  END;
  
  SELECT COUNT(*) INTO v_badge_count 
  FROM public.etc_badges 
  WHERE user_id = p_user_id AND is_active = true;
  
  v_score := v_score + (v_badge_count * 20);
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
