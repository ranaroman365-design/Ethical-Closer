-- Fix Intelligence Dashboard route
UPDATE rooms SET config = jsonb_set(config, '{route}', '"/members/intelligence"')
WHERE slug = 'intelligence';

-- Fix Deal Intelligence route
UPDATE rooms SET config = jsonb_set(config, '{route}', '"/members/deal-intelligence"')
WHERE slug = 'deal-intelligence';

-- Fix Intelligence allowed_stages to include L5+ properly
UPDATE rooms SET allowed_stages = ARRAY['manager', 'senior_manager', 'director', 'partner']
WHERE slug = 'intelligence';

-- Add Payment Links room
INSERT INTO rooms (slug, title, sort_order, allowed_stages, config, status, product_key)
VALUES (
  'payment-links',
  'Zahlungslinks',
  85,
  ARRAY['junior_manager', 'manager', 'senior_manager', 'director', 'partner'],
  '{"icon": "Wallet", "route": "/members/payment-links"}'::jsonb,
  'active',
  'etc'
)
ON CONFLICT DO NOTHING;