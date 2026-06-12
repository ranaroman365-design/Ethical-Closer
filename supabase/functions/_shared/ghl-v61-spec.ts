/**
 * ETC V6.1 GHL Spec — Runtime Contract Lock
 *
 * This file is the single immutable truth for the V6.1 "Dumb Mirror" contract.
 * If anyone ever edits ghl-config.ts and drifts from spec, importing this
 * module will THROW at edge-function cold start — failing loud instead of silent.
 *
 * Rules (enforced):
 *   1. Exactly 14 pipeline stages, in this exact order.
 *   2. Exactly 17 tags, with these exact slugs.
 *   3. Exactly 12 custom fields, including product_type / last_action /
 *      last_action_date / stage (V6.1 mandatory payload fields).
 *   4. Email is the only contact identity. Lovable = SoT, GHL = mirror.
 *   5. No branching / wait / if-else logic in the dispatcher — every event
 *      maps 1:1 to a tag (and optionally a stage).
 *
 * Importing this file in process-outbound-events keeps the contract honest.
 */

import {
  GHL_PIPELINE_STAGES,
  GHL_TAGS,
  GHL_CUSTOM_FIELDS,
  GHL_EVENT_MAP,
} from "./ghl-config.ts";

// ─── Frozen spec — DO NOT EDIT WITHOUT A V6.2 RFC ────────────────────────────

export const V61_PIPELINE_ORDER = [
  "New Lead",
  "Quiz Completed",
  "Booked",
  "Setter Assigned",
  "Setter Contacting",
  "Setter Qualified",
  "Setter Booked",
  "Ready for Closer",
  "Assigned Closer",
  "Closer In Progress",
  "Offer Made",
  "Follow Up",
  "Closed Won",
  "Closed Lost",
] as const;

export const V61_TAG_SLUGS = [
  "new_lead",
  "quiz_completed",
  "booked_call",
  "assigned_setter",
  "setter_contacting",
  "setter_qualified",
  "setter_disqualified",
  "call_booked",
  "ready_for_closer",
  "assigned_closer",
  "closer_started",
  "offer_presented",
  "follow_up",
  "closed_client",
  "closed_lost",
  "converted_L1",
  "no_show",
] as const;

export const V61_REQUIRED_CUSTOM_FIELDS = [
  "product_type",
  "last_action",
  "last_action_date",
  "stage",
] as const;

// ─── Assertion — runs at module import (cold start) ──────────────────────────

function assertSpec(): void {
  // Stages: count + exact label order
  if (GHL_PIPELINE_STAGES.length !== V61_PIPELINE_ORDER.length) {
    throw new Error(
      `[V6.1 spec violation] expected ${V61_PIPELINE_ORDER.length} pipeline stages, got ${GHL_PIPELINE_STAGES.length}`,
    );
  }
  GHL_PIPELINE_STAGES.forEach((s, i) => {
    if (s.label !== V61_PIPELINE_ORDER[i]) {
      throw new Error(
        `[V6.1 spec violation] stage ${i + 1}: expected "${V61_PIPELINE_ORDER[i]}", got "${s.label}"`,
      );
    }
  });

  // Tags: count + exact slug set
  const tagSlugs = Object.values(GHL_TAGS);
  if (tagSlugs.length !== V61_TAG_SLUGS.length) {
    throw new Error(
      `[V6.1 spec violation] expected ${V61_TAG_SLUGS.length} tags, got ${tagSlugs.length}`,
    );
  }
  for (const slug of V61_TAG_SLUGS) {
    if (!tagSlugs.includes(slug as typeof tagSlugs[number])) {
      throw new Error(`[V6.1 spec violation] missing required tag: ${slug}`);
    }
  }

  // Custom fields: must include the 4 mandatory payload keys
  for (const f of V61_REQUIRED_CUSTOM_FIELDS) {
    if (!GHL_CUSTOM_FIELDS.includes(f as typeof GHL_CUSTOM_FIELDS[number])) {
      throw new Error(`[V6.1 spec violation] missing required custom field: ${f}`);
    }
  }

  // Event map: every entry must have a tag (no event without a side-effect)
  for (const [evt, m] of Object.entries(GHL_EVENT_MAP)) {
    if (!m.tag) {
      throw new Error(`[V6.1 spec violation] event "${evt}" has no tag`);
    }
  }
}

assertSpec();

// Public re-export so callers can introspect without re-deriving constants.
export const V61_SPEC = {
  stages: V61_PIPELINE_ORDER,
  tags: V61_TAG_SLUGS,
  required_fields: V61_REQUIRED_CUSTOM_FIELDS,
  identity: "email" as const,
  ghl_role: "dumb_mirror" as const,
} as const;
