DROP POLICY IF EXISTS "Quiz submissions update by session" ON public.quiz_submissions;
CREATE POLICY "Quiz submissions admin update only" ON public.quiz_submissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );