-- Fix 1: Quarterly Crossing — add missing route and icon to config
UPDATE rooms 
SET config = jsonb_build_object('icon', 'Sparkles', 'route', '/members/quarterly-crossing')
WHERE slug = 'quarterly-crossing' AND product_key = 'etc';

-- Fix 2: Profiles RLS — allow all authenticated users to read all profiles (needed for chat, community, leaderboards)
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;

CREATE POLICY "Authenticated users can read profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Fix 3: Scale Hub — add manager (L5) to allowed_stages
UPDATE rooms 
SET allowed_stages = ARRAY['manager', 'senior_manager', 'director', 'partner']
WHERE slug = 'scale-hub' AND product_key = 'etc';

-- Fix 4: Start Here — add director (L7) to allowed_stages so it's visible L1-L8
UPDATE rooms 
SET allowed_stages = ARRAY['opener', 'setter', 'senior_associate', 'junior_manager', 'manager', 'senior_manager', 'director', 'partner']
WHERE slug = 'start-here' AND product_key = 'etc';