export type TierKey = 'bronze' | 'silver' | 'gold' | 'platinum' | 'black';
export type ProgramKey = 'closer' | 'fasttrack' | 'champion';
export type RoleKey = 'closer' | 'partner';
export type AvailabilityKey = 'available' | 'open' | 'unavailable';
export type BadgeType =
  | 'etc_certified'
  | 'etc_closer_gold'
  | 'etc_champion'
  | 'etc_top_performer';

export interface TheCloseUserType {
  id: string;
  user_id: string;
  role: RoleKey;
  status: 'pending' | 'active' | 'suspended';
  subscription_tier: TierKey;
  created_at: string;
  updated_at: string;
}

export interface CloserProfile {
  id: string;
  user_id: string;
  display_name: string;
  headline: string | null;
  location: string | null;
  languages: string[];
  experience_years: number;
  industries: string[];
  avg_deal_size: string | null;
  closing_rate: string | null;
  total_closes: number;
  bio: string | null;
  profile_image_url: string | null;
  linkedin_url: string | null;
  availability: AvailabilityKey;
  is_public: boolean;
  priority_score: number;
  created_at: string;
  updated_at: string;
  // Joined
  subscription_tier?: TierKey;
  badges?: EtcBadge[];
}

export interface PartnerProfile {
  id: string;
  user_id: string;
  company_name: string;
  contact_name: string | null;
  industry: string | null;
  company_size: string | null;
  website_url: string | null;
  description: string | null;
  logo_url: string | null;
  avg_deal_size: string | null;
  looking_for: string[];
  is_verified: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface EtcBadge {
  id: string;
  user_id: string;
  badge_type: BadgeType;
  is_active: boolean;
  granted_at: string;
  kpi_closes: number | null;
  kpi_revenue: string | null;
  kpi_period: string | null;
  verified_by: string | null;
  verified_at: string | null;
  expires_at: string | null;
  notes: string | null;
}

export interface JobOffer {
  id: string;
  partner_id: string;
  title: string;
  role_type: string;
  deal_size_min: number | null;
  deal_size_max: number | null;
  commission_type: string | null;
  commission_rate: string | null;
  industry: string | null;
  location_type: 'remote' | 'hybrid' | 'onsite';
  location: string | null;
  languages: string[];
  description: string | null;
  requirements: string | null;
  min_experience_years: number;
  requires_etc_badge: boolean;
  min_tier: TierKey;
  status: 'active' | 'paused' | 'closed';
  applications_count: number;
  views_count: number;
  created_at: string;
  expires_at: string | null;
  // Joined
  partner?: Pick<PartnerProfile,
    'company_name' | 'logo_url' | 'is_verified'>;
}

export interface JobApplication {
  id: string;
  job_id: string;
  closer_id: string;
  message: string | null;
  status: 'sent' | 'viewed' | 'shortlisted' | 'declined' | 'hired';
  applied_at: string;
}

export interface KpiSubmission {
  id: string;
  user_id: string;
  submission_type: 'badge_application' | 'champion_claim' | 'monthly_update';
  closes_count: number;
  revenue_total: string | null;
  period_start: string | null;
  period_end: string | null;
  evidence_urls: string[];
  status: 'submitted' | 'under_review' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_note: string | null;
  partner_confirmation: string | null;
}

export interface DirectContact {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  job_offer_id: string | null;
  status: 'sent' | 'read' | 'replied' | 'declined';
  sent_at: string;
  read_at: string | null;
}

export const TIER_RANK: Record<TierKey, number> = {
  bronze: 1, silver: 2, gold: 3, platinum: 4, black: 5,
};

export const TIER_COLOR: Record<TierKey, string> = {
  bronze:   '#9AA0A6',
  silver:   '#B8952A',
  gold:     '#6B7B8D',
  platinum: '#141410',
  black:    '#0A0A08',
};

export const TIER_PRICE: Record<TierKey, string> = {
  bronze:   '€9/Monat',
  silver:   '€29/Monat',
  gold:     '€79/Monat',
  platinum: '€199/Monat',
  black:    'Invitation Only',
};

export const TIER_LABEL: Record<TierKey, string> = {
  bronze:   'Bronze',
  silver:   'Silver',
  gold:     'Gold',
  platinum: 'Platinum',
  black:    'Black',
};
