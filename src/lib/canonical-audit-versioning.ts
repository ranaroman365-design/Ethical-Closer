/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL AUDIT, VERSIONING & REPORTING — Layer 37
 * ───────────────────────────────────────────────────────────────────────
 * Universal change-tracking spine for ALL governance-relevant mutations
 * (manual, automated, escalated). Every change is:
 *   1. Logged immutably (change_audit_log)
 *   2. Versioned (config_versions — append-only)
 *   3. Reversible (restore_config_version RPC creates a NEW version)
 *   4. Reportable (optimization_reports + PDF artifact)
 *
 * Scope: composes existing canon layers — does NOT replace their logic.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Modules whose changes must be audited & versioned. */
export const AUDIT_MODULES = [
  'lead_lifecycle',          // Layer 26
  'smart_attendance',        // Layer 27
  'ai_setter',               // Layer 28
  'message_library',         // Layer 31
  'message_performance',     // Layer 32
  'level_messaging',         // Layer 30
  'self_optimization',       // Layer 36
  'operator_control',        // Layer 33
  'touchpoint_sequence',     // Editor (post-L33)
  'ai_setter_guardrails',    // Post-L33
  'funnel_intelligence',     // Layer 34
] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

export const CHANGE_TYPES = [
  'create','update','delete','enable','disable',
  'rollback','approve','reject','threshold_change',
  'weight_shift','version_activate','escalation',
] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const SCOPE_TYPES = ['global','operator','funnel','lead'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const ACTOR_KINDS = ['admin','operator','system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const RISK_LEVELS = ['low','medium','high'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const REPORT_TYPES = [
  'change',          // single change (Change Report)
  'daily',           // last 24h roll-up
  'weekly',          // 7-day performance
  'operator',        // L6 scope
  'rollback',        // restore event
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Optimization governance modes (mirrors Layer 36 + adds 'passive'). */
export const GOVERNANCE_MODES = ['passive','assisted','autonomous'] as const;
export type GovernanceMode = (typeof GOVERNANCE_MODES)[number];

export interface ChangeAuditEntry {
  change_id: string;
  changed_by_kind: ActorKind;
  changed_by: string | null;
  change_type: ChangeType;
  scope_type: ScopeType;
  scope_id: string | null;
  module: AuditModule;
  previous_state: unknown;
  new_state: unknown;
  reason: string;
  metric_basis?: Record<string, unknown>;
  confidence_score?: number | null;
  reversible: boolean;
  rollback_reference_id?: string | null;
  // System-generated optional fields
  rule_triggered?: string | null;
  threshold_met?: Record<string, unknown> | null;
  sample_size?: number | null;
  before_metric?: Record<string, unknown> | null;
  after_metric?: Record<string, unknown> | null;
  expected_impact?: string | null;
  risk_level?: RiskLevel;
  created_at: string;
}

/** Hard rule: an L6 operator may only roll back their own funnel scope. */
export function canRollback(
  actorKind: ActorKind,
  scopeType: ScopeType,
  isAssignedToFunnel: boolean,
): boolean {
  if (actorKind === 'admin') return true;
  if (actorKind === 'system') return false;
  if (actorKind === 'operator') {
    // L6 may roll back funnel/operator scope they own; never global.
    if (scopeType === 'global') return false;
    return isAssignedToFunnel;
  }
  return false;
}

/** Storage path convention for downloadable PDFs. */
export function reportStoragePath(
  reportId: string,
  reportType: ReportType,
): string {
  const yyyy = new Date().getUTCFullYear();
  const mm = String(new Date().getUTCMonth() + 1).padStart(2, '0');
  return `${reportType}/${yyyy}/${mm}/${reportId}.pdf`;
}
