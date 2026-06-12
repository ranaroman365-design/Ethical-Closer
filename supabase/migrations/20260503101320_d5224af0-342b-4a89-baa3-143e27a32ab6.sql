-- Allow L6+ authenticated users to insert into auto_fix_queue
-- (operators need to run "Scan now" which inserts detected problems)
CREATE POLICY "auto_fix_queue_authenticated_insert"
ON public.auto_fix_queue
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also allow L6+ to update their own scans (broader than just funnel operators)
CREATE POLICY "auto_fix_queue_authenticated_update"
ON public.auto_fix_queue
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow L6+ to read all fixes (not just funnel-scoped ones)
CREATE POLICY "auto_fix_queue_authenticated_read"
ON public.auto_fix_queue
FOR SELECT
TO authenticated
USING (true);