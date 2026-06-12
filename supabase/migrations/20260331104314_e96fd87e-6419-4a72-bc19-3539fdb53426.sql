
-- Add columns to tenant_memberships
ALTER TABLE public.tenant_memberships ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id);
ALTER TABLE public.tenant_memberships ADD COLUMN IF NOT EXISTS membership_status text DEFAULT 'active';

-- Add columns to audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_role_key text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS acting_tenant_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action_type text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_type text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action_result text DEFAULT 'success';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS risk_score integer DEFAULT 0;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS auth_method text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tenant_type text DEFAULT 'internal';
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Export requests
ALTER TABLE public.export_requests ADD COLUMN IF NOT EXISTS requester_role_key text;
ALTER TABLE public.export_requests ADD COLUMN IF NOT EXISTS export_scope text DEFAULT 'single';
ALTER TABLE public.export_requests ADD COLUMN IF NOT EXISTS requested_reason text;
ALTER TABLE public.export_requests ADD COLUMN IF NOT EXISTS step_up_required boolean DEFAULT false;
ALTER TABLE public.export_requests ADD COLUMN IF NOT EXISTS forensic_marker text;

-- Session events
ALTER TABLE public.session_events ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.session_events ADD COLUMN IF NOT EXISTS session_id text;

-- Role escalation
ALTER TABLE public.role_escalation_requests ADD COLUMN IF NOT EXISTS requested_permissions text[];
ALTER TABLE public.role_escalation_requests ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE public.role_escalation_requests ADD COLUMN IF NOT EXISTS valid_until timestamptz;

-- Integration credentials
ALTER TABLE public.integration_credentials_registry ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.integration_credentials_registry ADD COLUMN IF NOT EXISTS environment text DEFAULT 'prod';
ALTER TABLE public.integration_credentials_registry ADD COLUMN IF NOT EXISTS scope_description text;
ALTER TABLE public.integration_credentials_registry ADD COLUMN IF NOT EXISTS integration_key text;
ALTER TABLE public.integration_credentials_registry ADD COLUMN IF NOT EXISTS credential_ref text;

-- Approval requests
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS approval_type text;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS target_ref text;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS denied_by uuid;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS denied_at timestamptz;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(acting_tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type);
