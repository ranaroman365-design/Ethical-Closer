/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL OWNERSHIP CONSTITUTION — Layer 54 (BINDING)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ONE ownership model. ONE truth. ONE hierarchy.
 *
 * This file defines the SINGLE source of truth for all ownership
 * relationships across leads, appointments, calls, revenue, and commissions.
 *
 * Truth Hierarchy:
 *   Constitution → ETC OS → Active Canon → Enforced Registry → Feature → UI
 *
 * Block: Governance
 * Layer: Intelligence + Revenue
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── OWNERSHIP ROLE DEFINITIONS ─────────────────────────────────────

export interface OwnershipRole {
  id: string;
  name: string;
  description: string;
  canonicalTable: string;
  canonicalField: string;
  fallbackField?: string;
  immutable: boolean;
  ownerPhases: string[];
}

export const OWNERSHIP_ROLES: OwnershipRole[] = [
  {
    id: 'lead_owner',
    name: 'Lead Owner',
    description: 'The currently responsible acquisition/conversion owner. Usually setter or reassigned operator.',
    canonicalTable: 'leads',
    canonicalField: 'owner_id',
    fallbackField: 'setter_id',
    immutable: false,
    ownerPhases: ['acquisition', 'pre_call', 'qualification'],
  },
  {
    id: 'appointment_owner',
    name: 'Appointment Owner',
    description: 'The operator CURRENTLY operationally responsible for the appointment. NOT historical creator.',
    canonicalTable: 'appointments',
    canonicalField: 'current_owner_id',
    fallbackField: 'setter_id',
    immutable: false,
    ownerPhases: ['booked', 'pre_call', 'call'],
  },
  {
    id: 'calendar_owner',
    name: 'Calendar Owner',
    description: 'The user whose calendar currently contains the appointment.',
    canonicalTable: 'appointments',
    canonicalField: 'closer_id',
    immutable: false,
    ownerPhases: ['booked', 'call'],
  },
  {
    id: 'call_owner',
    name: 'Call Owner',
    description: 'The user who ACTUALLY conducted the call. Critical for revenue attribution and KPIs.',
    canonicalTable: 'calls',
    canonicalField: 'call_owner_user_id',
    fallbackField: 'user_id',
    immutable: true, // After call completion, call ownership is immutable
    ownerPhases: ['call', 'outcome'],
  },
  {
    id: 'revenue_owner',
    name: 'Revenue Owner',
    description: 'The operator credited for the successful conversion. Drives commission calculation.',
    canonicalTable: 'calls',
    canonicalField: 'revenue_owner_user_id',
    fallbackField: 'user_id',
    immutable: true, // After payout, revenue ownership is immutable
    ownerPhases: ['close', 'revenue', 'commission'],
  },
];

// ─── ASSIGNMENT LIFECYCLE STATE MACHINE ─────────────────────────────

export type AssignmentState =
  | 'lead_created'
  | 'setter_assigned'
  | 'qualification_started'
  | 'appointment_booked'
  | 'closer_assigned'
  | 'appointment_owned'
  | 'call_conducted'
  | 'outcome_logged'
  | 'revenue_attributed'
  | 'commission_distributed';

export interface AssignmentTransition {
  from: AssignmentState;
  to: AssignmentState;
  event: string;
  ownershipChanges: string[];
  auditRequired: boolean;
}

export const ASSIGNMENT_TRANSITIONS: AssignmentTransition[] = [
  {
    from: 'lead_created',
    to: 'setter_assigned',
    event: 'SETTER_ASSIGNED',
    ownershipChanges: ['leads.owner_id', 'leads.setter_id'],
    auditRequired: true,
  },
  {
    from: 'setter_assigned',
    to: 'qualification_started',
    event: 'QUALIFICATION_STARTED',
    ownershipChanges: [],
    auditRequired: false,
  },
  {
    from: 'qualification_started',
    to: 'appointment_booked',
    event: 'APPOINTMENT_BOOKED',
    ownershipChanges: ['appointments.current_owner_id', 'appointments.original_owner_id'],
    auditRequired: true,
  },
  {
    from: 'appointment_booked',
    to: 'closer_assigned',
    event: 'CLOSER_ASSIGNED',
    ownershipChanges: ['appointments.closer_id', 'appointments.current_owner_id'],
    auditRequired: true,
  },
  {
    from: 'closer_assigned',
    to: 'appointment_owned',
    event: 'OWNERSHIP_CONFIRMED',
    ownershipChanges: ['appointments.current_owner_role'],
    auditRequired: false,
  },
  {
    from: 'appointment_owned',
    to: 'call_conducted',
    event: 'CALL_STARTED',
    ownershipChanges: ['calls.call_owner_user_id'],
    auditRequired: true,
  },
  {
    from: 'call_conducted',
    to: 'outcome_logged',
    event: 'OUTCOME_LOGGED',
    ownershipChanges: [],
    auditRequired: true,
  },
  {
    from: 'outcome_logged',
    to: 'revenue_attributed',
    event: 'REVENUE_ATTRIBUTED',
    ownershipChanges: ['calls.revenue_owner_user_id'],
    auditRequired: true,
  },
  {
    from: 'revenue_attributed',
    to: 'commission_distributed',
    event: 'COMMISSION_CREATED',
    ownershipChanges: ['commissions.user_id'],
    auditRequired: true,
  },
];

// ─── OWNERSHIP TRANSFER RULES ──────────────────────────────────────

export interface OwnershipTransferRule {
  id: string;
  description: string;
  mustUpdate: string[];
  mustPreserve: string[];
  mustAudit: string[];
}

export const OWNERSHIP_TRANSFER_RULES: OwnershipTransferRule[] = [
  {
    id: 'setter_reassignment',
    description: 'When a setter is reassigned to a different lead/appointment',
    mustUpdate: [
      'appointments.current_owner_id',
      'appointments.current_owner_role',
      'leads.owner_id',
    ],
    mustPreserve: [
      'appointments.original_owner_id',
      'appointments.original_owner_role',
      'leads.setter_id',
    ],
    mustAudit: [
      'appointment_reassignment_log',
      'calendar_events',
    ],
  },
  {
    id: 'closer_reassignment',
    description: 'When a closer is reassigned to a different appointment',
    mustUpdate: [
      'appointments.closer_id',
      'appointments.current_owner_id',
      'appointments.current_owner_role',
      'appointments.reassigned_at',
      'appointments.reassigned_by',
    ],
    mustPreserve: [
      'appointments.original_owner_id',
      'appointments.setter_id',
    ],
    mustAudit: [
      'appointment_reassignment_log',
      'appointment_assignment_history',
      'calendar_events',
    ],
  },
  {
    id: 'l6_takeover',
    description: 'When an L6 operator takes over an appointment or lead',
    mustUpdate: [
      'appointments.assigned_operator_id',
      'appointments.current_owner_id',
      'leads.assigned_operator_id',
    ],
    mustPreserve: [
      'appointments.original_owner_id',
      'appointments.setter_id',
      'appointments.closer_id',
    ],
    mustAudit: [
      'appointment_reassignment_log',
      'appointment_assignment_history',
      'calendar_events',
    ],
  },
];

// ─── COMMISSION ATTRIBUTION MODEL ───────────────────────────────────

export interface CommissionAttribution {
  role: string;
  basis: string;
  canonicalField: string;
  timestamp: string;
}

export const COMMISSION_ATTRIBUTION: CommissionAttribution[] = [
  {
    role: 'setter',
    basis: 'Setter ownership at qualified/show stage',
    canonicalField: 'appointments.setter_id',
    timestamp: 'appointments.completed_at',
  },
  {
    role: 'closer',
    basis: 'Actual call owner at successful close event',
    canonicalField: 'calls.call_owner_user_id',
    timestamp: 'calls.closed_at',
  },
  {
    role: 'l5_override',
    basis: 'Managing closer hierarchy at close timestamp',
    canonicalField: 'director_team_assignments.user_id',
    timestamp: 'calls.closed_at',
  },
  {
    role: 'l6_override',
    basis: 'Operator hierarchy at close timestamp',
    canonicalField: 'appointments.assigned_operator_id',
    timestamp: 'calls.closed_at',
  },
];

// ─── IMMUTABILITY RULES ────────────────────────────────────────────

export interface ImmutabilityRule {
  id: string;
  table: string;
  condition: string;
  enforcement: string;
}

export const IMMUTABILITY_RULES: ImmutabilityRule[] = [
  {
    id: 'commission_after_payout',
    table: 'commissions',
    condition: 'payout_batch_id IS NOT NULL AND batch.paid_at IS NOT NULL',
    enforcement: 'DB trigger trg_protect_finalized_commissions blocks UPDATE/DELETE',
  },
  {
    id: 'call_owner_after_completion',
    table: 'calls',
    condition: 'call_completed_at IS NOT NULL OR closed_at IS NOT NULL',
    enforcement: 'Application-level guard — call_owner_user_id should not change after call ends',
  },
  {
    id: 'original_owner_always',
    table: 'appointments',
    condition: 'original_owner_id IS NOT NULL',
    enforcement: 'Application-level guard — original_owner_id never overwritten',
  },
];

// ─── HARD RULES ─────────────────────────────────────────────────────

export const OWNERSHIP_HARD_RULES = [
  'No appointment without current_owner_id',
  'No lead without owner_id after setter assignment',
  'No call without call_owner_user_id',
  'No revenue attribution without revenue_owner_user_id',
  'No commission without call_id linkage',
  'No reassignment without audit log entry',
  'No payout modification after finalization (without admin override)',
  'original_owner_id is WRITE-ONCE — never overwritten',
  'Commission follows canonical operational truth, NOT stale/historical ownership',
  'GHL ownership is NEVER canonical — Supabase is sole source of truth',
] as const;
