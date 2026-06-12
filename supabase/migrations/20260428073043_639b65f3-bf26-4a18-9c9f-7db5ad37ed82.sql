
-- ═══════════════════════════════════════════════════════════════════════
-- LAYER 37 — Audit, Versioning & Reporting
-- Additive only. No existing table touched.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. change_audit_log (immutable) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.change_audit_log (
  change_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by_kind        TEXT NOT NULL CHECK (changed_by_kind IN ('admin','operator','system')),
  changed_by             UUID,
  change_type            TEXT NOT NULL CHECK (change_type IN
    ('create','update','delete','enable','disable','rollback','approve','reject','threshold_change','weight_shift','version_activate','escalation')),
  scope_type             TEXT NOT NULL CHECK (scope_type IN ('global','operator','funnel','lead')),
  scope_id               TEXT,
  module                 TEXT NOT NULL CHECK (module IN
    ('lead_lifecycle','smart_attendance','ai_setter','message_library','message_performance',
     'level_messaging','self_optimization','operator_control','touchpoint_sequence','ai_setter_guardrails','funnel_intelligence')),
  previous_state         JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_state              JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason                 TEXT NOT NULL,
  metric_basis           JSONB DEFAULT '{}'::jsonb,
  confidence_score       NUMERIC(4,3),
  reversible             BOOLEAN NOT NULL DEFAULT true,
  rollback_reference_id  UUID REFERENCES public.change_audit_log(change_id) ON DELETE SET NULL,
  rule_triggered         TEXT,
  threshold_met          JSONB,
  sample_size            INTEGER,
  before_metric          JSONB,
  after_metric           JSONB,
  expected_impact        TEXT,
  risk_level             TEXT CHECK (risk_level IN ('low','medium','high')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_module_created ON public.change_audit_log(module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_scope          ON public.change_audit_log(scope_type, scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor          ON public.change_audit_log(changed_by, created_at DESC);

ALTER TABLE public.change_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_admin_all ON public.change_audit_log;
CREATE POLICY audit_admin_all ON public.change_audit_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS audit_operator_read ON public.change_audit_log;
CREATE POLICY audit_operator_read ON public.change_audit_log
  FOR SELECT TO authenticated
  USING (
    scope_type = 'global' AND false  -- operators do NOT see global
    OR (scope_type IN ('funnel','operator') AND scope_id IS NOT NULL
        AND public.is_funnel_operator(scope_id))
  );

DROP POLICY IF EXISTS audit_operator_insert ON public.change_audit_log;
CREATE POLICY audit_operator_insert ON public.change_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    changed_by_kind = 'operator'
    AND changed_by = auth.uid()
    AND scope_type IN ('funnel','operator','lead')
    AND scope_id IS NOT NULL
    AND public.is_funnel_operator(scope_id)
  );

-- Hard immutability: forbid UPDATE / DELETE for everyone (admins included).
CREATE OR REPLACE FUNCTION public.tg_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'change_audit_log is immutable (operation: %)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_no_update ON public.change_audit_log;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON public.change_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_immutable();

DROP TRIGGER IF EXISTS trg_audit_no_delete ON public.change_audit_log;
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON public.change_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_audit_immutable();

-- ── 2. config_versions (append-only history) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.config_versions (
  version_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_version_id UUID REFERENCES public.config_versions(version_id) ON DELETE SET NULL,
  module            TEXT NOT NULL CHECK (module IN
    ('lead_lifecycle','smart_attendance','ai_setter','message_library','message_performance',
     'level_messaging','self_optimization','operator_control','touchpoint_sequence','ai_setter_guardrails','funnel_intelligence')),
  scope_type        TEXT NOT NULL CHECK (scope_type IN ('global','operator','funnel','lead')),
  scope_id          TEXT,
  config_snapshot   JSONB NOT NULL,
  created_by        UUID,
  reason            TEXT,
  active            BOOLEAN NOT NULL DEFAULT false,
  source_change_id  UUID REFERENCES public.change_audit_log(change_id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_module_scope ON public.config_versions(module, scope_type, scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cv_active       ON public.config_versions(module, scope_type, scope_id) WHERE active = true;

-- Only one active per (module, scope_type, scope_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_cv_one_active
  ON public.config_versions(module, scope_type, COALESCE(scope_id,'__GLOBAL__'))
  WHERE active = true;

ALTER TABLE public.config_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cv_admin_all ON public.config_versions;
CREATE POLICY cv_admin_all ON public.config_versions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS cv_operator_read ON public.config_versions;
CREATE POLICY cv_operator_read ON public.config_versions
  FOR SELECT TO authenticated
  USING (
    scope_type IN ('funnel','operator')
    AND scope_id IS NOT NULL
    AND public.is_funnel_operator(scope_id)
  );

-- Forbid UPDATE/DELETE — versions are append-only.
CREATE OR REPLACE FUNCTION public.tg_cv_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Allow flipping `active` only; everything else immutable.
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.module IS DISTINCT FROM NEW.module
        OR OLD.scope_type IS DISTINCT FROM NEW.scope_type
        OR OLD.scope_id IS DISTINCT FROM NEW.scope_id
        OR OLD.config_snapshot IS DISTINCT FROM NEW.config_snapshot
        OR OLD.parent_version_id IS DISTINCT FROM NEW.parent_version_id
        OR OLD.created_by IS DISTINCT FROM NEW.created_by
        OR OLD.created_at IS DISTINCT FROM NEW.created_at) THEN
      RAISE EXCEPTION 'config_versions snapshot is immutable; only `active` may change';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'config_versions does not allow %', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_cv_immutable_update ON public.config_versions;
CREATE TRIGGER trg_cv_immutable_update BEFORE UPDATE ON public.config_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_cv_immutable();

DROP TRIGGER IF EXISTS trg_cv_no_delete ON public.config_versions;
CREATE TRIGGER trg_cv_no_delete BEFORE DELETE ON public.config_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_cv_immutable();

-- ── 3. optimization_reports (PDF registry) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.optimization_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type   TEXT NOT NULL CHECK (report_type IN ('change','daily','weekly','operator','rollback')),
  module        TEXT,
  scope_type    TEXT NOT NULL CHECK (scope_type IN ('global','operator','funnel','lead')),
  scope_id      TEXT,
  change_id     UUID REFERENCES public.change_audit_log(change_id) ON DELETE SET NULL,
  version_id    UUID REFERENCES public.config_versions(version_id) ON DELETE SET NULL,
  storage_path  TEXT,
  file_url      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','ready','failed')),
  generated_by  UUID,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_scope  ON public.optimization_reports(scope_type, scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_change ON public.optimization_reports(change_id);
CREATE INDEX IF NOT EXISTS idx_reports_type   ON public.optimization_reports(report_type, created_at DESC);

ALTER TABLE public.optimization_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rep_admin_all ON public.optimization_reports;
CREATE POLICY rep_admin_all ON public.optimization_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'));

DROP POLICY IF EXISTS rep_operator_read ON public.optimization_reports;
CREATE POLICY rep_operator_read ON public.optimization_reports
  FOR SELECT TO authenticated
  USING (
    scope_type IN ('funnel','operator')
    AND scope_id IS NOT NULL
    AND public.is_funnel_operator(scope_id)
  );

-- ── 4. restore_config_version RPC ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_config_version(
  _version_id UUID,
  _reason     TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old             public.config_versions%ROWTYPE;
  v_active          public.config_versions%ROWTYPE;
  v_actor_kind      TEXT;
  v_new_version_id  UUID;
  v_change_id       UUID;
BEGIN
  SELECT * INTO v_old FROM public.config_versions WHERE version_id = _version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'version % not found', _version_id;
  END IF;

  -- Authorization: admin always; operator only for funnel/operator scope they own.
  IF public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') THEN
    v_actor_kind := 'admin';
  ELSIF v_old.scope_type IN ('funnel','operator')
        AND v_old.scope_id IS NOT NULL
        AND public.is_funnel_operator(v_old.scope_id) THEN
    v_actor_kind := 'operator';
  ELSE
    RAISE EXCEPTION 'not authorized to restore this version (scope: %)', v_old.scope_type;
  END IF;

  -- Capture current active version for the audit "previous_state".
  SELECT * INTO v_active
  FROM public.config_versions
  WHERE module = v_old.module
    AND scope_type = v_old.scope_type
    AND COALESCE(scope_id,'__GLOBAL__') = COALESCE(v_old.scope_id,'__GLOBAL__')
    AND active = true
  LIMIT 1;

  -- Audit row first (gives us change_id to attach to the new version).
  INSERT INTO public.change_audit_log(
    changed_by_kind, changed_by, change_type, scope_type, scope_id,
    module, previous_state, new_state, reason, reversible,
    rollback_reference_id, risk_level
  ) VALUES (
    v_actor_kind, auth.uid(), 'rollback', v_old.scope_type, v_old.scope_id,
    v_old.module,
    COALESCE(v_active.config_snapshot,'{}'::jsonb),
    v_old.config_snapshot,
    _reason,
    true,
    _version_id,
    'medium'
  )
  RETURNING change_id INTO v_change_id;

  -- Deactivate prior active (allowed by trigger — only `active` flips).
  UPDATE public.config_versions
     SET active = false
   WHERE module = v_old.module
     AND scope_type = v_old.scope_type
     AND COALESCE(scope_id,'__GLOBAL__') = COALESCE(v_old.scope_id,'__GLOBAL__')
     AND active = true;

  -- Append new version that mirrors the restored snapshot.
  INSERT INTO public.config_versions(
    parent_version_id, module, scope_type, scope_id,
    config_snapshot, created_by, reason, active, source_change_id
  ) VALUES (
    _version_id, v_old.module, v_old.scope_type, v_old.scope_id,
    v_old.config_snapshot, auth.uid(),
    'rollback: ' || _reason, true, v_change_id
  )
  RETURNING version_id INTO v_new_version_id;

  -- Stub a rollback report (PDF generated async by edge function).
  INSERT INTO public.optimization_reports(
    report_type, module, scope_type, scope_id,
    change_id, version_id, generated_by, metadata
  ) VALUES (
    'rollback', v_old.module, v_old.scope_type, v_old.scope_id,
    v_change_id, v_new_version_id, auth.uid(),
    jsonb_build_object('restored_from', _version_id, 'reason', _reason)
  );

  RETURN v_new_version_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_config_version(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_config_version(UUID, TEXT) TO authenticated;

-- ── 5. Storage bucket for PDFs (private) ─────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('optimization-reports','optimization-reports', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket policies
DROP POLICY IF EXISTS rep_bucket_admin_all ON storage.objects;
CREATE POLICY rep_bucket_admin_all ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'optimization-reports'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  )
  WITH CHECK (
    bucket_id = 'optimization-reports'
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner'))
  );

DROP POLICY IF EXISTS rep_bucket_operator_read ON storage.objects;
CREATE POLICY rep_bucket_operator_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'optimization-reports'
    AND EXISTS (
      SELECT 1 FROM public.optimization_reports r
      WHERE r.storage_path = storage.objects.name
        AND r.scope_type IN ('funnel','operator')
        AND r.scope_id IS NOT NULL
        AND public.is_funnel_operator(r.scope_id)
    )
  );
