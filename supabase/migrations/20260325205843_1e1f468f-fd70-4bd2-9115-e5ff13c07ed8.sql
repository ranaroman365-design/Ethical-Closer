
-- Fix permissive INSERT on call_analysis: only service role or admin
DROP POLICY "Service insert analyses" ON public.call_analysis;
CREATE POLICY "Admin insert analyses" ON public.call_analysis FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Fix permissive INSERT on performance_metrics
DROP POLICY "Upsert own metrics" ON public.performance_metrics;
CREATE POLICY "Admin insert metrics" ON public.performance_metrics FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Fix permissive UPDATE on performance_metrics
DROP POLICY "Update metrics" ON public.performance_metrics;
CREATE POLICY "Admin update metrics" ON public.performance_metrics FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'));

-- Create storage bucket for call recordings
INSERT INTO storage.buckets (id, name, public) VALUES ('call-recordings', 'call-recordings', false);

-- Storage policies for call recordings
CREATE POLICY "Users upload own recordings" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'call-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users read own recordings" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'call-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
