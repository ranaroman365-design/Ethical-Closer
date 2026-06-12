/**
 * ═══════════════════════════════════════════════════════════════════════
 * PHASE 2 GHL DECOMMISSIONING — Registry (Layer 53)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tracks all GHL dependency reduction actions from Phase 2.
 * This file is the SINGLE source of truth for Phase 2 status.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── PART 1: REMOVED EDGE FUNCTIONS ───────────────────────────────────────

export interface RemovedFunctionEntry {
  name: string;
  reason: string;
  canonicalReplacement: string;
  removedInPhase: 2;
  hadCronJob: boolean;
  tablesUsed: string[];
}

export const REMOVED_FUNCTIONS: RemovedFunctionEntry[] = [
  {
    name: 'smart-attendance-reminders',
    reason: 'Risk logic absorbed into canonical-reminder-consolidation.ts. Never actually sent messages.',
    canonicalReplacement: 'dispatch-appointment-reminders',
    removedInPhase: 2,
    hadCronJob: false,
    tablesUsed: ['leads', 'event_logs'],
  },
  {
    name: 'process-attendance-jobs',
    reason: 'attendance_jobs table had 0 rows. Never activated in production.',
    canonicalReplacement: 'dispatch-appointment-reminders → dispatch-communication',
    removedInPhase: 2,
    hadCronJob: false,
    tablesUsed: ['attendance_jobs', 'attendance_templates', 'attendance_settings', 'appointments', 'leads'],
  },
  {
    name: 'attendance-send-twilio',
    reason: 'Only called by process-attendance-jobs. With that removed, this is unused.',
    canonicalReplacement: 'dispatch-communication → Twilio gateway',
    removedInPhase: 2,
    hadCronJob: false,
    tablesUsed: ['twilio_message_logs'],
  },
  {
    name: 'no-show-recovery',
    reason: 'Replaced by mark-no-show-and-recover edge function.',
    canonicalReplacement: 'mark-no-show-and-recover',
    removedInPhase: 2,
    hadCronJob: false,
    tablesUsed: ['appointments', 'leads', 'event_logs'],
  },
  {
    name: 'ghl-event-webhook',
    reason: 'Merged into receive-ghl-webhook. funnel_events_v2 ingestion + raw_webhook_events now handled by the unified entry point.',
    canonicalReplacement: 'receive-ghl-webhook (unified)',
    removedInPhase: 2,
    hadCronJob: false,
    tablesUsed: ['raw_webhook_events', 'funnel_events_v2'],
  },
];

// ─── PART 2: RE-ROUTED FUNCTIONS ──────────────────────────────────────────

export interface ReroutedFunctionEntry {
  name: string;
  previousPath: string;
  newPath: string;
  change: string;
}

export const REROUTED_FUNCTIONS: ReroutedFunctionEntry[] = [
  {
    name: 'retargeting-no-booking',
    previousPath: 'outbound_events → process-outbound-events → GHL API',
    newPath: 'dispatch-communication → communication_dedup → Twilio',
    change: 'Replaced outbound_events.insert() with supabase.functions.invoke("dispatch-communication")',
  },
  {
    name: 'sync-retargeting-audiences',
    previousPath: 'outbound_events → process-outbound-events → GHL API',
    newPath: 'dispatch-communication → communication_dedup → Twilio',
    change: 'Replaced batch outbound_events.insert() with per-lead dispatch-communication invocations',
  },
];

// ─── PART 3: GHL ENTRY POINT CONSOLIDATION ────────────────────────────────

export const GHL_ENTRY_POINTS = {
  before: {
    inbound: ['receive-ghl-webhook', 'ghl-event-webhook'],
    outbound: ['process-outbound-events'],
  },
  after: {
    inbound: ['receive-ghl-webhook'],  // SINGLE entry point
    outbound: ['process-outbound-events'],  // Still active for CRM mirroring
  },
} as const;

// ─── PART 4: DROPPED TABLES ──────────────────────────────────────────────

export const DROPPED_TABLES = [
  { table: 'attendance_jobs', reason: '0 rows, never populated. Used only by removed process-attendance-jobs.' },
  { table: 'attendance_templates', reason: 'Template data embedded in edge functions. Table unused.' },
] as const;

// ─── PART 5: REMAINING GHL DEPENDENCIES ──────────────────────────────────

export interface RemainingGhlDependency {
  name: string;
  type: 'edge_function' | 'shared_config';
  purpose: string;
  phaseToRemove: number;
  notes: string;
}

export const REMAINING_GHL_DEPENDENCIES: RemainingGhlDependency[] = [
  {
    name: 'receive-ghl-webhook',
    type: 'edge_function',
    purpose: 'Inbound GHL events → canonical state transitions + funnel_events_v2',
    phaseToRemove: 3,
    notes: 'Hardened with HMAC, state guard, canonical normalization. Phase 3: remove when GHL is fully decommissioned.',
  },
  {
    name: 'process-outbound-events',
    type: 'edge_function',
    purpose: 'Supabase → GHL CRM mirror (contact upsert + tags + pipeline stages)',
    phaseToRemove: 3,
    notes: 'GHL as dumb mirror. Phase 3: remove when GHL CRM is no longer needed.',
  },
  {
    name: 'verify-ghl-tag-bindings',
    type: 'edge_function',
    purpose: 'Read-only audit of GHL tag existence',
    phaseToRemove: 3,
    notes: 'Safe. No mutations. Remove when GHL is decommissioned.',
  },
  {
    name: '_shared/ghl-config.ts',
    type: 'shared_config',
    purpose: 'GHL V6.1 config (pipeline stages, tags, custom fields, event map)',
    phaseToRemove: 3,
    notes: 'Used by process-outbound-events and receive-ghl-webhook.',
  },
  {
    name: '_shared/ghl-v61-spec.ts',
    type: 'shared_config',
    purpose: 'Runtime contract lock for V6.1 spec',
    phaseToRemove: 3,
    notes: 'Import guard. Used by process-outbound-events.',
  },
];

// ─── PART 6: PHASE 2.1 — LEGACY CRON DECOMMISSIONING ─────────────────────

export interface DecommissionedCron {
  jobId: number;
  name: string;
  schedule: string;
  action: 'unscheduled' | 'skip_list_added';
  reason: string;
  canonicalReplacement: string;
  decommissionedAt: string;
}

export const DECOMMISSIONED_CRONS: DecommissionedCron[] = [
  {
    jobId: 12,
    name: 'recalc_user_kpi_snapshot',
    schedule: '0 3 * * *',
    action: 'unscheduled',
    reason: 'Writes to deprecated users_kpi_snapshot (Layer 52). Replaced by member_kpis. 36 rows, only read by QA/test functions.',
    canonicalReplacement: 'member_kpis via compute_talent_scores RPC',
    decommissionedAt: '2026-05-06',
  },
];

export interface CanonicalizedEventSkip {
  eventName: string;
  previousPath: string;
  canonicalPath: string;
  skipAddedAt: string;
}

export const CANONICALIZED_EVENT_SKIPS: CanonicalizedEventSkip[] = [
  { eventName: 'appointment.reminder_24h', previousPath: 'outbound_events → process-outbound-events → GHL tag', canonicalPath: 'dispatch-appointment-reminders → dispatch-communication → Twilio', skipAddedAt: '2026-05-06' },
  { eventName: 'appointment.reminder_2h', previousPath: 'outbound_events → process-outbound-events → GHL tag', canonicalPath: 'dispatch-appointment-reminders → dispatch-communication → Twilio', skipAddedAt: '2026-05-06' },
  { eventName: 'appointment.reminder_10m', previousPath: 'outbound_events → process-outbound-events → GHL tag', canonicalPath: 'dispatch-appointment-reminders → dispatch-communication → Twilio', skipAddedAt: '2026-05-06' },
  { eventName: 'retargeting.sms_2h', previousPath: 'outbound_events → process-outbound-events → GHL tag', canonicalPath: 'retargeting-no-booking → dispatch-communication → Twilio', skipAddedAt: '2026-05-06' },
  { eventName: 'retargeting.email_24h', previousPath: 'outbound_events → process-outbound-events → GHL tag', canonicalPath: 'retargeting-no-booking → dispatch-communication → Twilio', skipAddedAt: '2026-05-06' },
  { eventName: 'retargeting.sms_48h', previousPath: 'outbound_events → process-outbound-events → GHL tag', canonicalPath: 'sync-retargeting-audiences → dispatch-communication → Twilio', skipAddedAt: '2026-05-06' },
  { eventName: 'retargeting.email_72h', previousPath: 'outbound_events → process-outbound-events → GHL tag', canonicalPath: 'sync-retargeting-audiences → dispatch-communication → Twilio', skipAddedAt: '2026-05-06' },
];

// ─── PART 7: DELIVERY VERIFICATION (Phase 2.1 KPI Check) ─────────────────

export interface DeliveryVerification {
  source: string;
  period: string;
  total: number;
  delivered: number;
  failed: number;
  deliveryRate: number;
  kpiTier: 'L1' | 'L2' | 'L3';
  kpiTarget: number;
  meetsTarget: boolean;
}

export const DELIVERY_VERIFICATION_SNAPSHOT: DeliveryVerification[] = [
  {
    source: 'outbound_events (appointment.reminder_*)',
    period: '30d',
    total: 64,
    delivered: 61,
    failed: 3,
    deliveryRate: 0.953,
    kpiTier: 'L2',
    kpiTarget: 0.90,
    meetsTarget: true,
  },
  {
    source: 'communication_dedup',
    period: '14d',
    total: 14,
    delivered: 14,
    failed: 0,
    deliveryRate: 1.0,
    kpiTier: 'L2',
    kpiTarget: 0.90,
    meetsTarget: true,
  },
];

// ─── AUDIT HELPER ─────────────────────────────────────────────────────────

export function auditPhase2(): {
  removed: number;
  rerouted: number;
  droppedTables: number;
  remainingGhlDeps: number;
  inboundEntryPoints: { before: number; after: number };
  decommissionedCrons: number;
  canonicalizedEventSkips: number;
  deliveryVerifications: number;
  allDeliveryTargetsMet: boolean;
} {
  return {
    removed: REMOVED_FUNCTIONS.length,
    rerouted: REROUTED_FUNCTIONS.length,
    droppedTables: DROPPED_TABLES.length,
    remainingGhlDeps: REMAINING_GHL_DEPENDENCIES.length,
    inboundEntryPoints: {
      before: GHL_ENTRY_POINTS.before.inbound.length,
      after: GHL_ENTRY_POINTS.after.inbound.length,
    },
    decommissionedCrons: DECOMMISSIONED_CRONS.length,
    canonicalizedEventSkips: CANONICALIZED_EVENT_SKIPS.length,
    deliveryVerifications: DELIVERY_VERIFICATION_SNAPSHOT.length,
    allDeliveryTargetsMet: DELIVERY_VERIFICATION_SNAPSHOT.every(v => v.meetsTarget),
  };
}

// ─── PART 8: PRODUCTION MONITORING CHECKS ────────────────────────────────

export interface MonitoringCheck {
  name: string;
  domain: 'canonical_dedup' | 'state_machine' | 'kpi_tiers';
  description: string;
  severity: 'warning' | 'critical';
  table: string;
  threshold: number | string;
}

export const MONITORING_CHECKS: MonitoringCheck[] = [
  {
    name: 'dedup_bypass_detected',
    domain: 'canonical_dedup',
    description: 'Detects duplicate deliveries (same lead+event dispatched >1 time within window)',
    severity: 'critical',
    table: 'communication_dispatch_log',
    threshold: 0,
  },
  {
    name: 'outbound_canonical_leak',
    domain: 'canonical_dedup',
    description: 'Detects canonicalized events sent via legacy outbound_events path instead of skipped',
    severity: 'critical',
    table: 'outbound_events',
    threshold: 0,
  },
  {
    name: 'state_violation_count',
    domain: 'state_machine',
    description: 'Counts INVALID_TRANSITION entries in lead_state_log (DB trigger should block these)',
    severity: 'critical',
    table: 'lead_state_log',
    threshold: 0,
  },
  {
    name: 'ghl_bypass_attempts',
    domain: 'state_machine',
    description: 'Counts GHL webhook events attempting state/stage overrides',
    severity: 'warning',
    table: 'raw_webhook_events',
    threshold: '>0 warning, >5 critical',
  },
  {
    name: 'kpi_staleness',
    domain: 'kpi_tiers',
    description: 'Alerts if member_kpis has not been updated within 48h',
    severity: 'critical',
    table: 'member_kpis',
    threshold: '48h',
  },
  {
    name: 'show_rate_deviation',
    domain: 'kpi_tiers',
    description: 'Alerts if any operator show_rate falls below L2 Domain floor (40%)',
    severity: 'warning',
    table: 'member_kpis',
    threshold: '40%',
  },
  {
    name: 'closing_rate_deviation',
    domain: 'kpi_tiers',
    description: 'Alerts if any operator closing_rate falls below L2 Domain floor (10%)',
    severity: 'warning',
    table: 'member_kpis',
    threshold: '10%',
  },
];

// ─── PART 9: QA REGRESSION ───────────────────────────────────────────

export interface QaRegressionTest {
  name: string;
  category: 'dedup' | 'canonical_leak' | 'state_machine' | 'kpi_pipeline';
  description: string;
  table: string;
  failCondition: string;
}

export const QA_REGRESSION_TESTS: QaRegressionTest[] = [
  {
    name: 'dedup_no_duplicate_dispatches',
    category: 'dedup',
    description: 'Verifies no lead+event combination was dispatched more than once within 24h',
    table: 'communication_dispatch_log',
    failCondition: 'Any duplicate group found',
  },
  {
    name: 'dedup_entries_consistent',
    category: 'dedup',
    description: 'Reports dedup key count vs blocked dispatch count (informational)',
    table: 'communication_dedup',
    failCondition: 'Never fails (informational)',
  },
  {
    name: 'canonical_no_legacy_leak',
    category: 'canonical_leak',
    description: 'Ensures no canonicalized events were sent via legacy outbound_events path',
    table: 'outbound_events',
    failCondition: 'Any canonicalized event with status=sent',
  },
  {
    name: 'canonical_skip_list_active',
    category: 'canonical_leak',
    description: 'Reports how many canonicalized events were correctly skipped (informational)',
    table: 'outbound_events',
    failCondition: 'Never fails (informational)',
  },
  {
    name: 'state_no_invalid_transitions',
    category: 'state_machine',
    description: 'Verifies no INVALID_TRANSITION events exist in lead_state_log',
    table: 'lead_state_log',
    failCondition: 'Any INVALID_TRANSITION event',
  },
  {
    name: 'state_no_orphaned_logs',
    category: 'state_machine',
    description: 'Verifies all state log entries reference existing leads',
    table: 'lead_state_log',
    failCondition: 'State log entry without matching lead',
  },
  {
    name: 'state_ghl_bypass_blocked',
    category: 'state_machine',
    description: 'Checks GHL webhook state-override attempts stay within tolerance',
    table: 'raw_webhook_events',
    failCondition: '>5 override attempts in 24h',
  },
  {
    name: 'kpi_pipeline_fresh',
    category: 'kpi_pipeline',
    description: 'Verifies member_kpis was updated within the last 48h',
    table: 'member_kpis',
    failCondition: 'member_kpis.updated_at older than 48h',
  },
];
