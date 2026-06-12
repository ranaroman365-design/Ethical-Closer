/**
 * Layer 26 — Lead Lifecycle Touchpoint System (Pre-Booking)
 *
 * Constitutional position:
 *   Block:        Acquisition (primary) + Conversion + Governance
 *   Governing:    Canon Constitution v1
 *   Composes:     Layer 31 (Message Library) for content,
 *                 Layer 23 (Channel Abstraction) for delivery,
 *                 Layer 25 (Capacity Control) for safety,
 *                 outbound_events for execution log.
 *
 * Purpose:
 *   Defines the deterministic schedule of touchpoints sent to a lead
 *   between `lead_created` and `appointment_booked`. Pure spec — no
 *   new sender, no new template store. Each touchpoint resolves to a
 *   message_library row via (phase, trigger, scope).
 *
 * Hard rules:
 *   1. 8 fixed steps only — additions require canon update.
 *   2. Stops on: appointment_booked | unsubscribe | do_not_contact | hard_bounce.
 *   3. Skips when: quiet_hours active | consent missing | active_sequence_lock present.
 *   4. Default OFF (lead_lifecycle_enabled=false). Test mode logs only.
 *   5. Per-funnel override allowed within admin guardrails (min_delay, max_attempts).
 */

export const LEAD_LIFECYCLE_LAYER_ID = 26 as const;

export interface LifecycleStep {
  readonly id: string;
  readonly offset_minutes: number;
  readonly purpose: string;
  readonly default_channel: "email" | "sms" | "whatsapp" | "in_app";
  readonly message_template_key: string; // resolves in message_library
  readonly active_default: boolean;
}

export const LIFECYCLE_STEPS: readonly LifecycleStep[] = [
  {
    id: "lc_immediate",
    offset_minutes: 0,
    purpose: "Welcome + reinforce decision + 1-tap booking link",
    default_channel: "email",
    message_template_key: "lifecycle.immediate.welcome",
    active_default: true,
  },
  {
    id: "lc_15min",
    offset_minutes: 15,
    purpose: "Soft nudge if no quiz progress / no booking",
    default_channel: "sms",
    message_template_key: "lifecycle.t15m.nudge",
    active_default: true,
  },
  {
    id: "lc_2_4h",
    offset_minutes: 180,
    purpose: "Reframe outcome, link to booking",
    default_channel: "email",
    message_template_key: "lifecycle.t3h.reframe",
    active_default: true,
  },
  {
    id: "lc_24h",
    offset_minutes: 24 * 60,
    purpose: "Day 1 reminder + objection pre-handle",
    default_channel: "email",
    message_template_key: "lifecycle.d1.reminder",
    active_default: true,
  },
  {
    id: "lc_d2",
    offset_minutes: 2 * 24 * 60,
    purpose: "Proof element (case study / numbers)",
    default_channel: "email",
    message_template_key: "lifecycle.d2.proof",
    active_default: true,
  },
  {
    id: "lc_d3",
    offset_minutes: 3 * 24 * 60,
    purpose: "Direct ask: book or opt out",
    default_channel: "sms",
    message_template_key: "lifecycle.d3.direct_ask",
    active_default: true,
  },
  {
    id: "lc_d7",
    offset_minutes: 7 * 24 * 60,
    purpose: "Re-engagement — new angle",
    default_channel: "email",
    message_template_key: "lifecycle.d7.reengage",
    active_default: false,
  },
  {
    id: "lc_d14",
    offset_minutes: 14 * 24 * 60,
    purpose: "Long-tail revival",
    default_channel: "email",
    message_template_key: "lifecycle.d14.revive",
    active_default: false,
  },
  {
    id: "lc_d30",
    offset_minutes: 30 * 24 * 60,
    purpose: "Final touch before cohort hand-off to Layer 22 reactivation",
    default_channel: "email",
    message_template_key: "lifecycle.d30.final",
    active_default: false,
  },
] as const;

export const LIFECYCLE_TERMINATORS = [
  "appointment_booked",
  "unsubscribe",
  "do_not_contact",
  "hard_bounce",
] as const;
export type LifecycleTerminator = (typeof LIFECYCLE_TERMINATORS)[number];

export const LIFECYCLE_GUARDRAILS = {
  min_delay_minutes_between_messages: 15,
  max_messages_per_lead_per_24h: 2,
  respects_quiet_hours: true,
  respects_capacity: true,
  default_enabled: false,
} as const;

export function getLifecycleStep(id: string): LifecycleStep | undefined {
  return LIFECYCLE_STEPS.find((s) => s.id === id);
}

export function isLifecycleTerminator(event: string): event is LifecycleTerminator {
  return (LIFECYCLE_TERMINATORS as readonly string[]).includes(event);
}
