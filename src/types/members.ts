export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  current_phase: number;
  placement_ready: boolean;
  certified: boolean;
  onboarding_completed: boolean;
  member_status: string;
  certification_status: string;
  business_stage: string;
  cohort: string | null;
  ghl_contact_id: string | null;
  placement_type: string;
  platform_usage: boolean;
  partner_track_status: string;
  partner_company_count: number;
  partner_revenue_volume: number;
  created_at: string;
  updated_at: string;
}

export interface Phase {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  unlock_condition: string | null;
}

export interface Module {
  id: string;
  phase_id: number;
  title: string;
  description: string | null;
  content_type: string;
  sort_order: number;
  video_url: string | null;
  worksheet_url: string | null;
  created_at: string;
}

export interface MemberProgress {
  id: string;
  user_id: string;
  module_id: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  published: boolean;
  created_at: string;
  created_by: string | null;
}

export interface MemberKpis {
  id: string;
  user_id: string;
  closing_rate: number;
  revenue_closed: number;
  calls_handled: number;
  show_rate: number;
  qualification_accuracy: number;
  objection_resolution_rate: number;
  revenue_per_call: number;
  storno_rate: number;
  follow_up_rate: number;
  crm_hygiene_score: number;
  calls_per_week: number;
  response_time: number;
  lead_quality_sensitivity: number;
  earnings_per_call: number;
  commission_earned: number;
  setter_influenced_revenue: number;
  closer_direct_revenue: number;
  leads_assigned: number;
  leads_qualified: number;
  leads_won: number;
  handover_rate: number;
  arrival_score: number;
  context_score: number;
  friction_score: number;
  decision_conversion_rate: number;
  resistance_spikes: number;
  avg_awareness_created: number;
  pressure_index: number;
  decision_score: number;
  ethical_alignment_score: number;
  ownership_score: number;
  awareness_score: number;
  updated_at: string;
}

export interface QuizQuestion {
  id: string;
  module_id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  explanation: string;
  sort_order: number;
}

export interface QuizAttempt {
  id: string;
  user_id: string;
  module_id: string;
  score: number;
  total_questions: number;
  passed: boolean;
  created_at: string;
}

export interface PracticeCall {
  id: string;
  user_id: string;
  file_path: string;
  file_name: string;
  scorecard: Record<string, number> | null;
  total_score: number | null;
  status: string;
  created_at: string;
}

export type AppRole =
  | 'admin'
  | 'administrator'
  | 'member'
  | 'community_member'
  | 'owner'
  | 'security_admin'
  | 'ops_admin'
  | 'content_admin'
  | 'finance_admin'
  | 'support_admin'
  | 'partner_admin'
  | 'analyst_readonly'
  | 'automation_service'
  | 'ai_agent';

/** Roles that grant elevated platform access */
export const PRIVILEGED_ROLES: AppRole[] = [
  'owner', 'administrator', 'security_admin', 'ops_admin',
  'content_admin', 'finance_admin', 'support_admin',
];

/** Roles that can approve escalations and exports */
export const APPROVAL_ROLES: AppRole[] = ['owner'];

/** Roles that can view security console */
export const SECURITY_ROLES: AppRole[] = ['owner', 'security_admin'];

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export const MEMBER_STATUSES = [
  'applicant', 'enrolled', 'training_active', 'practice_phase',
  'certification_pending', 'certified', 'placement_ready',
  'placement_process', 'placed', 'advanced_lab', 'inner_circle',
] as const;

export const MEMBER_STATUS_LABELS: Record<string, string> = {
  applicant: 'Bewerber',
  enrolled: 'Eingeschrieben',
  training_active: 'Training Aktiv',
  practice_phase: 'Practice Phase',
  certification_pending: 'Zertifizierung läuft',
  certified: 'Certified Ethical Closer',
  placement_ready: 'Placement Ready',
  placement_process: 'Placement Prozess',
  placed: 'Platziert',
  advanced_lab: 'Advanced Closing Lab',
  inner_circle: 'Inner Circle',
};

export const CERT_STATUSES = [
  'not_started', 'test1_passed', 'test2_passed',
  'simulation_submitted', 'simulation_review',
  'certified', 'failed',
] as const;

export const CERT_STATUS_LABELS: Record<string, string> = {
  not_started: 'Nicht begonnen',
  test1_passed: 'Test 1 bestanden',
  test2_passed: 'Test 2 bestanden',
  simulation_submitted: 'Simulation eingereicht',
  simulation_review: 'Simulation in Bewertung',
  certified: 'Certified Ethical Closer ✓',
  failed: 'Nicht bestanden',
};
