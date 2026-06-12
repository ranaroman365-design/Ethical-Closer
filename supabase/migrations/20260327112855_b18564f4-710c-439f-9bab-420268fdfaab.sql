
-- Dashboard daily aggregates for Director Dashboard
CREATE TABLE public.dashboard_daily_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_date date NOT NULL,
  scope_type text NOT NULL DEFAULT 'global',
  scope_key text NOT NULL DEFAULT 'all',
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(aggregate_date, scope_type, scope_key)
);

ALTER TABLE public.dashboard_daily_aggregates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and directors read aggregates" ON public.dashboard_daily_aggregates
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service insert aggregates" ON public.dashboard_daily_aggregates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- KPI alerts for threshold breaches
CREATE TABLE public.kpi_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_key text NOT NULL,
  snapshot_id uuid REFERENCES public.kpi_snapshots(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'warning',
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz DEFAULT NULL
);

ALTER TABLE public.kpi_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage kpi alerts" ON public.kpi_alerts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Notifications for admin approvals and reports
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  link_path text DEFAULT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "System insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR recipient_id = auth.uid());

-- Director recommendations derived from KPI analysis
CREATE TABLE public.director_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_date date NOT NULL DEFAULT CURRENT_DATE,
  scope_key text NOT NULL DEFAULT 'global',
  trigger_kpi_key text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  recommendation_type text NOT NULL DEFAULT 'general',
  recommendation_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.director_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage recommendations" ON public.director_recommendations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Directors read recommendations" ON public.director_recommendations
  FOR SELECT TO authenticated
  USING (true);
