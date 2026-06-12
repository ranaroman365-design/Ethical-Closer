
-- community_modules: read for all authenticated users
CREATE POLICY "auth_read_modules" ON public.community_modules
  FOR SELECT TO authenticated USING (true);

-- community_challenges: read for all authenticated users
CREATE POLICY "auth_read_challenges" ON public.community_challenges
  FOR SELECT TO authenticated USING (true);

-- module_completions: own rows
CREATE POLICY "own_read_completions" ON public.module_completions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert_completions" ON public.module_completions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- challenge_submissions: own rows (read+insert)
CREATE POLICY "own_read_submissions" ON public.challenge_submissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert_submissions" ON public.challenge_submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
