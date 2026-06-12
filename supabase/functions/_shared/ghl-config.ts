/**
 * ETC GHL Configuration — V6.1 FINAL (ID-based)
 *
 * This is the ONLY valid CRM execution mapping.
 * NO interpretation. NO renaming. NO deviation.
 *
 * Lovable = source of truth
 * GHL = execution layer (reacts to events only)
 *
 * Contact identity = EMAIL (unique, normalised: lowercase + trimmed)
 *
 * 17 tags, 17 workflows (1:1), 14 pipeline stages, 12 custom fields.
 * Single booking source: Lovable. Single no-show detector: Lovable.
 *
 * All GHL IDs are production values provided by the implementation team.
 */

import { PRODUCT_PREFIX } from "./product-config.ts";

// ─── GHL IDs (production) ───────────────────────────────────────────────────

export const GHL_PIPELINE_ID = "nAANvVvv2z5b6XQ08YYE";
export const GHL_LOCATION_ID = "Rjc9TYscI3xmUh9732K1";
export const GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
export const GHL_API_VERSION = "2021-07-28";

// ─── PIPELINE STAGES (14 stages, exact order, with GHL IDs) ─────────────────

export const GHL_PIPELINE_STAGES = [
  { order: 1,  key: "new_lead",           label: "New Lead",           ghl_id: "0daf4bf1-c279-4fbc-9a10-bdbfaf1eff44" },
  { order: 2,  key: "quiz_completed",     label: "Quiz Completed",     ghl_id: "d3a3fd7f-f6d7-437d-9fdd-55c67c2e1644" },
  { order: 3,  key: "booked",             label: "Booked",             ghl_id: "12c49cf3-60ff-4bc9-bfe0-8ab423b5d099" },
  { order: 4,  key: "setter_assigned",    label: "Setter Assigned",    ghl_id: "3f2cf5e8-8ea0-4a7c-8c58-b72b479e08c1" },
  { order: 5,  key: "setter_contacting",  label: "Setter Contacting",  ghl_id: "0d78f20a-b07d-4f85-b6c3-cc1954bb2178" },
  { order: 6,  key: "setter_qualified",   label: "Setter Qualified",   ghl_id: "50783adc-9248-4b3a-9f45-f015553da231" },
  { order: 7,  key: "setter_booked",      label: "Setter Booked",      ghl_id: "c1265d0a-71a5-424f-803b-a378fbc4cf4e" },
  { order: 8,  key: "ready_for_closer",   label: "Ready for Closer",   ghl_id: "317eb4fb-b304-4d1d-9415-712d6c1f3f2a" },
  { order: 9,  key: "assigned_closer",    label: "Assigned Closer",    ghl_id: "17293d25-efde-49b4-858c-1517223fab13" },
  { order: 10, key: "closer_in_progress", label: "Closer In Progress", ghl_id: "12da8cd8-bbf3-4c5a-8a48-098b0c2578dc" },
  { order: 11, key: "offer_made",         label: "Offer Made",         ghl_id: "cb9d2ca7-8ae0-4484-8b1b-5eaa1530072e" },
  { order: 12, key: "follow_up",          label: "Follow Up",          ghl_id: "59cc041a-4d11-435e-89b5-c0da8ee15934" },
  { order: 13, key: "closed_won",         label: "Closed Won",         ghl_id: "5216ba9a-2f8e-4a16-a36c-a06e08c5acb3" },
  { order: 14, key: "closed_lost",        label: "Closed Lost",        ghl_id: "fea992f8-15e0-4bb0-bb95-3313e5e14fe5" },
] as const;

export type GhlPipelineStage = (typeof GHL_PIPELINE_STAGES)[number]["key"];

// ─── SLUG → GHL RESOLVERS ──────────────────────────────────────────────────

const STAGE_KEY_TO_LABEL: Record<string, string> = Object.fromEntries(
  GHL_PIPELINE_STAGES.map((s) => [s.key, s.label]),
);

const STAGE_KEY_TO_ID: Record<string, string> = Object.fromEntries(
  GHL_PIPELINE_STAGES.map((s) => [s.key, s.ghl_id]),
);

/**
 * Resolve an internal stage key to the exact GHL pipeline stage label.
 * Returns undefined if the key has no GHL stage (e.g. setter_disqualified).
 */
export function resolveStageLabel(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return STAGE_KEY_TO_LABEL[key];
}

/** Resolve an internal stage key to its GHL stage ID. */
export function resolveStageId(key: string | null | undefined): string | undefined {
  if (!key) return undefined;
  return STAGE_KEY_TO_ID[key];
}

// ─── TAGS (exact ETC V6.1 — 17 tags with GHL IDs) ──────────────────────────

export const GHL_TAGS = {
  NEW_LEAD:            "new_lead",
  QUIZ_COMPLETED:      "quiz_completed",
  BOOKED_CALL:         "booked_call",
  ASSIGNED_SETTER:     "assigned_setter",
  SETTER_CONTACTING:   "setter_contacting",
  SETTER_QUALIFIED:    "setter_qualified",
  SETTER_DISQUALIFIED: "setter_disqualified",
  CALL_BOOKED:         "call_booked",
  READY_FOR_CLOSER:    "ready_for_closer",
  ASSIGNED_CLOSER:     "assigned_closer",
  CLOSER_STARTED:      "closer_started",
  OFFER_PRESENTED:     "offer_presented",
  FOLLOW_UP:           "follow_up",
  CLOSED_CLIENT:       "closed_client",
  CLOSED_LOST:         "closed_lost",
  CONVERTED_L1:        "converted_L1",
  NO_SHOW:             "no_show",
} as const;

/** Map tag name → GHL tag ID for API calls */
export const GHL_TAG_IDS: Record<string, string> = {
  new_lead:            "YIEQOxc7cHUU8UL0Gj9G",
  quiz_completed:      "S6M472Mf8f9bsncdizVt",
  booked_call:         "dKjJzOuba2OYg83uwupB",
  assigned_setter:     "cjtihfRHRbpwwyaulYxG",
  setter_contacting:   "lHvb9vEI66jOq9kIJitb",
  setter_qualified:    "nUvhC8bxUFH2UmNKNoXP",
  setter_disqualified: "evTeGweaM3xSNBS3r9wX",
  call_booked:         "GE3TnOfo6aFMRln69h4Y",
  ready_for_closer:    "CiMcnXgPL3ZINmW0XPGC",
  assigned_closer:     "mRuoHAjqLur1Q3waItb4",
  closer_started:      "cGOWl51EVqah7eufdlO1",
  offer_presented:     "iurWqAVkCtrTofHxcqGI",
  follow_up:           "7neB2jNB6eCgYls0r7sB",
  closed_client:       "K6O5m0io2gPZQwCJOuP6",
  closed_lost:         "684S8rR5qghAjskXCSrO",
  converted_L1:        "dmgKCJwpw6SbZMq5ACZW",
  no_show:             "KAWhr9XWDwMkWHYU6i8S",
};

/** Resolve a tag name to its GHL tag ID. */
export function resolveTagId(tagName: string | null | undefined): string | undefined {
  if (!tagName) return undefined;
  return GHL_TAG_IDS[tagName];
}

// ─── EVENT → TAG + WORKFLOW + STAGE (17 events, 1:1) ────────────────────────

export interface GhlEventMapping {
  tag: string | null;
  workflow: string;
  stage: GhlPipelineStage | null; // null = no stage move
  description: string;
  field_updates?: string[];
}

export const GHL_EVENT_MAP: Record<string, GhlEventMapping> = {
  // ── Lead Flow ──
  new_lead: {
    tag: GHL_TAGS.NEW_LEAD,
    workflow: "new_lead_workflow",
    stage: "new_lead",
    description: "New lead captured",
  },
  quiz_completed: {
    tag: GHL_TAGS.QUIZ_COMPLETED,
    workflow: "quiz_completed_workflow",
    stage: "quiz_completed",
    description: "Quiz/qualification completed",
  },
  booking_created: {
    tag: GHL_TAGS.BOOKED_CALL,
    workflow: "booking_created_workflow",
    stage: "booked",
    description: "Booking created — confirmation + reminders",
  },

  // ── Setter Flow ──
  lead_assigned: {
    tag: GHL_TAGS.ASSIGNED_SETTER,
    workflow: "lead_assigned_workflow",
    stage: "setter_assigned",
    description: "Lead assigned to setter",
    field_updates: ["setter_id"],
  },
  setter_contacting: {
    tag: GHL_TAGS.SETTER_CONTACTING,
    workflow: "setter_contacting_workflow",
    stage: "setter_contacting",
    description: "Setter is contacting lead",
  },
  setter_qualified: {
    tag: GHL_TAGS.SETTER_QUALIFIED,
    workflow: "setter_qualified_workflow",
    stage: "setter_qualified",
    description: "Setter qualified the lead",
  },
  setter_disqualified: {
    tag: GHL_TAGS.SETTER_DISQUALIFIED,
    workflow: "setter_disqualified_workflow",
    stage: null, // NO stage move per spec
    description: "Setter disqualified — no stage move, lead does not progress",
  },
  call_booked: {
    tag: GHL_TAGS.CALL_BOOKED,
    workflow: "call_booked_workflow",
    stage: "setter_booked",
    description: "Call booked by setter — moves to Setter Booked",
  },

  // ── Closer Flow ──
  moved_to_closer: {
    tag: GHL_TAGS.READY_FOR_CLOSER,
    workflow: "moved_to_closer_workflow",
    stage: "ready_for_closer",
    description: "Lead moved to closer queue",
  },
  lead_assigned_closer: {
    tag: GHL_TAGS.ASSIGNED_CLOSER,
    workflow: "lead_assigned_closer_workflow",
    stage: "assigned_closer",
    description: "Lead assigned to closer",
    field_updates: ["closer_id"],
  },
  closer_started: {
    tag: GHL_TAGS.CLOSER_STARTED,
    workflow: "closer_started_workflow",
    stage: "closer_in_progress",
    description: "Closer started working lead",
  },
  offer_presented: {
    tag: GHL_TAGS.OFFER_PRESENTED,
    workflow: "offer_presented_workflow",
    stage: "offer_made",
    description: "Offer presented to lead",
  },
  follow_up_scheduled: {
    tag: GHL_TAGS.FOLLOW_UP,
    workflow: "follow_up_scheduled_workflow",
    stage: "follow_up",
    description: "Follow-up scheduled",
  },

  // ── Outcome Flow ──
  deal_won: {
    tag: GHL_TAGS.CLOSED_CLIENT,
    workflow: "deal_won_workflow",
    stage: "closed_won",
    description: "Deal won — onboarding triggered",
  },
  deal_lost: {
    tag: GHL_TAGS.CLOSED_LOST,
    workflow: "deal_lost_workflow",
    stage: "closed_lost",
    description: "Deal lost — nurture triggered",
  },
  converted_to_L1: {
    tag: GHL_TAGS.CONVERTED_L1,
    workflow: "converted_to_L1_workflow",
    stage: null, // NO stage move — stays Closed Won
    description: "Converted to L1 — welcome/onboarding triggered",
  },

  // ── Alert / Exception Flow ──
  no_show: {
    tag: GHL_TAGS.NO_SHOW,
    workflow: "no_show_workflow",
    stage: null, // NO stage move per V6.1 spec
    description: "No-show detected — alert only, no stage move",
  },
};

// ─── CUSTOM FIELDS (12 fields, exact V6.1 — with GHL IDs) ──────────────────

export const GHL_CUSTOM_FIELDS = [
  "product_type",
  "user_state",
  "intent_level",
  "engagement_level",
  "last_action",
  "last_action_date",
  "setter_id",
  "closer_id",
  "lead_level",
  "deal_value",
  "lead_id",
  "stage",
] as const;

/** Map custom field name → GHL custom field ID */
export const GHL_CUSTOM_FIELD_IDS: Record<string, string> = {
  product_type:      "hDNx6RPeMMQ7d8mkT8pV",
  user_state:        "Mw4O4sRfmwvmEWGYrb55",
  intent_level:      "4MPxVBozqpJWotxghojt",
  engagement_level:  "WT5a7nWIeaWW81PQccKD",
  last_action:       "hhS3npdOyK5t3NaGHKaJ",
  last_action_date:  "c8bfSq4aLLJ5QLlIrmXf",
  setter_id:         "SXD6M3bFW32fk0QoRkHF",
  closer_id:         "Q0vnHzVDhtpzmBOuHK3k",
  lead_level:        "vtxB6BMBYdsyj2kNkxkJ",
  deal_value:        "VAVp0zdCBgAwlanvHUgl",
  lead_id:           "vteEOK83SYDGy8hu77yg",
  stage:             "6AG3Gfx9PlAdbtKwOZju",
};

export interface GhlContactPayload {
  // Identity (standard GHL fields, not custom)
  email: string;
  name?: string;
  phone?: string;

  // Custom fields (exact 12)
  product_type: string;
  user_state?: string;
  intent_level?: string;
  engagement_level?: string;
  last_action: string;
  last_action_date: string;
  setter_id?: string;
  closer_id?: string;
  lead_level?: string;
  deal_value?: number;
  lead_id?: string;
  stage?: string;

  // Tag + Workflow (per event)
  tag: string | null;
  workflow: string;

  // GHL IDs for direct API calls
  tag_id?: string;
  stage_id?: string;
  pipeline_id?: string;

  // Custom field values keyed by GHL field ID (for GHL API)
  customFields?: Record<string, string | number | undefined>;
}

// ─── EVENT → GHL PAYLOAD BUILDER ────────────────────────────────────────────

export function buildGhlPayload(
  eventName: string,
  lead: {
    id?: string | null;
    email?: string | null;
    name?: string;
    phone?: string | null;
    lead_level?: string | null;
    setter_id?: string | null;
    closer_id?: string | null;
    deal_value?: number | null;
    intent_level?: string | null;
    engagement_level?: string | null;
    user_state?: string | null;
  },
): GhlContactPayload | null {
  if (!lead.email) return null; // Email-NULL-Guard

  const mapping = GHL_EVENT_MAP[eventName];
  if (!mapping) return null;

  const now = new Date().toISOString();
  const stageLabel = resolveStageLabel(mapping.stage);

  // Build custom fields keyed by GHL field ID for direct API usage
  const customFields: Record<string, string | number | undefined> = {
    [GHL_CUSTOM_FIELD_IDS.product_type]:     PRODUCT_PREFIX,
    [GHL_CUSTOM_FIELD_IDS.user_state]:        lead.user_state ?? undefined,
    [GHL_CUSTOM_FIELD_IDS.intent_level]:      lead.intent_level ?? undefined,
    [GHL_CUSTOM_FIELD_IDS.engagement_level]:  lead.engagement_level ?? undefined,
    [GHL_CUSTOM_FIELD_IDS.last_action]:       eventName,
    [GHL_CUSTOM_FIELD_IDS.last_action_date]:  now,
    [GHL_CUSTOM_FIELD_IDS.setter_id]:         lead.setter_id ?? undefined,
    [GHL_CUSTOM_FIELD_IDS.closer_id]:         lead.closer_id ?? undefined,
    [GHL_CUSTOM_FIELD_IDS.lead_level]:        lead.lead_level ?? undefined,
    [GHL_CUSTOM_FIELD_IDS.deal_value]:        lead.deal_value ?? undefined,
    [GHL_CUSTOM_FIELD_IDS.lead_id]:           lead.id ?? undefined,
    [GHL_CUSTOM_FIELD_IDS.stage]:             stageLabel,
  };

  // Remove undefined values
  for (const k of Object.keys(customFields)) {
    if (customFields[k] === undefined) delete customFields[k];
  }

  return {
    // Identity
    email: lead.email.toLowerCase().trim(),
    name: lead.name,
    phone: lead.phone ?? undefined,

    // Custom fields (human-readable keys)
    product_type: PRODUCT_PREFIX,
    user_state: lead.user_state ?? undefined,
    intent_level: lead.intent_level ?? undefined,
    engagement_level: lead.engagement_level ?? undefined,
    last_action: eventName,
    last_action_date: now,
    setter_id: lead.setter_id ?? undefined,
    closer_id: lead.closer_id ?? undefined,
    lead_level: lead.lead_level ?? undefined,
    deal_value: lead.deal_value ?? undefined,
    lead_id: lead.id ?? undefined,
    stage: stageLabel,

    // Tag + workflow
    tag: mapping.tag,
    workflow: mapping.workflow,

    // GHL IDs for direct API usage
    tag_id: resolveTagId(mapping.tag),
    stage_id: resolveStageId(mapping.stage),
    pipeline_id: mapping.stage ? GHL_PIPELINE_ID : undefined,

    // Custom fields keyed by GHL field ID
    customFields,
  };
}

// ─── NO-SHOW TAG (used by both inbound + outbound) ─────────────────────────

export const NO_SHOW_TAG = GHL_TAGS.NO_SHOW;

// ─── ALLOWED INBOUND EVENTS (GHL → Lovable) ────────────────────────────────

export const ALLOWED_INBOUND_EVENTS = [
  "deal_won",
  "deal_lost",
  "no_show",
  "call_completed",
  "call_rescheduled",
] as const;

export type AllowedInboundEvent = (typeof ALLOWED_INBOUND_EVENTS)[number];

// ─── INTERNAL STAGE → V6.1 EVENT NAME ───────────────────────────────────────

export const INTERNAL_STAGE_TO_EVENT: Record<string, string> = {
  new:                  "new_lead",
  quiz_completed:       "quiz_completed",
  booked:               "booking_created",
  assigned_setter:      "lead_assigned",
  setter_contacting:    "setter_contacting",
  setter_qualified:     "setter_qualified",
  setter_disqualified:  "setter_disqualified",
  setter_booked:        "call_booked",
  ready_for_closer:     "moved_to_closer",
  assigned_closer:      "lead_assigned_closer",
  closer_in_progress:   "closer_started",
  offer_made:           "offer_presented",
  follow_up:            "follow_up_scheduled",
  closed_won:           "deal_won",
  closed_lost:          "deal_lost",
  converted_to_L1:      "converted_to_L1",
};
