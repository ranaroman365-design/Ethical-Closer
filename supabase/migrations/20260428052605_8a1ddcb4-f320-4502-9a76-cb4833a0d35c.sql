-- Replace WITH CHECK (true) with the same admin-role expression on the new admin-all policies.

DO $$
DECLARE pol record; admin_expr text :=
  '(public.has_role(auth.uid(),''admin''::app_role) OR public.has_role(auth.uid(),''owner''::app_role) OR public.has_role(auth.uid(),''ops_admin''::app_role))';
BEGIN
  -- attendance_events admin
  EXECUTE 'DROP POLICY IF EXISTS "att_events_admin_all" ON public.attendance_events';
  EXECUTE 'CREATE POLICY "att_events_admin_all" ON public.attendance_events FOR ALL TO authenticated USING ' || admin_expr || ' WITH CHECK ' || admin_expr;

  EXECUTE 'DROP POLICY IF EXISTS "att_status_admin_all" ON public.appointment_attendance_status';
  EXECUTE 'CREATE POLICY "att_status_admin_all" ON public.appointment_attendance_status FOR ALL TO authenticated USING ' || admin_expr || ' WITH CHECK ' || admin_expr;

  EXECUTE 'DROP POLICY IF EXISTS "ais_logs_admin_all" ON public.ai_setter_call_logs';
  EXECUTE 'CREATE POLICY "ais_logs_admin_all" ON public.ai_setter_call_logs FOR ALL TO authenticated USING ' || admin_expr || ' WITH CHECK ' || admin_expr;

  EXECUTE 'DROP POLICY IF EXISTS "ais_events_admin_all" ON public.ai_setter_events';
  EXECUTE 'CREATE POLICY "ais_events_admin_all" ON public.ai_setter_events FOR ALL TO authenticated USING ' || admin_expr || ' WITH CHECK ' || admin_expr;

  EXECUTE 'DROP POLICY IF EXISTS "twilio_logs_admin_all" ON public.twilio_message_logs';
  EXECUTE 'CREATE POLICY "twilio_logs_admin_all" ON public.twilio_message_logs FOR ALL TO authenticated USING ' || admin_expr || ' WITH CHECK ' || admin_expr;
END $$;

-- Service-role inserts (used by edge functions) bypass RLS naturally, so audit writes from triggers/edge functions still work.