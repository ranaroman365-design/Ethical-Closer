
-- 1. SLA Rules table
CREATE TABLE public.sla_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level int NOT NULL CHECK (level BETWEEN 1 AND 8),
  rule_key text NOT NULL,
  description text NOT NULL,
  description_en text,
  max_minutes int NOT NULL,
  kpi_category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(level, rule_key)
);

ALTER TABLE public.sla_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active SLA rules"
  ON public.sla_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage SLA rules"
  ON public.sla_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 2. SLA Events table
CREATE TABLE public.sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_unit_id uuid REFERENCES public.operator_units(id),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  rule_id uuid NOT NULL REFERENCES public.sla_rules(id),
  event_type text NOT NULL,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'breached')),
  breach_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sla_events_user ON public.sla_events(user_id);
CREATE INDEX idx_sla_events_unit ON public.sla_events(operator_unit_id);
CREATE INDEX idx_sla_events_status ON public.sla_events(status);
CREATE INDEX idx_sla_events_due ON public.sla_events(due_at) WHERE status = 'pending';

ALTER TABLE public.sla_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own SLA events"
  ON public.sla_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "L6 see unit SLA events"
  ON public.sla_events FOR SELECT TO authenticated
  USING (
    is_operator_l6plus(auth.uid())
    AND operator_unit_id = get_user_unit_id(auth.uid())
  );

CREATE POLICY "L7 plus see all SLA events"
  ON public.sla_events FOR SELECT TO authenticated
  USING (
    COALESCE((SELECT current_level >= 7 FROM user_level_status WHERE user_id = auth.uid()), false)
  );

CREATE POLICY "System inserts SLA events"
  ON public.sla_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "System updates SLA events"
  ON public.sla_events FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_operator_l6plus(auth.uid()));

-- 3. Meeting fields on appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS meeting_provider text CHECK (meeting_provider IN ('zoom','google_meet','whereby','teams','other')),
  ADD COLUMN IF NOT EXISTS meeting_id text,
  ADD COLUMN IF NOT EXISTS meeting_password text;

-- 4. Profit Center fields on operator_units
ALTER TABLE public.operator_units
  ADD COLUMN IF NOT EXISTS budget_monthly numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_label text DEFAULT 'hold' CHECK (status_label IN ('scale','hold','fix','kill')),
  ADD COLUMN IF NOT EXISTS cpl numeric GENERATED ALWAYS AS (NULL) STORED;

-- cpl is computed, can't use GENERATED, drop and keep as regular
ALTER TABLE public.operator_units DROP COLUMN IF EXISTS cpl;

-- 5. SLA Compliance RPC
CREATE OR REPLACE FUNCTION public.get_sla_compliance(
  p_unit_id uuid DEFAULT NULL,
  p_range_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - (p_range_days || ' days')::interval;
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'completed', COUNT(*) FILTER (WHERE se.status = 'completed'),
    'breached', COUNT(*) FILTER (WHERE se.status = 'breached'),
    'pending', COUNT(*) FILTER (WHERE se.status = 'pending'),
    'compliance_pct', CASE WHEN COUNT(*) FILTER (WHERE se.status IN ('completed','breached')) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE se.status = 'completed')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE se.status IN ('completed','breached')), 0) * 100, 1
      ) ELSE 100 END,
    'by_level', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'level', sub.level,
        'total', sub.total,
        'completed', sub.completed,
        'breached', sub.breached,
        'compliance_pct', sub.comp
      ))
      FROM (
        SELECT sr.level,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE se2.status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE se2.status = 'breached')::int AS breached,
          CASE WHEN COUNT(*) FILTER (WHERE se2.status IN ('completed','breached')) > 0
            THEN ROUND(COUNT(*) FILTER (WHERE se2.status = 'completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE se2.status IN ('completed','breached')),0) * 100, 1)
            ELSE 100 END AS comp
        FROM sla_events se2
        JOIN sla_rules sr ON sr.id = se2.rule_id
        WHERE se2.created_at >= v_cutoff
          AND (p_unit_id IS NULL OR se2.operator_unit_id = p_unit_id)
        GROUP BY sr.level
        ORDER BY sr.level
      ) sub
    ), '[]'::jsonb),
    'recent_breaches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', se3.id,
        'user_id', se3.user_id,
        'user_name', p.full_name,
        'event_type', se3.event_type,
        'rule_key', sr2.rule_key,
        'description', sr2.description,
        'due_at', se3.due_at,
        'created_at', se3.created_at
      ) ORDER BY se3.due_at DESC)
      FROM (
        SELECT * FROM sla_events
        WHERE status = 'breached' AND created_at >= v_cutoff
          AND (p_unit_id IS NULL OR operator_unit_id = p_unit_id)
        ORDER BY due_at DESC LIMIT 20
      ) se3
      JOIN sla_rules sr2 ON sr2.id = se3.rule_id
      LEFT JOIN profiles p ON p.id = se3.user_id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM sla_events se
  WHERE se.created_at >= v_cutoff
    AND (p_unit_id IS NULL OR se.operator_unit_id = p_unit_id);

  RETURN v_result;
END;
$$;

-- 6. Profit Center KPI RPC
CREATE OR REPLACE FUNCTION public.get_profit_center_summary(p_range_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - (p_range_days || ' days')::interval;
  v_caller uuid := auth.uid();
  v_level int;
  v_result jsonb;
BEGIN
  SELECT current_phase INTO v_level FROM profiles WHERE id = v_caller;

  SELECT COALESCE(jsonb_agg(unit_data ORDER BY unit_data->>'unit_name'), '[]'::jsonb) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'unit_id', ou.id,
      'unit_name', ou.unit_name,
      'funnel_path', ou.funnel_path,
      'operator_name', COALESCE(p.full_name, 'Unassigned'),
      'operator_id', ou.operator_id,
      'budget_monthly', ou.budget_monthly,
      'status_label', ou.status_label,
      'team_size', (SELECT COUNT(*) FROM operator_team_members otm WHERE otm.unit_id = ou.id AND otm.active = true),
      'leads', (SELECT COUNT(*) FROM real_leads_view rl WHERE rl.unit_id = ou.id AND rl.created_at >= v_cutoff),
      'bookings', (SELECT COUNT(*) FROM real_appointments_view ra
        WHERE ra.starts_at >= v_cutoff
          AND ra.setter_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = ou.id AND otm.active = true)),
      'shows', (SELECT COUNT(*) FROM real_appointments_view ra
        WHERE ra.starts_at >= v_cutoff
          AND ra.appointment_status NOT IN ('no_show','cancelled','expired','superseded')
          AND (ra.completed_at IS NOT NULL OR ra.call_started_at IS NOT NULL)
          AND ra.starts_at <= now()
          AND (ra.setter_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = ou.id AND otm.active = true)
            OR ra.closer_id IN (SELECT otm.member_id FROM operator_team_members otm WHERE otm.unit_id = ou.id AND otm.active = true))),
      'closes', (SELECT COUNT(*) FROM payment_links pl
        JOIN operator_team_members otm ON pl.closer_id = otm.member_id AND otm.unit_id = ou.id AND otm.active = true
        WHERE pl.status = 'paid' AND pl.created_at >= v_cutoff),
      'revenue', (SELECT COALESCE(SUM(pl.amount),0)::numeric / 100.0 FROM payment_links pl
        JOIN operator_team_members otm ON pl.closer_id = otm.member_id AND otm.unit_id = ou.id AND otm.active = true
        WHERE pl.status = 'paid' AND pl.created_at >= v_cutoff),
      'commissions', (SELECT COALESCE(SUM(cm.amount),0)::numeric FROM commissions cm
        JOIN operator_team_members otm ON cm.user_id = otm.member_id AND otm.unit_id = ou.id AND otm.active = true
        WHERE NOT COALESCE(cm.is_simulation, false) AND cm.created_at >= v_cutoff),
      'sla_compliance', (SELECT CASE WHEN COUNT(*) FILTER (WHERE se.status IN ('completed','breached')) > 0
        THEN ROUND(COUNT(*) FILTER (WHERE se.status='completed')::numeric / NULLIF(COUNT(*) FILTER (WHERE se.status IN ('completed','breached')),0) * 100, 1)
        ELSE 100 END FROM sla_events se WHERE se.operator_unit_id = ou.id AND se.created_at >= v_cutoff)
    ) AS unit_data
    FROM operator_units ou
    LEFT JOIN profiles p ON p.id = ou.operator_id
    WHERE ou.status = 'active'
      AND (
        has_role(v_caller, 'admin') OR COALESCE(v_level, 0) >= 8
        OR (v_level = 7 AND ou.id IN (SELECT get_director_unit_ids(v_caller)))
        OR (v_level = 6 AND ou.id IN (SELECT get_user_unit_ids(v_caller)))
      )
  ) sub;

  RETURN v_result;
END;
$$;
