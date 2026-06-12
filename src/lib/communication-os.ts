/**
 * Layer 48 — Communication Operating System (CANONICAL)
 *
 * Orchestrates ALL outbound messages across 4 channels into a coherent system.
 * Each event has exactly ONE primary channel + optional fallback (Hard-Fail only).
 * Each message belongs to ONE purpose: attention | action | documentation | reinforcement.
 *
 * This is the single source of truth for "which channel for which event".
 * Sits ABOVE Layer 23 (Channel Abstraction), Layer 31 (Message Library),
 * Layer 43 (Email), Layer 44 (Push), Layer 45 (Communication Canon).
 *
 * IMPORTANT: Do not bypass routeMessage() to send manually — every send must
 * flow through dispatch-communication so dedup, fallback, and logging apply.
 */

export type CommChannel = "whatsapp" | "sms" | "push" | "email";
export type CommPurpose = "attention" | "action" | "documentation" | "reinforcement";
export type CommPhase =
  | "lead_entry"
  | "booking"
  | "pre_call"
  | "call"
  | "post_call"
  | "onboarding"
  | "talent_engine";

export interface TouchpointSpec {
  event_key: string;
  phase: CommPhase;
  purpose: CommPurpose;
  primary: CommChannel;
  /** Only triggered on Hard-Fail (4xx/5xx) of primary. null = no fallback. */
  fallback: CommChannel | null;
  /** Optional default message-library template key. */
  template_key?: string;
  /** Human-readable why this channel was chosen. */
  rationale: string;
  /** Optional timing in minutes relative to a reference event (e.g. -1440 = 24h before call). */
  timing_minutes?: number;
}

/**
 * CHANNEL ROLES (locked):
 *   WhatsApp = ACTION / REACTION  → primary for hot interactions & conversion
 *   SMS      = BACKUP / CRITICAL  → fallback only, ultra-short
 *   Push     = ATTENTION TRIGGER  → re-engagement, non-invasive
 *   Email    = DOCUMENTATION      → confirms reality, never sells
 */
export const CHANNEL_ROLES: Record<CommChannel, { role: string; character: string }> = {
  whatsapp: { role: "Action / Reaction", character: "direkt, kurz, handlungsorientiert" },
  sms: { role: "Backup / Critical Delivery", character: "ultra kurz, rein funktional" },
  push: { role: "Attention Trigger", character: "leicht, nicht invasiv, triggernd" },
  email: { role: "Documentation / Trust", character: "klar, ruhig, offiziell" },
};

/**
 * FULL TOUCHPOINT MATRIX — every outbound trigger lives here.
 * If you need to add a new event, add it here FIRST, then wire the sender.
 */
export const TOUCHPOINT_MATRIX: TouchpointSpec[] = [
  // PHASE 1 — LEAD ENTRY
  { event_key: "quiz_completed_hot",      phase: "lead_entry", purpose: "action",        primary: "whatsapp", fallback: "sms",   rationale: "Hot lead → direct human reaction window" },
  { event_key: "email_capture",           phase: "lead_entry", purpose: "documentation", primary: "email",    fallback: null,    rationale: "Confirm capture, build trust" },
  { event_key: "quiz_abandoned",          phase: "lead_entry", purpose: "attention",     primary: "push",     fallback: null,    rationale: "Re-engage without invasion" },

  // PHASE 2 — BOOKING
  { event_key: "booking_started",         phase: "booking",    purpose: "attention",     primary: "push",     fallback: null,    rationale: "Nudge to complete booking" },
  { event_key: "booking_completed_email", phase: "booking",    purpose: "documentation", primary: "email",    fallback: null,    rationale: "Receipt + calendar invite" },
  { event_key: "booking_completed_wa",    phase: "booking",    purpose: "action",        primary: "whatsapp", fallback: "sms",   rationale: "Personal welcome + expectation set" },
  { event_key: "booking_no_show_book",    phase: "booking",    purpose: "action",        primary: "whatsapp", fallback: "sms",   rationale: "Recovery — direct human follow-up" },

  // PHASE 3 — PRE-CALL
  { event_key: "pre_call_24h",            phase: "pre_call",   purpose: "reinforcement", primary: "whatsapp", fallback: "sms",   rationale: "Day-before commitment lock", timing_minutes: -1440 },
  { event_key: "pre_call_3h",             phase: "pre_call",   purpose: "reinforcement", primary: "whatsapp", fallback: "sms",   rationale: "Same-day final ramp",          timing_minutes: -180 },
  { event_key: "pre_call_30m",            phase: "pre_call",   purpose: "action",        primary: "whatsapp", fallback: "sms",   rationale: "Last-mile show-up trigger",    timing_minutes: -30 },

  // PHASE 4 — CALL
  { event_key: "call_no_show_recovery",   phase: "call",       purpose: "action",        primary: "whatsapp", fallback: "sms",   rationale: "Reschedule window — direct + personal" },

  // PHASE 5 — POST CALL
  { event_key: "post_call_qualified",     phase: "post_call",  purpose: "action",        primary: "whatsapp", fallback: "sms",   rationale: "Momentum — keep conversation in WA thread" },
  { event_key: "post_call_not_qualified", phase: "post_call",  purpose: "documentation", primary: "email",    fallback: null,    rationale: "Calm, official — no pressure" },
  { event_key: "post_call_followup",      phase: "post_call",  purpose: "action",        primary: "whatsapp", fallback: "sms",   rationale: "Closer-driven follow-up cadence" },

  // PHASE 6 — ONBOARDING
  { event_key: "onboarding_accepted",     phase: "onboarding", purpose: "documentation", primary: "email",    fallback: null,    rationale: "Welcome + portal access proof" },
  { event_key: "onboarding_start",        phase: "onboarding", purpose: "action",        primary: "whatsapp", fallback: "sms",   rationale: "Behavior installation — direct line to mentor" },
  { event_key: "onboarding_day_1",        phase: "onboarding", purpose: "attention",     primary: "push",     fallback: null,    rationale: "Light nudge to continue" },

  // PHASE 7 — TALENT ENGINE
  { event_key: "level_start",             phase: "talent_engine", purpose: "action",        primary: "whatsapp", fallback: null, rationale: "Personal level-up signal" },
  { event_key: "talent_feedback",         phase: "talent_engine", purpose: "action",        primary: "whatsapp", fallback: null, rationale: "Coaching cadence" },
  { event_key: "promotion_email",         phase: "talent_engine", purpose: "documentation", primary: "email",    fallback: null, rationale: "Official record of promotion" },
  { event_key: "promotion_wa",            phase: "talent_engine", purpose: "reinforcement", primary: "whatsapp", fallback: null, rationale: "Emotional reinforcement of milestone" },
  { event_key: "underperformance_alert",  phase: "talent_engine", purpose: "action",        primary: "whatsapp", fallback: null, rationale: "Direct intervention" },
  { event_key: "mentoring_nudge",         phase: "talent_engine", purpose: "attention",     primary: "push",     fallback: null, rationale: "Gentle re-engagement" },

  // INTERNAL ADMIN
  { event_key: "hot_lead_alert_internal", phase: "lead_entry",    purpose: "attention",     primary: "whatsapp", fallback: null, rationale: "Internal operator alert — no fallback (admin already has push)" },
];

const MATRIX_BY_EVENT = new Map(TOUCHPOINT_MATRIX.map((t) => [t.event_key, t]));

export function getTouchpoint(event_key: string): TouchpointSpec | undefined {
  return MATRIX_BY_EVENT.get(event_key);
}

export interface RouteContext {
  user_id?: string | null;
  lead_id?: string | null;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  has_push_token?: boolean;
}

export interface RoutedMessage {
  spec: TouchpointSpec;
  primary: CommChannel;
  fallback: CommChannel | null;
  dedup_key: string;
  /** Available channels after recipient-data check. */
  resolved_recipient: { channel: CommChannel; address: string } | null;
}

/**
 * Compute routing for an event. Pure function — no side effects.
 * The Edge Function `dispatch-communication` calls this then performs the send.
 */
export function routeMessage(event_key: string, ctx: RouteContext): RoutedMessage | null {
  const spec = MATRIX_BY_EVENT.get(event_key);
  if (!spec) return null;

  const subject_id = ctx.user_id ?? ctx.lead_id ?? ctx.recipient_email ?? ctx.recipient_phone ?? "anon";
  const dedup_key = `${event_key}:${subject_id}`;

  const resolve = (ch: CommChannel): { channel: CommChannel; address: string } | null => {
    if (ch === "email" && ctx.recipient_email) return { channel: "email", address: ctx.recipient_email };
    if ((ch === "whatsapp" || ch === "sms") && ctx.recipient_phone) return { channel: ch, address: ctx.recipient_phone };
    if (ch === "push" && ctx.has_push_token && ctx.user_id) return { channel: "push", address: ctx.user_id };
    return null;
  };

  const resolved = resolve(spec.primary) ?? (spec.fallback ? resolve(spec.fallback) : null);

  return {
    spec,
    primary: spec.primary,
    fallback: spec.fallback,
    dedup_key,
    resolved_recipient: resolved,
  };
}

export const COMMUNICATION_OS_VERSION = "v1.0.0";
