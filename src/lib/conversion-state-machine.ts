/**
 * ═══════════════════════════════════════════════════════════════════════
 * UNIFIED CONVERSION STATE MACHINE™ (ETC Canon Level)
 * Layer 47 — Deterministic Conversion Engine
 * ═══════════════════════════════════════════════════════════════════════
 *
 * THE single source of truth for lead-to-close conversion flow.
 * Every lead moves deterministically through states.
 * Every state has exactly 1 goal, 1 owner role, defined events, measurable KPIs.
 *
 * HARD RULES (nicht verhandelbar):
 *   ❗ Kein Lead ohne State
 *   ❗ Kein State ohne Owner
 *   ❗ Kein Event ohne Transition
 *   ❗ Kein No-Show ohne Recovery
 *   ❗ Kein Booking ohne Pre-Call Link
 *
 * Related: src/lib/operational-canon.ts (Layer 12)
 * ═══════════════════════════════════════════════════════════════════════
 */

// ─── CONVERSION STATES ─────────────────────────────────────────────────
export const CONVERSION_STATES = Object.freeze({
  // Phase 1 — Acquisition
  NEW_LEAD:            'new_lead',
  CONTACTED:           'contacted',
  ENGAGED:             'engaged',
  BOOKED:              'booked',
  // Phase 2 — Pre-Call
  PRE_CALL_PENDING:    'pre_call_pending',
  PRE_CALL_COMPLETED:  'pre_call_completed',
  // Phase 3 — Call
  SHOWED:              'showed',
  CLOSED_WON:          'closed_won',
  CLOSED_LOST:         'closed_lost',
  // Phase 4 — Failure & Recovery
  NO_SHOW:             'no_show',
  RECOVERY_ACTIVE:     'recovery_active',
  REBOOKED:            'rebooked',
  SECOND_NO_SHOW:      'second_no_show',
  // Phase 5 — Exit
  UNRESPONSIVE:        'unresponsive',
  EXIT:                'exit',
} as const);

export type ConversionState = typeof CONVERSION_STATES[keyof typeof CONVERSION_STATES];

// ─── CONVERSION EVENTS ─────────────────────────────────────────────────
// Only these events trigger state transitions. No new events allowed.
export const CONVERSION_EVENTS = Object.freeze({
  LEAD_CREATED:              'lead_created',
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
} as const);

export type ConversionEvent = typeof CONVERSION_EVENTS[keyof typeof CONVERSION_EVENTS];

// ─── STATE TRANSITIONS ─────────────────────────────────────────────────
// Deterministic: state + event → new state. No ambiguity.
export const STATE_TRANSITIONS: Readonly<
  Record<ConversionState, Readonly<Partial<Record<ConversionEvent, ConversionState>>>>
> = Object.freeze({
  new_lead: {
    first_contact_sent: 'contacted',
  },
  contacted: {
    lead_replied: 'engaged',
  },
  engaged: {
    appointment_booked: 'booked',
    lead_exited: 'unresponsive',
  },
  booked: {
    appointment_booked: 'pre_call_pending', // auto-transition on booking
  },
  pre_call_pending: {
    pre_call_answer_submitted: 'pre_call_completed',
    call_showed: 'showed',
    call_no_show: 'no_show',
  },
  pre_call_completed: {
    call_showed: 'showed',
    call_no_show: 'no_show',
  },
  showed: {
    call_closed_won: 'closed_won',
    call_closed_lost: 'closed_lost',
  },
  closed_won: {},   // terminal
  closed_lost: {
    lead_exited: 'exit',
  },
  no_show: {
    recovery_started: 'recovery_active',
  },
  recovery_active: {
    rebooked: 'rebooked',
    call_no_show: 'second_no_show',
    lead_exited: 'exit',
  },
  rebooked: {
    call_showed: 'showed',
    call_no_show: 'second_no_show',
  },
  second_no_show: {
    lead_exited: 'exit',
  },
  unresponsive: {
    lead_exited: 'exit',
  },
  exit: {},  // terminal
});

/**
 * Resolve the next state for a given current state + event.
 * Returns null if transition is not allowed (invalid event for state).
 */
export function resolveTransition(
  currentState: ConversionState,
  event: ConversionEvent,
): ConversionState | null {
  return STATE_TRANSITIONS[currentState]?.[event] ?? null;
}

// ─── OWNER SYSTEM ──────────────────────────────────────────────────────
// Jeder Lead hat genau einen Owner pro State.
export type OwnerRole = 'setter' | 'closer' | 'system' | 'operator';

export const STATE_OWNERS: Readonly<Record<ConversionState, OwnerRole>> = Object.freeze({
  new_lead:            'setter',
  contacted:           'setter',
  engaged:             'setter',
  booked:              'setter',
  pre_call_pending:    'setter',   // System triggers, Setter monitors
  pre_call_completed:  'setter',
  showed:              'closer',
  closed_won:          'closer',
  closed_lost:         'closer',
  no_show:             'system',
  recovery_active:     'setter',   // System + Setter recovery
  rebooked:            'setter',
  second_no_show:      'operator', // Escalation to Operator
  unresponsive:        'setter',
  exit:                'system',
});

// ─── PHASE GROUPING ────────────────────────────────────────────────────
export type ConversionPhase = 'acquisition' | 'pre_call' | 'call' | 'recovery' | 'exit';

export const STATE_PHASES: Readonly<Record<ConversionState, ConversionPhase>> = Object.freeze({
  new_lead:            'acquisition',
  contacted:           'acquisition',
  engaged:             'acquisition',
  booked:              'acquisition',
  pre_call_pending:    'pre_call',
  pre_call_completed:  'pre_call',
  showed:              'call',
  closed_won:          'call',
  closed_lost:         'call',
  no_show:             'recovery',
  recovery_active:     'recovery',
  rebooked:            'recovery',
  second_no_show:      'recovery',
  unresponsive:        'exit',
  exit:                'exit',
});

// ─── STATE METADATA ────────────────────────────────────────────────────
export interface StateDefinition {
  state: ConversionState;
  phase: ConversionPhase;
  goal: string;
  owner: OwnerRole;
  terminal: boolean;
}

export const STATE_DEFINITIONS: readonly StateDefinition[] = Object.freeze([
  { state: 'new_lead',           phase: 'acquisition', goal: 'Kontakt starten',          owner: 'setter',   terminal: false },
  { state: 'contacted',          phase: 'acquisition', goal: 'Antwort erzeugen',         owner: 'setter',   terminal: false },
  { state: 'engaged',            phase: 'acquisition', goal: 'Gespräch führen',          owner: 'setter',   terminal: false },
  { state: 'booked',             phase: 'acquisition', goal: 'Termin sichern',           owner: 'setter',   terminal: false },
  { state: 'pre_call_pending',   phase: 'pre_call',    goal: 'Vorbereitung triggern',    owner: 'setter',   terminal: false },
  { state: 'pre_call_completed', phase: 'pre_call',    goal: 'Intent klären',            owner: 'setter',   terminal: false },
  { state: 'showed',             phase: 'call',        goal: 'Gespräch führen',          owner: 'closer',   terminal: false },
  { state: 'closed_won',         phase: 'call',        goal: 'Revenue',                  owner: 'closer',   terminal: true  },
  { state: 'closed_lost',        phase: 'call',        goal: 'Qualifizieren',            owner: 'closer',   terminal: false },
  { state: 'no_show',            phase: 'recovery',    goal: 'Signal erkennen',          owner: 'system',   terminal: false },
  { state: 'recovery_active',    phase: 'recovery',    goal: 'Rebook erzwingen',         owner: 'setter',   terminal: false },
  { state: 'rebooked',           phase: 'recovery',    goal: 'Zweite Chance',            owner: 'setter',   terminal: false },
  { state: 'second_no_show',     phase: 'recovery',    goal: 'Verlust erkennen',         owner: 'operator', terminal: false },
  { state: 'unresponsive',       phase: 'exit',        goal: 'sauberer Abschluss',       owner: 'setter',   terminal: false },
  { state: 'exit',               phase: 'exit',        goal: 'System-Ende',              owner: 'system',   terminal: true  },
]);

// ─── RECOVERY TIMELINE ─────────────────────────────────────────────────
// Defined recovery cadence after no-show.
export const RECOVERY_TIMELINE = Object.freeze([
  { offset_minutes: 5,    action: 'recovery_message_1', channel: 'sms' },
  { offset_minutes: 120,  action: 'recovery_message_2', channel: 'sms' },
  { offset_minutes: 1440, action: 'recovery_message_3', channel: 'email' },
] as const);

// ─── CONVERSION KPIs ───────────────────────────────────────────────────
export const CONVERSION_KPIS = Object.freeze({
  // Pre-Call KPIs
  pre_call_completion_rate: {
    label: 'Pre-Call Completion Rate',
    formula: 'pre_call_completed / pre_call_pending',
    numerator: 'pre_call_completed',
    denominator: 'pre_call_pending',
  },
  show_rate_prepared: {
    label: 'Show Rate (Prepared)',
    formula: 'showed(pre_call_completed) / pre_call_completed',
    numerator: 'showed_after_pre_call',
    denominator: 'pre_call_completed',
  },
  show_rate_unprepared: {
    label: 'Show Rate (Unprepared)',
    formula: 'showed(pre_call_pending) / (pre_call_pending - pre_call_completed)',
    numerator: 'showed_without_pre_call',
    denominator: 'pre_call_pending_only',
  },
  close_rate_prepared: {
    label: 'Close Rate (Prepared)',
    formula: 'closed_won(pre_call_completed) / showed(pre_call_completed)',
    numerator: 'won_after_pre_call',
    denominator: 'showed_after_pre_call',
  },
  revenue_per_prepared_lead: {
    label: 'Revenue per Prepared Lead',
    formula: 'sum(revenue where pre_call_completed) / pre_call_completed',
    numerator: 'revenue_from_prepared',
    denominator: 'pre_call_completed',
  },
  // Recovery KPIs
  no_show_rate: {
    label: 'No-Show Rate',
    formula: 'no_show / booked',
    numerator: 'no_show',
    denominator: 'booked',
  },
  recovery_rate: {
    label: 'Recovery Rate',
    formula: 'recovery_active / no_show',
    numerator: 'recovery_active',
    denominator: 'no_show',
  },
  rebook_rate: {
    label: 'Rebook Rate',
    formula: 'rebooked / recovery_active',
    numerator: 'rebooked',
    denominator: 'recovery_active',
  },
  recovery_show_rate: {
    label: 'Recovery Show Rate',
    formula: 'showed(rebooked) / rebooked',
    numerator: 'showed_after_rebook',
    denominator: 'rebooked',
  },
  recovery_close_rate: {
    label: 'Recovery Close Rate',
    formula: 'closed_won(rebooked) / showed(rebooked)',
    numerator: 'won_after_rebook',
    denominator: 'showed_after_rebook',
  },
  revenue_recovered: {
    label: 'Revenue Recovered',
    formula: 'sum(revenue where previous_state = no_show)',
    numerator: 'revenue_from_recovery',
    denominator: null,
  },
  // Core KPIs (extended)
  show_rate: {
    label: 'Show Rate',
    formula: 'showed / booked',
    numerator: 'showed',
    denominator: 'booked',
    target: 0.75,
  },
  recovery_target: {
    label: 'Recovery Target',
    formula: 'rebooked / no_show',
    numerator: 'rebooked',
    denominator: 'no_show',
    target: 0.25,
  },
  revenue_per_lead: {
    label: 'Revenue per Lead',
    formula: 'sum(deal_value) / lead_created',
    numerator: 'total_revenue',
    denominator: 'total_leads',
  },
  revenue_per_no_show: {
    label: 'Revenue per No-Show',
    formula: 'sum(revenue_recovered) / no_show',
    numerator: 'revenue_from_recovery',
    denominator: 'no_show',
  },
} as const);

// ─── LEGACY STAGE MAPPING ──────────────────────────────────────────────
// Maps old `leads.stage` values to new ConversionState for migration.
export const LEGACY_STAGE_MAP: Readonly<Record<string, ConversionState>> = Object.freeze({
  'new':                'new_lead',
  'assigned_setter':    'contacted',
  'qualified':          'engaged',
  'booked':             'booked',
  'showed':             'showed',
  'offer':              'showed',
  'won':                'closed_won',
  'closed_won':         'closed_won',
  'started':            'closed_won',
  'returned_to_pool':   'unresponsive',
});

/**
 * Map a legacy stage to the new ConversionState.
 * Falls back to 'new_lead' for unknown stages.
 */
export function mapLegacyStage(stage: string | null | undefined): ConversionState {
  if (!stage) return CONVERSION_STATES.NEW_LEAD;
  return LEGACY_STAGE_MAP[stage] ?? CONVERSION_STATES.NEW_LEAD;
}

// ─── DEV GUARDS ────────────────────────────────────────────────────────
const VALID_STATES = new Set<string>(Object.values(CONVERSION_STATES));
const VALID_EVENTS = new Set<string>(Object.values(CONVERSION_EVENTS));

export function assertValidState(state: string): asserts state is ConversionState {
  if (!VALID_STATES.has(state)) {
    throw new Error(`[ConversionStateMachine] Invalid state "${state}". Valid: ${[...VALID_STATES].join(', ')}`);
  }
}

export function assertValidEvent(event: string): asserts event is ConversionEvent {
  if (!VALID_EVENTS.has(event)) {
    throw new Error(`[ConversionStateMachine] Invalid event "${event}". Valid: ${[...VALID_EVENTS].join(', ')}`);
  }
}
