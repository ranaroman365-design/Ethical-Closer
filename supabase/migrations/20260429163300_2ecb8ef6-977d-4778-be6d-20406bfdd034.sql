-- Private Storage bucket for cleanup CSV backups (admin-only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cleanup-backups', 'cleanup-backups', false)
ON CONFLICT (id) DO NOTHING;

-- Admin-only access to objects in this bucket
CREATE POLICY "Admins can read cleanup backups"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'cleanup-backups'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can upload cleanup backups"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cleanup-backups'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);