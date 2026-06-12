/**
 * ═══════════════════════════════════════════════════════════════════════
 * PHASE 1 CANONICALIZATION — Master Registry (Layer 53)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Central registry for Phase 1 canonicalization:
 * - Reminder system consolidation
 * - Communication dedup enforcement
 * - GHL bypass guard
 * - KPI source truth hierarchy
 * - Legacy system registry
 *
 * This file is the SINGLE source of truth for Phase 1 status.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── PART 1: REMINDER SYSTEM CANONICALIZATION ──────────────────────────────

export interface ReminderSystemEntry {
  name: string;
  type: 'edge_function';
  status: 'canonical' | 'legacy_absorb' | 'legacy_deprecate';
  canonicalReplacement: string | null;
  triggers: string;
  createsJobs: boolean;
  sendsMessages: boolean;
  usesTwilio: boolean;
  writesLogs: boolean;
  hasDedup: boolean;
  respectsTimezone: boolean;
  cancelsOnReschedule: boolean;
  tables: string[];
  notes: string;
}

export const REMINDER_SYSTEMS: ReminderSystemEntry[] = [
  {
    name: 'dispatch-appointment-reminders',
    type: 'edge_function',
    status: 'canonical',
    canonicalReplacement: null,
    triggers: 'cron (every 5min), scans appointments 0-30h window',
    createsJobs: false,
    sendsMessages: true,  // via dispatch-communication (dedup enforced)
    usesTwilio: true,     // via dispatch-communication → Twilio gateway
    writesLogs: true,     // via dispatch-communication → communication_dispatch_log
    hasDedup: true,       // dispatch-communication enforces communication_dedup
    respectsTimezone: true, // Europe/Berlin formatting
    cancelsOnReschedule: true, // reminders_state on appointments, skips non-booked/confirmed
    tables: ['appointments', 'leads', 'communication_dedup', 'communication_dispatch_log'],
    notes: 'CANONICAL sender. Routes through dispatch-communication for unified dedup.',
  },
  {
    name: 'smart-attendance-reminders',
    type: 'edge_function',
    status: 'legacy_absorb',
    canonicalReplacement: 'dispatch-appointment-reminders (risk logic absorbed into canonical-reminder-consolidation.ts)',
    triggers: 'cron, scans leads with appointment_time in 24h window',
    createsJobs: false,
    sendsMessages: false, // only computes risk + logs events, never actually sends
    usesTwilio: false,
    writesLogs: true,     // event_logs
    hasDedup: false,
    respectsTimezone: false,
    cancelsOnReschedule: false, // no reschedule awareness
    tables: ['leads', 'event_logs'],
    notes: 'ABSORB: Risk logic (LOW/MID/HIGH schedules) already absorbed into canonical-reminder-consolidation.ts. This function only logs, never sends. Safe to disable cron.',
  },
  {
    name: 'process-attendance-jobs',
    type: 'edge_function',
    status: 'legacy_deprecate',
    canonicalReplacement: 'dispatch-appointment-reminders → dispatch-communication',
    triggers: 'cron, processes attendance_jobs table',
    createsJobs: false,
    sendsMessages: true,  // via attendance-send-twilio
    usesTwilio: true,     // via attendance-send-twilio → Twilio gateway
    writesLogs: true,     // via attendance-send-twilio → twilio_message_logs
    hasDedup: false,      // no dedup — relies on job status only
    respectsTimezone: false,
    cancelsOnReschedule: false,
    tables: ['attendance_jobs', 'attendance_templates', 'attendance_settings', 'appointments', 'leads'],
    notes: 'DEPRECATE: attendance_jobs table has 0 rows. Never activated in production. attendance-send-twilio also legacy. Safe to disable cron.',
  },
];

// ─── PART 2: COMMUNICATION DEDUP ENFORCEMENT ───────────────────────────────

export interface DedupChannelStatus {
  channel: string;
  enforced: boolean;
  enforcer: string;
  dedupKeyPattern: string;
  notes: string;
}

export const DEDUP_CHANNEL_STATUS: DedupChannelStatus[] = [
  {
    channel: 'whatsapp',
    enforced: true,
    enforcer: 'dispatch-communication → communication_dedup',
    dedupKeyPattern: '{event_key}:{lead_id_or_phone}',
    notes: 'Primary channel for most touchpoints. Dedup via 24h unique constraint.',
  },
  {
    channel: 'sms',
    enforced: true,
    enforcer: 'dispatch-communication → communication_dedup',
    dedupKeyPattern: '{event_key}:{lead_id_or_phone}',
    notes: 'Fallback channel. Dedup enforced when routed through dispatch-communication.',
  },
  {
    channel: 'email',
    enforced: true,
    enforcer: 'dispatch-communication → communication_dedup + send-transactional-email idempotency_key',
    dedupKeyPattern: '{event_key}:{email}',
    notes: 'Dual dedup: communication_dedup at dispatch level + idempotency_key at send level.',
  },
  {
    channel: 'push',
    enforced: true,
    enforcer: 'dispatch-communication → communication_dedup',
    dedupKeyPattern: '{event_key}:{user_id}',
    notes: 'Push notifications dedup via communication_dedup.',
  },
  {
    channel: 'in_app',
    enforced: false,
    enforcer: 'none',
    dedupKeyPattern: 'n/a',
    notes: 'In-app notifications not yet routed through dispatch-communication. Low risk (UI-only).',
  },
  {
    channel: 'voice',
    enforced: false,
    enforcer: 'none',
    dedupKeyPattern: 'n/a',
    notes: 'Voice follow-up is manual. No automated dispatch yet.',
  },
];

// ─── PART 3: GHL BYPASS GUARD STATUS ───────────────────────────────────────

export interface GhlGuardEntry {
  function: string;
  guardType: 'db_trigger' | 'webhook_normalization' | 'event_validation' | 'tag_verification';
  protectedColumns: string[];
  disposition: 'accepted' | 'rejected' | 'logged';
  enforcement: string;
  notes: string;
}

export const GHL_GUARD_STATUS: GhlGuardEntry[] = [
  {
    function: 'trg_enforce_canonical_state (DB trigger)',
    guardType: 'db_trigger',
    protectedColumns: ['leads.conversion_state'],
    disposition: 'rejected',
    enforcement: 'Raises CANONICAL_STATE_VIOLATION for any transition not in canonical_state_transitions whitelist',
    notes: 'Database-level guard. Cannot be bypassed by ANY client — GHL, API, manual SQL, edge functions.',
  },
  {
    function: 'receive-ghl-webhook',
    guardType: 'webhook_normalization',
    protectedColumns: ['leads.conversion_state', 'leads.stage'],
    disposition: 'accepted',
    enforcement: 'GHL events normalized to canonical events → lookup canonical_state_transitions → apply via conversion_state only',
    notes: 'HARDENED: No more direct leads.stage updates. All state changes via canonical transition lookup.',
  },
  {
    function: 'ghl-event-webhook',
    guardType: 'event_validation',
    protectedColumns: [],
    disposition: 'logged',
    enforcement: 'Maps to funnel_events_v2 via ingest_funnel_event RPC. Does NOT mutate lead state.',
    notes: 'Safe: writes to raw_webhook_events + funnel_events_v2. No state mutation.',
  },
  {
    function: 'verify-ghl-tag-bindings',
    guardType: 'tag_verification',
    protectedColumns: [],
    disposition: 'logged',
    enforcement: 'Read-only verification. Checks tags exist in GHL location.',
    notes: 'Safe: read-only audit. No mutations.',
  },
  {
    function: 'process-outbound-events',
    guardType: 'event_validation',
    protectedColumns: [],
    disposition: 'accepted',
    enforcement: 'Pushes Supabase → GHL (outbound only). GHL is dumb mirror. No state comes back.',
    notes: 'Safe: Supabase → GHL direction only. GHL cannot influence state through this path.',
  },
];

// ─── PART 4: KPI SOURCE TRUTH HIERARCHY ────────────────────────────────────

export interface KpiSourceMapping {
  dashboard: string;
  currentSource: string;
  canonicalSource: string;
  risk: 'none' | 'low' | 'medium' | 'high';
  notes: string;
}

export const KPI_SOURCE_MAP: KpiSourceMapping[] = [
  {
    dashboard: 'Revenue OS (L6 Performance)',
    currentSource: 'leads + calls + funnel_events_v2 (computed in useL6PerformanceData)',
    canonicalSource: 'real_kpi_snapshot (L2 Domain) + canonical_kpi_unified (L3 Operator)',
    risk: 'medium',
    notes: 'Frontend computes from raw tables. Should migrate to canonical backend-computed views.',
  },
  {
    dashboard: 'Talent OS (Member KPIs)',
    currentSource: 'member_kpis (via useKpis hook)',
    canonicalSource: 'member_kpis (L3 Operator — CANONICAL)',
    risk: 'none',
    notes: 'Already uses canonical source. member_kpis is the correct L3 table.',
  },
  {
    dashboard: 'Intelligence Control',
    currentSource: 'intelligence_snapshots + intelligence_bottlenecks',
    canonicalSource: 'intelligence_snapshots (L2 Domain — CANONICAL)',
    risk: 'none',
    notes: 'Already uses canonical Intelligence Layer tables.',
  },
  {
    dashboard: 'Director KPI Overview',
    currentSource: 'kpi_definitions (display config only)',
    canonicalSource: 'kpi_definitions + canonical_kpi_unified',
    risk: 'low',
    notes: 'Uses kpi_definitions for display metadata. Data comes from backend-computed sources.',
  },
  {
    dashboard: 'Admin KPI Dashboard',
    currentSource: 'leads (raw query with stage/source/quiz counts)',
    canonicalSource: 'real_kpi_snapshot (L2 Domain)',
    risk: 'medium',
    notes: 'Frontend counts raw leads. Should migrate to pre-computed snapshot.',
  },
  {
    dashboard: 'Weekly Momentum / Placement Readiness',
    currentSource: 'Derived from member_kpis + profiles',
    canonicalSource: 'canonical_kpi_unified (L3+trend)',
    risk: 'low',
    notes: 'Partially canonical. Trend data from kpi_snapshots is correct path.',
  },
];

// Tables deprecated per Layer 52
export const DEPRECATED_KPI_TABLES = [
  { table: 'users_kpi_snapshot', reason: 'Replaced by member_kpis (L3 Operator)', safeToDelete: false },
  { table: 'dashboard_daily_aggregates', reason: 'Replaced by real_kpi_snapshot (L2 Domain)', safeToDelete: false },
] as const;

// ─── PART 5: LEGACY SYSTEM REGISTRY ────────────────────────────────────────

export interface LegacyRegistryEntry {
  name: string;
  type: 'edge_function' | 'table' | 'cron' | 'workflow';
  currentStatus: 'active' | 'inactive' | 'legacy';
  canonicalReplacement: string;
  safeToDisable: boolean;
  risk: 'low' | 'medium' | 'high';
  notes: string;
}

export const LEGACY_REGISTRY: LegacyRegistryEntry[] = [
  // Reminder systems — REMOVED IN PHASE 2
  {
    name: 'smart-attendance-reminders',
    type: 'edge_function',
    currentStatus: 'inactive',
    canonicalReplacement: 'dispatch-appointment-reminders (risk logic in canonical-reminder-consolidation.ts)',
    safeToDisable: true,
    risk: 'low',
    notes: 'REMOVED in Phase 2. Never actually sent messages. Risk logic absorbed.',
  },
  {
    name: 'process-attendance-jobs',
    type: 'edge_function',
    currentStatus: 'inactive',
    canonicalReplacement: 'dispatch-appointment-reminders → dispatch-communication',
    safeToDisable: true,
    risk: 'low',
    notes: 'REMOVED in Phase 2. attendance_jobs table empty. Never activated.',
  },
  {
    name: 'attendance-send-twilio',
    type: 'edge_function',
    currentStatus: 'inactive',
    canonicalReplacement: 'dispatch-communication → Twilio gateway',
    safeToDisable: true,
    risk: 'low',
    notes: 'REMOVED in Phase 2. Only called by process-attendance-jobs.',
  },
  // Tables — DROPPED IN PHASE 2
  {
    name: 'attendance_jobs',
    type: 'table',
    currentStatus: 'inactive',
    canonicalReplacement: 'appointments.reminders_state + dispatch-communication dedup',
    safeToDisable: true,
    risk: 'low',
    notes: 'DROPPED in Phase 2. 0 rows in production.',
  },
  {
    name: 'attendance_templates',
    type: 'table',
    currentStatus: 'inactive',
    canonicalReplacement: 'TEMPLATES in dispatch-appointment-reminders + dispatch-communication MATRIX',
    safeToDisable: true,
    risk: 'low',
    notes: 'DROPPED in Phase 2. Template data embedded in edge functions.',
  },
  {
    name: 'users_kpi_snapshot',
    type: 'table',
    currentStatus: 'inactive',
    canonicalReplacement: 'member_kpis (L3 Operator)',
    safeToDisable: true,
    risk: 'low',
    notes: 'Deprecated per Layer 52. Cron recalc_user_kpi_snapshot (jobid 12) DEACTIVATED in Phase 2.1. 36 rows remain. Only read by QA/test functions.',
  },
  {
    name: 'dashboard_daily_aggregates',
    type: 'table',
    currentStatus: 'legacy',
    canonicalReplacement: 'real_kpi_snapshot (L2 Domain)',
    safeToDisable: false,
    risk: 'medium',
    notes: 'Deprecated per Layer 52. May have cached aggregates. Verify no reads before dropping.',
  },
  // GHL-related — ghl-event-webhook MERGED in Phase 2
  {
    name: 'ghl-event-webhook',
    type: 'edge_function',
    currentStatus: 'inactive',
    canonicalReplacement: 'receive-ghl-webhook (unified, hardened, canonical normalization + funnel ingestion)',
    safeToDisable: true,
    risk: 'low',
    notes: 'MERGED into receive-ghl-webhook in Phase 2. Funnel events + raw webhook audit now handled by unified entry point.',
  },
];

// ─── PART 6: CANONICAL REMINDER FLOW ───────────────────────────────────────

export const CANONICAL_REMINDER_FLOW = {
  description: 'Canonical appointment reminder pipeline',
  steps: [
    { step: 1, name: 'Event Source', detail: 'appointment booked/confirmed → appointments table' },
    { step: 2, name: 'Cron Trigger', detail: 'dispatch-appointment-reminders scans appointments every 5min' },
    { step: 3, name: 'Idempotency Check', detail: 'reminders_state JSONB on appointment — skip if already sent' },
    { step: 4, name: 'Template Render', detail: 'TEMPLATES[action] → personalized body with quiz/fit/time' },
    { step: 5, name: 'Dispatch', detail: 'dispatch-communication with event_key + payload' },
    { step: 6, name: 'Dedup', detail: 'communication_dedup table — 24h window unique constraint' },
    { step: 7, name: 'Channel Route', detail: 'TOUCHPOINT_MATRIX → primary (WhatsApp) → fallback (SMS)' },
    { step: 8, name: 'Send', detail: 'Twilio gateway (connector-gateway.lovable.dev/twilio)' },
    { step: 9, name: 'Log', detail: 'communication_dispatch_log + twilio_message_logs' },
    { step: 10, name: 'State Update', detail: 'appointments.reminders_state[action] = timestamp' },
  ],
} as const;

// ─── AUDIT HELPERS ─────────────────────────────────────────────────────────

export function auditPhase1(): {
  reminders: { canonical: number; legacy: number; deprecated: number };
  dedup: { enforced: number; total: number };
  ghlGuards: { protected: number; total: number };
  kpi: { canonical: number; atRisk: number };
  legacy: { total: number; safeToDisable: number };
} {
  const reminders = {
    canonical: REMINDER_SYSTEMS.filter(r => r.status === 'canonical').length,
    legacy: REMINDER_SYSTEMS.filter(r => r.status === 'legacy_absorb').length,
    deprecated: REMINDER_SYSTEMS.filter(r => r.status === 'legacy_deprecate').length,
  };

  const dedup = {
    enforced: DEDUP_CHANNEL_STATUS.filter(d => d.enforced).length,
    total: DEDUP_CHANNEL_STATUS.length,
  };

  const ghlGuards = {
    protected: GHL_GUARD_STATUS.filter(g => g.protectedColumns.length > 0).length,
    total: GHL_GUARD_STATUS.length,
  };

  const kpi = {
    canonical: KPI_SOURCE_MAP.filter(k => k.risk === 'none').length,
    atRisk: KPI_SOURCE_MAP.filter(k => k.risk === 'medium' || k.risk === 'high').length,
  };

  const legacy = {
    total: LEGACY_REGISTRY.length,
    safeToDisable: LEGACY_REGISTRY.filter(l => l.safeToDisable).length,
  };

  return { reminders, dedup, ghlGuards, kpi, legacy };
}
