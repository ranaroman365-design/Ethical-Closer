
-- Placements: closer-to-company assignments
CREATE TABLE public.placements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  closer_id UUID NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.placement_opportunities(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'matched',
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own placements" ON public.placements
  FOR SELECT TO authenticated
  USING (closer_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','administrator','owner')
  ));

CREATE POLICY "Admins can manage placements" ON public.placements
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','administrator','owner')
  ));

-- Placement metrics: periodic performance tracking
CREATE TABLE public.placement_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  placement_id UUID NOT NULL REFERENCES public.placements(id) ON DELETE CASCADE,
  period TEXT NOT NULL DEFAULT 'weekly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  deals_won INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC NOT NULL DEFAULT 0,
  close_rate NUMERIC,
  show_rate NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.placement_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own placement metrics" ON public.placement_metrics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.placements WHERE placements.id = placement_id AND placements.closer_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','administrator','owner')
  ));

CREATE POLICY "Users can insert own placement metrics" ON public.placement_metrics
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.placements WHERE placements.id = placement_id AND placements.closer_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','administrator','owner')
  ));

CREATE POLICY "Admins can manage placement metrics" ON public.placement_metrics
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','administrator','owner')
  ));

-- Indexes
CREATE INDEX idx_placements_closer ON public.placements(closer_id);
CREATE INDEX idx_placements_tenant ON public.placements(tenant_id);
CREATE INDEX idx_placements_status ON public.placements(status);
CREATE INDEX idx_placement_metrics_placement ON public.placement_metrics(placement_id);
