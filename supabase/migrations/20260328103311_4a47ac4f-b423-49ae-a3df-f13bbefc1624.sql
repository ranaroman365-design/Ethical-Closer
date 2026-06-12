
-- Communication toggles table for admin on/off switches
CREATE TABLE IF NOT EXISTS public.communication_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key text UNIQUE NOT NULL,
  group_label text NOT NULL,
  group_description text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.communication_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage communication toggles" ON public.communication_toggles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read communication toggles" ON public.communication_toggles
  FOR SELECT TO authenticated
  USING (true);

-- Seed the 6 MECE groups
INSERT INTO public.communication_toggles (group_key, group_label, group_description, enabled) VALUES
  ('db_triggers', 'DB Trigger (Auto-Events)', 'Automatische Milestone-Posts, Follow-Up-Scheduling, KPI-Recalc, Handover, Referral-Rewards, Phase-Advancement', true),
  ('cron_functions', 'Cron Edge Functions', 'State-Engine, Follow-Up-Versand, Outbound-Events (GHL), Weekly Reports, KPI-Recommendations, Snapshot-Berechnung', true),
  ('transactional_emails', 'Transaktionale E-Mails', 'Booking-Bestätigungen, Erinnerungen, Status-Updates via E-Mail-Queue', true),
  ('webhook_dispatch', 'Webhook Dispatch', 'Externe Webhook-Endpoints für Event-Forwarding (GHL, Custom)', true),
  ('realtime_notifications', 'In-App Benachrichtigungen', 'Echtzeit-Toasts für DMs, Community-Antworten, Karriereschritte, Auto-Wins', true),
  ('monetization_triggers', 'Monetization Triggers', 'State-basierte Angebote (Booster, Radiant, Scale Lab, Inner Circle, Quarterly)', true)
ON CONFLICT (group_key) DO NOTHING;

-- Community RLS: replace open SELECT with level-based access
DROP POLICY IF EXISTS "Authenticated read community messages" ON public.community_messages;

-- Helper function for community access
CREATE OR REPLACE FUNCTION public.get_user_community_types(p_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(p_user_id, 'admin'::app_role) THEN ARRAY['trainee','opener','setter','closer','manager','partner','director']
    ELSE (
      SELECT CASE p.business_stage
        WHEN 'prospect' THEN ARRAY['trainee']
        WHEN 'opener' THEN ARRAY['trainee','opener']
        WHEN 'setter' THEN ARRAY['setter']
        WHEN 'senior_associate' THEN ARRAY['setter']
        WHEN 'junior_manager' THEN ARRAY['closer']
        WHEN 'manager' THEN ARRAY['closer']
        WHEN 'senior_manager' THEN ARRAY['closer']
        WHEN 'director' THEN ARRAY['manager','director']
        WHEN 'partner' THEN ARRAY['manager','partner']
        ELSE ARRAY['trainee']
      END
      FROM profiles p WHERE p.id = p_user_id
    )
  END;
$$;

CREATE POLICY "Level-based community read" ON public.community_messages
  FOR SELECT TO authenticated
  USING (
    community_type = ANY(public.get_user_community_types(auth.uid()))
  );
