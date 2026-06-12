CREATE POLICY "Anon can update own quiz submissions by id"
  ON public.quiz_submissions FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);