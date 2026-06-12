
CREATE POLICY "auth_read_investment_tips" ON public.investment_tips
  FOR SELECT TO authenticated USING (true);
