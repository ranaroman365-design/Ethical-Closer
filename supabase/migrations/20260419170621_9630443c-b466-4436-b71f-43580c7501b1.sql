
CREATE POLICY "auth_read_events" ON public.live_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_attendances" ON public.live_attendances
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "own_insert_attendance" ON public.live_attendances
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_delete_attendance" ON public.live_attendances
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
