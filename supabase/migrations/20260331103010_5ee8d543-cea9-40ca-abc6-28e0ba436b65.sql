
-- ============================================================
-- PHASE 1B: Tables, Functions, RLS for Security Hardening
-- ============================================================

-- TENANTS TABLE
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  product_key text DEFAULT 'etc',
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- TENANT MEMBERSHIPS TABLE
CREATE TABLE IF NOT EXISTS public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

-- ADMIN PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  resource_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  owner_only boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role, resource_key)
);
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- SECURITY EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text,
  acting_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  target_resource_type text,
  target_resource_id text,
  severity text NOT NULL DEFAULT 'info',
  risk_score int DEFAULT 0,
  ip_address text,
  user_agent text,
  session_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  result text DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- EXPORT REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  export_type text NOT NULL,
  resource_type text NOT NULL,
  risk_level text NOT NULL DEFAULT 'low',
  row_count int,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  reason text,
  file_path text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE public.export_requests ENABLE ROW LEVEL SECURITY;

-- ROLE ESCALATION REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.role_escalation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_role public.app_role NOT NULL,
  reason text NOT NULL,
  duration_minutes int NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_notes text,
  active_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.role_escalation_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECURITY DEFINER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_security_privileged(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner', 'security_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_memberships WHERE user_id = _user_id AND tenant_id = _tenant_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_ids(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(tenant_id), '{}') FROM public.tenant_memberships WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.check_permission(_user_id uuid, _resource_key text, _action text DEFAULT 'view')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.admin_permissions ap ON ap.role = ur.role
    WHERE ur.user_id = _user_id
      AND ap.resource_key = _resource_key
      AND CASE _action
            WHEN 'view' THEN ap.can_view
            WHEN 'edit' THEN ap.can_edit
            WHEN 'export' THEN ap.can_export
            WHEN 'delete' THEN ap.can_delete
            ELSE false
          END
  )
$$;

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_target_resource_type text DEFAULT NULL,
  p_target_resource_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_risk_score int DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_role text;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.security_events (
    actor_user_id, actor_role, event_type, severity,
    target_resource_type, target_resource_id, risk_score, metadata, result
  ) VALUES (
    auth.uid(), v_role, p_event_type, p_severity,
    p_target_resource_type, p_target_resource_id, p_risk_score, p_metadata, 'success'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================================

-- Tenants
CREATE POLICY "tenant_select" ON public.tenants FOR SELECT USING (
  public.is_security_privileged(auth.uid())
  OR id IN (SELECT unnest(public.get_user_tenant_ids(auth.uid())))
);
CREATE POLICY "tenant_manage" ON public.tenants FOR ALL USING (public.is_owner(auth.uid()));

-- Tenant memberships
CREATE POLICY "membership_select" ON public.tenant_memberships FOR SELECT USING (
  user_id = auth.uid()
  OR public.is_security_privileged(auth.uid())
  OR public.is_tenant_member(auth.uid(), tenant_id)
);
CREATE POLICY "membership_manage" ON public.tenant_memberships FOR ALL USING (public.is_owner(auth.uid()));

-- Admin permissions
CREATE POLICY "perms_select" ON public.admin_permissions FOR SELECT USING (
  public.has_any_role(auth.uid(), ARRAY['owner','security_admin','ops_admin','admin']::app_role[])
);
CREATE POLICY "perms_manage" ON public.admin_permissions FOR ALL USING (public.is_owner(auth.uid()));

-- Security events
CREATE POLICY "sec_events_select" ON public.security_events FOR SELECT USING (public.is_security_privileged(auth.uid()));
CREATE POLICY "sec_events_insert" ON public.security_events FOR INSERT WITH CHECK (true);

-- Export requests
CREATE POLICY "export_select" ON public.export_requests FOR SELECT USING (
  requested_by = auth.uid() OR public.is_security_privileged(auth.uid())
);
CREATE POLICY "export_insert" ON public.export_requests FOR INSERT WITH CHECK (requested_by = auth.uid());
CREATE POLICY "export_update" ON public.export_requests FOR UPDATE USING (public.is_security_privileged(auth.uid()));

-- Role escalation requests
CREATE POLICY "escalation_select" ON public.role_escalation_requests FOR SELECT USING (
  requester_id = auth.uid() OR public.is_security_privileged(auth.uid())
);
CREATE POLICY "escalation_insert" ON public.role_escalation_requests FOR INSERT WITH CHECK (requester_id = auth.uid());
CREATE POLICY "escalation_update" ON public.role_escalation_requests FOR UPDATE USING (public.is_security_privileged(auth.uid()));

-- ============================================================
-- SEED DEFAULT ADMIN PERMISSIONS MATRIX
-- ============================================================
INSERT INTO public.admin_permissions (role, resource_key, can_view, can_edit, can_export, can_delete, owner_only, description) VALUES
  ('owner','security_console',true,true,true,true,true,'Security dashboard'),
  ('owner','audit_logs',true,false,true,false,true,'Immutable audit trail'),
  ('owner','prompt_vault',true,true,true,true,true,'AI system prompts'),
  ('owner','workflow_registry',true,true,true,true,false,'Automation configs'),
  ('owner','integration_registry',true,true,false,true,false,'External integrations'),
  ('owner','export_center',true,true,true,false,false,'Data exports'),
  ('owner','tenant_management',true,true,false,true,true,'Tenant admin'),
  ('owner','role_escalation',true,true,false,false,false,'JIT access'),
  ('owner','system_config',true,true,true,false,true,'System config'),
  ('owner','ip_assets',true,true,false,false,true,'IP assets'),
  ('security_admin','security_console',true,true,false,false,false,NULL),
  ('security_admin','audit_logs',true,false,true,false,false,NULL),
  ('security_admin','workflow_registry',true,false,false,false,false,NULL),
  ('security_admin','integration_registry',true,false,false,false,false,NULL),
  ('security_admin','export_center',true,true,false,false,false,NULL),
  ('security_admin','role_escalation',true,true,false,false,false,NULL),
  ('ops_admin','users',true,true,false,false,false,NULL),
  ('ops_admin','onboarding',true,true,false,false,false,NULL),
  ('ops_admin','leads',true,true,false,false,false,NULL),
  ('content_admin','academy',true,true,false,false,false,NULL),
  ('content_admin','content_assets',true,true,false,true,false,NULL),
  ('finance_admin','commissions',true,false,true,false,false,NULL),
  ('finance_admin','export_center',true,false,true,false,false,'Finance exports'),
  ('support_admin','users',true,false,false,false,false,'Support user view'),
  ('support_admin','leads',true,false,false,false,false,NULL),
  ('partner_admin','tenant_dashboard',true,true,false,false,false,NULL),
  ('analyst_readonly','dashboards',true,false,false,false,false,'Read-only dashboards'),
  ('admin','security_console',true,false,false,false,false,NULL),
  ('admin','audit_logs',true,false,false,false,false,NULL),
  ('admin','users',true,true,true,true,false,NULL),
  ('admin','leads',true,true,true,true,false,NULL),
  ('admin','export_center',true,true,true,false,false,NULL),
  ('admin','system_config',true,true,false,false,false,NULL)
ON CONFLICT (role, resource_key) DO NOTHING;
