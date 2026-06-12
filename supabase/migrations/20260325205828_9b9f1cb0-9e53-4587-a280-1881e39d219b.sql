
-- Table: calls (main call uploads)
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_url text,
  transcript text,
  duration integer,
  call_type text NOT NULL DEFAULT 'closer',
  funnel_stage text NOT NULL DEFAULT 'warm',
  offer_type text NOT NULL DEFAULT 'high_ticket',
  price_point integer DEFAULT 0,
  awareness_level text DEFAULT 'problem_aware',
  emotional_state text DEFAULT 'curious',
  lead_source text DEFAULT 'organic',
  result text DEFAULT 'no_decision',
  deal_size integer DEFAULT 0,
  objection_type text,
  self_rating integer DEFAULT 5,
  self_breakpoint text,
  self_uncertainty text,
  status text NOT NULL DEFAULT 'uploaded',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own calls" ON public.calls FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own calls" ON public.calls FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own calls" ON public.calls FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- Table: call_analysis (AI analysis results)
CREATE TABLE public.call_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  overall_score numeric DEFAULT 0,
  opening_score numeric DEFAULT 0,
  rapport_score numeric DEFAULT 0,
  qualification_score numeric DEFAULT 0,
  pain_score numeric DEFAULT 0,
  desire_score numeric DEFAULT 0,
  pitch_score numeric DEFAULT 0,
  closing_score numeric DEFAULT 0,
  talk_ratio numeric DEFAULT 0,
  question_depth_score numeric DEFAULT 0,
  engagement_score numeric DEFAULT 0,
  objection_score numeric DEFAULT 0,
  closing_efficiency numeric DEFAULT 0,
  top_3_mistakes jsonb DEFAULT '[]',
  objections_detected jsonb DEFAULT '[]',
  language_feedback jsonb DEFAULT '[]',
  closing_feedback jsonb DEFAULT '[]',
  action_plan jsonb DEFAULT '[]',
  structure_details jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.call_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own analyses" ON public.call_analysis FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.calls WHERE calls.id = call_analysis.call_id AND (calls.user_id = auth.uid() OR has_role(auth.uid(), 'admin')))
  );
CREATE POLICY "Service insert analyses" ON public.call_analysis FOR INSERT TO authenticated
  WITH CHECK (true);

-- Table: performance_metrics (aggregated user metrics)
CREATE TABLE public.performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  avg_call_score numeric DEFAULT 0,
  closing_rate numeric DEFAULT 0,
  objection_score numeric DEFAULT 0,
  trend_score numeric DEFAULT 0,
  total_calls integer DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own metrics" ON public.performance_metrics FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Upsert own metrics" ON public.performance_metrics FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "Update metrics" ON public.performance_metrics FOR UPDATE TO authenticated
  USING (true);
