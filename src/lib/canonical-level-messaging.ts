/**
 * Layer 30 — Level-Based Messaging Engine (Canon)
 *
 * Constitutional position:
 *   Block:        Conversion (primary) + Value + Governance
 *   Governing:    Layer 12 (Operational Canon) for events,
 *                 Layer 18/19/20 for level lifecycle truth,
 *                 Layer 23 (Channel Abstraction) for delivery.
 *
 * Purpose:
 *   Deterministic mapping of (level, message_type) -> message spec.
 *   Drives onboarding, progression, promotion and retention messages
 *   for users along the L0 -> L8 lifecycle.
 *
 * Hard rules:
 *   1. One template per (level, message_type, trigger_event) — no duplicates.
 *   2. 4 message types only: onboarding | progress | promotion | warning.
 *   3. 5 trigger events only: level_entered | inactivity_detected |
 *      milestone_reached | upgrade_available | drop_off_detected.
 *   4. Channel cascade respects Layer 23 (SMS > WhatsApp > Email > In-App > Voice).
 *   5. Silent until both global AND per-operator opt-in.
 *   6. L5 and below have no admin access to this layer.
 *   7. L6+ may override only inside their own funnel scope.
 *   8. Admin-defined templates always win over operator overrides for warnings.
 */

export const LEVEL_MESSAGING_LAYER_ID = 30 as const;

export const LEVEL_MESSAGE_TYPES = [
  "onboarding",
  "progress",
  "promotion",
  "warning",
] as const;
export type LevelMessageType = (typeof LEVEL_MESSAGE_TYPES)[number];

export const LEVEL_MESSAGE_TRIGGERS = [
  "level_entered",
  "inactivity_detected",
  "milestone_reached",
  "upgrade_available",
  "drop_off_detected",
] as const;
export type LevelMessageTrigger = (typeof LEVEL_MESSAGE_TRIGGERS)[number];

export const LEVEL_MESSAGE_CHANNELS = [
  "sms",
  "whatsapp",
  "email",
  "voice",
  "in_app",
] as const;
export type LevelMessageChannel = (typeof LEVEL_MESSAGE_CHANNELS)[number];

export const LEVEL_MESSAGE_LEVELS = [
  "L0",
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "L6",
  "L7",
  "L8",
] as const;
export type LevelMessageLevel = (typeof LEVEL_MESSAGE_LEVELS)[number];

export interface LevelMessageSpec {
  template_key: string;
  level: LevelMessageLevel;
  message_type: LevelMessageType;
  trigger_event: LevelMessageTrigger;
  channel: LevelMessageChannel;
  timing: "immediate" | "delayed" | "event_based";
  delay_minutes?: number;
}

/**
 * Phase 1: deterministic guard — confirms a (level, message_type) combo
 * is allowed by canon. Used by edge stubs and admin UI before sends.
 */
export function isAllowedLevelMessage(
  level: string,
  messageType: string,
): boolean {
  return (
    (LEVEL_MESSAGE_LEVELS as readonly string[]).includes(level) &&
    (LEVEL_MESSAGE_TYPES as readonly string[]).includes(messageType)
  );
}

/**
 * Audit gate. Returns problems found in a template list.
 */
export function auditLevelMessageTemplates(
  templates: Array<Pick<LevelMessageSpec, "level" | "message_type" | "trigger_event">>,
): string[] {
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const t of templates) {
    if (!isAllowedLevelMessage(t.level, t.message_type)) {
      problems.push(`Invalid (level, message_type) combo: ${t.level}/${t.message_type}`);
      continue;
    }
    const key = `${t.level}|${t.message_type}|${t.trigger_event}`;
    if (seen.has(key)) {
      problems.push(`Duplicate template for ${key}`);
    }
    seen.add(key);
  }
  return problems;
}
