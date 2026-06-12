-- Nullify calls.lead_id instead of deleting (preserves commissions)
UPDATE public.calls SET lead_id = NULL WHERE lead_id IN (
  SELECT id FROM public.leads WHERE is_simulation = true OR source IN ('test','simulation','demo','seed') OR source LIKE '%test%'
  OR email LIKE '%@example.%' OR email LIKE '%@test.%' OR email LIKE '%@fake.%'
  OR name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%fake%' OR name ILIKE '%simulation%'
  OR name ILIKE '%lovable%' OR name ILIKE '%qa %'
);
DELETE FROM public.follow_ups WHERE lead_id IN (
  SELECT id FROM public.leads WHERE is_simulation = true OR source IN ('test','simulation','demo','seed') OR source LIKE '%test%'
  OR email LIKE '%@example.%' OR email LIKE '%@test.%' OR email LIKE '%@fake.%'
  OR name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%fake%' OR name ILIKE '%simulation%'
  OR name ILIKE '%lovable%' OR name ILIKE '%qa %'
);
DELETE FROM public.payment_links WHERE lead_id IN (
  SELECT id FROM public.leads WHERE is_simulation = true OR source IN ('test','simulation','demo','seed') OR source LIKE '%test%'
  OR email LIKE '%@example.%' OR email LIKE '%@test.%' OR email LIKE '%@fake.%'
  OR name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%fake%' OR name ILIKE '%simulation%'
  OR name ILIKE '%lovable%' OR name ILIKE '%qa %'
);
UPDATE public.appointments SET rescheduled_to_id = NULL WHERE rescheduled_to_id IN (
  SELECT a.id FROM public.appointments a WHERE a.lead_id IN (
    SELECT id FROM public.leads WHERE is_simulation = true OR source IN ('test','simulation','demo','seed') OR source LIKE '%test%'
    OR email LIKE '%@example.%' OR email LIKE '%@test.%' OR email LIKE '%@fake.%'
    OR name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%fake%' OR name ILIKE '%simulation%'
    OR name ILIKE '%lovable%' OR name ILIKE '%qa %'
  )
);
UPDATE public.appointments SET rescheduled_from_id = NULL WHERE rescheduled_from_id IN (
  SELECT a.id FROM public.appointments a WHERE a.lead_id IN (
    SELECT id FROM public.leads WHERE is_simulation = true OR source IN ('test','simulation','demo','seed') OR source LIKE '%test%'
    OR email LIKE '%@example.%' OR email LIKE '%@test.%' OR email LIKE '%@fake.%'
    OR name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%fake%' OR name ILIKE '%simulation%'
    OR name ILIKE '%lovable%' OR name ILIKE '%qa %'
  )
);
-- Nullify payment_links by appointment
DELETE FROM public.payment_links WHERE appointment_id IN (
  SELECT a.id FROM public.appointments a WHERE a.lead_id IN (
    SELECT id FROM public.leads WHERE is_simulation = true OR source IN ('test','simulation','demo','seed') OR source LIKE '%test%'
    OR email LIKE '%@example.%' OR email LIKE '%@test.%' OR email LIKE '%@fake.%'
    OR name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%fake%' OR name ILIKE '%simulation%'
    OR name ILIKE '%lovable%' OR name ILIKE '%qa %'
  )
);
UPDATE public.leads SET booking_id = NULL WHERE is_simulation = true OR source IN ('test','simulation','demo','seed') OR source LIKE '%test%'
  OR email LIKE '%@example.%' OR email LIKE '%@test.%' OR email LIKE '%@fake.%'
  OR name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%fake%' OR name ILIKE '%simulation%'
  OR name ILIKE '%lovable%' OR name ILIKE '%qa %';
-- Delete fake leads (CASCADE handles most children)
DELETE FROM public.leads WHERE 
  is_simulation = true OR source IN ('test','simulation','demo','seed') OR source LIKE '%test%'
  OR email LIKE '%@example.%' OR email LIKE '%@test.%' OR email LIKE '%@fake.%'
  OR name ILIKE '%test%' OR name ILIKE '%demo%' OR name ILIKE '%fake%' OR name ILIKE '%simulation%'
  OR name ILIKE '%lovable%' OR name ILIKE '%qa %';