-- Create a public storage bucket for admin-recorded module videos
INSERT INTO storage.buckets (id, name, public) VALUES ('module-videos', 'module-videos', true);

-- Allow admins to upload/update/delete videos
CREATE POLICY "Admins upload module videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'module-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update module videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'module-videos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete module videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'module-videos' AND public.has_role(auth.uid(), 'admin'));

-- Anyone authenticated can read module videos
CREATE POLICY "Authenticated read module videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'module-videos');