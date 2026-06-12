
CREATE POLICY "own_read_aplayer" ON public.aplayer_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_insert_aplayer" ON public.aplayer_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_read_aplayer" ON public.aplayer_applications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
