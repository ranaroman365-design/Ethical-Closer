-- Sprint 1: Extend profiles with new fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS business_stage text NOT NULL DEFAULT 'trainee';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_set boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manual_stage_lock boolean DEFAULT false;

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'active',
  visibility_mode text DEFAULT 'stage_bound',
  allowed_stages text[] DEFAULT '{}',
  read_only_after_graduation boolean DEFAULT false,
  auto_hide_on_graduation boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read active rooms" ON rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage rooms" ON rooms FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Thresholds table
CREATE TABLE IF NOT EXISTS thresholds (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  stage_scope text NOT NULL,
  target_stage text NOT NULL,
  condition_type text DEFAULT 'all',
  conditions jsonb NOT NULL DEFAULT '[]',
  outcomes jsonb NOT NULL DEFAULT '[]',
  active boolean DEFAULT true,
  requires_manual_approval boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read thresholds" ON thresholds FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage thresholds" ON thresholds FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- User threshold states
CREATE TABLE IF NOT EXISTS user_threshold_states (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  threshold_id uuid NOT NULL REFERENCES thresholds(id) ON DELETE CASCADE,
  status text DEFAULT 'pending',
  progress jsonb DEFAULT '{}',
  evaluated_at timestamptz,
  result jsonb,
  UNIQUE(user_id, threshold_id)
);
ALTER TABLE user_threshold_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own threshold states" ON user_threshold_states FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage threshold states" ON user_threshold_states FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- User access overrides
CREATE TABLE IF NOT EXISTS user_access_overrides (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  reason text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, room_id, action_type)
);
ALTER TABLE user_access_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own overrides" ON user_access_overrides FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage overrides" ON user_access_overrides FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id uuid,
  target_user_id uuid,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  source_type text DEFAULT 'manual',
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit logs" ON audit_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert audit logs" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- User notes
CREATE TABLE IF NOT EXISTS user_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  admin_id uuid,
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage notes" ON user_notes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Invite tokens
CREATE TABLE IF NOT EXISTS invite_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token text UNIQUE NOT NULL,
  email text NOT NULL,
  initial_stage text DEFAULT 'trainee',
  created_by uuid,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage invites" ON invite_tokens FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Public validate tokens" ON invite_tokens FOR SELECT USING (true);

-- Insert default rooms with route config
INSERT INTO rooms (slug, title, allowed_stages, sort_order, config) VALUES
  ('dashboard', 'Dashboard', '{"trainee","junior","senior","director"}', 1, '{"route": "/members", "icon": "LayoutDashboard", "end": true}'),
  ('start-here', 'Start Here', '{"trainee","junior","senior","director"}', 2, '{"route": "/members/start", "icon": "Rocket"}'),
  ('academy', 'Academy', '{"trainee","junior","senior","director"}', 3, '{"route": "/members/academy", "icon": "GraduationCap"}'),
  ('practice', 'Practice', '{"trainee","junior","senior","director"}', 4, '{"route": "/members/practice", "icon": "Target"}'),
  ('certification', 'Zertifizierung', '{"trainee","junior","senior","director"}', 5, '{"route": "/members/certification", "icon": "Award"}'),
  ('objection-handling', 'Objection Handling', '{"trainee","junior","senior","director"}', 6, '{"route": "/members/objection-handling", "icon": "Shield"}'),
  ('setter-workspace', 'Junior Workspace', '{"trainee","junior","senior","director"}', 7, '{"route": "/members/setter", "icon": "Crosshair"}'),
  ('closing-questions', 'Closing Questions', '{"trainee","junior","senior","director"}', 8, '{"route": "/members/closing-questions", "icon": "MessageCircle"}'),
  ('call-framework', 'Call Framework', '{"trainee","junior","senior","director"}', 9, '{"route": "/members/call-framework", "icon": "Phone"}'),
  ('tools', 'Tools', '{"trainee","junior","senior","director"}', 10, '{"route": "/members/tools", "icon": "Wrench"}'),
  ('help', 'Hilfe', '{"trainee","junior","senior","director"}', 11, '{"route": "/members/help", "icon": "HelpCircle"}'),
  ('profile', 'Profil', '{"trainee","junior","senior","director"}', 12, '{"route": "/members/profile", "icon": "User"}'),
  ('placement', 'Placement', '{"senior","director"}', 13, '{"route": "/members/placement", "icon": "Briefcase"}'),
  ('closer-workspace', 'Senior Workspace', '{"senior","director"}', 14, '{"route": "/members/closer", "icon": "Handshake"}'),
  ('trainee-community', 'Trainee Community', '{"trainee","junior"}', 15, '{"route": "/members/community", "icon": "Users"}'),
  ('closer-community', 'Senior Community', '{"senior","director"}', 16, '{"route": "/members/closer-community", "icon": "Crown"}');

-- Insert default thresholds
INSERT INTO thresholds (name, stage_scope, target_stage, condition_type, conditions, outcomes, requires_manual_approval) VALUES
(
  'Trainee → Junior', 'trainee', 'junior', 'all',
  '[{"type": "quiz_completion", "min_score": 80}, {"type": "modules_complete", "phase": 1}]',
  '[{"type": "change_stage", "target_stage": "junior"}]',
  false
),
(
  'Junior → Senior', 'junior', 'senior', 'manual_approval',
  '[{"type": "kpi_threshold", "metric": "approved_calls", "min": 10}]',
  '[{"type": "change_stage", "target_stage": "senior"}]',
  true
),
(
  'Senior → Director', 'senior', 'director', 'manual_approval',
  '[{"type": "placement_achieved", "count": 5}]',
  '[{"type": "change_stage", "target_stage": "director"}, {"type": "unlock_room", "slug": "director-room"}]',
  true
);