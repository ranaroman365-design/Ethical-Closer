
-- Update existing rooms to match new simulator structure
-- 1. Rename 'practice' room to be the Practice Hub
UPDATE public.rooms 
SET title = 'Praxis-Hub',
    config = jsonb_set(
      jsonb_set(config, '{route}', '"/members/practice"'),
      '{icon}', '"Target"'
    )
WHERE slug = 'practice' AND product_key = 'etc';

-- 2. Replace opener-simulator, setter-simulator, simulator, voice-simulator, ethical-simulator
-- with new clean slugs

-- Update opener-simulator → simulator-opener  
UPDATE public.rooms 
SET slug = 'simulator-opener',
    title = 'Opener Simulator',
    config = jsonb_set(
      jsonb_set(config, '{route}', '"/members/simulator/opener"'),
      '{icon}', '"MessageCircle"'
    )
WHERE slug = 'opener-simulator' AND product_key = 'etc';

-- Update setter-simulator → simulator-setter
UPDATE public.rooms 
SET slug = 'simulator-setter',
    title = 'Setter Simulator',
    config = jsonb_set(
      jsonb_set(config, '{route}', '"/members/simulator/setter"'),
      '{icon}', '"Phone"'
    )
WHERE slug = 'setter-simulator' AND product_key = 'etc';

-- Update simulator (closer) → simulator-closer
UPDATE public.rooms 
SET slug = 'simulator-closer',
    title = 'Closer Simulator',
    config = jsonb_set(
      jsonb_set(config, '{route}', '"/members/simulator/closer"'),
      '{icon}', '"Crosshair"'
    )
WHERE slug = 'simulator' AND product_key = 'etc';

-- Deactivate voice-simulator and ethical-simulator from main nav
-- (functionality absorbed into role simulators)
UPDATE public.rooms 
SET status = 'inactive'
WHERE slug IN ('voice-simulator', 'ethical-simulator') 
  AND product_key = 'etc';

-- Insert new rooms if they don't exist (in case above updates don't find them)
INSERT INTO public.rooms (slug, title, sort_order, allowed_stages, config, status, product_key)
SELECT 'simulator-opener', 'Opener Simulator', 620, 
  ARRAY['opener','setter','associate_setter','senior_associate','senior_setter','junior_manager','manager','senior_manager','director','partner'],
  '{"route": "/members/simulator/opener", "icon": "MessageCircle"}'::jsonb,
  'active', 'etc'
WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE slug = 'simulator-opener' AND product_key = 'etc');

INSERT INTO public.rooms (slug, title, sort_order, allowed_stages, config, status, product_key)
SELECT 'simulator-setter', 'Setter Simulator', 630,
  ARRAY['setter','associate_setter','senior_associate','senior_setter','junior_manager','manager','senior_manager','director','partner'],
  '{"route": "/members/simulator/setter", "icon": "Phone"}'::jsonb,
  'active', 'etc'
WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE slug = 'simulator-setter' AND product_key = 'etc');

INSERT INTO public.rooms (slug, title, sort_order, allowed_stages, config, status, product_key)
SELECT 'simulator-closer', 'Closer Simulator', 640,
  ARRAY['senior_associate','senior_setter','junior_manager','manager','senior_manager','director','partner'],
  '{"route": "/members/simulator/closer", "icon": "Crosshair"}'::jsonb,
  'active', 'etc'
WHERE NOT EXISTS (SELECT 1 FROM public.rooms WHERE slug = 'simulator-closer' AND product_key = 'etc');
