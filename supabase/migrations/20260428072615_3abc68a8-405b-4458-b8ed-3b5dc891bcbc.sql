
CREATE TABLE IF NOT EXISTS public.self_optimization_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled      BOOLEAN NOT NULL DEFAULT false,
  mode         TEXT    NOT NULL DEFAULT 'assisted'
                CHECK (mode IN ('assisted','autonomous')),
  thresholds   JSONB   NOT NULL DEFAULT '{
    "message_min_lift_pct": 15,
    "message_min_sample_size": 50,
    "message_traffic_shift_pct": 70,
    "channel_min_lift_pct": 20,
    "timing_max_shift_min": 5,
    "script_min_lift_pct": 10,
    "script_traffic_shift_pct": 60,
    "noshow_min_show_rate_pct": 60,
    "noshow_extra_reminder_hours": 2,
    "highvalue_lead_score_min": 70,
    "highvalue_wait_hours": 2,
    "cooldown_max_messages_24h": 3,
    "max_call_attempts": 3
  }'::jsonb,
  rules_enabled JSONB  NOT NULL DEFAULT '{
    "R1_message_optimization": true,
    "R2_channel_prioritization": true,
    "R3_timing_adjustment": true,
    "R4_ai_script_optimization": true,
    "R5_noshow_reduction": true,
    "R6_high_value_priority": true,
    "R7_escalation": true,
    "R8_cooldown": true,
    "R9_call_attempt_cap": true,
    "R10_negative_response_pause": true
  }'::jsonb,
  updated_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.self_optimization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS so_settings_admin_all ON public.self_optimization_settings;
CREATE POLICY so_settings_admin_all
  ON public.self_optimization_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS so_settings_read_authenticated ON public.self_optimization_settings;
CREATE POLICY so_settings_read_authenticated
  ON public.self_optimization_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.self_optimization_settings (enabled, mode)
SELECT false, 'assisted'
WHERE NOT EXISTS (SELECT 1 FROM public.self_optimization_settings);

CREATE TABLE IF NOT EXISTS public.self_optimization_proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       TEXT NOT NULL,
  funnel_key    TEXT,
  scope         JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale     TEXT NOT NULL,
  before_state  JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state   JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_lift_pct NUMERIC(6,2),
  sample_size   INTEGER,
  confidence    NUMERIC(4,3),
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','applied','expired')),
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  applied_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_so_proposals_status ON public.self_optimization_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_so_proposals_funnel ON public.self_optimization_proposals(funnel_key, status);
CREATE INDEX IF NOT EXISTS idx_so_proposals_rule   ON public.self_optimization_proposals(rule_id, status);

ALTER TABLE public.self_optimization_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS so_proposals_admin_all ON public.self_optimization_proposals;
CREATE POLICY so_proposals_admin_all
  ON public.self_optimization_proposals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS so_proposals_operator_read ON public.self_optimization_proposals;
CREATE POLICY so_proposals_operator_read
  ON public.self_optimization_proposals
  FOR SELECT TO authenticated
  USING (funnel_key IS NULL OR public.is_funnel_operator(funnel_key));

DROP POLICY IF EXISTS so_proposals_operator_update ON public.self_optimization_proposals;
CREATE POLICY so_proposals_operator_update
  ON public.self_optimization_proposals
  FOR UPDATE TO authenticated
  USING (funnel_key IS NOT NULL AND public.is_funnel_operator(funnel_key));

CREATE TABLE IF NOT EXISTS public.self_optimization_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID REFERENCES public.self_optimization_proposals(id) ON DELETE SET NULL,
  rule_id       TEXT NOT NULL,
  event         TEXT NOT NULL
                  CHECK (event IN ('proposed','approved','rejected','applied','reverted','expired','auto_applied')),
  funnel_key    TEXT,
  what_changed  TEXT NOT NULL,
  why           TEXT,
  before_metric JSONB DEFAULT '{}'::jsonb,
  after_metric  JSONB DEFAULT '{}'::jsonb,
  actor         UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_so_logs_proposal ON public.self_optimization_logs(proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_so_logs_rule     ON public.self_optimization_logs(rule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_so_logs_funnel   ON public.self_optimization_logs(funnel_key, created_at DESC);

ALTER TABLE public.self_optimization_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS so_logs_admin_all ON public.self_optimization_logs;
CREATE POLICY so_logs_admin_all
  ON public.self_optimization_logs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS so_logs_operator_read ON public.self_optimization_logs;
CREATE POLICY so_logs_operator_read
  ON public.self_optimization_logs
  FOR SELECT TO authenticated
  USING (funnel_key IS NULL OR public.is_funnel_operator(funnel_key));

CREATE OR REPLACE FUNCTION public.tg_self_opt_settings_touch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_self_opt_settings_touch ON public.self_optimization_settings;
CREATE TRIGGER trg_self_opt_settings_touch
  BEFORE UPDATE ON public.self_optimization_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_self_opt_settings_touch();
