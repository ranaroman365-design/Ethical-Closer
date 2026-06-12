
DO $$ BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'brand_admin'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'project_manager'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.project_status AS ENUM ('created','active','on_hold','delivered','churned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pool_strategy AS ENUM ('round_robin','load_balance','capacity_weighted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
