
-- Step 2: Create break_glass_events, license fields, migrate roles, seed permissions

-- break_glass_events table
CREATE TABLE IF NOT EXISTS public.break_glass_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by_user_id uuid NOT NULL,
  trigger_reason text NOT NULL,
  approved_by_user_id uuid,
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  scope text DEFAULT 'full',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.break_glass_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_break_glass_select" ON public.break_glass_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "owner_break_glass_insert" ON public.break_glass_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner'));

-- License fields on tenants
DO $$ BEGIN
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS license_status text DEFAULT 'trial';
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS license_paid boolean DEFAULT false;
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS owner_control_enabled boolean DEFAULT true;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Migrate admin → administrator
UPDATE public.user_roles SET role = 'administrator' WHERE role = 'admin';

-- Audit log for migration
INSERT INTO public.audit_logs (action, action_type, resource_type, after_state, risk_score)
VALUES ('role_migration','role_migration','system','{"description":"All admin roles migrated to administrator"}'::jsonb, 90);

-- Seed administrator permissions
INSERT INTO public.admin_permissions (role, resource_key, can_view, can_edit, can_export, can_delete, owner_only, description)
VALUES
  ('administrator', 'user_management', true, true, false, false, false, 'Manage users in assigned scope'),
  ('administrator', 'content', true, true, false, false, false, 'View and edit content'),
  ('administrator', 'support', true, true, false, false, false, 'Support operations'),
  ('administrator', 'dashboards', true, false, false, false, false, 'View operational dashboards'),
  ('administrator', 'role_escalation', true, false, false, false, false, 'Request escalation only'),
  ('administrator', 'export_center', true, false, true, false, false, 'Request exports only')
ON CONFLICT DO NOTHING;

-- Remove legacy admin sensitive access
DELETE FROM public.admin_permissions 
WHERE role = 'admin' AND resource_key IN ('prompt_vault','system_config','integration_registry','ip_assets','workflow_registry');
