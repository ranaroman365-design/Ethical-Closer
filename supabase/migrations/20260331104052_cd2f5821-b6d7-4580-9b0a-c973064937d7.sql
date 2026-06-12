
-- ================================================================
-- PHASE 1: Missing tables, columns, helper functions, RLS, seeds
-- ================================================================

-- 1. ROLES table (standalone)
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text UNIQUE NOT NULL,
  role_name text NOT NULL,
  role_scope text NOT NULL DEFAULT 'global' CHECK (role_scope IN ('global','tenant','service')),
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- 2. PERMISSIONS table
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text UNIQUE NOT NULL,
  permission_name text NOT NULL,
  description text,
  category text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- 3. SYSTEM_CONFIG
CREATE TABLE IF NOT EXISTS public.system_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text UNIQUE NOT NULL,
  config_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  sensitivity_level text NOT NULL DEFAULT 'medium' CHECK (sensitivity_level IN ('low','medium','high','critical')),
  owner_only boolean DEFAULT true,
  version_no integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- 4. GHL_ACCOUNTS
CREATE TABLE IF NOT EXISTS public.ghl_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ghl_location_id text,
  ghl_account_type text NOT NULL DEFAULT 'subaccount' CHECK (ghl_account_type IN ('agency','subaccount')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.ghl_accounts ENABLE ROW LEVEL SECURITY;

-- 5. AUTOMATION_ENDPOINTS
CREATE TABLE IF NOT EXISTS public.automation_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_key text UNIQUE NOT NULL,
  provider text NOT NULL CHECK (provider IN ('supabase','ghl','n8n','make','hybrid')),
  purpose text,
  endpoint_path text,
  allowed_methods text[],
  sensitivity_level text NOT NULL DEFAULT 'low' CHECK (sensitivity_level IN ('low','medium','high','critical')),
  owner_only boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.automation_endpoints ENABLE ROW LEVEL SECURITY;

-- 6. AI_AGENT_ACTIONS
CREATE TABLE IF NOT EXISTS public.ai_agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_agent_key text NOT NULL,
  requested_by_user_id uuid,
  tenant_id uuid,
  action_category text NOT NULL CHECK (action_category IN ('summary','security_watch','workflow_assist','analytics_narration')),
  requested_scope jsonb,
  data_sources text[],
  output_summary text,
  action_executed boolean DEFAULT false,
  execution_mode text NOT NULL DEFAULT 'read_only' CHECK (execution_mode IN ('read_only','suggest_only','approved_write')),
  approval_request_id uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ai_agent_actions ENABLE ROW LEVEL SECURITY;

-- 7. CONTENT_ASSETS
CREATE TABLE IF NOT EXISTS public.content_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  asset_name text NOT NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('image','video','pdf','copy_block','academy_lesson','other')),
  storage_path text,
  visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('public','tenant','internal')),
  exportable boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
ALTER TABLE public.content_assets ENABLE ROW LEVEL SECURITY;

-- 8. EXPORT_ITEMS
CREATE TABLE IF NOT EXISTS public.export_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_request_id uuid REFERENCES public.export_requests(id) ON DELETE CASCADE,
  item_type text,
  item_ref text,
  row_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.export_items ENABLE ROW LEVEL SECURITY;
