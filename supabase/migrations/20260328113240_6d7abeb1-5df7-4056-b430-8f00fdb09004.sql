INSERT INTO rooms (slug, title, sort_order, allowed_stages, config, status)
VALUES (
  'offer-deck',
  'Angebotsarchitektur',
  85,
  ARRAY['setter', 'senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '{"icon": "Layers", "route": "/members/offer-deck"}'::jsonb,
  'active'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order,
  allowed_stages = EXCLUDED.allowed_stages,
  config = EXCLUDED.config,
  status = EXCLUDED.status;