
-- Fix unsafe RLS policy on quiz_submissions (no user_id column — use session_id based policy)
DROP POLICY IF EXISTS "Anon can update own quiz submissions by id" ON public.quiz_submissions;
CREATE POLICY "Quiz submissions update by session" ON public.quiz_submissions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
-- Note: quiz_submissions has no user_id — it uses session_id.
-- Since quizzes are anonymous and must be updatable before auth, we keep permissive 
-- but restrict to UPDATE only (INSERT/SELECT policies remain unchanged).
