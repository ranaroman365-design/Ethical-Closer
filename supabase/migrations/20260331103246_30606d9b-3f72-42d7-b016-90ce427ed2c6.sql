
-- ============================================================
-- PHASE 2: Prompt Vault + Workflow Registry + Session Events + Audit Triggers
-- ============================================================

-- PROMPT REGISTRY (owner-only IP)
CREATE TABLE IF NOT EXISTS public.prompt_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'system',
  current_version int NOT NULL DEFAULT 1,
  sensitivity_level text NOT NULL DEFAULT 'critical',
  owner_only boolean NOT NULL DEFAULT true,
  exportable boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prompt_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_owner_only_select" ON public.prompt_registry
  FOR SELECT USING (public.is_owner(auth.uid()));
CREATE POLICY "prompt_owner_only_manage" ON public.prompt_registry
  FOR ALL USING (public.is_owner(auth.uid()));

-- PROMPT VERSIONS (immutable history)
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES public.prompt_registry(id) ON DELETE CASCADE,
  version int NOT NULL,
  content text NOT NULL,
  change_note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(prompt_id, version)
);
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_ver_owner_only" ON public.prompt_versions
  FOR SELECT USING (public.is_owner(auth.uid()));
CREATE POLICY "prompt_ver_manage" ON public.prompt_versions
  FOR ALL USING (public.is_owner(auth.uid()));

-- WORKFLOW REGISTRY
CREATE TABLE IF NOT EXISTS public.workflow_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  platform text NOT NULL DEFAULT 'n8n',
  description text,
  status text NOT NULL DEFAULT 'active',
  endpoint_url text,
  credential_scope text,
  sensitivity_level text NOT NULL DEFAULT 'high',
  owner_only boolean NOT NULL DEFAULT false,
  exportable boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  error_count int DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workflow_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wf_security_select" ON public.workflow_registry
  FOR SELECT USING (public.is_security_privileged(auth.uid()));
CREATE POLICY "wf_owner_manage" ON public.workflow_registry
  FOR ALL USING (public.is_owner(auth.uid()));

-- INTEGRATION CREDENTIALS REGISTRY
CREATE TABLE IF NOT EXISTS public.integration_credentials_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  credential_type text NOT NULL DEFAULT 'api_key',
  description text,
  last_rotated_at timestamptz,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_credentials_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integ_security_select" ON public.integration_credentials_registry
  FOR SELECT USING (public.is_security_privileged(auth.uid()));
CREATE POLICY "integ_owner_manage" ON public.integration_credentials_registry
  FOR ALL USING (public.is_owner(auth.uid()));

-- SESSION EVENTS (for session tracking / anomaly detection)
CREATE TABLE IF NOT EXISTS public.session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  ip_address text,
  user_agent text,
  country text,
  device_fingerprint text,
  session_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_self_or_security" ON public.session_events
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_security_privileged(auth.uid())
  );
CREATE POLICY "session_insert_auth" ON public.session_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- IP ASSETS TABLE
CREATE TABLE IF NOT EXISTS public.ip_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type text NOT NULL,
  title text NOT NULL,
  description text,
  sensitivity_level text NOT NULL DEFAULT 'critical',
  owner_only boolean NOT NULL DEFAULT true,
  exportable boolean NOT NULL DEFAULT false,
  content_ref text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ip_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ip_owner_only" ON public.ip_assets
  FOR SELECT USING (public.is_owner(auth.uid()));
CREATE POLICY "ip_owner_manage" ON public.ip_assets
  FOR ALL USING (public.is_owner(auth.uid()));

-- AUDIT TRIGGER: log role changes automatically
CREATE OR REPLACE FUNCTION public.audit_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_events (
    actor_user_id, event_type, severity, risk_score,
    target_resource_type, target_resource_id,
    metadata
  ) VALUES (
    auth.uid(), 'role_change', 'high', 80,
    'user_roles', COALESCE(NEW.user_id, OLD.user_id)::text,
    jsonb_build_object(
      'old_role', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.role END,
      'new_role', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.role END,
      'operation', TG_OP
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_role_change ON public.user_roles;
CREATE TRIGGER trg_audit_role_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_change();

-- AUDIT TRIGGER: log export request creation
CREATE OR REPLACE FUNCTION public.audit_export_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_events (
    actor_user_id, event_type, severity, risk_score,
    target_resource_type, target_resource_id,
    metadata
  ) VALUES (
    NEW.requested_by, 'export_requested', 
    CASE NEW.risk_level WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END,
    CASE NEW.risk_level WHEN 'critical' THEN 95 WHEN 'high' THEN 75 WHEN 'medium' THEN 50 ELSE 20 END,
    'export_requests', NEW.id::text,
    jsonb_build_object('export_type', NEW.export_type, 'resource_type', NEW.resource_type, 'risk_level', NEW.risk_level, 'row_count', NEW.row_count)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_export ON public.export_requests;
CREATE TRIGGER trg_audit_export
  AFTER INSERT ON public.export_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_export_request();
