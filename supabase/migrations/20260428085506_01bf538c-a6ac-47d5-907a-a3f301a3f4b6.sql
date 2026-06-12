-- System Architecture View — read-only live status RPC (Layer 45 visualization)
CREATE OR REPLACE FUNCTION public.system_architecture_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_priv boolean;
  _wa_24h int := 0;
  _email_24h int := 0;
  _email_failed_24h int := 0;
  _push_24h int := 0;
  _msg_lib_24h int := 0;
  _wa_active_convos int := 0;
  _email_pending int := 0;
  _email_dlq int := 0;
  _wa_enabled int := 0;
  _ai_enabled int := 0;
  _lifecycle_enabled int := 0;
  _level_msg_enabled int := 0;
  _email_master boolean := false;
  _push_master boolean := false;
  _ai_setter_master boolean := false;
  _conv_ai_master boolean := false;
  _funnel_total int := 0;
  _recent_audit jsonb;
BEGIN
  _is_priv := has_role(auth.uid(), 'admin'::app_role)
           OR has_role(auth.uid(), 'owner'::app_role)
           OR has_role(auth.uid(), 'ops_admin'::app_role);
  IF NOT _is_priv THEN
    -- L6+ operators with at least one assigned funnel
    IF NOT EXISTS (SELECT 1 FROM operator_funnel_assignments WHERE operator_id = auth.uid()) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT count(*) INTO _funnel_total FROM per_funnel_feature_flags;
  SELECT count(*) FILTER (WHERE smart_attendance_enabled),
         count(*) FILTER (WHERE ai_setter_enabled),
         count(*) FILTER (WHERE lead_lifecycle_enabled),
         count(*) FILTER (WHERE level_messaging_enabled)
    INTO _wa_enabled, _ai_enabled, _lifecycle_enabled, _level_msg_enabled
  FROM per_funnel_feature_flags;

  -- WhatsApp activity (last 24h)
  BEGIN
    SELECT count(*) INTO _wa_24h FROM wa_messages WHERE created_at > now() - interval '24 hours';
    SELECT count(DISTINCT lead_id) INTO _wa_active_convos
      FROM wa_messages WHERE created_at > now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Email activity
  BEGIN
    SELECT count(*) INTO _email_24h FROM email_send_log WHERE created_at > now() - interval '24 hours';
    SELECT count(*) INTO _email_failed_24h FROM email_send_log
      WHERE created_at > now() - interval '24 hours' AND status IN ('failed','dlq','bounced');
    SELECT count(*) INTO _email_pending FROM email_send_log
      WHERE created_at > now() - interval '60 minutes' AND status = 'pending';
    SELECT count(*) INTO _email_dlq FROM email_send_log
      WHERE created_at > now() - interval '24 hours' AND status = 'dlq';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Push activity
  BEGIN
    SELECT count(*) INTO _push_24h FROM push_notifications WHERE created_at > now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Message library (SMS/WhatsApp campaign-style sends)
  BEGIN
    SELECT count(*) INTO _msg_lib_24h FROM message_library_send_log WHERE created_at > now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Master switches (best-effort, table may not always exist)
  BEGIN
    SELECT enabled INTO _email_master FROM email_documentation_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _email_master := true; END;
  BEGIN
    SELECT master_enabled INTO _push_master FROM push_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _push_master := false; END;
  BEGIN
    SELECT enabled INTO _conv_ai_master FROM conversational_ai_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _conv_ai_master := false; END;

  -- Last 10 cross-system events
  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO _recent_audit FROM (
    SELECT 'change_audit_log'::text AS source, module, change_type, scope_type, scope_id, created_at
    FROM change_audit_log
    ORDER BY created_at DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'funnels', jsonb_build_object(
      'total', _funnel_total,
      'smart_attendance_enabled', _wa_enabled,
      'ai_setter_enabled', _ai_enabled,
      'lead_lifecycle_enabled', _lifecycle_enabled,
      'level_messaging_enabled', _level_msg_enabled
    ),
    'channels', jsonb_build_object(
      'whatsapp', jsonb_build_object(
        'master_enabled', _conv_ai_master,
        'sent_24h', _wa_24h,
        'active_conversations_24h', _wa_active_convos,
        'description', 'Primary conversion channel — booking, follow-up, reminders'
      ),
      'sms', jsonb_build_object(
        'master_enabled', (_ai_enabled > 0),
        'sent_24h', _msg_lib_24h,
        'description', 'Conversion fallback — short, time-sensitive nudges'
      ),
      'push', jsonb_build_object(
        'master_enabled', COALESCE(_push_master, false),
        'sent_24h', _push_24h,
        'description', 'Re-engagement layer — bring user back to platform'
      ),
      'email', jsonb_build_object(
        'master_enabled', COALESCE(_email_master, true),
        'sent_24h', _email_24h,
        'failed_24h', _email_failed_24h,
        'pending', _email_pending,
        'dlq_24h', _email_dlq,
        'description', 'Documentation & trust layer — confirms reality, no selling'
      )
    ),
    'queues', jsonb_build_object(
      'note', 'PGMQ-managed; per-channel activity used as live proxy',
      'email_pending', _email_pending,
      'email_dlq_24h', _email_dlq
    ),
    'edge', jsonb_build_object(
      'communication', jsonb_build_object('name', 'process-attendance-jobs · process-outbound-events'),
      'ai_setter', jsonb_build_object('name', 'process-ai-setter-call-queue'),
      'push', jsonb_build_object('name', 'push-dispatch'),
      'email', jsonb_build_object('name', 'process-email-queue · email-documentation-dispatch')
    ),
    'incidents', jsonb_build_object(
      'email_failure_rate_high', (_email_24h > 10 AND _email_failed_24h::float / GREATEST(_email_24h,1) > 0.2),
      'email_dlq_present', (_email_dlq > 0)
    ),
    'recent_events', _recent_audit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.system_architecture_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.system_architecture_status() TO authenticated;