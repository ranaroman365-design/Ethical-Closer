
-- Create product_config table (standalone — no function changes)
CREATE TABLE IF NOT EXISTS public.product_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text UNIQUE NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_config ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_config' AND policyname = 'Anyone can read product_config') THEN
    CREATE POLICY "Anyone can read product_config" ON public.product_config FOR SELECT USING (true);
  END IF;
END $$;

-- RLS: only admins can modify
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_config' AND policyname = 'Only admins can modify product_config') THEN
    CREATE POLICY "Only admins can modify product_config" ON public.product_config FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- Seed ETC config
INSERT INTO public.product_config (product_key, config) VALUES (
  'etc',
  '{
    "levels": [
      { "level": 0, "key": "prospect", "role": "Bewerber", "stage": "prospect" },
      { "level": 1, "key": "opener", "role": "Trainee", "stage": "opener" },
      { "level": 2, "key": "setter", "role": "Associate Setter", "stage": "setter" },
      { "level": 3, "key": "senior_associate", "role": "Senior Setter", "stage": "senior_associate" },
      { "level": 4, "key": "junior_manager", "role": "Junior Closer", "stage": "junior_manager" },
      { "level": 5, "key": "manager", "role": "Managing Closer", "stage": "manager" },
      { "level": 6, "key": "senior_manager", "role": "Senior Closer", "stage": "senior_manager" },
      { "level": 7, "key": "director", "role": "Director", "stage": "director" },
      { "level": 8, "key": "partner", "role": "Partner", "stage": "partner" }
    ],
    "community_mapping": {
      "prospect": "trainee", "applicant": "trainee", "opener": "trainee", "trainee": "trainee",
      "setter": "setter", "associate_setter": "setter", "associate": "setter",
      "senior_associate": "setter", "senior_setter": "setter",
      "junior_manager": "closer", "manager": "closer", "senior_manager": "closer",
      "director": "manager", "partner": "manager"
    },
    "commission_rates": {
      "opener": 0.01, "trainee": 0.01,
      "setter": 0.03, "associate_setter": 0.03, "associate": 0.03,
      "senior_associate": 0.05, "senior_setter": 0.05,
      "junior_manager": 0.08, "manager": 0.10, "senior_manager": 0.12,
      "director": 0.03, "partner": 0.02
    },
    "promotion_thresholds": {
      "1": { "requires_onboarding": true },
      "2": { "calls": 10, "show_rate": 55, "modules_done": 3 },
      "3": { "calls": 25, "show_rate": 65, "modules_done": 6 },
      "4": { "calls": 40, "show_rate": 70, "close_rate": 15, "requires_certification": true },
      "5": { "calls": 80, "show_rate": 75, "close_rate": 25, "revenue": 10000 },
      "6": { "calls": 150, "show_rate": 80, "close_rate": 30, "revenue": 50000, "epc": 200 },
      "7": { "manual_review": true },
      "8": { "invitation_only": true }
    }
  }'::jsonb
) ON CONFLICT (product_key) DO NOTHING;
