-- Create the update function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Extend placement_opportunities with company input fields
ALTER TABLE public.placement_opportunities
  ADD COLUMN IF NOT EXISTS ticket_size text,
  ADD COLUMN IF NOT EXISTS target_audience text,
  ADD COLUMN IF NOT EXISTS call_type text DEFAULT 'warm',
  ADD COLUMN IF NOT EXISTS expected_volume text,
  ADD COLUMN IF NOT EXISTS product_type text;

-- Create placement_matches table for the matching engine
CREATE TABLE public.placement_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.placement_opportunities(id) ON DELETE CASCADE,
  closer_user_id uuid NOT NULL,
  match_score integer NOT NULL DEFAULT 0,
  match_reasoning jsonb DEFAULT '[]'::jsonb,
  depth_score numeric DEFAULT 0,
  objection_score numeric DEFAULT 0,
  commitment_score numeric DEFAULT 0,
  close_rate numeric DEFAULT 0,
  conversation_style text,
  product_fit_score numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'suggested',
  placement_outcome text,
  revenue_generated numeric DEFAULT 0,
  retention_days integer,
  feedback_score numeric,
  feedback_notes text,
  placed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(opportunity_id, closer_user_id)
);

ALTER TABLE public.placement_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own matches"
  ON public.placement_matches FOR SELECT
  USING (auth.uid() = closer_user_id);

CREATE POLICY "Admins full access to matches"
  ON public.placement_matches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'administrator', 'owner', 'ops_admin')
    )
  );

CREATE TRIGGER update_placement_matches_updated_at
  BEFORE UPDATE ON public.placement_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();