
-- 1. Add missing columns to kpi_verifications
ALTER TABLE public.kpi_verifications
  ADD COLUMN IF NOT EXISTS qualified_calls integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submission_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS proof_notes text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Create kpi_proof_files table
CREATE TABLE IF NOT EXISTS public.kpi_proof_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.kpi_verifications(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_type text,
  file_name text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kpi_proof_files ENABLE ROW LEVEL SECURITY;

-- RLS: user can see own proof files
CREATE POLICY "Users can view own proof files"
  ON public.kpi_proof_files FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.kpi_verifications kv WHERE kv.id = verification_id AND kv.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can insert own proof files"
  ON public.kpi_proof_files FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Admins can manage proof files"
  ON public.kpi_proof_files FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Create private storage bucket for KPI proof
INSERT INTO storage.buckets (id, name, public) VALUES ('kpi-proof', 'kpi-proof', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload own KPI proof"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'kpi-proof' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view own KPI proof"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'kpi-proof' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "Admins can manage KPI proof"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'kpi-proof' AND public.has_role(auth.uid(), 'admin'));

-- 4. Update kpi_verifications RLS for submission flow
DROP POLICY IF EXISTS "Users can view own kpi_verifications" ON public.kpi_verifications;
DROP POLICY IF EXISTS "Users can insert own kpi_verifications" ON public.kpi_verifications;
DROP POLICY IF EXISTS "Users can update own kpi_verifications" ON public.kpi_verifications;
DROP POLICY IF EXISTS "Admins can manage kpi_verifications" ON public.kpi_verifications;

CREATE POLICY "Users can view own kpi_verifications"
  ON public.kpi_verifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own kpi_verifications"
  ON public.kpi_verifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own draft kpi_verifications"
  ON public.kpi_verifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND submission_status IN ('draft', 'rejected'));

CREATE POLICY "Admins can manage kpi_verifications"
  ON public.kpi_verifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
