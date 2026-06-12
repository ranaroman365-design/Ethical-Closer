
-- brands
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  logo_url text,
  status text NOT NULL DEFAULT 'active',
  owner_user_id uuid,
  default_calendar_id uuid,
  default_pipeline_id text,
  default_project_template_id uuid,
  default_revenue_split jsonb NOT NULL DEFAULT '{"brand":0.6,"etc":0.4,"closer":0.15,"setter":0.05,"operator":0.05}'::jsonb,
  booking_enabled boolean NOT NULL DEFAULT true,
  source_systems text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brands_slug ON public.brands(slug);
CREATE INDEX IF NOT EXISTS idx_brands_source_systems ON public.brands USING GIN(source_systems);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_brands_updated_at ON public.brands;
CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.brands (slug, name, source_systems, default_revenue_split) VALUES
  ('etc','Ethical Closer', ARRAY['ETC','etc']::text[],
   '{"brand":1.0,"etc":1.0,"closer":0.15,"setter":0.05,"operator":0.05}'::jsonb),
  ('mbf','Mama baut Freiheit', ARRAY['MBF','mbf','mbf_meta_q2']::text[],
   '{"brand":0.6,"etc":0.4,"closer":0.15,"setter":0.05,"operator":0.05}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Extend existing tables
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS origin_brand_id uuid REFERENCES public.brands(id),
  ADD COLUMN IF NOT EXISTS origin_funnel text,
  ADD COLUMN IF NOT EXISTS origin_offer text,
  ADD COLUMN IF NOT EXISTS origin_quiz text,
  ADD COLUMN IF NOT EXISTS project_id uuid;
CREATE INDEX IF NOT EXISTS idx_leads_origin_brand ON public.leads(origin_brand_id, created_at DESC);

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
CREATE INDEX IF NOT EXISTS idx_appointments_brand ON public.appointments(brand_id, created_at DESC);

ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
CREATE INDEX IF NOT EXISTS idx_calls_brand ON public.calls(brand_id, created_at DESC);

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id);
CREATE INDEX IF NOT EXISTS idx_user_roles_brand ON public.user_roles(brand_id, user_id);

-- Backfill
UPDATE public.leads SET origin_brand_id = b.id FROM public.brands b
  WHERE b.slug='etc' AND public.leads.origin_brand_id IS NULL;
UPDATE public.leads SET origin_brand_id = b.id FROM public.brands b
  WHERE b.slug='mbf' AND lower(coalesce(public.leads.source,'')) = 'mbf';
UPDATE public.appointments SET brand_id = l.origin_brand_id
  FROM public.leads l WHERE l.id = public.appointments.lead_id AND public.appointments.brand_id IS NULL;
UPDATE public.calls SET brand_id = l.origin_brand_id
  FROM public.leads l WHERE l.id = public.calls.lead_id AND public.calls.brand_id IS NULL;

-- Helpers
CREATE OR REPLACE FUNCTION public.has_brand_role(_user_id uuid, _brand_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = ANY(_roles)
      AND (brand_id = _brand_id OR brand_id IS NULL));
$$;

CREATE OR REPLACE FUNCTION public.current_user_brand_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT brand_id) FILTER (WHERE brand_id IS NOT NULL), ARRAY[]::uuid[])
  FROM public.user_roles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.resolve_brand_from_source(_source_system text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.brands
  WHERE _source_system = ANY(source_systems) OR lower(slug) = lower(coalesce(_source_system,''))
  ORDER BY (lower(slug) = lower(coalesce(_source_system,''))) DESC LIMIT 1;
$$;

-- brands RLS
DROP POLICY IF EXISTS "brands_select" ON public.brands;
CREATE POLICY "brands_select" ON public.brands FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR id = ANY(public.current_user_brand_ids()) OR owner_user_id = auth.uid());
DROP POLICY IF EXISTS "brands_admin_write" ON public.brands;
CREATE POLICY "brands_admin_write" ON public.brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR owner_user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR owner_user_id = auth.uid());

-- Pools
CREATE TABLE IF NOT EXISTS public.assignment_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  pool_type text NOT NULL CHECK (pool_type IN ('setter','closer','operator')),
  name text NOT NULL,
  member_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  strategy public.pool_strategy NOT NULL DEFAULT 'round_robin',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pools_brand ON public.assignment_pools(brand_id, pool_type);
ALTER TABLE public.assignment_pools ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_pools_updated_at ON public.assignment_pools;
CREATE TRIGGER trg_pools_updated_at BEFORE UPDATE ON public.assignment_pools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "pools_select" ON public.assignment_pools;
CREATE POLICY "pools_select" ON public.assignment_pools FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
    OR (brand_id IS NOT NULL AND public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin','admin']::public.app_role[]))
    OR auth.uid() = ANY(member_user_ids));
DROP POLICY IF EXISTS "pools_write" ON public.assignment_pools;
CREATE POLICY "pools_write" ON public.assignment_pools FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')
    OR (brand_id IS NOT NULL AND public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin']::public.app_role[])))
  WITH CHECK (public.has_role(auth.uid(),'admin')
    OR (brand_id IS NOT NULL AND public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin']::public.app_role[])));

-- Routing rules
CREATE TABLE IF NOT EXISTS public.brand_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  offer_key text,
  setter_pool_id uuid REFERENCES public.assignment_pools(id),
  closer_pool_id uuid REFERENCES public.assignment_pools(id),
  priority int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routing_brand ON public.brand_routing_rules(brand_id, priority);
ALTER TABLE public.brand_routing_rules ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_routing_updated_at ON public.brand_routing_rules;
CREATE TRIGGER trg_routing_updated_at BEFORE UPDATE ON public.brand_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "routing_select" ON public.brand_routing_rules;
CREATE POLICY "routing_select" ON public.brand_routing_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin']::public.app_role[]));
DROP POLICY IF EXISTS "routing_write" ON public.brand_routing_rules;
CREATE POLICY "routing_write" ON public.brand_routing_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin']::public.app_role[]))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin']::public.app_role[]));

-- Project templates
CREATE TABLE IF NOT EXISTS public.project_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_owner_role text,
  service_level text DEFAULT 'dwy',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_templates_updated_at ON public.project_templates;
CREATE TRIGGER trg_templates_updated_at BEFORE UPDATE ON public.project_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "templates_select" ON public.project_templates;
CREATE POLICY "templates_select" ON public.project_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
    OR (brand_id IS NOT NULL AND public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin','project_manager']::public.app_role[])));
DROP POLICY IF EXISTS "templates_write" ON public.project_templates;
CREATE POLICY "templates_write" ON public.project_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')
    OR (brand_id IS NOT NULL AND public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin']::public.app_role[])))
  WITH CHECK (public.has_role(auth.uid(),'admin')
    OR (brand_id IS NOT NULL AND public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin']::public.app_role[])));

-- Projects
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  lead_id uuid REFERENCES public.leads(id),
  deal_id uuid REFERENCES public.calls(id),
  client_user_id uuid,
  offer_key text,
  owner_user_id uuid,
  team_user_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  service_level text DEFAULT 'dwy',
  project_status public.project_status NOT NULL DEFAULT 'created',
  template_id uuid REFERENCES public.project_templates(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_projects_brand ON public.projects(brand_id, project_status);
CREATE INDEX IF NOT EXISTS idx_projects_lead ON public.projects(lead_id);
CREATE INDEX IF NOT EXISTS idx_projects_deal ON public.projects(deal_id);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
    OR public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin','project_manager']::public.app_role[])
    OR owner_user_id = auth.uid()
    OR auth.uid() = ANY(team_user_ids)
    OR client_user_id = auth.uid());
DROP POLICY IF EXISTS "projects_write" ON public.projects;
CREATE POLICY "projects_write" ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')
    OR public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin','project_manager']::public.app_role[])
    OR owner_user_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin')
    OR public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin','project_manager']::public.app_role[]));

-- Revenue allocations (immutable snapshot of split at close)
CREATE TABLE IF NOT EXISTS public.revenue_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id),
  revenue_total numeric NOT NULL DEFAULT 0,
  brand_share numeric NOT NULL DEFAULT 0,
  etc_share numeric NOT NULL DEFAULT 0,
  setter_share numeric NOT NULL DEFAULT 0,
  closer_share numeric NOT NULL DEFAULT 0,
  operator_share numeric NOT NULL DEFAULT 0,
  split_config jsonb NOT NULL,
  finalized boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_allocation_deal ON public.revenue_allocations(deal_id);
CREATE INDEX IF NOT EXISTS idx_allocations_brand ON public.revenue_allocations(brand_id, created_at DESC);
ALTER TABLE public.revenue_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allocations_select" ON public.revenue_allocations;
CREATE POLICY "allocations_select" ON public.revenue_allocations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
    OR public.has_brand_role(auth.uid(), brand_id, ARRAY['brand_admin']::public.app_role[])
    OR EXISTS (SELECT 1 FROM public.calls c WHERE c.id = revenue_allocations.deal_id
      AND (c.call_owner_user_id = auth.uid() OR c.revenue_owner_user_id = auth.uid() OR c.user_id = auth.uid())));

CREATE OR REPLACE FUNCTION public.protect_finalized_allocations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.finalized AND (
    NEW.split_config IS DISTINCT FROM OLD.split_config
    OR NEW.revenue_total IS DISTINCT FROM OLD.revenue_total
    OR NEW.brand_share IS DISTINCT FROM OLD.brand_share
    OR NEW.etc_share IS DISTINCT FROM OLD.etc_share
    OR NEW.setter_share IS DISTINCT FROM OLD.setter_share
    OR NEW.closer_share IS DISTINCT FROM OLD.closer_share
    OR NEW.operator_share IS DISTINCT FROM OLD.operator_share
  ) THEN
    RAISE EXCEPTION 'revenue_allocation is finalized and cannot be modified (deal_id=%)', OLD.deal_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_protect_finalized_allocations ON public.revenue_allocations;
CREATE TRIGGER trg_protect_finalized_allocations BEFORE UPDATE ON public.revenue_allocations
  FOR EACH ROW EXECUTE FUNCTION public.protect_finalized_allocations();

-- Auto-create project + allocation on close-won
CREATE OR REPLACE FUNCTION public.create_project_from_deal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand uuid; v_template uuid; v_split jsonb; v_project uuid; v_revenue numeric;
BEGIN
  IF COALESCE(NEW.is_simulation, false) THEN RETURN NEW; END IF;
  IF NEW.result NOT IN ('won','closed_won') THEN RETURN NEW; END IF;
  IF NEW.closed_at IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.projects WHERE deal_id = NEW.id) THEN RETURN NEW; END IF;

  SELECT COALESCE(NEW.brand_id, l.origin_brand_id) INTO v_brand
    FROM public.leads l WHERE l.id = NEW.lead_id;
  IF v_brand IS NULL THEN SELECT id INTO v_brand FROM public.brands WHERE slug='etc' LIMIT 1; END IF;

  SELECT default_project_template_id, default_revenue_split INTO v_template, v_split
    FROM public.brands WHERE id = v_brand;

  INSERT INTO public.projects (brand_id, lead_id, deal_id, template_id, project_status)
  VALUES (v_brand, NEW.lead_id, NEW.id, v_template, 'created')
  RETURNING id INTO v_project;

  UPDATE public.leads SET project_id = v_project WHERE id = NEW.lead_id;

  v_revenue := COALESCE(NEW.revenue, 0);
  INSERT INTO public.revenue_allocations (
    deal_id, brand_id, revenue_total, brand_share, etc_share,
    closer_share, setter_share, operator_share, split_config, finalized
  ) VALUES (
    NEW.id, v_brand, v_revenue,
    v_revenue * COALESCE((v_split->>'brand')::numeric, 0),
    v_revenue * COALESCE((v_split->>'etc')::numeric, 0),
    v_revenue * COALESCE((v_split->>'closer')::numeric, 0),
    v_revenue * COALESCE((v_split->>'setter')::numeric, 0),
    v_revenue * COALESCE((v_split->>'operator')::numeric, 0),
    v_split, true
  ) ON CONFLICT (deal_id) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_project_on_close ON public.calls;
CREATE TRIGGER trg_create_project_on_close
  AFTER INSERT OR UPDATE OF result, closed_at ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.create_project_from_deal();

-- Auto-fill brand_id from lead
CREATE OR REPLACE FUNCTION public.set_brand_id_from_lead()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.brand_id IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT origin_brand_id INTO NEW.brand_id FROM public.leads WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointments_set_brand ON public.appointments;
CREATE TRIGGER trg_appointments_set_brand BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_brand_id_from_lead();

DROP TRIGGER IF EXISTS trg_calls_set_brand ON public.calls;
CREATE TRIGGER trg_calls_set_brand BEFORE INSERT ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.set_brand_id_from_lead();
