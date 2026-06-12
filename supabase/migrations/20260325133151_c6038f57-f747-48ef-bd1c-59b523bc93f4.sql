
-- Tighten the anon insert policy to only allow 'new' stage and 'bewerbung' source
DROP POLICY IF EXISTS "Public insert leads from bewerbung" ON public.leads;
CREATE POLICY "Public insert leads from bewerbung"
ON public.leads
FOR INSERT
TO anon
WITH CHECK (stage = 'new' AND source = 'bewerbung');
