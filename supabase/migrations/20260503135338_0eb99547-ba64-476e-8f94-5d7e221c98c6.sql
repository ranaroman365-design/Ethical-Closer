
-- Drop the 5-parameter overload
DROP FUNCTION IF EXISTS public.upsert_funnel_lead(text, text, text, text, jsonb);

-- Drop the 7-parameter overload (with uuid traffic_owner)
DROP FUNCTION IF EXISTS public.upsert_funnel_lead(text, text, text, text, jsonb, text, uuid);
