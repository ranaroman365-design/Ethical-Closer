
-- Placement applications table
CREATE TABLE public.placement_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  opportunity_id uuid NOT NULL REFERENCES public.placement_opportunities(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'submitted',
  match_score integer DEFAULT 0,
  admin_notes text,
  user_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  placed_at timestamp with time zone,
  UNIQUE(user_id, opportunity_id)
);

-- Add more fields to placement_opportunities for better matching
ALTER TABLE public.placement_opportunities ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.placement_opportunities ADD COLUMN IF NOT EXISTS niche text;
ALTER TABLE public.placement_opportunities ADD COLUMN IF NOT EXISTS language text DEFAULT 'Deutsch';
ALTER TABLE public.placement_opportunities ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.placement_opportunities ADD COLUMN IF NOT EXISTS min_close_rate numeric DEFAULT 0;
ALTER TABLE public.placement_opportunities ADD COLUMN IF NOT EXISTS min_show_rate numeric DEFAULT 0;
ALTER TABLE public.placement_opportunities ADD COLUMN IF NOT EXISTS experience_level text DEFAULT 'junior_manager';

-- RLS for placement_applications
ALTER TABLE public.placement_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own applications"
  ON public.placement_applications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own applications"
  ON public.placement_applications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own applications"
  ON public.placement_applications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete applications"
  ON public.placement_applications FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
