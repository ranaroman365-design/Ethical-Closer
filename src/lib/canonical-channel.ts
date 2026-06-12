/**
 * ═══════════════════════════════════════════════════════════════════════
 * ETC CANONICAL CHANNEL ABSTRACTION (Hardwired)
 * Layer 23 — Communication Trigger / Message / Channel Separation
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Source of truth for HOW the system communicates.
 *
 * Closes the audit's Communication-mixing risk by FORMALLY separating the
 * three concerns that must never be conflated:
 *
 *   TRIGGER  — WHEN  (the event/condition that fires the communication)
 *   MESSAGE  — WHAT  (one purpose, one CTA, one outcome)
 *   CHANNEL  — WHERE (delivery medium, with cascade)
 *
 * HARD RULES:
 *   ❌ A communication may NEVER mix two purposes in one MessageSpec.
 *   ❌ A trigger may NEVER directly reference a channel — it only emits a
 *      MessageSpec that resolves channels via the cascade.
 *   ❌ A channel may NEVER inject business logic — it transports only.
 *   ✅ Every outbound communication MUST resolve through:
 *      Trigger → MessageSpec → ChannelCascade → Delivery
 *
 * Block:        Foundation (primary) · Conversion · Value (supporting)
 * Constitution: governed by `canon-constitution`
 * Loop integration: feeds `execution-loop-canon-v2` Communication slot
 *
 * Spec:   docs/canonical-channel.md
 * Memory: mem://architecture/canonical-channel
 * Siblings:
 *   - src/lib/canonical-events.ts         (trigger event names)
 *   - src/lib/canonical-reactivation.ts   (consumer: every stage emits a MessageSpec)
 *   - src/lib/execution-loop-canon.ts     (consumer: Communication layer)
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { CanonicalEventName } from './canonical-events';

// ─── 1. TRIGGER — WHEN ──────────────────────────────────────────────────
// A trigger is a typed condition. It NEVER chooses a channel directly.

export type TriggerKind =
  | 'event'        // canonical event fired
  | 'time'         // absolute or relative time reached (T-24h, T-2h…)
  | 'inactivity'   // no qualifying event within window
  | 'kpi_breach';  // metric crossed threshold

export interface TriggerSpec {
  /** Stable id used in audit logs and outbound_events.metadata.trigger_id */
  readonly id: string;
  readonly kind: TriggerKind;
  /** Required when kind = 'event' */
  readonly event?: CanonicalEventName;
  /** Required when kind = 'time' — minutes before/after a reference event (negative = before) */
  readonly offset_minutes?: number;
  /** Required when kind = 'inactivity' — days of silence */
  readonly inactivity_days?: number;
  /** Required when kind = 'kpi_breach' — KPI key from operational-canon */
  readonly kpi_key?: string;
  /** Human-readable note for audits */
  readonly description: string;
}

// ─── 2. MESSAGE — WHAT ──────────────────────────────────────────────────
// One purpose, one CTA. No multi-purpose messages.

export type MessagePurpose =
  | 'reminder'
  | 'reactivation'
  | 'urgency'
  | 'encouragement'
  | 'correction'
  | 'escalation'
  | 'confirmation';

export interface MessageSpec {
  /** Stable id, written to outbound_events.metadata.message_id */
  readonly id: string;
  /** EXACTLY ONE purpose — enforced by the audit gate */
  readonly purpose: MessagePurpose;
  /** Single dominant CTA. No alternative paths. */
  readonly primary_cta: string;
  /** Template key resolved by the renderer (e.g. email template id) */
  readonly template_key: string;
  /** Locale-aware variants supported by the renderer (DE/EN minimum) */
  readonly locales: readonly ('de' | 'en')[];
}

// ─── 3. CHANNEL — WHERE ─────────────────────────────────────────────────
// Transport only. No logic. Cascade order is fixed per ChannelCascade.

export type Channel =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'in_app'
  | 'mentor_intervention'
  | 'admin_escalation';

export interface ChannelCascade {
  /** Ordered list of channels — first successful delivery wins */
  readonly order: readonly Channel[];
  /** Optional fallback to a different MessageSpec id if entire cascade fails */
  readonly fallback_message_id?: string;
}

// ─── 4. COMMUNICATION SPEC — the only legal composition ────────────────
// A CommunicationSpec is the indivisible unit. Anything outside this shape
// is a canon violation.

export interface CommunicationSpec {
  readonly id: string;
  readonly trigger: TriggerSpec;
  readonly message: MessageSpec;
  readonly channels: ChannelCascade;
  /** Time horizon per execution-loop-canon-v2 */
  readonly time_horizon: 'immediate' | 'short_term' | 'long_term';
}

// ─── 5. AUDIT GATE ──────────────────────────────────────────────────────

export function auditCommunicationSpec(spec: CommunicationSpec): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const t = spec.trigger;

  // Trigger validation
  if (t.kind === 'event' && !t.event) errors.push(`${spec.id}: event trigger missing event`);
  if (t.kind === 'time' && t.offset_minutes === undefined)
    errors.push(`${spec.id}: time trigger missing offset_minutes`);
  if (t.kind === 'inactivity' && t.inactivity_days === undefined)
    errors.push(`${spec.id}: inactivity trigger missing inactivity_days`);
  if (t.kind === 'kpi_breach' && !t.kpi_key)
    errors.push(`${spec.id}: kpi_breach trigger missing kpi_key`);

  // Message validation
  if (!spec.message.primary_cta || spec.message.primary_cta.trim() === '')
    errors.push(`${spec.id}: message missing primary_cta`);
  if (spec.message.locales.length === 0)
    errors.push(`${spec.id}: message must declare at least one locale`);

  // Channel validation
  if (spec.channels.order.length === 0)
    errors.push(`${spec.id}: channel cascade must have at least one channel`);
  const seen = new Set<string>();
  for (const c of spec.channels.order) {
    if (seen.has(c)) errors.push(`${spec.id}: duplicate channel ${c} in cascade`);
    seen.add(c);
  }

  return { ok: errors.length === 0, errors };
}

export function auditCommunicationSpecs(
  specs: readonly CommunicationSpec[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const spec of specs) {
    if (ids.has(spec.id)) errors.push(`Duplicate CommunicationSpec id: ${spec.id}`);
    ids.add(spec.id);
    const r = auditCommunicationSpec(spec);
    errors.push(...r.errors);
  }
  return { ok: errors.length === 0, errors };
}

// ─── 6. CANONICAL CASCADES — reusable templates ─────────────────────────
// Use these instead of redefining channel orders inline. New cascades
// require a canon update, not an inline override.

export const CASCADES = Object.freeze({
  EMAIL_FIRST:        { order: ['email', 'sms'] as readonly Channel[] },
  SMS_FIRST:          { order: ['sms', 'whatsapp', 'email'] as readonly Channel[] },
  IN_APP_FIRST:       { order: ['in_app', 'email'] as readonly Channel[] },
  URGENT_MULTI:       { order: ['sms', 'whatsapp', 'email', 'in_app'] as readonly Channel[] },
  MENTOR_ESCALATION:  { order: ['mentor_intervention'] as readonly Channel[] },
  ADMIN_ESCALATION:   { order: ['admin_escalation'] as readonly Channel[] },
}) satisfies Readonly<Record<string, ChannelCascade>>;
