-- 1. Intelligence Snapshots
CREATE TABLE public.intelligence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  kpis jsonb NOT NULL DEFAULT '{}',
  funnel_counts jsonb NOT NULL DEFAULT '{}',
  operator_score numeric(5,1),
  operator_tier text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intel_snap_operator ON public.intelligence_snapshots(operator_id, created_at DESC);
CREATE INDEX idx_intel_snap_period ON public.intelligence_snapshots(period_start, period_end);

ALTER TABLE public.intelligence_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view snapshots" ON public.intelligence_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert snapshots" ON public.intelligence_snapshots FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Intelligence Bottlenecks
CREATE TABLE public.intelligence_bottlenecks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.intelligence_snapshots(id) ON DELETE CASCADE,
  bottleneck_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'warning')),
  current_value numeric(5,4) NOT NULL,
  threshold numeric(5,4) NOT NULL,
  impact_score numeric(12,2) NOT NULL DEFAULT 0,
  root_causes jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intel_bn_snapshot ON public.intelligence_bottlenecks(snapshot_id);
CREATE INDEX idx_intel_bn_severity ON public.intelligence_bottlenecks(severity, created_at DESC);

ALTER TABLE public.intelligence_bottlenecks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view bottlenecks" ON public.intelligence_bottlenecks FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert bottlenecks" ON public.intelligence_bottlenecks FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Intelligence Actions
CREATE TABLE public.intelligence_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.intelligence_snapshots(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_role text NOT NULL,
  estimated_impact text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'dismissed')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intel_actions_snapshot ON public.intelligence_actions(snapshot_id);
CREATE INDEX idx_intel_actions_status ON public.intelligence_actions(status, priority);

ALTER TABLE public.intelligence_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view actions" ON public.intelligence_actions FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert actions" ON public.intelligence_actions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update actions" ON public.intelligence_actions FOR UPDATE TO authenticated USING (true);

-- 4. Intelligence Alerts
CREATE TABLE public.intelligence_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kpi text NOT NULL,
  label text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'warning')),
  current_value numeric(5,4) NOT NULL,
  threshold numeric(5,4) NOT NULL,
  message text NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intel_alerts_operator ON public.intelligence_alerts(operator_id, created_at DESC);
CREATE INDEX idx_intel_alerts_severity ON public.intelligence_alerts(severity, acknowledged_at);

ALTER TABLE public.intelligence_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view alerts" ON public.intelligence_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert alerts" ON public.intelligence_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update alerts" ON public.intelligence_alerts FOR UPDATE TO authenticated USING (true);