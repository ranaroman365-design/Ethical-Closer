/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC OPERATIONAL CANON (Hardwired)
 * Layer 12 — Immutable System Laws
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for the 10 operational invariants:
 *   1. Event dictionary    — finite list of canonical events
 *   2. User state machine  — exactly one primary state per user
 *   3. KPI formulas        — one formula per KPI, forever
 *   4. Time windows        — global activity / revenue / trend windows
 *   5. Dashboard hierarchy — Status → Trend → Benchmark → Insight → Action
 *   6. Action types        — Communicate / Coach / Allocate / Flag / Escalate
 *   7. Access matrix       — see / do / unlock per level (deterministic)
 *   8. Data ownership      — Lovable owns events, KPIs, state, communication
 *   9. Terminology         — one concept = one word
 *  10. North-star metric   — single primary success metric
 *
 * HARD RULES:
 *   ❌ Never invent new event names, action types, or KPI formulas
 *   ❌ Never duplicate a source of truth across systems
 *   ❌ Never reinterpret an existing canonical term
 *   ✅ Always import from this file when checking/dispatching/labeling
 *
 * Spec: docs/operational-canon.md
 * Memory: mem://architecture/operational-canon
 * Sibling: src/lib/canonical-roles.ts (Layer 11)
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── 1. CANONICAL EVENT DICTIONARY ─────────────────────────────────────
// 1 real-world action = 1 event. 1 event = 1 meaning forever.
// No synonyms, no duplicates, no reinterpretation.
export const CANONICAL_EVENTS = Object.freeze({
  // Acquisition
  LEAD_CREATED:       'lead_created',
  QUIZ_STARTED:       'quiz_started',
  QUIZ_COMPLETED:     'quiz_completed',
  BOOKED:             'booked',
  NO_SHOW:            'no_show',
  CALL_COMPLETED:     'call_completed',
  DEAL_WON:           'deal_won',
  DEAL_LOST:          'deal_lost',
  // Conversion State Machine (Layer 47)
  FIRST_CONTACT_SENT:        'first_contact_sent',
  LEAD_REPLIED:              'lead_replied',
  APPOINTMENT_BOOKED:        'appointment_booked',
  PRE_CALL_OPENED:           'pre_call_opened',
  PRE_CALL_ANSWER_SUBMITTED: 'pre_call_answer_submitted',
  CALL_STARTED:              'call_started',
  CALL_SHOWED:               'call_showed',
  CALL_NO_SHOW:              'call_no_show',
  RECOVERY_STARTED:          'recovery_started',
  REBOOKED:                  'rebooked',
  CALL_CLOSED_WON:           'call_closed_won',
  CALL_CLOSED_LOST:          'call_closed_lost',
  LEAD_EXITED:               'lead_exited',
  // Lifecycle
  LEVEL_UP:           'level_up',
  INACTIVE_3D:        'inactive_3d',
  INACTIVE_7D:        'inactive_7d',
  // Economy
  PAYMENT_COMPLETED:  'payment_completed',
  COMMUNITY_JOINED:   'community_joined',
} as const);
export type CanonicalEvent = typeof CANONICAL_EVENTS[keyof typeof CANONICAL_EVENTS];

// ─── 2. CANONICAL USER STATE MACHINE ───────────────────────────────────
// A user is ALWAYS in exactly ONE primary state.
export const USER_STATES = Object.freeze({
  LEAD:       'lead',
  QUIZ:       'quiz',
  BOOKED:     'booked',
  SHOWED:     'showed',
  CLOSED_WON: 'closed_won',
  L1: 'l1', L2: 'l2', L3: 'l3', L4: 'l4',
  L5: 'l5', L6: 'l6', L7: 'l7', L8: 'l8',
} as const);
export type UserState = typeof USER_STATES[keyof typeof USER_STATES];

/** Allowed forward transitions. Backward moves require an admin override. */
export const STATE_TRANSITIONS: Readonly<Record<UserState, readonly UserState[]>> = Object.freeze({
  lead:       ['quiz'],
  quiz:       ['booked'],
  booked:     ['showed'],            // (no_show event keeps state = booked)
  showed:     ['closed_won'],
  closed_won: ['l1'],
  l1: ['l2'], l2: ['l3'], l3: ['l4'], l4: ['l5'],
  l5: ['l6'], l6: ['l7'], l7: ['l8'], l8: [],
});

export function canTransition(from: UserState, to: UserState): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── 3. CANONICAL KPI FORMULAS ─────────────────────────────────────────
// Each KPI has exactly ONE formula. Thresholds live in src/lib/kpi-config.ts.
export const KPI_FORMULAS = Object.freeze({
  booking_rate: {
    label: 'Booking Rate',
    formula: 'booked / quiz_completed',
    numerator: 'booked',
    denominator: 'quiz_completed',
  },
  show_rate: {
    label: 'Show Rate',
    formula: 'showed / booked',
    numerator: 'showed',
    denominator: 'booked',
  },
  close_rate: {
    label: 'Close Rate',
    formula: 'deal_won / showed',
    numerator: 'deal_won',
    denominator: 'showed',
  },
  no_show_rate: {
    label: 'No-Show Rate',
    formula: 'no_show / booked',
    numerator: 'no_show',
    denominator: 'booked',
  },
  revenue_per_lead: {
    label: 'Revenue per Lead',
    formula: 'sum(deal_won.revenue) / lead_created',
    numerator: 'sum(deal_won.revenue)',
    denominator: 'lead_created',
  },
  revenue_per_operator: {
    label: 'Revenue per Operator',
    formula: 'sum(deal_won.revenue) / active_operators',
    numerator: 'sum(deal_won.revenue)',
    denominator: 'active_operators',
  },
} as const);
export type KpiKey = keyof typeof KPI_FORMULAS;

/** Pure formula resolver. Returns null if denominator is 0 (never NaN). */
export function computeKpi(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

// ─── 4. CANONICAL TIME WINDOWS ─────────────────────────────────────────
export const TIME_WINDOWS = Object.freeze({
  ACTIVITY_DAYS:    7,           // OSS activity component, dashboards
  REVENUE_DAYS:     30,          // earnings, revenue cards, OSS revenue
  TREND_SHORT_DAYS: 7,           // short leg of trend comparison
  TREND_LONG_DAYS:  30,          // long leg of trend comparison
  INACTIVE_WARN:    3,           // → emits inactive_3d
  INACTIVE_RISK:    7,           // → emits inactive_7d
} as const);

// ─── 5. CANONICAL DASHBOARD HIERARCHY ──────────────────────────────────
// Every dashboard section follows this order.
export const DASHBOARD_HIERARCHY = Object.freeze([
  'status',     // 1. Where am I right now?
  'trend',      // 2. Which direction am I moving?
  'benchmark',  // 3. How do I compare?
  'insight',    // 4. What does this mean?
  'action',     // 5. What do I do next?
] as const);
export type DashboardSection = typeof DASHBOARD_HIERARCHY[number];

// ─── 6. CANONICAL ACTION TYPES ─────────────────────────────────────────
// The system NEVER invents new action types.
export const ACTION_TYPES = Object.freeze({
  COMMUNICATE: 'communicate',  // send a message via Communication Engine
  COACH:       'coach',        // training / feedback / mentoring
  ALLOCATE:    'allocate',     // assign / reassign work or leads
  FLAG:        'flag',         // mark for review (no immediate action)
  ESCALATE:    'escalate',     // raise to higher role / admin / break-glass
} as const);
export type ActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES];

// ─── 7. CANONICAL ACCESS / PERMISSION MATRIX ───────────────────────────
// Access is 100% deterministic by level. See / Do / Unlock per level.
export interface AccessRow { level: number; see: readonly string[]; do: readonly string[]; unlock: readonly string[]; }

export const ACCESS_MATRIX: readonly AccessRow[] = Object.freeze([
  { level: 0, see: ['applicant_portal'],                       do: ['quiz', 'booking'],                          unlock: [] },
  { level: 1, see: ['basic_dashboard', 'academy'],             do: ['training', 'opener_workspace'],             unlock: [] },
  { level: 2, see: ['setter_dashboard', 'calendar'],           do: ['setting', 'qualification'],                 unlock: ['setter_workspace'] },
  { level: 3, see: ['setter_dashboard', 'mentor_overview'],    do: ['setting', 'mentor_setters'],                unlock: ['mentor_space'] },
  { level: 4, see: ['revenue_metrics', 'closer_dashboard'],    do: ['close_deals'],                              unlock: ['closing_os', 'offer_deck'] },
  { level: 5, see: ['revenue_metrics', 'mentor_overview'],     do: ['close_deals', 'mentor_closers'],            unlock: ['call_review'] },
  { level: 6, see: ['operator_dashboard', 'origin_metrics'],   do: ['own_funnel', 'manage_budget'],              unlock: ['performance_command_center'] },
  { level: 7, see: ['director_dashboard', 'team_kpis'],        do: ['manage_operators', 'allocate_resources'],   unlock: ['director_workspace'] },
  { level: 8, see: ['partner_dashboard', 'system_economics'],  do: ['b2b_sales', 'license_system'],              unlock: ['partner_hub', 'white_label'] },
]);

export function accessFor(level: number): AccessRow {
  return ACCESS_MATRIX[Math.max(0, Math.min(8, Math.trunc(level ?? 0)))];
}

// ─── 8. CANONICAL DATA OWNERSHIP ───────────────────────────────────────
// One domain → one source of truth. No duplication.
export const DATA_OWNERSHIP = Object.freeze({
  events:         'lovable',  // canonical event log
  kpis:           'lovable',  // formulas + values
  user_state:     'lovable',  // primary state machine
  communication:  'lovable',  // templates + dispatch (GHL = channel only)
  commissions:    'lovable',  // payout source of truth
  access:         'lovable',  // ACCESS_MATRIX above
  identity:       'lovable',  // auth.users + profiles
} as const);

// ─── 9. CANONICAL TERMINOLOGY ──────────────────────────────────────────
// One concept = one word across the entire system.
export const TERMINOLOGY = Object.freeze({
  booking:    { use: 'Booking',  forbid: ['appointment', 'call slot', 'session slot', 'meeting'] },
  show:       { use: 'Show',     forbid: ['attended', 'joined', 'arrived', 'present'] },
  deal_won:   { use: 'Deal Won', forbid: ['sale', 'success', 'win', 'conversion'] },
  level_up:   { use: 'Level Up', forbid: ['promotion', 'upgrade', 'advancement', 'rank up'] },
  operator:   { use: 'Senior Closer', forbid: ['Operator (external)'], note: 'L6 external label rule — see canonical-roles.ts' },
  lead:       { use: 'Lead',     forbid: ['prospect (external)', 'contact'] },
  quiz:       { use: 'Quiz',     forbid: ['assessment', 'survey', 'questionnaire'] },
} as const);

// ─── 10. CANONICAL NORTH-STAR METRIC ───────────────────────────────────
// Everything else aligns to this single primary success metric.
export const NORTH_STAR = Object.freeze({
  primary: {
    key: 'revenue_per_operator',
    label: 'Revenue per Operator',
    formula: KPI_FORMULAS.revenue_per_operator.formula,
    window_days: TIME_WINDOWS.REVENUE_DAYS,
  },
  secondary: {
    key: 'l6_operators_created_30d',
    label: 'L6 Senior Closers Created (30d)',
    formula: 'count(level_up where to_level = 6 within 30d)',
    window_days: TIME_WINDOWS.REVENUE_DAYS,
  },
} as const);

// ─── DEV-MODE GUARDS ───────────────────────────────────────────────────
const CANONICAL_EVENT_SET = new Set<string>(Object.values(CANONICAL_EVENTS));
const CANONICAL_ACTION_SET = new Set<string>(Object.values(ACTION_TYPES));

export function assertCanonicalEvent(event: string): void {
  if (import.meta.env?.DEV && !CANONICAL_EVENT_SET.has(event)) {
    // eslint-disable-next-line no-console
    console.error(
      `[OperationalCanon] Non-canonical event "${event}". ` +
      `Use one of: ${Object.values(CANONICAL_EVENTS).join(', ')}`,
    );
  }
}

export function assertCanonicalAction(action: string): void {
  if (import.meta.env?.DEV && !CANONICAL_ACTION_SET.has(action)) {
    // eslint-disable-next-line no-console
    console.error(
      `[OperationalCanon] Non-canonical action "${action}". ` +
      `Use one of: ${Object.values(ACTION_TYPES).join(', ')}`,
    );
  }
}
