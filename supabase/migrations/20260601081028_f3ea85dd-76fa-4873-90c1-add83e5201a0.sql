-- Registry table mapping slot_key (= route) -> uploaded image
CREATE TABLE IF NOT EXISTS public.masterofsales_proof_assets (
  slot_key      text PRIMARY KEY,
  image_url     text NOT NULL,
  storage_path  text NOT NULL,
  alt_text      text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.masterofsales_proof_assets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.masterofsales_proof_assets TO authenticated;
GRANT ALL ON public.masterofsales_proof_assets TO service_role;

ALTER TABLE public.masterofsales_proof_assets ENABLE ROW LEVEL SECURITY;

-- Public read (landing page visitors)
CREATE POLICY "mos_proof_assets_public_read"
  ON public.masterofsales_proof_assets FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admin write
CREATE POLICY "mos_proof_assets_admin_insert"
  ON public.masterofsales_proof_assets FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mos_proof_assets_admin_update"
  ON public.masterofsales_proof_assets FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mos_proof_assets_admin_delete"
  ON public.masterofsales_proof_assets FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Public storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('masterofsales-proofs', 'masterofsales-proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Bucket policies on storage.objects
CREATE POLICY "mos_proofs_bucket_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'masterofsales-proofs');

CREATE POLICY "mos_proofs_bucket_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'masterofsales-proofs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mos_proofs_bucket_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'masterofsales-proofs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mos_proofs_bucket_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'masterofsales-proofs' AND public.has_role(auth.uid(), 'admin'));