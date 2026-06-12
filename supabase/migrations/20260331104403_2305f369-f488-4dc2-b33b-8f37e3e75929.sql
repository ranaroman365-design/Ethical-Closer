
-- RLS POLICIES for new tables
CREATE POLICY "roles_select" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_owner_insert" ON public.roles FOR INSERT TO authenticated WITH CHECK (public.is_owner(auth.uid()));
CREATE POLICY "roles_owner_update" ON public.roles FOR UPDATE TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "roles_owner_delete" ON public.roles FOR DELETE TO authenticated USING (public.is_owner(auth.uid()));

CREATE POLICY "perm_select" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "perm_owner_insert" ON public.permissions FOR INSERT TO authenticated WITH CHECK (public.is_owner(auth.uid()));
CREATE POLICY "perm_owner_update" ON public.permissions FOR UPDATE TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "perm_owner_delete" ON public.permissions FOR DELETE TO authenticated USING (public.is_owner(auth.uid()));

CREATE POLICY "sysconfig_owner_select" ON public.system_config FOR SELECT TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "sysconfig_owner_insert" ON public.system_config FOR INSERT TO authenticated WITH CHECK (public.is_owner(auth.uid()));
CREATE POLICY "sysconfig_owner_update" ON public.system_config FOR UPDATE TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "sysconfig_owner_delete" ON public.system_config FOR DELETE TO authenticated USING (public.is_owner(auth.uid()));

CREATE POLICY "ghl_sec_select" ON public.ghl_accounts FOR SELECT TO authenticated USING (public.is_security_privileged(auth.uid()) OR public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "ghl_owner_insert" ON public.ghl_accounts FOR INSERT TO authenticated WITH CHECK (public.is_owner(auth.uid()));
CREATE POLICY "ghl_owner_update" ON public.ghl_accounts FOR UPDATE TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "ghl_owner_delete" ON public.ghl_accounts FOR DELETE TO authenticated USING (public.is_owner(auth.uid()));

CREATE POLICY "ae_sec_select" ON public.automation_endpoints FOR SELECT TO authenticated USING (public.is_security_privileged(auth.uid()));
CREATE POLICY "ae_owner_insert" ON public.automation_endpoints FOR INSERT TO authenticated WITH CHECK (public.is_owner(auth.uid()));
CREATE POLICY "ae_owner_update" ON public.automation_endpoints FOR UPDATE TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "ae_owner_delete" ON public.automation_endpoints FOR DELETE TO authenticated USING (public.is_owner(auth.uid()));

CREATE POLICY "aia_sec_select" ON public.ai_agent_actions FOR SELECT TO authenticated USING (public.is_security_privileged(auth.uid()));
CREATE POLICY "aia_auth_insert" ON public.ai_agent_actions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "ca_auth_select" ON public.content_assets FOR SELECT TO authenticated USING (visibility = 'public' OR public.is_security_privileged(auth.uid()) OR public.check_permission(auth.uid(), 'content') OR (tenant_id IS NOT NULL AND public.is_tenant_member(auth.uid(), tenant_id)));
CREATE POLICY "ca_content_insert" ON public.content_assets FOR INSERT TO authenticated WITH CHECK (public.is_security_privileged(auth.uid()) OR public.check_permission(auth.uid(), 'content'));
CREATE POLICY "ca_content_update" ON public.content_assets FOR UPDATE TO authenticated USING (public.is_security_privileged(auth.uid()) OR public.check_permission(auth.uid(), 'content'));
CREATE POLICY "ca_owner_delete" ON public.content_assets FOR DELETE TO authenticated USING (public.is_owner(auth.uid()));

CREATE POLICY "ei_auth_select" ON public.export_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.export_requests er WHERE er.id = export_request_id AND (er.requested_by = auth.uid() OR public.is_security_privileged(auth.uid()))));
CREATE POLICY "ei_sec_insert" ON public.export_items FOR INSERT TO authenticated WITH CHECK (public.is_security_privileged(auth.uid()));

-- role_permissions RLS
DROP TABLE IF EXISTS public.role_permissions CASCADE;
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, permission_id)
);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp_select" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rp_owner_insert" ON public.role_permissions FOR INSERT TO authenticated WITH CHECK (public.is_owner(auth.uid()));
CREATE POLICY "rp_owner_update" ON public.role_permissions FOR UPDATE TO authenticated USING (public.is_owner(auth.uid()));
CREATE POLICY "rp_owner_delete" ON public.role_permissions FOR DELETE TO authenticated USING (public.is_owner(auth.uid()));

-- has_permission function
CREATE OR REPLACE FUNCTION public.has_permission(p_user_id uuid, p_tenant_id uuid, p_permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_memberships tm
    JOIN roles r ON (r.id = tm.role_id OR r.role_key = tm.role::text)
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE tm.user_id = p_user_id
      AND (tm.tenant_id = p_tenant_id OR p_tenant_id IS NULL)
      AND COALESCE(tm.membership_status, 'active') = 'active'
      AND p.permission_key = p_permission_key
  ) OR public.is_owner(p_user_id)
$$;

-- Triggers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_updated_at_system_config ON public.system_config;
CREATE TRIGGER trg_updated_at_system_config BEFORE UPDATE ON public.system_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_updated_at_ghl_accounts ON public.ghl_accounts;
CREATE TRIGGER trg_updated_at_ghl_accounts BEFORE UPDATE ON public.ghl_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_updated_at_auto_endpoints ON public.automation_endpoints;
CREATE TRIGGER trg_updated_at_auto_endpoints BEFORE UPDATE ON public.automation_endpoints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_updated_at_content_assets ON public.content_assets;
CREATE TRIGGER trg_updated_at_content_assets BEFORE UPDATE ON public.content_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Append-only audit_logs
CREATE OR REPLACE FUNCTION public.deny_audit_modification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$;
DROP TRIGGER IF EXISTS trg_deny_audit_update ON public.audit_logs;
CREATE TRIGGER trg_deny_audit_update BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.deny_audit_modification();

-- Fix security definer views - recreate with security_invoker
DROP VIEW IF EXISTS public.user_effective_permissions;
CREATE VIEW public.user_effective_permissions WITH (security_invoker = true) AS
SELECT tm.user_id, tm.tenant_id, r.role_key, pe.permission_key
FROM tenant_memberships tm
JOIN roles r ON (r.id = tm.role_id OR r.role_key = tm.role::text)
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions pe ON pe.id = rp.permission_id
WHERE COALESCE(tm.membership_status, 'active') = 'active';

-- Seed roles
INSERT INTO public.roles (role_key, role_name, role_scope, description) VALUES
  ('owner','Owner','global','Platform owner'),
  ('security_admin','Security Admin','global','Security ops'),
  ('ops_admin','Ops Admin','global','Operations'),
  ('content_admin','Content Admin','global','Content'),
  ('finance_admin','Finance Admin','global','Finance'),
  ('support_admin','Support Admin','tenant','Support'),
  ('partner_admin','Partner Admin','tenant','Partner'),
  ('analyst_readonly','Analyst','tenant','Read-only'),
  ('automation_service','Automation','service','Machine'),
  ('ai_agent','AI Agent','service','AI')
ON CONFLICT (role_key) DO NOTHING;

-- Seed permissions
INSERT INTO public.permissions (permission_key, permission_name, category) VALUES
  ('tenant_view','View Tenants','tenant'),('tenant_manage_members','Manage Members','tenant'),
  ('content_view','View Content','content'),('content_edit','Edit Content','content'),
  ('support_view','View Support','support'),('support_manage','Manage Support','support'),
  ('finance_view','View Finance','finance'),('finance_export','Export Finance','finance'),
  ('audit_view','View Audit','audit'),('security_manage','Manage Security','security'),
  ('export_low','Low Export','export'),('export_medium','Medium Export','export'),
  ('export_high','High Export','export'),('export_critical','Critical Export','export'),
  ('workflow_view','View Workflows','workflow'),('workflow_manage','Manage Workflows','workflow'),
  ('prompt_view','View Prompts','prompt'),('prompt_manage','Manage Prompts','prompt'),
  ('config_view','View Config','config'),('config_manage','Manage Config','config'),
  ('token_manage','Manage Tokens','integration'),
  ('role_escalation_request','Request Escalation','role'),('role_escalation_approve','Approve Escalation','role'),
  ('owner_console_access','Owner Console','owner')
ON CONFLICT (permission_key) DO NOTHING;

-- Seed role-permission mappings
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.role_key = 'owner'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.permission_key IN ('audit_view','security_manage','role_escalation_approve','token_manage','workflow_view','workflow_manage','export_low','export_medium','export_high','config_view','tenant_view')
WHERE r.role_key = 'security_admin' ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.permission_key IN ('tenant_view','tenant_manage_members','role_escalation_request','content_view','support_view')
WHERE r.role_key = 'ops_admin' ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.permission_key IN ('content_view','content_edit')
WHERE r.role_key = 'content_admin' ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.permission_key IN ('finance_view','finance_export','export_low','export_medium')
WHERE r.role_key = 'finance_admin' ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.permission_key IN ('support_view','support_manage','role_escalation_request')
WHERE r.role_key = 'support_admin' ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.permission_key IN ('tenant_view','tenant_manage_members','content_view','support_view')
WHERE r.role_key = 'partner_admin' ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.permission_key IN ('tenant_view','content_view')
WHERE r.role_key = 'analyst_readonly' ON CONFLICT (role_id, permission_id) DO NOTHING;
