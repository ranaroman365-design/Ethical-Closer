
CREATE TABLE public.applicant_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  commitment integer NOT NULL DEFAULT 0 CHECK (commitment >= 0 AND commitment <= 20),
  financial_ability integer NOT NULL DEFAULT 0 CHECK (financial_ability >= 0 AND financial_ability <= 20),
  time_availability integer NOT NULL DEFAULT 0 CHECK (time_availability >= 0 AND time_availability <= 20),
  communication_quality integer NOT NULL DEFAULT 0 CHECK (communication_quality >= 0 AND communication_quality <= 20),
  goal_clarity integer NOT NULL DEFAULT 0 CHECK (goal_clarity >= 0 AND goal_clarity <= 20),
  total_score integer GENERATED ALWAYS AS (commitment + financial_ability + time_availability + communication_quality + goal_clarity) STORED,
  player_type text GENERATED ALWAYS AS (
    CASE 
      WHEN (commitment + financial_ability + time_availability + communication_quality + goal_clarity) >= 80 THEN 'A'
      WHEN (commitment + financial_ability + time_availability + communication_quality + goal_clarity) >= 60 THEN 'B'
      ELSE 'C'
    END
  ) STORED,
  admin_notes text,
  scored_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id)
);

ALTER TABLE public.applicant_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage applicant scores"
  ON public.applicant_scores FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read own score via lead email"
  ON public.applicant_scores FOR SELECT
  TO anon, authenticated
  USING (true);
