-- Layer 44 — Push Notification Channel
-- Settings (master + per-use-case toggles + per-funnel overrides)
-- Subscriptions (Web Push endpoint + keys per user)
-- Notifications log (in_app feed + delivery audit)

-- VAPID public key + master settings
CREATE TABLE IF NOT EXISTS public.push_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  master_enabled boolean NOT NULL DEFAULT false,
  vapid_public_key text,
  per_use_case jsonb NOT NULL DEFAULT '{
    "magic_link_access": true,
    "new_message": true,
    "appointment_reminder": true,
    "reschedule_reminder": true,
    "no_show_recovery": true,
    "level_onboarding": true,
    "promotion_message": false,
    "birthday_message": false
  }'::jsonb,
  per_funnel jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
INSERT INTO public.push_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.push_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_settings_admin_all" ON public.push_settings;
CREATE POLICY "push_settings_admin_all" ON public.push_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));
DROP POLICY IF EXISTS "push_settings_public_pubkey" ON public.push_settings;
CREATE POLICY "push_settings_public_pubkey" ON public.push_settings
  FOR SELECT TO authenticated USING (true);

-- Per-user web push subscription (one device = one row)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  user_agent text,
  consent_granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_sub_user_active
  ON public.push_subscriptions (user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_sub_self_read" ON public.push_subscriptions;
CREATE POLICY "push_sub_self_read" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid()
    OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'ops_admin'));
DROP POLICY IF EXISTS "push_sub_self_write" ON public.push_subscriptions;
CREATE POLICY "push_sub_self_write" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "push_sub_self_update" ON public.push_subscriptions;
CREATE POLICY "push_sub_self_update" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "push_sub_self_delete" ON public.push_subscriptions;
CREATE POLICY "push_sub_self_delete" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Notification log — drives in_app feed + audits delivery + click attribution
CREATE TABLE IF NOT EXISTS public.push_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  use_case text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app','web_push','mobile_push')),
  title text NOT NULL,
  body text NOT NULL,
  click_url text,
  decision text NOT NULL CHECK (decision IN ('sent','suppressed','error','delivered','clicked','read')),
  reason text,
  funnel_key text,
  related_lead_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_notif_user_recent
  ON public.push_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_notif_use_case_recent
  ON public.push_notifications (use_case, created_at DESC);

ALTER TABLE public.push_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_notif_self_read" ON public.push_notifications;
CREATE POLICY "push_notif_self_read" ON public.push_notifications
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'owner')
    OR public.has_role(auth.uid(),'ops_admin')
  );
DROP POLICY IF EXISTS "push_notif_self_update" ON public.push_notifications;
CREATE POLICY "push_notif_self_update" ON public.push_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- INSERT only via service role (edge function).