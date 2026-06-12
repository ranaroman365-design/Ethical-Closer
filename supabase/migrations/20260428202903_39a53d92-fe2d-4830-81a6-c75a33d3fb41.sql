-- ============================================================================
-- Experiment Registry Backfill + Decision Log (Phase A) — corrected
-- ============================================================================

ALTER TABLE public.experiments
  ADD COLUMN IF NOT EXISTS test_key text,
  ADD COLUMN IF NOT EXISTS hypothesis text,
  ADD COLUMN IF NOT EXISTS primary_kpi text,
  ADD COLUMN IF NOT EXISTS surface text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','winner_declared','archived')),
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE UNIQUE INDEX IF NOT EXISTS experiments_test_key_uniq ON public.experiments(test_key) WHERE test_key IS NOT NULL;

ALTER TABLE public.experiment_variants
  ADD COLUMN IF NOT EXISTS variant_key text,
  ADD COLUMN IF NOT EXISTS is_control boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_holdout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weight_pct numeric,
  ADD COLUMN IF NOT EXISTS change_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description text;

CREATE TABLE IF NOT EXISTS public.experiment_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  test_key text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('declare_winner','keep_running','abandon','rollback','extend')),
  winning_variant_key text,
  primary_kpi text NOT NULL,
  control_value numeric,
  winner_value numeric,
  lift_pct numeric,
  sample_size_total bigint,
  reason text NOT NULL,
  next_action text,
  metrics_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experiment_decisions_exp_id_idx ON public.experiment_decisions(experiment_id);
CREATE INDEX IF NOT EXISTS experiment_decisions_decided_at_idx ON public.experiment_decisions(decided_at DESC);

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "experiments_l6_select" ON public.experiments;
DROP POLICY IF EXISTS "experiments_l6_write" ON public.experiments;
DROP POLICY IF EXISTS "variants_l6_select" ON public.experiment_variants;
DROP POLICY IF EXISTS "variants_l6_write" ON public.experiment_variants;
DROP POLICY IF EXISTS "decisions_l6_select" ON public.experiment_decisions;
DROP POLICY IF EXISTS "decisions_l6_insert" ON public.experiment_decisions;

CREATE POLICY "experiments_l6_select" ON public.experiments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

CREATE POLICY "experiments_l6_write" ON public.experiments
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

CREATE POLICY "variants_l6_select" ON public.experiment_variants
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

CREATE POLICY "variants_l6_write" ON public.experiment_variants
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

CREATE POLICY "decisions_l6_select" ON public.experiment_decisions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

CREATE POLICY "decisions_l6_insert" ON public.experiment_decisions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND COALESCE(p.current_phase, 0) >= 6)
  );

-- Backfill experiments
INSERT INTO public.experiments (id, test_key, name, hypothesis, primary_kpi, surface, status, started_at, storage_key, source_file, notes)
VALUES
  (gen_random_uuid(), 'social_proof_v1', 'Apply Social-Proof Copy A/B/H',
    'Outcome-orientierte Result-Pill-Copy hebt CTR auf "Strategie-Call sichern" gegenueber prozessorientierter Variante. 10% Holdout fuer echte Baseline.',
    'apply_cta_click_rate', '/apply', 'running', now() - interval '14 days',
    'apply_social_proof_ab_v1', 'src/lib/apply-ab-test.ts',
    '3-arm test (A=control 45%, B=variant 45%, H=holdout 10%). Holdout reuses A copy without A label.'),
  (gen_random_uuid(), 'hero_variant_v1', 'Apply Hero Variant TIME/INCOME/CTA90',
    'Income-Chips oder explizitere CTA-Label heben Quiz-Start-Rate gegenueber Time-Investment-Chips.',
    'quiz_started_rate', '/apply', 'running', now() - interval '7 days',
    'apply_hero_ab_v1', 'src/lib/apply-hero-ab.ts',
    'No holdout cell - social_proof_v1 already provides one.'),
  (gen_random_uuid(), 'playbook_hero_cta_v1', 'Playbook Hero-CTA 2x2 Factorial',
    'Playbook-CTA mit "Kostenloses Playbook erhalten" UND ueber primaerer CTA platziert hebt Lead-Magnet-Conversion ohne primary CTA cannibalization.',
    'lead_magnet_conversion_rate', '/apply', 'running', now() - interval '7 days',
    'playbook_hero_cta_v1', 'src/lib/playbook-cta-ab-test.ts',
    '2x2 factorial: copy (ANSEHEN/ERHALTEN) x placement (BELOW/ABOVE). A=30/B=30/C=20/D=20.'),
  (gen_random_uuid(), 'sticky_hint_v1', 'Sticky CTA Hint A/B/C',
    'Persistente Sticky-CTA-Hint (Variante B/C) hebt Re-Engagement bei Scroll-Stopps gegenueber stillem Sticky (A).',
    'sticky_cta_click_rate', '/apply', 'running', now() - interval '14 days',
    'apply_sticky_hint_v1', 'src/lib/sticky-ab-test.ts',
    'Equal-weight 3-arm. Existing dashboard at /members/admin/sticky-hint-ab.'),
  (gen_random_uuid(), 'ladder_vs_route_v1', 'Ladder vs Direct Route (Marketing Root)',
    'Soft-Yes-Pathway via Quiz mit ?intent=masterclass schlaegt direkten Route zu /start/masterclass auf Booking-Rate.',
    'booking_created_rate', 'root', 'running', now() - interval '14 days',
    'ec_exp_v1:ladder_vs_route_v1', 'src/lib/experiments.ts',
    'Deterministic hash-bucketing (FNV-1a). Only test using true cross-device-ready hashing.'),
  (gen_random_uuid(), 'apply_vs_qualify_v1', 'Apply Direct vs Qualify Filter Funnel',
    'Vorgeschalteter Qualify-Filter senkt Lead-Volumen aber hebt Close-Rate netto.',
    'close_rate', '/apply', 'running', '2026-04-27 08:46:30+00',
    NULL, NULL,
    'DB-driven funnel-level test. Mirrors ab_funnel_tests.test_1_apply_vs_qualify.')
ON CONFLICT (test_key) WHERE test_key IS NOT NULL DO NOTHING;

-- Backfill variants
WITH ex AS (
  SELECT id, test_key FROM public.experiments WHERE test_key IN
    ('social_proof_v1','hero_variant_v1','playbook_hero_cta_v1','sticky_hint_v1','ladder_vs_route_v1','apply_vs_qualify_v1')
)
INSERT INTO public.experiment_variants (id, experiment_id, variant_key, is_control, is_holdout, weight_pct, change_definition, description)
SELECT gen_random_uuid(), ex.id, v.variant_key, v.is_control, v.is_holdout, v.weight_pct, v.change_definition::jsonb, v.description
FROM ex
JOIN (VALUES
  ('social_proof_v1','A',true,false,45,'{"result_pill_copy":"cautious_process_oriented"}','Control: cautious, process-oriented copy'),
  ('social_proof_v1','B',false,false,45,'{"result_pill_copy":"outcome_oriented_concrete"}','Variant: outcome-oriented, more concrete copy'),
  ('social_proof_v1','H',false,true,10,'{"result_pill_copy":"cautious_process_oriented","holdout":true}','Holdout: same copy as A but excluded from analysis'),
  ('hero_variant_v1','TIME',true,false,33,'{"hero_chips":"time_investment","cta_label":"default"}','Control: existing time-bucket micro-commitment'),
  ('hero_variant_v1','INCOME',false,false,33,'{"hero_chips":"income_buckets","cta_label":"default","intent_routes":["2k-5k","5k-10k","10k+"]}','Income-bucket chips, route to /apply/quiz?intent=<bucket>'),
  ('hero_variant_v1','CTA90',false,false,34,'{"hero_chips":"time_investment","cta_label":"Bewerbung starten (90 Sek)"}','Time chips control + explicit time-cost CTA label'),
  ('playbook_hero_cta_v1','A',true,false,30,'{"copy":"Playbook ansehen","placement":"BELOW"}','Control: ANSEHEN x BELOW'),
  ('playbook_hero_cta_v1','B',false,false,30,'{"copy":"Kostenloses Playbook erhalten","placement":"BELOW"}','Variant: ERHALTEN x BELOW (copy isolated)'),
  ('playbook_hero_cta_v1','C',false,false,20,'{"copy":"Playbook ansehen","placement":"ABOVE"}','Variant: ANSEHEN x ABOVE (placement isolated)'),
  ('playbook_hero_cta_v1','D',false,false,20,'{"copy":"Kostenloses Playbook erhalten","placement":"ABOVE"}','Variant: ERHALTEN x ABOVE (full treatment)'),
  ('sticky_hint_v1','A',true,false,33.33,'{"sticky_hint":"silent"}','Control: silent sticky CTA'),
  ('sticky_hint_v1','B',false,false,33.33,'{"sticky_hint":"hint_v1"}','Variant B: hint copy v1'),
  ('sticky_hint_v1','C',false,false,33.34,'{"sticky_hint":"hint_v2"}','Variant C: hint copy v2'),
  ('ladder_vs_route_v1','control',true,false,50,'{"path":"/start/masterclass","entry":"direct"}','Control: legacy direct route'),
  ('ladder_vs_route_v1','ladder',false,false,50,'{"path":"/quiz?intent=masterclass","entry":"soft_yes_quiz"}','Variant: soft-yes pathway through the quiz'),
  ('apply_vs_qualify_v1','apply_direct',true,false,50,'{"funnel":"apply_direct"}','Champion: direct apply funnel'),
  ('apply_vs_qualify_v1','qualify_filter',false,false,50,'{"funnel":"qualify_filter"}','Challenger: qualify pre-filter funnel')
) AS v(test_key, variant_key, is_control, is_holdout, weight_pct, change_definition, description)
ON v.test_key = ex.test_key
ON CONFLICT DO NOTHING;