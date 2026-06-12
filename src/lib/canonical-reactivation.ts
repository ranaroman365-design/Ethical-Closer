/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC CANONICAL REACTIVATION REGISTRY (Hardwired)
 * Layer 22 — Retention / Reactivation Canon
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for HOW the system reacts to inactivity.
 * Closes the LTV loop: every silent drop-off has a deterministic trigger,
 * a single message purpose, a single channel-cascade, and a recovery path
 * with a hard escalation cap.
 *
 * Why this exists:
 *   - Audit (Part 6) flagged Retention as the biggest LTV lever still open.
 *   - Inactivity events (INACTIVE_3D / INACTIVE_7D) existed in the event
 *     dictionary but had no canonical action map → silent drift.
 *
 * HARD RULES:
 *   ❌ No reactivation outside this registry
 *   ❌ No new inactivity windows without a registered stage
 *   ❌ No infinite retry — every stage caps at max_attempts → escalate or terminate
 *   ✅ Every stage maps Trigger → Message Purpose → Channel → Action → Recovery
 *
 * Block:        Value (primary) · Governance (supporting)
 * Loop mode:    'recovery'  (per execution-loop-canon-v2)
 * Time horizon: 'short_term' (3d–14d) and 'long_term' (30d+)
 *
 * Spec:   docs/canonical-reactivation.md
 * Memory: mem://architecture/canonical-reactivation
 * Sibling registries:
 *   - src/lib/canonical-events.ts        (event names)
 *   - src/lib/canonical-thresholds.ts    (numeric windows)
 *   - src/lib/execution-loop-canon.ts    (loop mechanics)
 * ═══════════════════════════════════════════════════════════════════════
 */

import { EVENTS, type CanonicalEventName } from './canonical-events';

// ─── Types (mirror execution-loop-canon vocabulary) ─────────────────────

export type ReactivationCohort =
  | 'lead_no_quiz'        // lead created, never started quiz
  | 'quiz_no_booking'     // quiz completed, never booked
  | 'booked_no_show'      // booked, missed call (handled mostly by rescue)
  | 'community_idle'      // community member, no activity
  | 'member_idle'         // L1+ member, KPI silence
  | 'closed_won_idle';    // converted, but no first execution

export type MessagePurpose =
  | 'reminder'
  | 'reactivation'
  | 'encouragement'
  | 'urgency'
  | 'escalation';

export type Channel =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'in_app'
  | 'mentor_intervention';

export type ReactivationOutcome =
  | 'engaged'             // user took the next action → exit loop
  | 'still_silent'        // no response → next stage
  | 'opted_out'           // explicit ignore → terminate
  | 'escalated';          // max attempts reached → handed to mentor/director

export interface ReactivationStage {
  /** Stable id, also written into outbound_events.metadata.stage_id */
  readonly id: string;
  /** Trigger window — references a canonical inactivity event */
  readonly trigger_event: CanonicalEventName;
  /** Days since last meaningful activity for this cohort */
  readonly inactivity_days: number;
  /** What the message is for — ONE purpose per stage */
  readonly purpose: MessagePurpose;
  /** Channel cascade, in order. First success wins. */
  readonly channels: readonly Channel[];
  /** Maximum send attempts at this stage before escalation */
  readonly max_attempts: number;
  /** Single dominant CTA — exactly one per stage */
  readonly cta: string;
  /** What success looks like (canonical event that exits the loop) */
  readonly success_event: CanonicalEventName;
  /** Where to go if this stage fails to engage */
  readonly on_failure: 'next_stage' | 'escalate' | 'terminate';
}

export interface ReactivationLoop {
  readonly cohort: ReactivationCohort;
  readonly description: string;
  readonly stages: readonly ReactivationStage[];
  /** Final escalation target if every stage fails */
  readonly terminal_action: 'archive' | 'mentor_intervention' | 'admin_review';
}

// ─── REGISTRY ───────────────────────────────────────────────────────────
// One loop per cohort. No cohort may have two loops. No stage may repeat
// a (cohort, inactivity_days) pair.

export const REACTIVATION_LOOPS: Readonly<Record<ReactivationCohort, ReactivationLoop>> =
  Object.freeze({
    lead_no_quiz: {
      cohort: 'lead_no_quiz',
      description: 'Lead captured but never started the quiz.',
      stages: [
        {
          id: 'lead_no_quiz.d2',
          trigger_event: EVENTS.INACTIVE_3D,
          inactivity_days: 2,
          purpose: 'reminder',
          channels: ['email', 'sms'],
          max_attempts: 1,
          cta: 'Quiz starten',
          success_event: EVENTS.QUIZ_STARTED,
          on_failure: 'next_stage',
        },
        {
          id: 'lead_no_quiz.d7',
          trigger_event: EVENTS.INACTIVE_7D,
          inactivity_days: 7,
          purpose: 'reactivation',
          channels: ['email'],
          max_attempts: 1,
          cta: 'Quiz starten',
          success_event: EVENTS.QUIZ_STARTED,
          on_failure: 'terminate',
        },
      ],
      terminal_action: 'archive',
    },

    quiz_no_booking: {
      cohort: 'quiz_no_booking',
      description: 'Quiz finished but no call booked. Highest-leverage cohort.',
      stages: [
        {
          id: 'quiz_no_booking.d1',
          trigger_event: EVENTS.INACTIVE_3D,
          inactivity_days: 1,
          purpose: 'urgency',
          channels: ['email', 'sms'],
          max_attempts: 1,
          cta: 'Call buchen',
          success_event: EVENTS.BOOKED,
          on_failure: 'next_stage',
        },
        {
          id: 'quiz_no_booking.d3',
          trigger_event: EVENTS.INACTIVE_3D,
          inactivity_days: 3,
          purpose: 'reactivation',
          channels: ['email', 'whatsapp'],
          max_attempts: 1,
          cta: 'Call buchen',
          success_event: EVENTS.BOOKED,
          on_failure: 'next_stage',
        },
        {
          id: 'quiz_no_booking.d7',
          trigger_event: EVENTS.INACTIVE_7D,
          inactivity_days: 7,
          purpose: 'reactivation',
          channels: ['email'],
          max_attempts: 1,
          cta: 'Community beitreten (€27)',
          success_event: EVENTS.COMMUNITY_JOINED,
          on_failure: 'terminate',
        },
      ],
      terminal_action: 'archive',
    },

    booked_no_show: {
      cohort: 'booked_no_show',
      description: 'Missed call. Owned by rescue flow first; this is the long-tail.',
      stages: [
        {
          id: 'booked_no_show.d3',
          trigger_event: EVENTS.INACTIVE_3D,
          inactivity_days: 3,
          purpose: 'reactivation',
          channels: ['email', 'sms'],
          max_attempts: 1,
          cta: 'Neuen Termin buchen',
          success_event: EVENTS.BOOKED,
          on_failure: 'next_stage',
        },
        {
          id: 'booked_no_show.d7',
          trigger_event: EVENTS.INACTIVE_7D,
          inactivity_days: 7,
          purpose: 'reactivation',
          channels: ['email'],
          max_attempts: 1,
          cta: 'Community beitreten (€27)',
          success_event: EVENTS.COMMUNITY_JOINED,
          on_failure: 'terminate',
        },
      ],
      terminal_action: 'archive',
    },

    community_idle: {
      cohort: 'community_idle',
      description: 'Community member with no path-progression for 7+ days.',
      stages: [
        {
          id: 'community_idle.d7',
          trigger_event: EVENTS.INACTIVE_7D,
          inactivity_days: 7,
          purpose: 'encouragement',
          channels: ['in_app', 'email'],
          max_attempts: 1,
          cta: 'Nächsten Schritt im Path öffnen',
          success_event: EVENTS.PATH_STEP_COMPLETED,
          on_failure: 'next_stage',
        },
        {
          id: 'community_idle.d14',
          trigger_event: EVENTS.INACTIVE_7D,
          inactivity_days: 14,
          purpose: 'urgency',
          channels: ['email', 'in_app'],
          max_attempts: 1,
          cta: 'Upgrade zum Hauptprogramm',
          success_event: EVENTS.UPGRADE_CLICKED,
          on_failure: 'next_stage',
        },
        {
          id: 'community_idle.d30',
          trigger_event: EVENTS.INACTIVE_7D,
          inactivity_days: 30,
          purpose: 'reactivation',
          channels: ['email'],
          max_attempts: 1,
          cta: 'Comeback-Angebot ansehen',
          success_event: EVENTS.UPGRADE_CONVERTED,
          on_failure: 'terminate',
        },
      ],
      terminal_action: 'archive',
    },

    member_idle: {
      cohort: 'member_idle',
      description: 'L1+ member with KPI silence — handled by mentor first, escalates to director.',
      stages: [
        {
          id: 'member_idle.d3',
          trigger_event: EVENTS.INACTIVE_3D,
          inactivity_days: 3,
          purpose: 'encouragement',
          channels: ['in_app'],
          max_attempts: 1,
          cta: 'Tägliche Execution starten',
          success_event: EVENTS.CALL_COMPLETED,
          on_failure: 'next_stage',
        },
        {
          id: 'member_idle.d7',
          trigger_event: EVENTS.INACTIVE_7D,
          inactivity_days: 7,
          purpose: 'escalation',
          channels: ['mentor_intervention'],
          max_attempts: 1,
          cta: 'Mentor-Check buchen',
          success_event: EVENTS.CALL_COMPLETED,
          on_failure: 'escalate',
        },
      ],
      terminal_action: 'mentor_intervention',
    },

    closed_won_idle: {
      cohort: 'closed_won_idle',
      description: 'Converted user but no first execution within 3 days.',
      stages: [
        {
          id: 'closed_won_idle.d3',
          trigger_event: EVENTS.INACTIVE_3D,
          inactivity_days: 3,
          purpose: 'encouragement',
          channels: ['in_app', 'email'],
          max_attempts: 1,
          cta: 'Onboarding fortsetzen',
          success_event: EVENTS.PATH_STEP_COMPLETED,
          on_failure: 'next_stage',
        },
        {
          id: 'closed_won_idle.d7',
          trigger_event: EVENTS.INACTIVE_7D,
          inactivity_days: 7,
          purpose: 'escalation',
          channels: ['mentor_intervention'],
          max_attempts: 1,
          cta: 'Mentor-Onboarding-Call',
          success_event: EVENTS.CALL_COMPLETED,
          on_failure: 'escalate',
        },
      ],
      terminal_action: 'mentor_intervention',
    },
  });

// ─── Lookup helpers ─────────────────────────────────────────────────────

/** Resolve the next due stage for a cohort given days of inactivity. */
export function nextReactivationStage(
  cohort: ReactivationCohort,
  inactiveDays: number,
): ReactivationStage | null {
  const loop = REACTIVATION_LOOPS[cohort];
  if (!loop) return null;
  // Pick the highest stage whose threshold has been reached.
  let due: ReactivationStage | null = null;
  for (const stage of loop.stages) {
    if (inactiveDays >= stage.inactivity_days) due = stage;
  }
  return due;
}

/** All stage ids — useful for outbound idempotency keys and audits. */
export const ALL_REACTIVATION_STAGE_IDS: readonly string[] = Object.freeze(
  Object.values(REACTIVATION_LOOPS).flatMap((l) => l.stages.map((s) => s.id)),
);

// ─── Audit gate (run in tests) ──────────────────────────────────────────

export function auditReactivationCanon(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const loop of Object.values(REACTIVATION_LOOPS)) {
    let lastDays = -1;
    for (const stage of loop.stages) {
      if (seen.has(stage.id)) errors.push(`Duplicate stage id: ${stage.id}`);
      seen.add(stage.id);
      if (stage.inactivity_days <= lastDays) {
        errors.push(`Stage ${stage.id} not strictly increasing in inactivity_days`);
      }
      lastDays = stage.inactivity_days;
      if (stage.max_attempts < 1) errors.push(`${stage.id}: max_attempts must be >= 1`);
      if (stage.channels.length === 0) errors.push(`${stage.id}: at least one channel required`);
    }
    const last = loop.stages[loop.stages.length - 1];
    if (last && last.on_failure === 'next_stage') {
      errors.push(`${loop.cohort}: terminal stage ${last.id} cannot have on_failure='next_stage'`);
    }
  }
  return { ok: errors.length === 0, errors };
}
