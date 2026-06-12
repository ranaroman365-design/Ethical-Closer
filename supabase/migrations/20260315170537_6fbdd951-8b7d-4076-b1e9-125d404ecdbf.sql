
-- Add member_status and certification_status and cohort to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS member_status text NOT NULL DEFAULT 'enrolled',
  ADD COLUMN IF NOT EXISTS certification_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS cohort text;

-- KPI tracking table
CREATE TABLE public.member_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  closing_rate numeric DEFAULT 0,
  revenue_closed numeric DEFAULT 0,
  calls_handled integer DEFAULT 0,
  show_rate numeric DEFAULT 0,
  qualification_accuracy numeric DEFAULT 0,
  objection_resolution_rate numeric DEFAULT 0,
  revenue_per_call numeric DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.member_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own kpis" ON public.member_kpis
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update own kpis" ON public.member_kpis
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own kpis" ON public.member_kpis
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Quiz system
CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  question text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_answer text NOT NULL,
  explanation text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read quiz questions" ON public.quiz_questions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage quiz questions" ON public.quiz_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_id uuid NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  score integer NOT NULL,
  total_questions integer NOT NULL,
  passed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own attempts" ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own attempts" ON public.quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Practice calls storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('practice-calls', 'practice-calls', false);

CREATE POLICY "Users upload own calls" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'practice-calls' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users read own calls" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'practice-calls' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

-- Practice call records table
CREATE TABLE public.practice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  scorecard jsonb,
  total_score integer,
  status text NOT NULL DEFAULT 'uploaded',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.practice_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own practice calls" ON public.practice_calls
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own practice calls" ON public.practice_calls
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Update practice calls" ON public.practice_calls
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Update handle_new_user to also create KPIs
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  INSERT INTO public.member_kpis (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
