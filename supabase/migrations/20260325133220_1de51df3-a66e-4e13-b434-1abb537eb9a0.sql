
-- Fix remaining sort_order duplicates
UPDATE public.rooms SET sort_order = 11 WHERE slug = 'practice';
UPDATE public.rooms SET sort_order = 12 WHERE slug = 'certification';
