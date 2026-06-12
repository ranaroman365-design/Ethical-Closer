/**
 * ═══════════════════════════════════════════════════════════════════════
 * SPRINT: 6 GAPS — GO-LIVE READY (Layer 55)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Canonical registry of the 6 closure gaps from SOP v1.0.
 * Source of truth for tests and dashboards.
 * ═══════════════════════════════════════════════════════════════════════
 */

export const SPRINT_GAPS = [
  {
    id: 'GAP_1',
    name: 'Owner-Eskalations-Cron',
    layer: 55,
    block: 'Conversion',
    table: 'lead_owner_escalations',
    edgeFunction: 'owner-escalation-cron',
    cronInterval: '*/15 * * * *',
    stages: [
      { stage: 1, thresholdMin: 240, role: 'backup_setter' },
      { stage: 2, thresholdMin: 720, role: 'ops_admin' },
      { stage: 3, thresholdMin: 1440, role: 'admin' },
    ],
  },
  {
    id: 'GAP_2',
    name: 'No-Show Recovery +5min / +2h',
    layer: 55,
    block: 'Conversion',
    columns: ['appointments.recovery_5min_sent_at', 'appointments.recovery_2h_sent_at'],
    edgeFunction: 'no-show-recovery-cron',
    cronInterval: '*/5 * * * *',
    waves: ['5min', '2h', '24h_existing'],
  },
  {
    id: 'GAP_3',
    name: 'Funnel-Separation Hard-Guard',
    layer: 55,
    block: 'Governance',
    trigger: 'trg_funnel_separation_guard',
    behavior: 'Cancels pending pre_call reminders when appointment outcome → no_show',
  },
  {
    id: 'GAP_4',
    name: 'Objection-Recovery Layer',
    layer: 55,
    block: 'Conversion',
    table: 'objection_recovery_queue',
    edgeFunction: 'objection-recovery-cron',
    cronInterval: '*/15 * * * *',
    objectionCodes: ['price', 'time', 'trust', 'partner', 'think_about_it', 'not_ready', 'other'],
    sequenceDays: [1, 3, 7],
    sequenceChannels: ['whatsapp', 'sms', 'email'],
  },
  {
    id: 'GAP_5',
    name: 'Instant Combo Trigger (WhatsApp + AI-Call)',
    layer: 55,
    block: 'Acquisition',
    edgeFunction: 'instant-combo-trigger',
    cronInterval: '*/2 * * * *',
    optInFlag: 'ai_setter_settings.instant_combo_enabled',
    idempotencyColumn: 'leads.combo_dispatched_at',
  },
  {
    id: 'GAP_6',
    name: 'Tag-2 / Tag-4 Call-Tasks',
    layer: 55,
    block: 'Conversion',
    table: 'setter_call_tasks',
    taskTypes: ['day2_call', 'day4_call'],
  },
] as const;

export type SprintGapId = typeof SPRINT_GAPS[number]['id'];

export function getSprintGap(id: SprintGapId) {
  return SPRINT_GAPS.find(g => g.id === id);
}

export const SPRINT_OBJECTION_CODES = ['price', 'time', 'trust', 'partner', 'think_about_it', 'not_ready', 'other'] as const;
export type ObjectionCode = typeof SPRINT_OBJECTION_CODES[number];

export const OBJECTION_LABELS: Record<ObjectionCode, string> = {
  price: 'Preis',
  time: 'Zeit',
  trust: 'Vertrauen',
  partner: 'Partner-Entscheidung',
  think_about_it: 'Bedenkzeit',
  not_ready: 'Noch nicht bereit',
  other: 'Sonstiges',
};
