
-- Insert Pool room
INSERT INTO rooms (slug, title, description, sort_order, allowed_stages, config, status, visibility_mode)
VALUES (
  'pool',
  'Pool',
  'Zentraler Lead- und Bewerber-Pool',
  14,
  '{setter,senior_associate,junior_manager,manager,senior_manager,director,partner}',
  '{"icon":"Inbox","route":"/members/pool"}',
  'active',
  'stage_bound'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  sort_order = EXCLUDED.sort_order,
  allowed_stages = EXCLUDED.allowed_stages,
  config = EXCLUDED.config,
  status = EXCLUDED.status;

-- Fix Start Here: L1-L2
UPDATE rooms SET allowed_stages = '{opener,setter}', sort_order = 2 WHERE slug = 'start-here';

-- Fix Tools: visible to all but Admin-only content handled in component
UPDATE rooms SET sort_order = 96 WHERE slug = 'tools';

-- Ensure consistent sort orders for the new section structure
UPDATE rooms SET sort_order = 1 WHERE slug = 'dashboard';
UPDATE rooms SET sort_order = 3 WHERE slug = 'closer-benefits';
UPDATE rooms SET sort_order = 4 WHERE slug = 'build-your-team';
UPDATE rooms SET sort_order = 5 WHERE slug = 'academy';
UPDATE rooms SET sort_order = 6 WHERE slug = 'call-framework';
UPDATE rooms SET sort_order = 7 WHERE slug = 'closer-framework';
UPDATE rooms SET sort_order = 8 WHERE slug = 'closing-questions';
UPDATE rooms SET sort_order = 9 WHERE slug = 'objection-handling';
UPDATE rooms SET sort_order = 10 WHERE slug = 'practice';
UPDATE rooms SET sort_order = 11 WHERE slug = 'simulator';
UPDATE rooms SET sort_order = 12 WHERE slug = 'certification';
UPDATE rooms SET sort_order = 14 WHERE slug = 'pool';
UPDATE rooms SET sort_order = 15 WHERE slug = 'trainee-workspace';
UPDATE rooms SET sort_order = 16 WHERE slug = 'setter-workspace';
UPDATE rooms SET sort_order = 17 WHERE slug = 'closer-workspace';
UPDATE rooms SET sort_order = 18 WHERE slug = 'placement';
UPDATE rooms SET sort_order = 20 WHERE slug = 'trainee-community';
UPDATE rooms SET sort_order = 21 WHERE slug = 'associate-community';
UPDATE rooms SET sort_order = 22 WHERE slug = 'closer-community';
UPDATE rooms SET sort_order = 23 WHERE slug = 'mentor-space';
UPDATE rooms SET sort_order = 25 WHERE slug = 'advanced-lab';
UPDATE rooms SET sort_order = 26 WHERE slug = 'inner-circle';
UPDATE rooms SET sort_order = 80 WHERE slug = 'radiant';
