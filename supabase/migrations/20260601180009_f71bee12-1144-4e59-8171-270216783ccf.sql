-- CRO seed: register 3 copy experiments + variants. Pure INSERT, no schema change.
-- Rollback: DELETE FROM public.ab_experiments WHERE key IN
--   ('hero_copy_v1','cta_label_v1','trust_order_v1');

INSERT INTO public.ab_experiments
  (key, name, description, status, scope, primary_metric, guardrail_metric,
   min_samples_per_variant, significance_alpha, min_lift_pct, allocator)
VALUES
  ('hero_copy_v1', 'Hero Headline Copy v1',
   'A/B-Test der Landing-Headline. A=Vertrauens-Angle, B=Planbarkeits-Angle.',
   'running', 'lp', 'quiz_start_rate', 'booking_rate', 200, 0.05, 10, 'thompson'),
  ('cta_label_v1', 'Primary CTA Label v1',
   'A/B-Test des Haupt-CTA-Labels (Apply-Button).',
   'running', 'lp', 'cta_ctr', 'quiz_start_rate', 200, 0.05, 10, 'thompson'),
  ('trust_order_v1', 'Trust Section Order v1',
   'A/B-Test Reihenfolge Trust-Sektion: Testimonials zuerst vs. Trust-Argumente zuerst.',
   'running', 'lp', 'quiz_start_rate', 'booking_rate', 200, 0.05, 10, 'thompson')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.ab_variants (experiment_id, key, label, is_control, weight, payload)
SELECT e.id, v.key, v.label, v.is_control, v.weight, v.payload::jsonb
FROM public.ab_experiments e
JOIN (VALUES
  ('hero_copy_v1', 'A', 'A — Vertrauen', true,  0.5,
    '{"headline":"Für Coaches, die wachsen wollen – ohne nochmal blind zu vertrauen."}'),
  ('hero_copy_v1', 'B', 'B — Planbarkeit', false, 0.5,
    '{"headline":"Planbare Kundenanfragen für Coaches – ohne Marketing-Experimente."}'),
  ('cta_label_v1', 'A', 'A — Unverbindlich prüfen', true,  0.5,
    '{"label":"Unverbindlich prüfen"}'),
  ('cta_label_v1', 'B', 'B — Kostenlose Analyse anfordern', false, 0.5,
    '{"label":"Kostenlose Analyse anfordern"}'),
  ('trust_order_v1', 'A', 'A — Testimonials zuerst', true,  0.5,
    '{"order":"testimonials_first"}'),
  ('trust_order_v1', 'B', 'B — Trust-Argumente zuerst', false, 0.5,
    '{"order":"trust_args_first"}')
) AS v(exp_key, key, label, is_control, weight, payload)
  ON v.exp_key = e.key
WHERE e.key IN ('hero_copy_v1','cta_label_v1','trust_order_v1')
ON CONFLICT (experiment_id, key) DO NOTHING;