-- Job Offers
CREATE TABLE job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partner_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN (
    'closer','setter','sales_manager','other'
  )),
  deal_size_min INTEGER,
  deal_size_max INTEGER,
  commission_type TEXT,
  commission_rate TEXT,
  industry TEXT,
  location_type TEXT DEFAULT 'remote'
    CHECK (location_type IN ('remote','hybrid','onsite')),
  location TEXT,
  languages TEXT[] DEFAULT '{}',
  description TEXT,
  requirements TEXT,
  min_experience_years INTEGER DEFAULT 0,
  requires_etc_badge BOOLEAN DEFAULT false,
  min_tier TEXT DEFAULT 'bronze'
    CHECK (min_tier IN ('bronze','silver','gold','platinum','black')),
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active','paused','closed')),
  applications_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);
ALTER TABLE job_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "jo_public_read" ON job_offers
  FOR SELECT USING (status = 'active');
CREATE POLICY "jo_partner_write" ON job_offers
  FOR ALL USING (
    partner_id IN (
      SELECT id FROM partner_profiles WHERE user_id = auth.uid()
    )
  );

-- Job Applications
CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_offers(id) ON DELETE CASCADE,
  closer_id UUID NOT NULL REFERENCES closer_profiles(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT DEFAULT 'sent'
    CHECK (status IN ('sent','viewed','shortlisted','declined','hired')),
  applied_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id, closer_id)
);
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ja_closer_own" ON job_applications
  FOR ALL USING (
    closer_id IN (
      SELECT id FROM closer_profiles WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "ja_partner_read" ON job_applications
  FOR SELECT USING (
    job_id IN (
      SELECT id FROM job_offers WHERE partner_id IN (
        SELECT id FROM partner_profiles WHERE user_id = auth.uid()
      )
    )
  );

-- Direct Contacts
CREATE TABLE direct_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.users(id),
  to_user_id UUID NOT NULL REFERENCES auth.users(id),
  message TEXT NOT NULL,
  job_offer_id UUID REFERENCES job_offers(id),
  status TEXT DEFAULT 'sent'
    CHECK (status IN ('sent','read','replied','declined')),
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);
ALTER TABLE direct_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dc_parties_read" ON direct_contacts
  FOR SELECT USING (
    auth.uid() = from_user_id OR auth.uid() = to_user_id
  );
CREATE POLICY "dc_auth_insert" ON direct_contacts
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);