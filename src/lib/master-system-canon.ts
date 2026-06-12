/**
 * Master System Canon — ETC Revenue Operating System™
 *
 * SUPREME canonical definition. This file IS the platform.
 * Every feature, dashboard, edge function, and automation
 * MUST trace back to a section defined here.
 *
 * Truth hierarchy:
 *   Canon Constitution → ETC OS (Layer 47) → THIS FILE → Active Canons → Features → UI
 *
 * DO NOT:
 *   - Invent new states, events, flows, or KPIs outside this file
 *   - Duplicate definitions that exist here
 *   - Override any IMMUTABLE section
 *
 * Source references (implementation):
 *   - Operational Canon:        src/lib/operational-canon.ts
 *   - Canon Constitution:       src/lib/canon-constitution.ts
 *   - Canonical Roles:          src/lib/canonical-roles.ts
 *   - Canonical Narrative:      src/lib/canonical-narrative.ts
 *   - Communication OS:         src/lib/whatsapp-message-library.ts
 *   - Conversation Trees:       src/lib/conversation-trees.ts
 *   - System Architecture:      src/lib/canonical-system-architecture.ts
 *   - Canon Map:                src/lib/canon-map.ts
 */

// ═══════════════════════════════════════════════════════════════
// §1  SYSTEM DEFINITION
// ═══════════════════════════════════════════════════════════════

export const SYSTEM_DEFINITION = {
  name: 'ETC Revenue Operating System',
  type: 'event-driven, state-controlled Revenue Operating System',
  flow: 'Lead → Qualification → Booking → Show → Close → Recovery → Revenue',
  sourceOfTruth: 'Supabase',
  executionChannel: 'GHL (SMS/Email only — never overrides state)',
  northStar: 'Revenue per Operator (30d)',
  principle: 'Selection over Pressure',
} as const;

// ═══════════════════════════════════════════════════════════════
// §2  LEAD ENTRY & ACQUISITION
// ═══════════════════════════════════════════════════════════════

export const ACQUISITION = {
  sources: ['paid_ads', 'email', 'organic_social', 'referrals'] as const,
  mandatoryFlow: ['quiz', 'lead_capture', 'qualification', 'booking'] as const,
  rules: [
    'Kein Lead ohne Tracking (UTM + source_funnel)',
    'Kein Lead ohne Quiz (quiz_score + quiz_result required)',
    'Kein externer Kalender — Booking nur über Plattform',
    'Pflichtfelder: Name, Email, Phone',
  ],
  funnelSources: ['quiz', 'fastlane', 'apply', 'closerpath'] as const,
} as const;

// ═══════════════════════════════════════════════════════════════
// §3  PLATFORM SYSTEM (Applicant Portal)
// ═══════════════════════════════════════════════════════════════

export const PLATFORM_SYSTEM = {
  postEntryView: 'Applicant Portal',
  modules: [
    'lead_profile',
    'quiz_data',
    'communication_history',
    'appointment_status',
    'chat',
    'academy',
    'certification',
  ] as const,
  accessRule: 'Visible after quiz completion. Full access after booking.',
} as const;

// ═══════════════════════════════════════════════════════════════
// §4  STATUS MACHINE (CORE) — IMMUTABLE
// ═══════════════════════════════════════════════════════════════

export const LEAD_STATES = [
  'new',
  'contacted',
  'engaged',
  'booked',
  'assigned_setter',
  'setter_qualified',
  'ready_for_closer',
  'closer_in_progress',
  'offer_made',
  'no_show',
  'no_close',
  'closed_won',
  'closed_lost',
  'unresponsive',
  'reactivation_pool',
] as const;

export type LeadState = (typeof LEAD_STATES)[number];

export const STATUS_MACHINE_RULES = {
  noStatusRule: 'Kein Lead ohne Status → SYSTEMFEHLER',
  validTransitions: {
    new:                ['contacted'],
    contacted:          ['engaged', 'booked', 'unresponsive'],
    engaged:            ['booked', 'unresponsive'],
    booked:             ['assigned_setter', 'no_show'],
    assigned_setter:    ['setter_qualified', 'no_show'],
    setter_qualified:   ['ready_for_closer', 'no_show'],
    ready_for_closer:   ['closer_in_progress', 'no_show'],
    closer_in_progress: ['offer_made', 'no_show', 'no_close'],
    offer_made:         ['closed_won', 'closed_lost', 'no_close'],
    no_show:            ['booked', 'reactivation_pool', 'unresponsive'],
    no_close:           ['closer_in_progress', 'reactivation_pool', 'unresponsive'],
    closed_won:         [],  // terminal
    closed_lost:        ['reactivation_pool'],
    unresponsive:       ['reactivation_pool', 'contacted'],
    reactivation_pool:  ['contacted'],
  } satisfies Record<LeadState, readonly LeadState[]>,
} as const;

// ═══════════════════════════════════════════════════════════════
// §5  FULL CONVERSION FLOWS — IMMUTABLE
// ═══════════════════════════════════════════════════════════════

export type RecoveryStep = {
  readonly trigger: string;
  readonly channel: string;
  readonly action: string;
  readonly deadline_h?: number;
};

export const NO_BOOKING_FLOW: readonly RecoveryStep[] = [
  { trigger: 'T0',    channel: 'whatsapp', action: 'Erstkontakt', deadline_h: 0.08 },
  { trigger: 'D2',    channel: 'whatsapp+call', action: 'Follow-up Call' },
  { trigger: 'D4',    channel: 'whatsapp+call', action: 'Final Attempt' },
  { trigger: 'D5',    channel: 'email', action: 'Exit / Soft Close' },
  { trigger: 'D30+',  channel: 'whatsapp', action: 'Reactivation' },
];

export const NO_SHOW_FLOW: readonly RecoveryStep[] = [
  { trigger: '+5min',  channel: 'whatsapp', action: 'Sofortnachricht', deadline_h: 0.08 },
  { trigger: '+2h',    channel: 'whatsapp', action: 'Rebooking Angebot', deadline_h: 2 },
  { trigger: '+24h',   channel: 'whatsapp+call', action: 'Call + Follow-up', deadline_h: 24 },
];

export const NO_CLOSE_FLOW: readonly RecoveryStep[] = [
  { trigger: '+2h',   channel: 'whatsapp', action: 'Follow-up', deadline_h: 2 },
  { trigger: '+24h',  channel: 'call', action: 'Call Task', deadline_h: 24 },
  { trigger: 'D2',    channel: 'email', action: 'Objection Content' },
  { trigger: 'D4',    channel: 'whatsapp', action: 'Case Study' },
  { trigger: 'D7',    channel: 'whatsapp+call', action: 'Reopen Attempt' },
];

// ═══════════════════════════════════════════════════════════════
// §6  COMMUNICATION ORCHESTRATION
// ═══════════════════════════════════════════════════════════════

export const COMMUNICATION = {
  channels: {
    whatsapp: { role: 'Action', priority: 1 },
    sms:      { role: 'Backup', priority: 2 },
    email:    { role: 'Documentation / Trust', priority: 3 },
    push:     { role: 'Re-engagement', priority: 4 },
    browser:  { role: 'In-app Notification', priority: 5 },
    voice:    { role: 'Escalation / Closing', priority: 6 },
  },
  rules: [
    'Kein Spam — 24h dedup per lead per event_key',
    'Kein Channel-Konflikt — primary → fallback only on hard-fail',
    'Sequenz gesteuert über Events (communication_dispatch_log)',
    'Max 5 messages / lead / day',
    'Template-only — no inline copy',
  ],
  entryPoint: 'dispatch-communication (Edge Function)',
  templateRegistry: 'src/lib/whatsapp-message-library.ts',
  humanizer: 'humanize-message (Edge Function)',
  conversationEngine: 'src/lib/conversation-trees.ts',
} as const;

// ═══════════════════════════════════════════════════════════════
// §7  SETTER & CLOSER SYSTEM
// ═══════════════════════════════════════════════════════════════

export const SETTER_CLOSER = {
  setter: {
    role: 'Qualifies Lead via Script',
    outcomes: ['qualified_pass', 'not_qualified_exit', 'reschedule'] as const,
    scriptSource: 'Closing Script Canon (mem://features/closing-script-philosophy)',
    levelRequired: 4,
  },
  closer: {
    role: 'Executes Closing Call',
    outcomes: ['closed_won', 'no_close', 'no_show'] as const,
    levelRequired: 4,
  },
  handoff: {
    rule: 'Setter → Closer only when setter_qualified. Never skip.',
    fastTrack: 'Quiz Score > 75 → skip Setter, direct to Closer (L1 payment)',
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// §8  AI OPERATOR LAYER
// ═══════════════════════════════════════════════════════════════

export const AI_OPERATOR = {
  capabilities: [
    'messaging',
    'follow_ups',
    'recovery',
    'reactivation',
    'no_show_sequence',
    'no_close_sequence',
  ] as const,
  rules: [
    'Event-driven — reacts to canonical events only',
    'Respects status machine — no state skipping',
    'Human handoff on: complex_reply, objection, emotion, pre_closing',
    'Max 5 messages per lead per day',
    'No pressure, no false promises, no pricing disclosure',
    'Master switch: ai_operator_config.is_active (default OFF)',
  ],
  stateMachine: 'NEW_LEAD → CONTACTED → BOOKED → NO_SHOW → NO_CLOSE → CLOSED',
  edgeFunction: 'ai-operator',
  model: 'google/gemini-3-flash-preview (via Lovable AI Gateway)',
  dashboard: 'AIOperatorDashboard.tsx',
} as const;

// ═══════════════════════════════════════════════════════════════
// §9  MONITORING SYSTEM
// ═══════════════════════════════════════════════════════════════

export const MONITORING = {
  dashboards: [
    { name: 'Revenue Flow Map', path: '/members/performance/revenue', minLevel: 6 },
    { name: 'Talent Flow Map', path: '/members/performance/talent', minLevel: 7 },
    { name: 'Intelligence Control', path: '/members/performance/intelligence', minLevel: 6 },
    { name: 'Conversion Intelligence', path: '/members/admin/conversion-intelligence', minLevel: 6 },
    { name: 'Operator Control', path: '/members/dashboard/operator-control', minLevel: 6 },
    { name: 'Communication Matrix', path: '/members/admin/communication-matrix', minLevel: 6 },
    { name: 'Revenue Command Center', path: '/members/admin/revenue-command', minLevel: 7 },
  ] as const,
  views: [
    'Funnel Performance',
    'System Status',
    'Lead Timeline',
    'Alerts',
    'Channel Performance',
  ] as const,
  hierarchy: 'Status → Trend → Benchmark → Insight → Action',
} as const;

// ═══════════════════════════════════════════════════════════════
// §10  ENFORCEMENT SYSTEM
// ═══════════════════════════════════════════════════════════════

export const ENFORCEMENT = {
  rules: [
    { id: 'lead_contact_sla', rule: 'Jeder Lead wird kontaktiert', sla_h: 24 },
    { id: 'follow_up_required', rule: 'Jeder Lead bekommt Follow-up', sla_h: 48 },
    { id: 'noshow_recovery', rule: 'Jeder No-Show wird bearbeitet', sla_h: 4 },
    { id: 'noclose_followup', rule: 'Jeder No-Close wird nachverfolgt', sla_h: 48 },
    { id: 'playbook_read', rule: 'Playbook-Acknowledgment vor Lead-Zugriff', sla_h: null },
    { id: 'call_minimum', rule: 'Mindest-Call-Anzahl pro Woche', sla_h: null },
    { id: 'lead_owner_required', rule: 'Jeder Lead hat einen Owner', sla_h: 0 },
    { id: 'response_time', rule: 'Antwort auf Lead-Response < 2h', sla_h: 2 },
  ] as const,
  escalationLevels: [
    { level: 1, action: 'alert', delay_h: 0, description: 'Reminder an Operator' },
    { level: 2, action: 'reassign', delay_h: 4, description: 'Reassignment / Review' },
    { level: 3, action: 'escalate_l6', delay_h: 8, description: 'L6 Eskalation' },
  ] as const,
  consequences: ['alert', 'block', 'reassign'] as const,
  edgeFunction: 'enforcement-check',
  dashboard: 'EnforcementDashboard.tsx',
} as const;

// ═══════════════════════════════════════════════════════════════
// §11  GOVERNANCE SYSTEM
// ═══════════════════════════════════════════════════════════════

export const GOVERNANCE = {
  playbooks: {
    auditFrequency: 'weekly (Mon 06:00 UTC) + monthly deep audit',
    healthStates: ['current', 'partially_outdated', 'outdated', 'critically_wrong'] as const,
    priority: 'revenue > conversion > stability',
    versionTracking: true,
    systemAlignment: 'AI compares playbook vs live system state',
  },
  edgeFunction: 'playbook-audit',
  dashboard: 'PlaybookGovernanceDashboard.tsx',
  rule: 'Veraltete Playbooks = Risiko. Auto-flagged.',
} as const;

// ═══════════════════════════════════════════════════════════════
// §12  KPI SYSTEM — IMMUTABLE
// ═══════════════════════════════════════════════════════════════

export const KPI_SYSTEM = {
  metrics: [
    { id: 'contact_rate', formula: 'contacted / total_leads', window: '7d' },
    { id: 'response_rate', formula: 'responded / contacted', window: '7d' },
    { id: 'booking_rate', formula: 'booked / qualified', window: '30d' },
    { id: 'show_rate', formula: 'showed / booked', window: '30d' },
    { id: 'close_rate', formula: 'closed_won / showed', window: '30d' },
    { id: 'recovery_rate', formula: 'rebooked / (no_show + no_close)', window: '30d' },
    { id: 'revenue', formula: 'SUM(deal_value) WHERE closed_won', window: '30d' },
    { id: 'revenue_per_operator', formula: 'revenue / active_operators', window: '30d' },
    { id: 'time_to_first_contact', formula: 'AVG(first_action_at - created_at)', window: '7d' },
    { id: 'avg_deal_value', formula: 'AVG(deal_value) WHERE closed_won', window: '30d' },
  ] as const,
  compositeScores: {
    oss: 'Operator Scoring System (0-100) — src/lib/operator-scoring-system',
    psp: 'Predictive Success Profile (0-100) — L1-L3 only',
  },
  rule: 'No new KPIs without Canon amendment. No threshold changes without admin approval.',
} as const;

// ═══════════════════════════════════════════════════════════════
// §13  EVENT & LOG SYSTEM
// ═══════════════════════════════════════════════════════════════

export const CANONICAL_EVENTS = [
  'lead_created',
  'quiz_completed',
  'booking_created',
  'booking_confirmed',
  'booking_cancelled',
  'appointment_reminded',
  'appointment_showed',
  'appointment_no_show',
  'setter_qualified',
  'closer_assigned',
  'call_completed',
  'deal_closed_won',
  'deal_closed_lost',
] as const;

export type CanonicalEvent = (typeof CANONICAL_EVENTS)[number];

export const EVENT_LOGGING = {
  requiredFields: ['event_type', 'timestamp', 'lead_id', 'channel', 'status'] as const,
  storage: 'communication_dispatch_log + processed_events',
  rule: 'Every step = event + timestamp + channel + success/error. No silent failures.',
  idempotency: 'processed_events table guards duplicate processing (Stripe + KPI)',
} as const;

// ═══════════════════════════════════════════════════════════════
// §14  VERIFICATION MODE
// ═══════════════════════════════════════════════════════════════

export const VERIFICATION = {
  testFunction: 'funnel-test-lead (Edge Function)',
  scenarios: ['happy_path', 'no_show', 'no_close', 'full_recovery'] as const,
  requirements: [
    'Nachrichten werden gesendet (dispatch_log entries)',
    'Logs existieren (event trail)',
    'Status wechseln korrekt (state machine validated)',
    'is_simulation = true (isolated from production)',
    'simulation_batch_id set (batch-traceable)',
  ],
  rule: 'No deployment without passing happy_path + no_show scenario.',
} as const;

// ═══════════════════════════════════════════════════════════════
// §15  FINAL SYSTEM RULE — SUPREME
// ═══════════════════════════════════════════════════════════════

export const SYSTEM_RULE = {
  statement: 'Dieses System ist nicht optional. Es ist der operative Kern der Plattform.',
  enforcement: 'Every feature MUST declare: { layer, block, governing_canon_id, kpi_moved, events }',
  validation: 'validateFeaturePlacement() from canonical-system-architecture.ts',
  immutableSections: ['§4 STATUS_MACHINE', '§5 CONVERSION_FLOWS', '§12 KPI_SYSTEM', '§13 EVENTS'],
  amendmentProcess: 'Canon Constitution → Admin approval → Migration → Memory update',
} as const;

// ═══════════════════════════════════════════════════════════════
// EXPORT: Full System Registry
// ═══════════════════════════════════════════════════════════════

export const MASTER_SYSTEM_CANON = {
  '§1_system_definition': SYSTEM_DEFINITION,
  '§2_acquisition': ACQUISITION,
  '§3_platform': PLATFORM_SYSTEM,
  '§4_status_machine': STATUS_MACHINE_RULES,
  '§5_conversion_flows': { no_booking: NO_BOOKING_FLOW, no_show: NO_SHOW_FLOW, no_close: NO_CLOSE_FLOW },
  '§6_communication': COMMUNICATION,
  '§7_setter_closer': SETTER_CLOSER,
  '§8_ai_operator': AI_OPERATOR,
  '§9_monitoring': MONITORING,
  '§10_enforcement': ENFORCEMENT,
  '§11_governance': GOVERNANCE,
  '§12_kpi': KPI_SYSTEM,
  '§13_events': { canonical_events: CANONICAL_EVENTS, logging: EVENT_LOGGING },
  '§14_verification': VERIFICATION,
  '§15_system_rule': SYSTEM_RULE,
} as const;
