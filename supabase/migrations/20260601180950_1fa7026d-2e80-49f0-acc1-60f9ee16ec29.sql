-- Update existing CRO experiment variant payloads to match ETC brand voice.
-- Pure UPDATE on payload JSON. No schema change. No new variants.
-- Rollback: re-run with original copy from 20260601180009 migration.

-- hero_copy_v1: Control = current homepage headline. B = alternative angle.
UPDATE public.ab_variants v
SET payload = jsonb_build_object(
  'headline',
  'Werde High-Ticket Closer —'
)
FROM public.ab_experiments e
WHERE v.experiment_id = e.id AND e.key = 'hero_copy_v1' AND v.key = 'A';

UPDATE public.ab_variants v
SET payload = jsonb_build_object(
  'headline',
  'Steig ein in ein echtes Closing-System —'
)
FROM public.ab_experiments e
WHERE v.experiment_id = e.id AND e.key = 'hero_copy_v1' AND v.key = 'B';

-- cta_label_v1: Control = current button label.
UPDATE public.ab_variants v
SET payload = jsonb_build_object('label', 'Eignung prüfen')
FROM public.ab_experiments e
WHERE v.experiment_id = e.id AND e.key = 'cta_label_v1' AND v.key = 'A';

UPDATE public.ab_variants v
SET payload = jsonb_build_object('label', 'Jetzt bewerben')
FROM public.ab_experiments e
WHERE v.experiment_id = e.id AND e.key = 'cta_label_v1' AND v.key = 'B';

-- trust_order_v1: Control = current order (Daniel, Natalie, Thomas).
-- Variant B = highest income first (Thomas, Daniel, Natalie).
UPDATE public.ab_variants v
SET payload = jsonb_build_object('order', 'default')
FROM public.ab_experiments e
WHERE v.experiment_id = e.id AND e.key = 'trust_order_v1' AND v.key = 'A';

UPDATE public.ab_variants v
SET payload = jsonb_build_object('order', 'income_first')
FROM public.ab_experiments e
WHERE v.experiment_id = e.id AND e.key = 'trust_order_v1' AND v.key = 'B';
