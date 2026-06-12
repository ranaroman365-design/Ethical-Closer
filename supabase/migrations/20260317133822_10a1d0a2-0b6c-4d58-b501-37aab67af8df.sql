-- Fix overly permissive audit_logs INSERT policy
DROP POLICY IF EXISTS "Insert audit logs" ON audit_logs;
CREATE POLICY "Authenticated insert audit logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);