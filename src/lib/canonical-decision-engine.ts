/**
 * ═══════════════════════════════════════════════════════════════════════
 * CANONICAL DECISION ENGINE™ (ETC Canon Level)
 * Layer 51 — Unified Decision Layer
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ONE lead = ONE truth = ONE priority.
 *
 * This module is the SINGLE entry point for:
 *   1. Canonical Lead State (phone, quality, attendance risk, stage)
 *   2. Canonical Score (wraps lead-scoring-engine.ts)
 *   3. Lead Priority (HIGH / MEDIUM / LOW)
 *   4. Canonical Event Mapping (unifies event_logs, funnel_events, funnel_events_v2)
 *
 * RULES:
 *   ❗ No dashboard may compute its own lead quality or priority.
 *   ❗ No component may interpret raw fields — always use this engine.
 *   ❗ Revenue truth = calls.revenue WHERE result='closed_won' (unchanged).
 *   ❗ All event queries go through CANONICAL_EVENT_MAP or getCanonicalEventType().
 *
 * Depends on:
 *   - src/lib/lead-scoring-engine.ts (Layer 50)
 *   - src/lib/conversion-state-machine.ts (Layer 47)
 *   - src/lib/phone-validation.ts (Phase 1)
 *
 * Block: Intelligence (primary) · Conversion · Governance
 * ═══════════════════════════════════════════════════════════════════════
 */

import {
  calculateLeadScore,
  buildScoringInput,
  type LeadScoringInput,
  type LeadScoringResult,
} from './lead-scoring-engine';

// ─── CANONICAL LEAD QUALITY ─────────────────────────────────────────

export type LeadQuality = 'high' | 'mid' | 'low';
export type AttendanceRisk = 'low' | 'mid' | 'high';
export type LeadPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type CanonicalStage = 'new' | 'booked' | 'showed' | 'closed';

// ─── CANONICAL LEAD STATE ───────────────────────────────────────────

export interface CanonicalLeadState {
  phone_valid: boolean;
  lead_quality: LeadQuality;
  whatsapp_confirmed: boolean;
  whatsapp_unresponsive: boolean;
  attendance_risk: AttendanceRisk;
  stage: CanonicalStage;
  pre_call_unconfirmed: boolean;
  attendance_flag: boolean;
  appointment_status: AppointmentStatus;
  lead_priority: LeadPriority;
}

export type AppointmentStatus = 'scheduled' | 'at_risk' | 'completed' | 'no_show' | 'rebooked';

// ─── PHASE 4 CANONICAL EVENTS ───────────────────────────────────────

export const PHASE4_EVENTS = [
  'PRE_CALL_CONFIRMATION_SENT',
  'PRE_CALL_CONFIRMED',
  'PRE_CALL_UNCONFIRMED',
  'AUTO_RESCHEDULE_TRIGGERED',
  'NO_SHOW_DETECTED',
  'NO_SHOW_RECOVERY_SENT',
  'REBOOKED_AFTER_NO_SHOW',
  'BOOKING_PRIORITY_ASSIGNED',
] as const;
export type Phase4Event = typeof PHASE4_EVENTS[number];

// ─── REMINDER INTENSITY (Phase 4) ───────────────────────────────────

export type ReminderSchedule = { offsetMinutes: number; label: string }[];

export function getReminderSchedule(risk: AttendanceRisk): ReminderSchedule {
  switch (risk) {
    case 'low':
      return [
        { offsetMinutes: -1440, label: '24h' },
        { offsetMinutes: -180, label: '3h' },
        { offsetMinutes: -60, label: '1h' },
        { offsetMinutes: -10, label: '10min' },
      ];
    case 'mid':
      return [
        { offsetMinutes: -1440, label: '24h' },
        { offsetMinutes: -180, label: '3h' },
        { offsetMinutes: -60, label: '1h' },
        { offsetMinutes: -30, label: 'confirmation_check' },
      ];
    case 'high':
      return [
        { offsetMinutes: -1440, label: '24h' },
        { offsetMinutes: -360, label: '6h' },
        { offsetMinutes: -180, label: '3h' },
        { offsetMinutes: -60, label: '1h' },
        { offsetMinutes: -30, label: '30min' },
        { offsetMinutes: -10, label: '10min' },
        { offsetMinutes: -5, label: 'manual_confirmation_push' },
      ];
  }
}

// ─── CALENDAR PRIORITY (Phase 4) ────────────────────────────────────

export interface CalendarAllocation {
  slotQuality: 'best' | 'normal' | 'limited';
  fastlane: boolean;
  premiumResource: boolean;
  seniorCloserEligible: boolean;
}

export function getCalendarAllocation(priority: LeadPriority): CalendarAllocation {
  switch (priority) {
    case 'HIGH':
      return { slotQuality: 'best', fastlane: true, premiumResource: true, seniorCloserEligible: true };
    case 'MEDIUM':
      return { slotQuality: 'normal', fastlane: false, premiumResource: false, seniorCloserEligible: false };
    case 'LOW':
      return { slotQuality: 'limited', fastlane: false, premiumResource: false, seniorCloserEligible: false };
  }
}

// ─── CANONICAL DECISION OUTPUT ──────────────────────────────────────

export interface CanonicalDecision {
  state: CanonicalLeadState;
  score: LeadScoringResult;
  priority: LeadPriority;
}

// ─── STAGE MAPPING ──────────────────────────────────────────────────

const STAGE_MAP: Record<string, CanonicalStage> = {
  new_lead: 'new',
  contacted: 'new',
  engaged: 'new',
  booked: 'booked',
  pre_call_pending: 'booked',
  pre_call_completed: 'booked',
  showed: 'showed',
  closed_won: 'closed',
  closed_lost: 'closed',
  no_show: 'booked',
  recovery_active: 'booked',
  rebooked: 'booked',
  second_no_show: 'new',
  unresponsive: 'new',
  exit: 'closed',
};

/**
 * Map any conversion_state to a canonical stage.
 * Falls back to 'new' for unknown states.
 */
export function toCanonicalStage(conversionState: string | null | undefined): CanonicalStage {
  if (!conversionState) return 'new';
  return STAGE_MAP[conversionState] ?? 'new';
}

// ─── LEAD QUALITY FROM RAW DATA ─────────────────────────────────────

/**
 * Derive canonical lead quality from available fields.
 * Consolidates: lead_quality (A/B/C), qualification_bucket (high/mid/low),
 * quiz_score, and commitment_level into ONE value.
 */
export function deriveLeadQuality(lead: Record<string, any>): LeadQuality {
  // 1. Check explicit qualification bucket (from quiz)
  const bucket = (lead.qualification_bucket ?? '').toLowerCase();
  if (bucket === 'high') return 'high';
  if (bucket === 'medium' || bucket === 'mid') return 'mid';
  if (bucket === 'low') return 'low';

  // 2. Check lead_quality field (A/B/C or hot/warm/cold)
  const lq = (lead.lead_quality ?? '').toLowerCase();
  if (lq === 'a' || lq === 'hot') return 'high';
  if (lq === 'b' || lq === 'warm') return 'mid';
  if (lq === 'c' || lq === 'cold') return 'low';

  // 3. Fall back to quiz_score thresholds
  const qs = lead.qualification_score ?? lead.quiz_score ?? null;
  if (typeof qs === 'number') {
    if (qs >= 10) return 'high';
    if (qs >= 5) return 'mid';
    return 'low';
  }

  // 4. No data → low
  return 'low';
}

// ─── ATTENDANCE RISK ────────────────────────────────────────────────

/**
 * Derive attendance risk from no-show history, behavior signals,
 * WhatsApp responsiveness, and appointment timing.
 *
 * Phase 3+4 Rules:
 *   - whatsapp_unresponsive = true → high (hard rule)
 *   - invalid phone → high
 *   - ≥1 no-show AND no previous attendance → high
 *   - booking <1h before call without WA confirmation → high
 *   - whatsapp_confirmed = true → low (unless ≥2 no-shows)
 *   - phone_valid + no no-show history → low
 */
export function deriveAttendanceRisk(lead: Record<string, any>): AttendanceRisk {
  const noShows = lead.total_no_shows ?? 0;
  const attended = lead.total_calls_attended ?? 0;
  const waUnresponsive = lead.whatsapp_unresponsive === true;
  const waConfirmed = lead.whatsapp_confirmed === true;
  const phoneValid = lead.phone_valid === true;

  // Phase 3: unresponsive → always high
  if (waUnresponsive) return 'high';

  // Phase 4: invalid phone → high
  const hasPhone = !!lead.phone || !!lead.phone_normalized;
  if (!hasPhone || !phoneValid) {
    // If confirmed via WA despite phone issues, downgrade to mid
    if (waConfirmed) return 'mid';
    return 'high';
  }

  // No-show history
  if (noShows >= 2) return 'high';
  if (noShows >= 1 && attended === 0) {
    // WA confirmed can rescue single no-show
    if (waConfirmed) return 'mid';
    return 'high';
  }

  // Phase 4: Booking <1h before call without WA confirmation
  if (lead.appointment_time) {
    const appointmentTime = new Date(lead.appointment_time).getTime();
    const bookingTime = lead.booked_at ? new Date(lead.booked_at).getTime() : Date.now();
    const hoursBeforeCall = (appointmentTime - bookingTime) / 3600000;
    if (hoursBeforeCall < 1 && !waConfirmed) return 'high';
  }

  // No-show with attendance history = mid
  if (noShows >= 1 && attended > 0) {
    if (waConfirmed) return 'low';
    return 'mid';
  }

  // WA confirmed + phone valid + clean history = low
  if (waConfirmed) return 'low';

  // Phone valid + clean history = low
  return 'low';
}

/**
 * Phase 4: Determine if a lead needs auto-reschedule.
 * Returns true if whatsapp_unresponsive OR pre_call_unconfirmed.
 */
export function shouldAutoReschedule(lead: Record<string, any>): boolean {
  return lead.whatsapp_unresponsive === true || lead.pre_call_unconfirmed === true;
}

/**
 * Phase 4: Determine if a no-show has occurred.
 * Checks if appointment time has passed, attendance_flag is not set,
 * and appointment is not completed.
 */
export function isNoShow(lead: Record<string, any>): boolean {
  if (lead.attendance_flag === true) return false;
  if (lead.appointment_status === 'completed') return false;
  if (!lead.appointment_time) return false;
  const appointmentTime = new Date(lead.appointment_time).getTime();
  return Date.now() > appointmentTime;
}

// ─── COMPUTE CANONICAL STATE ────────────────────────────────────────

/**
 * Compute the canonical lead state from raw lead data.
 * This is the ONLY function that should derive lead state.
 */
export function computeCanonicalState(lead: Record<string, any>): CanonicalLeadState {
  const phone_valid = lead.phone_valid === true;
  const lead_quality = deriveLeadQuality(lead);
  const whatsapp_confirmed = lead.whatsapp_confirmed === true || lead.whatsapp_opt_in === true;
  const whatsapp_unresponsive = lead.whatsapp_unresponsive === true;
  const attendance_risk = deriveAttendanceRisk(lead);
  const stage = toCanonicalStage(lead.conversion_state ?? lead.stage ?? null);
  const pre_call_unconfirmed = lead.pre_call_unconfirmed === true;
  const attendance_flag = lead.attendance_flag === true;
  const appointment_status: AppointmentStatus = (['scheduled', 'at_risk', 'completed', 'no_show', 'rebooked'].includes(lead.appointment_status) ? lead.appointment_status : 'scheduled') as AppointmentStatus;

  // We compute priority after building the partial state
  const partialState: Omit<CanonicalLeadState, 'lead_priority'> = {
    phone_valid, lead_quality, whatsapp_confirmed, whatsapp_unresponsive,
    attendance_risk, stage, pre_call_unconfirmed, attendance_flag, appointment_status,
  };

  // Priority is derived below in computeCanonicalDecision, set placeholder
  return { ...partialState, lead_priority: 'LOW' } as CanonicalLeadState;
}

// ─── COMPUTE PRIORITY ───────────────────────────────────────────────

/**
 * Derive lead priority from canonical state + score.
 *
 * Phase 3 Priority Matrix:
 *   HIGH   = phone_valid + quality ≠ low + attendance_risk ≠ high + whatsapp_confirmed
 *            (score ≥ 60 OR whatsapp boost)
 *   MEDIUM = decent conditions but whatsapp_confirmed = false
 *   LOW    = whatsapp_unresponsive OR low quality OR everything else
 *
 * CRITICAL: HIGH now REQUIRES whatsapp_confirmed = true
 */
export function computePriority(state: CanonicalLeadState, score: LeadScoringResult): LeadPriority {
  const { phone_valid, lead_quality, attendance_risk, whatsapp_confirmed } = state;
  const { leadScore } = score;

  // LOW: unresponsive (attendance_risk = high from WhatsApp) or low quality
  if (attendance_risk === 'high' && !whatsapp_confirmed) return 'LOW';

  // HIGH: requires ALL of: phone_valid + quality ≠ low + risk ≠ high + whatsapp_confirmed
  if (
    phone_valid &&
    lead_quality !== 'low' &&
    attendance_risk !== 'high' &&
    whatsapp_confirmed &&
    leadScore >= 35
  ) {
    return 'HIGH';
  }

  // MEDIUM: decent conditions but missing whatsapp_confirmed or lower score
  if (leadScore >= 35 || (phone_valid && lead_quality !== 'low')) {
    return 'MEDIUM';
  }

  return 'LOW';
}

// ─── MAIN DECISION FUNCTION ─────────────────────────────────────────

/**
 * Compute the full canonical decision for a lead.
 *
 * @param lead     - Raw lead row from DB
 * @param appointment - Current/latest appointment (or {})
 * @param stats    - Engagement stats (messages, response time, etc.)
 * @param lastQuiz - Last quiz result (or null)
 */
export function computeCanonicalDecision(
  lead: Record<string, any>,
  appointment?: Record<string, any>,
  stats?: Parameters<typeof buildScoringInput>[2],
  lastQuiz?: Record<string, any> | null,
): CanonicalDecision {
  const state = computeCanonicalState(lead);
  const scoringInput = buildScoringInput(lead, appointment ?? {}, stats, lastQuiz ?? null);
  const score = calculateLeadScore(scoringInput);
  const priority = computePriority(state, score);

  // Phase 4: Attach computed priority to state for downstream consumers
  state.lead_priority = priority;

  return { state, score, priority };
}

// ─── QUALIFIED REACHABLE CHECK ──────────────────────────────────────

/**
 * A lead is QualifiedReachable when whatsapp_confirmed=true AND phone_valid=true.
 * This is the canonical event trigger — dashboards use this, not raw fields.
 */
export function isQualifiedReachable(lead: Record<string, any>): boolean {
  return lead.whatsapp_confirmed === true && lead.phone_valid === true;
}

// ─── BATCH HELPER ───────────────────────────────────────────────────

/**
 * Compute canonical decisions for an array of leads (no DB calls).
 * Useful for dashboard rendering.
 */
export function computeBatchDecisions(
  leads: Record<string, any>[],
): Array<{ leadId: string; decision: CanonicalDecision }> {
  return leads.map((lead) => ({
    leadId: lead.id,
    decision: computeCanonicalDecision(lead),
  }));
}

// ─── CANONICAL EVENT MAP ────────────────────────────────────────────

/**
 * Maps every known event name from event_logs, funnel_events, funnel_events_v2
 * to ONE canonical event name.
 *
 * Only 5 canonical events exist:
 *   lead_created | quiz_completed | booked | showed | closed_won
 */
export const CANONICAL_EVENTS = [
  'lead_created',
  'quiz_completed',
  'qualified_reachable',
  'booked',
  'showed',
  'closed_won',
] as const;
export type CanonicalEvent = typeof CANONICAL_EVENTS[number];

const EVENT_MAP: Record<string, CanonicalEvent> = {
  // event_logs names
  lead_created: 'lead_created',
  lead_submitted: 'lead_created',
  manual_created: 'lead_created',
  lp_view: 'lead_created',
  new_lead: 'lead_created',

  // quiz
  quiz_started: 'quiz_completed',
  quiz_completed: 'quiz_completed',
  result_viewed: 'quiz_completed',
  qualified_manual: 'quiz_completed',

  // qualified reachable (WhatsApp confirmed)
  qualified_reachable: 'qualified_reachable',
  whatsapp_confirmed: 'qualified_reachable',
  QualifiedReachableLead: 'qualified_reachable',

  // booking
  booking_viewed: 'booked',
  booking_completed: 'booked',
  booked: 'booked',
  rebooked: 'booked',

  // show
  call_showed: 'showed',
  showed: 'showed',
  attended: 'showed',

  // close
  deal_won: 'closed_won',
  closed_won: 'closed_won',
  deal_closed: 'closed_won',
};

/**
 * Map any raw event name to a canonical event.
 * Returns null for unmapped events (e.g. deal_lost, no_show — not canonical milestones).
 */
export function getCanonicalEventType(rawEvent: string): CanonicalEvent | null {
  return EVENT_MAP[rawEvent] ?? null;
}

/**
 * Check if a raw event name maps to a specific canonical event.
 */
export function isCanonicalEvent(rawEvent: string, target: CanonicalEvent): boolean {
  return EVENT_MAP[rawEvent] === target;
}

// ─── PRIORITY DISPLAY HELPERS ───────────────────────────────────────

export function getPriorityColor(priority: LeadPriority): string {
  switch (priority) {
    case 'HIGH': return 'text-emerald-700 dark:text-emerald-400';
    case 'MEDIUM': return 'text-amber-700 dark:text-amber-400';
    case 'LOW': return 'text-red-600 dark:text-red-400';
  }
}

export function getPriorityBg(priority: LeadPriority): string {
  switch (priority) {
    case 'HIGH': return 'bg-emerald-500/15 border-emerald-500/30';
    case 'MEDIUM': return 'bg-amber-500/15 border-amber-500/30';
    case 'LOW': return 'bg-red-500/15 border-red-500/30';
  }
}

export function getPriorityEmoji(priority: LeadPriority): string {
  switch (priority) {
    case 'HIGH': return '🟢';
    case 'MEDIUM': return '🟡';
    case 'LOW': return '🔴';
  }
}

export function getPriorityLabel(priority: LeadPriority, lang: 'de' | 'en' = 'de'): string {
  const labels: Record<LeadPriority, Record<string, string>> = {
    HIGH: { de: 'Hohe Priorität', en: 'High Priority' },
    MEDIUM: { de: 'Mittlere Priorität', en: 'Medium Priority' },
    LOW: { de: 'Niedrige Priorität', en: 'Low Priority' },
  };
  return labels[priority][lang] ?? labels[priority].en;
}

// ─── CANONICAL EVENT QUERY HELPERS ──────────────────────────────────

/**
 * Count raw events grouped by canonical event type.
 * Use this instead of counting raw event aliases directly in dashboards.
 *
 * @param events - Array of objects with an event_type or event_name field
 * @returns Counts keyed by canonical event name
 */
export function countCanonicalEvents(
  events: Array<{ event_type?: string; event_name?: string }>,
): Record<CanonicalEvent, number> {
  const counts: Record<CanonicalEvent, number> = {
    lead_created: 0,
    quiz_completed: 0,
    qualified_reachable: 0,
    booked: 0,
    showed: 0,
    closed_won: 0,
  };

  for (const e of events) {
    const raw = e.event_type ?? e.event_name ?? '';
    const canonical = getCanonicalEventType(raw);
    if (canonical) counts[canonical]++;
  }

  return counts;
}

/**
 * Group leads by canonical priority using the decision engine.
 * Returns counts and lead IDs per priority bucket.
 */
export function groupByPriority(
  leads: Record<string, any>[],
): Record<LeadPriority, { count: number; leadIds: string[] }> {
  const groups: Record<LeadPriority, { count: number; leadIds: string[] }> = {
    HIGH: { count: 0, leadIds: [] },
    MEDIUM: { count: 0, leadIds: [] },
    LOW: { count: 0, leadIds: [] },
  };

  for (const lead of leads) {
    const { priority } = computeCanonicalDecision(lead);
    groups[priority].count++;
    if (lead.id) groups[priority].leadIds.push(lead.id);
  }

  return groups;
}

/**
 * Group leads by canonical stage.
 */
export function groupByStage(
  leads: Record<string, any>[],
): Record<CanonicalStage, number> {
  const groups: Record<CanonicalStage, number> = {
    new: 0, booked: 0, showed: 0, closed: 0,
  };

  for (const lead of leads) {
    const stage = toCanonicalStage(lead.conversion_state ?? lead.stage);
    groups[stage]++;
  }

  return groups;
}

// ── Canonical Display Helpers ──────────────────────────────────────

/**
 * Map canonical LeadQuality → display heat label.
 * Dashboards MUST use this instead of inline score thresholds.
 */
export type CanonicalHeat = 'hot' | 'warm' | 'cold';

export function getCanonicalHeat(lead: Record<string, any>): CanonicalHeat {
  const q = deriveLeadQuality(lead);
  return q === 'high' ? 'hot' : q === 'mid' ? 'warm' : 'cold';
}

export function getHeatDisplay(heat: CanonicalHeat): { label: string; emoji: string; color: string } {
  switch (heat) {
    case 'hot': return { label: '🔥 Hot', emoji: '🔥', color: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30' };
    case 'warm': return { label: '🟡 Warm', emoji: '🟡', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' };
    case 'cold': return { label: '🔵 Cold', emoji: '🔵', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30' };
  }
}

/**
 * Map old A/B/C quality grades to canonical LeadQuality.
 * Use in dashboards that previously displayed A/B/C from score-lead edge fn.
 */
export function mapLegacyQualityGrade(grade: string | null | undefined): LeadQuality {
  if (grade === 'A') return 'high';
  if (grade === 'B') return 'mid';
  return 'low';
}

export function getQualityDisplay(quality: LeadQuality): { label: string; color: string; bgClass: string; textClass: string } {
  switch (quality) {
    case 'high': return { label: 'High', color: 'green', bgClass: 'border-green-500/30 bg-green-500/5', textClass: 'text-green-600' };
    case 'mid': return { label: 'Mid', color: 'amber', bgClass: 'border-amber-500/30 bg-amber-500/5', textClass: 'text-amber-600' };
    case 'low': return { label: 'Low', color: 'gray', bgClass: 'border-muted/30 bg-muted/5', textClass: 'text-muted-foreground' };
  }
}

/**
 * Canonical no-show risk check for SmartAlerts / dashboards.
 * Use deriveAttendanceRisk() instead of inline total_no_shows thresholds.
 */
export function isHighRiskAppointment(lead: Record<string, any>): boolean {
  return deriveAttendanceRisk(lead) === 'high';
}

export function getRiskSeverity(lead: Record<string, any>): 'critical' | 'warning' | 'ok' {
  const risk = deriveAttendanceRisk(lead);
  return risk === 'high' ? 'critical' : risk === 'mid' ? 'warning' : 'ok';
}
