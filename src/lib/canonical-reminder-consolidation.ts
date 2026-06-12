// Canonical Reminder Consolidation — Layer 53 (BINDING)
//
// Consolidates 3 overlapping reminder systems into ONE canonical model.
//
// AUDIT FINDINGS:
//   System 1: dispatch-appointment-reminders (ACTIVE, CANONICAL)
//     - appointments table + reminders_state JSONB, 24h/2h/10min, outbound_events, cron every 5min
//   System 2: smart-attendance-reminders (PARTIAL, ABSORB)
//     - leads table, risk-based schedule, does NOT actually send, cron every 5min
//   System 3: process-attendance-jobs (DORMANT, DEPRECATE)
//     - attendance_jobs (0 rows), attendance_templates, never activated
//
// DECISION: KEEP dispatch-appointment-reminders as canonical sender.
//   ABSORB risk logic from smart-attendance-reminders.
//   DEPRECATE process-attendance-jobs + no-show-recovery.

// ─── Canonical Reminder Schedule ────────────────────────────────────

export type AttendanceRisk = 'low' | 'mid' | 'high';

export interface ReminderSlot {
  /** Minutes before appointment */
  offsetMinutes: number;
  /** Reminder key for dedup */
  key: string;
  /** Channel to use */
  channel: 'whatsapp' | 'sms' | 'email';
  /** Is this a confirmation check (expects response)? */
  confirmationCheck: boolean;
}

/**
 * Canonical reminder schedules by risk tier.
 * Merged from smart-attendance-reminders risk logic + dispatch-appointment-reminders fixed slots.
 */
export const CANONICAL_REMINDER_SCHEDULES: Record<AttendanceRisk, ReminderSlot[]> = {
  low: [
    { offsetMinutes: 1440, key: 'reminder_24h', channel: 'whatsapp', confirmationCheck: false },
    { offsetMinutes: 120, key: 'reminder_2h', channel: 'whatsapp', confirmationCheck: false },
    { offsetMinutes: 10, key: 'reminder_10m', channel: 'sms', confirmationCheck: false },
  ],
  mid: [
    { offsetMinutes: 1440, key: 'reminder_24h', channel: 'whatsapp', confirmationCheck: false },
    { offsetMinutes: 180, key: 'reminder_3h', channel: 'whatsapp', confirmationCheck: false },
    { offsetMinutes: 60, key: 'reminder_1h', channel: 'whatsapp', confirmationCheck: true },
    { offsetMinutes: 10, key: 'reminder_10m', channel: 'sms', confirmationCheck: false },
  ],
  high: [
    { offsetMinutes: 1440, key: 'reminder_24h', channel: 'whatsapp', confirmationCheck: false },
    { offsetMinutes: 360, key: 'reminder_6h', channel: 'whatsapp', confirmationCheck: false },
    { offsetMinutes: 180, key: 'reminder_3h', channel: 'whatsapp', confirmationCheck: false },
    { offsetMinutes: 60, key: 'reminder_1h', channel: 'whatsapp', confirmationCheck: true },
    { offsetMinutes: 30, key: 'reminder_30m', channel: 'sms', confirmationCheck: false },
    { offsetMinutes: 10, key: 'reminder_10m', channel: 'sms', confirmationCheck: false },
  ],
};

// ─── Risk Computation (absorbed from smart-attendance-reminders) ────

export interface RiskInput {
  totalNoShows: number;
  totalCallsAttended: number;
  whatsappUnresponsive: boolean;
  whatsappConfirmed: boolean;
  phoneValid: boolean;
  preCallUnconfirmed: boolean;
}

/**
 * Compute attendance risk tier.
 * Absorbed from smart-attendance-reminders inline logic.
 * This is now the SINGLE canonical risk computation.
 */
export function computeAttendanceRisk(input: RiskInput): AttendanceRisk {
  const { totalNoShows, totalCallsAttended, whatsappUnresponsive, whatsappConfirmed, phoneValid } = input;

  if (whatsappUnresponsive) return 'high';
  if (!phoneValid) return whatsappConfirmed ? 'mid' : 'high';
  if (totalNoShows >= 2) return 'high';
  if (totalNoShows >= 1 && totalCallsAttended === 0) return whatsappConfirmed ? 'mid' : 'high';
  if (totalNoShows >= 1 && totalCallsAttended > 0) return whatsappConfirmed ? 'low' : 'mid';
  return 'low';
}

/**
 * Get the canonical reminder schedule for a given risk level.
 */
export function getReminderSchedule(risk: AttendanceRisk): ReminderSlot[] {
  return CANONICAL_REMINDER_SCHEDULES[risk];
}

/**
 * Find which reminder slot is due right now (±5 min tolerance).
 */
export function findDueReminder(
  risk: AttendanceRisk,
  minutesUntilAppointment: number,
  alreadySent: Set<string>,
): ReminderSlot | null {
  const schedule = CANONICAL_REMINDER_SCHEDULES[risk];
  for (const slot of schedule) {
    if (alreadySent.has(slot.key)) continue;
    const windowStart = slot.offsetMinutes - 5;
    const windowEnd = slot.offsetMinutes + 5;
    if (minutesUntilAppointment >= windowStart && minutesUntilAppointment <= windowEnd) {
      return slot;
    }
  }
  return null;
}

// ─── System Ownership Map ───────────────────────────────────────────

export const REMINDER_SYSTEM_OWNERSHIP = {
  'dispatch-appointment-reminders': {
    status: 'canonical' as const,
    role: 'Canonical reminder sender',
    tables: ['appointments (reminders_state)', 'outbound_events', 'leads (read)'],
    cron: 'etc-cron-dispatch-appointment-reminders (*/5)',
    channel: 'outbound_events → GHL/Twilio',
    phase: 'current',
  },
  'smart-attendance-reminders': {
    status: 'deprecated' as const,
    role: 'Risk engine (logic absorbed into canonical-reminder-consolidation.ts)',
    tables: ['leads (read)', 'event_logs (write)'],
    cron: 'automation-scheduler (*/5)',
    channel: 'None (does not send)',
    phase: 'Phase 1 — disable cron trigger',
    migrateTo: 'dispatch-appointment-reminders + computeAttendanceRisk()',
  },
  'process-attendance-jobs': {
    status: 'dormant' as const,
    role: 'Template-driven job processor (never activated)',
    tables: ['attendance_jobs (0 rows)', 'attendance_templates', 'attendance_settings'],
    cron: 'automation-scheduler (*/5)',
    channel: 'attendance-send-twilio',
    phase: 'Phase 2 — archive tables, remove from scheduler',
    migrateTo: 'dispatch-appointment-reminders',
  },
  'no-show-recovery': {
    status: 'deprecated' as const,
    role: 'Legacy no-show handler (superseded by mark-no-show-and-recover)',
    tables: ['leads (read)'],
    cron: 'None',
    channel: 'WhatsApp (placeholder links)',
    phase: 'Phase 1 — delete function',
    migrateTo: 'mark-no-show-and-recover',
  },
} as const;

// ─── Migration Plan ─────────────────────────────────────────────────

export interface MigrationStep {
  phase: 1 | 2 | 3;
  priority: 'P0' | 'P1' | 'P2';
  action: string;
  system: string;
  affectedTables: string[];
  affectedWorkflows: string[];
  risk: 'low' | 'medium' | 'high';
  effort: 'small' | 'medium' | 'large';
  description: string;
}

export const MIGRATION_PLAN: MigrationStep[] = [
  // ── Phase 1: Stop Overlap (P0) ──
  {
    phase: 1,
    priority: 'P0',
    action: 'Disable smart-attendance-reminders cron trigger',
    system: 'smart-attendance-reminders',
    affectedTables: ['leads', 'event_logs'],
    affectedWorkflows: ['automation-scheduler'],
    risk: 'low',
    effort: 'small',
    description: 'Remove smart-attendance-reminders invocation from automation-scheduler. Risk engine logic already absorbed into canonical-reminder-consolidation.ts. No messages were being sent anyway.',
  },
  {
    phase: 1,
    priority: 'P0',
    action: 'Delete no-show-recovery edge function',
    system: 'no-show-recovery',
    affectedTables: ['leads'],
    affectedWorkflows: [],
    risk: 'low',
    effort: 'small',
    description: 'Fully superseded by mark-no-show-and-recover (3-stage WhatsApp recovery). no-show-recovery has no cron, no active callers.',
  },
  {
    phase: 1,
    priority: 'P1',
    action: 'Merge risk-based scheduling into dispatch-appointment-reminders',
    system: 'dispatch-appointment-reminders',
    affectedTables: ['appointments', 'leads', 'outbound_events'],
    affectedWorkflows: ['etc-cron-dispatch-appointment-reminders'],
    risk: 'medium',
    effort: 'medium',
    description: 'Import computeAttendanceRisk() and use CANONICAL_REMINDER_SCHEDULES instead of fixed 24h/2h/10min. Adds risk-aware mid/high slots (6h, 3h, 1h, 30min). Requires reading lead.whatsapp_* fields.',
  },
  {
    phase: 1,
    priority: 'P1',
    action: 'Migrate outbound destination from GHL to Twilio',
    system: 'dispatch-appointment-reminders',
    affectedTables: ['outbound_events'],
    affectedWorkflows: ['process-outbound-events'],
    risk: 'medium',
    effort: 'medium',
    description: 'Change destination from "ghl" to "twilio" in outbound_events insert. Requires Twilio WhatsApp sender to be fully operational.',
  },
  // ── Phase 2: Clean Up Dormant Infrastructure (P1) ──
  {
    phase: 2,
    priority: 'P1',
    action: 'Disable process-attendance-jobs in automation-scheduler',
    system: 'process-attendance-jobs',
    affectedTables: ['attendance_jobs'],
    affectedWorkflows: ['automation-scheduler'],
    risk: 'low',
    effort: 'small',
    description: 'Remove process-attendance-jobs invocation. 0 jobs ever created, system is dormant.',
  },
  {
    phase: 2,
    priority: 'P2',
    action: 'Archive attendance infrastructure tables',
    system: 'process-attendance-jobs',
    affectedTables: ['attendance_jobs', 'attendance_templates', 'attendance_settings', 'attendance_touchpoint_config', 'attendance_events'],
    affectedWorkflows: ['SmartAttendanceSettings admin page', 'useAttendanceSettings hook'],
    risk: 'low',
    effort: 'medium',
    description: 'Add DEPRECATED comments. Do not drop yet — admin UI (SmartAttendanceSettings.tsx) references them. Plan UI migration to use canonical reminder config.',
  },
  // ── Phase 3: Full Canonicalization (P2) ──
  {
    phase: 3,
    priority: 'P2',
    action: 'Replace SmartAttendanceSettings admin UI',
    system: 'process-attendance-jobs',
    affectedTables: ['attendance_settings', 'attendance_templates'],
    affectedWorkflows: ['SmartAttendanceSettings.tsx', 'useAttendanceSettings.ts'],
    risk: 'medium',
    effort: 'large',
    description: 'Rebuild admin UI to configure CANONICAL_REMINDER_SCHEDULES (risk tiers, channels, templates) instead of attendance_templates. Store config in system_config or dedicated table.',
  },
  {
    phase: 3,
    priority: 'P2',
    action: 'Delete deprecated edge functions',
    system: 'smart-attendance-reminders, process-attendance-jobs, no-show-recovery',
    affectedTables: [],
    affectedWorkflows: [],
    risk: 'low',
    effort: 'small',
    description: 'After Phase 2 is stable for 2+ weeks, delete the edge function code and deployed functions.',
  },
];

// ─── Audit Function ─────────────────────────────────────────────────

export interface ReminderConsolidationAudit {
  canonicalSystem: string;
  deprecatedSystems: string[];
  dormantSystems: string[];
  totalMigrationSteps: number;
  phase1Steps: number;
  phase2Steps: number;
  phase3Steps: number;
  affectedTables: string[];
  affectedEdgeFunctions: string[];
  violations: string[];
}

export function auditReminderConsolidation(): ReminderConsolidationAudit {
  const violations: string[] = [];

  // Validate all risk levels have schedules
  const risks: AttendanceRisk[] = ['low', 'mid', 'high'];
  for (const r of risks) {
    const schedule = CANONICAL_REMINDER_SCHEDULES[r];
    if (!schedule || schedule.length === 0) {
      violations.push(`Missing schedule for risk level: ${r}`);
    }
    // Check 24h reminder exists for all tiers
    if (!schedule.some(s => s.key === 'reminder_24h')) {
      violations.push(`Risk "${r}" missing 24h reminder`);
    }
    // Check 10m final reminder exists for all tiers
    if (!schedule.some(s => s.key === 'reminder_10m')) {
      violations.push(`Risk "${r}" missing 10min final reminder`);
    }
  }

  // High risk should have more slots than low
  if (CANONICAL_REMINDER_SCHEDULES.high.length <= CANONICAL_REMINDER_SCHEDULES.low.length) {
    violations.push('High risk should have more reminder slots than low risk');
  }

  const allTables = new Set<string>();
  const allFunctions = new Set<string>();
  for (const step of MIGRATION_PLAN) {
    step.affectedTables.forEach(t => allTables.add(t));
    allFunctions.add(step.system);
  }

  return {
    canonicalSystem: 'dispatch-appointment-reminders',
    deprecatedSystems: ['smart-attendance-reminders', 'no-show-recovery'],
    dormantSystems: ['process-attendance-jobs'],
    totalMigrationSteps: MIGRATION_PLAN.length,
    phase1Steps: MIGRATION_PLAN.filter(s => s.phase === 1).length,
    phase2Steps: MIGRATION_PLAN.filter(s => s.phase === 2).length,
    phase3Steps: MIGRATION_PLAN.filter(s => s.phase === 3).length,
    affectedTables: Array.from(allTables),
    affectedEdgeFunctions: Array.from(allFunctions),
    violations,
  };
}
