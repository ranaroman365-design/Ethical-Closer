/**
 * Layer 31 — Unified Message Library (Registry Canon)
 *
 * Constitutional position:
 *   Block:        Foundation (primary) + Conversion + Governance
 *   Governing:    Canon Constitution v1 (single source of truth principle)
 *   Supersedes:   template tables in Layer 27/28/29/30 (kept for backward
 *                 compat, will be migrated in Phase 2).
 *
 * Purpose:
 *   Single registry table for ALL outbound message templates.
 *   A/B-ready via variant_key + variant_weight.
 *   Per-operator overrides via scope='operator'.
 *
 * Hard rules:
 *   1. 10 phases only — additions require canon update.
 *   2. 8 triggers only — must align with canonical-events.ts.
 *   3. 5 channels only — respects Layer 23 (Channel Abstraction).
 *   4. Variant weights for one (template_key, scope, scope_*) MUST sum to 100.
 *   5. Birthday messages: opt-in only (profiles.birthday_message_opt_in).
 *   6. Silent until message_library_settings.enabled=true (global) AND
 *      per-operator opt-in for operator-scoped templates.
 *   7. L5 and below: no read/write. L6+: read global + write own scope.
 */

export const MESSAGE_LIBRARY_LAYER_ID = 31 as const;

export const MESSAGE_PHASES = [
  "lead_activation",
  "pre_booking",
  "post_booking",
  "attendance",
  "no_show",
  "reactivation",
  "level_progression",
  "promotion",
  "retention",
  "special_events",
] as const;
export type MessagePhase = (typeof MESSAGE_PHASES)[number];

export const MESSAGE_TRIGGERS = [
  "lead_created",
  "inactivity",
  "time_delay",
  "appointment_booked",
  "no_show",
  "level_entered",
  "upgrade_available",
  "birthday",
] as const;
export type MessageTrigger = (typeof MESSAGE_TRIGGERS)[number];

export const MESSAGE_CHANNELS = [
  "sms",
  "whatsapp",
  "email",
  "voice",
  "in_app",
  "web_push",
  "mobile_push",
] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_SCOPES = ["global", "funnel", "operator"] as const;
export type MessageScope = (typeof MESSAGE_SCOPES)[number];

export interface MessageLibraryEntry {
  template_key: string;
  phase: MessagePhase;
  trigger_event: MessageTrigger;
  channel: MessageChannel;
  scope: MessageScope;
  variant_key: string;
  variant_weight: number;
  active: boolean;
}

/**
 * Deterministic variant picker. Returns variant_key based on weighted draw.
 * Sum of weights does NOT need to be 100 — function normalizes.
 */
export function pickVariant<T extends { variant_key: string; variant_weight: number }>(
  variants: T[],
  seed: number = Math.random(),
): T | null {
  const active = variants.filter((v) => v.variant_weight > 0);
  if (active.length === 0) return null;
  const total = active.reduce((s, v) => s + v.variant_weight, 0);
  if (total === 0) return null;
  let acc = 0;
  const target = seed * total;
  for (const v of active) {
    acc += v.variant_weight;
    if (target <= acc) return v;
  }
  return active[active.length - 1];
}

/**
 * Render template body — replaces {{var}} placeholders. React-safe (no eval).
 */
export function renderBody(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

/**
 * Audit gate. Returns problems found in a list of registry entries.
 */
export function auditMessageLibrary(entries: MessageLibraryEntry[]): string[] {
  const problems: string[] = [];
  // Group by (template_key, scope, scope_operator_id) and check variant sum
  const groups = new Map<string, MessageLibraryEntry[]>();
  for (const e of entries) {
    const k = `${e.template_key}|${e.scope}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  for (const [k, list] of groups) {
    if (list.length === 1) continue;
    const sum = list.reduce((s, v) => s + v.variant_weight, 0);
    if (sum !== 100) {
      problems.push(
        `Variant weights for ${k} sum to ${sum}, expected 100. Variants: ${list
          .map((v) => `${v.variant_key}=${v.variant_weight}`)
          .join(", ")}`,
      );
    }
  }
  return problems;
}
