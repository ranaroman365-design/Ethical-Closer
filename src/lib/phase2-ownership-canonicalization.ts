/**
 * ═══════════════════════════════════════════════════════════════════════
 * PHASE 2 OWNERSHIP CANONICALIZATION — Registry (Layer 54)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tracks all Phase 2 canonicalization actions.
 * Single source of truth for Phase 2 status.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { OWNERSHIP_ROLES, ASSIGNMENT_TRANSITIONS, OWNERSHIP_TRANSFER_RULES, COMMISSION_ATTRIBUTION, IMMUTABILITY_RULES, OWNERSHIP_HARD_RULES } from './canonical-ownership';
import { REVENUE_SOURCES, DASHBOARD_REVENUE_MAP, REVENUE_ATTRIBUTION_RULES } from './canonical-revenue-truth';
import { CALENDAR_TRUTH_SOURCES, SCHEDULING_RULES, CALENDAR_HARD_RULES } from './canonical-calendar';

// ─── PART 1: DB MIGRATIONS ─────────────────────────────────────────

export interface Phase2Migration {
  id: string;
  description: string;
  table: string;
  type: 'add_column' | 'create_table' | 'create_trigger' | 'backfill';
  status: 'completed' | 'pending';
}

export const PHASE2_MIGRATIONS: Phase2Migration[] = [
  {
    id: 'calls_call_owner',
    description: 'Added call_owner_user_id to calls — the actual call conductor',
    table: 'calls',
    type: 'add_column',
    status: 'completed',
  },
  {
    id: 'calls_revenue_owner',
    description: 'Added revenue_owner_user_id to calls — the conversion credit owner',
    table: 'calls',
    type: 'add_column',
    status: 'completed',
  },
  {
    id: 'calls_backfill',
    description: 'Backfilled call_owner_user_id and revenue_owner_user_id from user_id',
    table: 'calls',
    type: 'backfill',
    status: 'completed',
  },
  {
    id: 'commission_audit_log',
    description: 'Created commission_audit_log table for immutability audit trail',
    table: 'commission_audit_log',
    type: 'create_table',
    status: 'completed',
  },
  {
    id: 'commission_immutability_trigger',
    description: 'Created trg_protect_finalized_commissions to block changes after payout',
    table: 'commissions',
    type: 'create_trigger',
    status: 'completed',
  },
];

// ─── PART 2: CANONICAL SOURCE FILES ────────────────────────────────

export interface CanonicalSourceFile {
  path: string;
  layer: number;
  block: string;
  description: string;
}

export const CANONICAL_SOURCE_FILES: CanonicalSourceFile[] = [
  {
    path: 'src/lib/canonical-ownership.ts',
    layer: 54,
    block: 'Governance',
    description: 'Canonical Ownership Constitution — 5 ownership roles, assignment lifecycle, transfer rules, immutability',
  },
  {
    path: 'src/lib/canonical-revenue-truth.ts',
    layer: 54,
    block: 'Value',
    description: 'Revenue Attribution Constitution — source hierarchy, dashboard map, attribution rules',
  },
  {
    path: 'src/lib/canonical-calendar.ts',
    layer: 54,
    block: 'Conversion',
    description: 'Calendar Canon — scheduling truth sources, GHL rules, integrity rules',
  },
];

// ─── PART 3: INTEGRITY MONITORING ──────────────────────────────────

export interface IntegrityCheck {
  name: string;
  domain: string;
  description: string;
  query: string;
  severity: 'warning' | 'critical';
}

export const INTEGRITY_CHECKS: IntegrityCheck[] = [
  {
    name: 'appointment_without_owner',
    domain: 'ownership_integrity',
    description: 'Appointments where current_owner_id IS NULL',
    query: "SELECT count(*) FROM appointments WHERE current_owner_id IS NULL AND appointment_status NOT IN ('cancelled')",
    severity: 'critical',
  },
  {
    name: 'lead_without_owner',
    domain: 'ownership_integrity',
    description: 'Leads where owner_id IS NULL after setter assignment',
    query: "SELECT count(*) FROM leads WHERE owner_id IS NULL AND conversion_state NOT IN ('new_lead')",
    severity: 'warning',
  },
  {
    name: 'revenue_without_attribution',
    domain: 'revenue_integrity',
    description: 'Calls with revenue > 0 but no revenue_owner_user_id',
    query: 'SELECT count(*) FROM calls WHERE revenue > 0 AND revenue_owner_user_id IS NULL',
    severity: 'critical',
  },
  {
    name: 'orphan_appointments',
    domain: 'calendar_integrity',
    description: 'Appointments with no matching lead',
    query: 'SELECT count(*) FROM appointments a LEFT JOIN leads l ON a.lead_id = l.id WHERE l.id IS NULL',
    severity: 'warning',
  },
  {
    name: 'commission_payout_mismatch',
    domain: 'revenue_integrity',
    description: "Commissions with payout_status='paid' but no payout_batch_id",
    query: "SELECT count(*) FROM commissions WHERE payout_status = 'paid' AND payout_batch_id IS NULL",
    severity: 'critical',
  },
];

// ─── PART 4: LEGACY CRON STATUS ────────────────────────────────────

export interface LegacyCronStatus {
  name: string;
  jobId: number | null;
  status: 'disabled' | 'removed' | 'active_canonical';
  disabledInPhase: string;
  replacedBy: string;
}

export const LEGACY_CRON_STATUS: LegacyCronStatus[] = [
  {
    name: 'recalc_user_kpi_snapshot',
    jobId: 12,
    status: 'disabled',
    disabledInPhase: 'Phase 2.1 GHL Decommissioning',
    replacedBy: 'calculate-kpi-snapshots (canonical)',
  },
  {
    name: 'smart-attendance-reminders',
    jobId: null,
    status: 'removed',
    disabledInPhase: 'Phase 2 GHL Decommissioning',
    replacedBy: 'dispatch-appointment-reminders',
  },
  {
    name: 'process-attendance-jobs',
    jobId: null,
    status: 'removed',
    disabledInPhase: 'Phase 2 GHL Decommissioning',
    replacedBy: 'dispatch-appointment-reminders → dispatch-communication',
  },
  {
    name: 'attendance-send-twilio',
    jobId: null,
    status: 'removed',
    disabledInPhase: 'Phase 2 GHL Decommissioning',
    replacedBy: 'dispatch-communication → Twilio gateway',
  },
];

// ─── PART 5: DASHBOARD KPI GAPS ────────────────────────────────────

export interface DashboardKpiGap {
  dashboard: string;
  component: string;
  issue: string;
  resolution: string;
  status: 'closed' | 'flagged';
}

export const DASHBOARD_KPI_GAPS: DashboardKpiGap[] = [
  {
    dashboard: 'Execution Dashboard',
    component: 'src/components/performance/ExecutionDashboard.tsx',
    issue: 'Reads raw appointments + calls tables instead of canonical KPI sources',
    resolution: 'Flagged for migration to member_kpis / real_kpi_snapshot',
    status: 'flagged',
  },
];

// ─── AUDIT FUNCTION ─────────────────────────────────────────────────

export function auditPhase2Ownership(): {
  ownershipRoles: number;
  assignmentTransitions: number;
  transferRules: number;
  commissionAttributionRoles: number;
  immutabilityRules: number;
  hardRules: number;
  revenueSources: number;
  canonicalRevenueSources: number;
  nonCanonicalRevenueSources: number;
  dashboardsMapped: number;
  dashboardsCanonical: number;
  dashboardsFlagged: number;
  calendarTruthSources: number;
  schedulingRules: number;
  migrations: number;
  migrationsCompleted: number;
  integrityChecks: number;
  legacyCronsDisabled: number;
} {
  const canonicalDashboards = DASHBOARD_REVENUE_MAP.filter(d => d.canonical);
  const flaggedDashboards = DASHBOARD_REVENUE_MAP.filter(d => !d.canonical);
  const canonicalRevSources = REVENUE_SOURCES.filter(s => s.tier === 'canonical');
  const nonCanonicalRevSources = REVENUE_SOURCES.filter(s => s.tier === 'non_canonical');

  return {
    ownershipRoles: OWNERSHIP_ROLES.length,
    assignmentTransitions: ASSIGNMENT_TRANSITIONS.length,
    transferRules: OWNERSHIP_TRANSFER_RULES.length,
    commissionAttributionRoles: COMMISSION_ATTRIBUTION.length,
    immutabilityRules: IMMUTABILITY_RULES.length,
    hardRules: OWNERSHIP_HARD_RULES.length,
    revenueSources: REVENUE_SOURCES.length,
    canonicalRevenueSources: canonicalRevSources.length,
    nonCanonicalRevenueSources: nonCanonicalRevSources.length,
    dashboardsMapped: DASHBOARD_REVENUE_MAP.length,
    dashboardsCanonical: canonicalDashboards.length,
    dashboardsFlagged: flaggedDashboards.length,
    calendarTruthSources: CALENDAR_TRUTH_SOURCES.length,
    schedulingRules: SCHEDULING_RULES.length,
    migrations: PHASE2_MIGRATIONS.length,
    migrationsCompleted: PHASE2_MIGRATIONS.filter(m => m.status === 'completed').length,
    integrityChecks: INTEGRITY_CHECKS.length,
    legacyCronsDisabled: LEGACY_CRON_STATUS.filter(c => c.status !== 'active_canonical').length,
  };
}
