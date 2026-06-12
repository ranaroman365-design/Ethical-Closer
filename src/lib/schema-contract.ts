/**
 * Schema Contract Constants — ETC v1.0
 *
 * This file documents the canonical field names and sources of truth.
 * Import these constants instead of hardcoding field names.
 *
 * ⚠️ Uses schema contract. Do not query profiles.level or current_stage directly.
 * See: docs/schema-contract.md
 */

// ─── Canonical Field Names ──────────────────────────────────────────

/** The numeric progression field on profiles. NOT "level". */
export const CANONICAL_PHASE_FIELD = 'current_phase' as const;

/** The human-readable stage on profiles (e.g. 'opener', 'setter', 'partner'). */
export const CANONICAL_STAGE_FIELD = 'business_stage' as const;

/** The idempotency key field on processed_events. NOT "event_id". */
export const CANONICAL_EVENT_KEY_FIELD = 'event_key' as const;

// ─── Canonical Sources of Truth ─────────────────────────────────────

/** Role assignments come from user_roles, never profiles. */
export const ROLE_SOURCE = 'user_roles' as const;

/** Team membership comes from this contract view, not performance aggregation. */
export const TEAM_SOURCE = 'team_membership_contract' as const;

/** Unified user access view combining profiles + user_roles. */
export const USER_ACCESS_VIEW = 'user_access_contract' as const;

/** Revenue truth comes from calls table, not leads.deal_value. */
export const REVENUE_SOURCE = 'calls' as const;

/** Lead priority/quality truth comes from canonical-decision-engine, not inline logic. */
export const DECISION_ENGINE_SOURCE = 'canonical-decision-engine' as const;

// ─── Forbidden Fields (documentation only) ──────────────────────────

/**
 * These fields DO NOT EXIST in the database.
 * Referencing them will cause runtime errors.
 *
 * - profiles.level → use current_phase or user_roles
 * - profiles.current_stage → use current_phase or business_stage
 * - processed_events.event_id → use event_key
 */
export const FORBIDDEN_FIELDS = [
  'profiles.level',
  'profiles.current_stage',
  'processed_events.event_id',
] as const;

// ─── Simulation Filter ─────────────────────────────────────────────

/** Standard simulation exclusion filter for Supabase queries. */
export const SIMULATION_FILTER = { is_simulation: false } as const;

// ─── Loading Timeout ────────────────────────────────────────────────

/** Maximum milliseconds to wait before showing an error state instead of infinite loading. */
export const LOADING_TIMEOUT_MS = 10_000;
