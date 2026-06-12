-- Start Here visible for ALL levels (L1-L7)
UPDATE rooms SET allowed_stages = ARRAY['opener','setter','senior_associate','junior_manager','manager','senior_manager','partner']
WHERE slug = 'start-here';

-- Tools visible ONLY for admin (empty array = admin-only via isAdmin check)
UPDATE rooms SET allowed_stages = ARRAY[]::text[]
WHERE slug = 'tools';