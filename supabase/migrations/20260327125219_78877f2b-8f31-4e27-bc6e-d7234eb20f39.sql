
CREATE TABLE public.quiz_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  funnel_source text NOT NULL DEFAULT 'lifestyle',
  answers_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  scores_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  final_segment text NOT NULL DEFAULT 'lifestyle',
  commitment_level text,
  primary_pain text,
  desired_outcome text,
  quiz_score integer DEFAULT 0,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can insert quiz submissions"
  ON public.quiz_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins read all quiz submissions"
  ON public.quiz_submissions FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Setters and closers read linked quiz submissions"
  ON public.quiz_submissions FOR SELECT
  TO authenticated
  USING (
    lead_id IN (
      SELECT id FROM public.leads
      WHERE setter_id = auth.uid() OR closer_id = auth.uid() OR owner_id = auth.uid()
    )
  );

CREATE POLICY "Read own by session"
  ON public.quiz_submissions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX idx_quiz_submissions_session ON public.quiz_submissions(session_id);
CREATE INDEX idx_quiz_submissions_lead ON public.quiz_submissions(lead_id);
