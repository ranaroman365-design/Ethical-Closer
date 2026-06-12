
-- 1. SCRIPT ENGINE TABLES
CREATE TABLE IF NOT EXISTS public.sales_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL DEFAULT 'closer',
  status TEXT NOT NULL DEFAULT 'active',
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.script_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID NOT NULL REFERENCES public.sales_scripts(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('opening','discovery','pain','pitch','objection','closing','followup')),
  content TEXT NOT NULL,
  context TEXT,
  score NUMERIC(5,2) DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','AI_PATTERN','imported')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','suggested')),
  source_pattern_id UUID REFERENCES public.copilot_pattern_insights(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_script_blocks_script ON public.script_blocks(script_id, phase);
CREATE INDEX IF NOT EXISTS idx_script_blocks_source ON public.script_blocks(source, status);

CREATE TABLE IF NOT EXISTS public.script_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID NOT NULL REFERENCES public.sales_scripts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(script_id, version)
);

ALTER TABLE public.sales_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scripts_read_authenticated" ON public.sales_scripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "blocks_read_authenticated" ON public.script_blocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "versions_read_authenticated" ON public.script_versions FOR SELECT TO authenticated USING (true);

CREATE POLICY "scripts_write_admin" ON public.sales_scripts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "blocks_write_admin" ON public.script_blocks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "versions_write_admin" ON public.script_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER trg_sales_scripts_updated_at BEFORE UPDATE ON public.sales_scripts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_script_blocks_updated_at BEFORE UPDATE ON public.script_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. SCHEDULED OUTCOME FALLBACK
CREATE TABLE IF NOT EXISTS public.scheduled_outcome_fallback (
  call_id UUID PRIMARY KEY REFERENCES public.calls(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_outcome_fallback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sof_admin_only" ON public.scheduled_outcome_fallback FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE OR REPLACE FUNCTION public.enforce_call_result_on_complete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cutoff CONSTANT TIMESTAMPTZ := '2026-04-26 00:00:00+00';
BEGIN
  IF NEW.created_at >= cutoff
     AND NEW.status = 'completed'
     AND (NEW.result IS NULL OR NEW.result = '')
     AND OLD.status IS DISTINCT FROM 'completed' THEN
    INSERT INTO public.scheduled_outcome_fallback (call_id, due_at)
    VALUES (NEW.id, now() + interval '24 hours')
    ON CONFLICT (call_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_call_result ON public.calls;
CREATE TRIGGER trg_enforce_call_result AFTER UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.enforce_call_result_on_complete();

-- 3. AUTO-ANALYZE QUEUE
CREATE TABLE IF NOT EXISTS public.pending_call_analyses (
  call_id UUID PRIMARY KEY REFERENCES public.calls(id) ON DELETE CASCADE,
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ
);
ALTER TABLE public.pending_call_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pca_admin_only" ON public.pending_call_analyses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE OR REPLACE FUNCTION public.enqueue_call_analysis_on_transcript()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.transcript IS NOT NULL
     AND length(NEW.transcript) > 50
     AND (TG_OP = 'INSERT' OR OLD.transcript IS NULL OR OLD.transcript = '')
     AND NOT EXISTS (SELECT 1 FROM public.call_analysis WHERE call_id = NEW.id) THEN
    INSERT INTO public.pending_call_analyses (call_id) VALUES (NEW.id) ON CONFLICT (call_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enqueue_call_analysis ON public.calls;
CREATE TRIGGER trg_enqueue_call_analysis AFTER INSERT OR UPDATE OF transcript ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_call_analysis_on_transcript();

-- 4. STORAGE RLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='call_recordings_user_upload') THEN
    CREATE POLICY "call_recordings_user_upload" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'call-recordings' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='call_recordings_user_read') THEN
    CREATE POLICY "call_recordings_user_read" ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'call-recordings' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='call_recordings_user_delete') THEN
    CREATE POLICY "call_recordings_user_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'call-recordings' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')));
  END IF;
END $$;

-- 5. SEED starter scripts
INSERT INTO public.sales_scripts (name, description, level, role)
SELECT 'Closer Master Script', 'Lebendiges Closer-Skript. Manuelle Bausteine + KI-Vorschlaege aus echten Calls.', 4, 'closer'
WHERE NOT EXISTS (SELECT 1 FROM public.sales_scripts WHERE name = 'Closer Master Script');

INSERT INTO public.sales_scripts (name, description, level, role)
SELECT 'Setter Master Script', 'Lebendiges Setter-Skript. Manuelle Bausteine + KI-Vorschlaege.', 2, 'setter'
WHERE NOT EXISTS (SELECT 1 FROM public.sales_scripts WHERE name = 'Setter Master Script');
