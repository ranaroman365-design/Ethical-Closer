/**
 * Canonical CTA Ladder registry.
 *
 * Single source of truth for every valid combination of
 *   { location, cta_id, destination, cta_type, intent }
 * emitted by `home_cta_click` events.
 *
 * Used by:
 *   - call sites (compile-time guard via {@link assertHomeCta})
 *   - the consistency test (`home-cta-registry.test.ts`) that scans
 *     `event_logs` for violating rows.
 *
 * Editing rules:
 *   - Add a row here BEFORE adding a new CTA to the UI.
 *   - Never delete rows for events that may still exist in `event_logs`.
 *   - `intent` is `null` for every step except the soft-yes Masterclass step,
 *     which is the only ladder rung allowed to set `intent: "masterclass"`.
 */

export type HomeCtaLocation =
  | "hero_topbar"
  | "hero_primary"
  | "process_steps"
  | "masterclass_block"
  | "bewerbung_cta"
  | "final_cta"
  | "footer"
  | "sticky_bar";

export type HomeCtaId =
  | "primary_quiz"
  | "primary_apply"
  | "webinar"
  | "masterclass"
  | "member_login"
  | "b2b_partners";

export type HomeCtaType =
  | "primary"
  | "secondary"
  | "final"
  | "soft_yes"
  | "sticky"
  | "b2b"
  | "nav";

export type HomeCtaIntent = "masterclass" | null;

export interface HomeCtaRule {
  location: HomeCtaLocation;
  cta_id: HomeCtaId;
  /** Allowed destinations for this rung. Use a list because the masterclass
   *  block A/B-tests two destinations (legacy route vs. ladder). */
  destinations: string[];
  cta_type: HomeCtaType;
  intent: HomeCtaIntent;
}

export const HOME_CTA_REGISTRY: HomeCtaRule[] = [
  // Hard-yes ladder — every rung sends users to the qualification quiz.
  { location: "hero_primary",   cta_id: "primary_quiz", destinations: ["/start/quiz"], cta_type: "primary",   intent: null },
  { location: "process_steps",  cta_id: "primary_quiz", destinations: ["/start/quiz"], cta_type: "secondary", intent: null },
  { location: "bewerbung_cta",  cta_id: "primary_quiz", destinations: ["/start/quiz"], cta_type: "secondary", intent: null },
  { location: "final_cta",      cta_id: "primary_quiz", destinations: ["/start/quiz"], cta_type: "final",     intent: null },
  { location: "sticky_bar",     cta_id: "primary_quiz", destinations: ["/start/quiz"], cta_type: "sticky",    intent: null },

  // Soft-yes ladder — Masterclass block. A/B test:
  //   - control: legacy direct route to /start/masterclass (cta_id="masterclass")
  //   - ladder:  routes through /start/quiz?intent=masterclass (cta_id="primary_quiz")
  // Both variants are tagged cta_type=soft_yes + intent=masterclass so the
  // soft-yes path stays identifiable regardless of variant.
  {
    location: "masterclass_block",
    cta_id: "masterclass",
    destinations: ["/start/masterclass"],
    cta_type: "soft_yes",
    intent: "masterclass",
  },
  {
    location: "masterclass_block",
    cta_id: "primary_quiz",
    destinations: ["/start/quiz?intent=masterclass"],
    cta_type: "soft_yes",
    intent: "masterclass",
  },

  // ROOT v3 — System Router. Exactly one primary (/apply) + one secondary (/webinar)
  // CTA per location. Legacy /start/quiz rows above are preserved for historical
  // event-log compatibility but are no longer rendered on the live root.
  { location: "hero_primary",   cta_id: "primary_apply", destinations: ["/apply"],    cta_type: "primary",   intent: null },
  { location: "hero_primary",   cta_id: "webinar",       destinations: ["/webinar"],  cta_type: "secondary", intent: null },
  { location: "process_steps",  cta_id: "primary_apply", destinations: ["/apply"],    cta_type: "secondary", intent: null },
  { location: "bewerbung_cta",  cta_id: "primary_apply", destinations: ["/apply"],    cta_type: "secondary", intent: null },
  { location: "final_cta",      cta_id: "primary_apply", destinations: ["/apply"],    cta_type: "final",     intent: null },
  { location: "final_cta",      cta_id: "webinar",       destinations: ["/webinar"],  cta_type: "secondary", intent: null },
  { location: "sticky_bar",     cta_id: "primary_apply", destinations: ["/apply"],    cta_type: "sticky",    intent: null },
  { location: "masterclass_block", cta_id: "webinar",    destinations: ["/webinar"],  cta_type: "soft_yes",  intent: "masterclass" },

  // Auxiliary nav / B2B — not part of the ladder, but emitted via the same
  // helper so they must also be registered.
  { location: "hero_topbar", cta_id: "member_login",  destinations: ["/members/login"], cta_type: "nav", intent: null },
  { location: "footer",      cta_id: "b2b_partners",  destinations: ["/partners"],      cta_type: "b2b", intent: null },
];

export interface HomeCtaPayload {
  location: string;
  cta_id: string;
  destination: string;
  cta_type?: string | null;
  intent?: string | null;
}

export interface HomeCtaViolation {
  reason:
    | "unknown_location"
    | "unknown_cta_id_for_location"
    | "destination_not_allowed"
    | "cta_type_mismatch"
    | "intent_mismatch";
  expected?: unknown;
  actual?: unknown;
}

/**
 * Validate a single `home_cta_click` payload against {@link HOME_CTA_REGISTRY}.
 * Returns `null` when valid, otherwise a structured violation reason.
 */
export function validateHomeCta(p: HomeCtaPayload): HomeCtaViolation | null {
  const candidates = HOME_CTA_REGISTRY.filter((r) => r.location === p.location);
  if (candidates.length === 0) {
    return { reason: "unknown_location", actual: p.location };
  }

  const byId = candidates.filter((r) => r.cta_id === p.cta_id);
  if (byId.length === 0) {
    return {
      reason: "unknown_cta_id_for_location",
      expected: candidates.map((r) => r.cta_id),
      actual: p.cta_id,
    };
  }

  // Match the rule whose destination list contains the actual destination.
  const rule = byId.find((r) => r.destinations.includes(p.destination));
  if (!rule) {
    return {
      reason: "destination_not_allowed",
      expected: byId.flatMap((r) => r.destinations),
      actual: p.destination,
    };
  }

  if ((p.cta_type ?? null) !== rule.cta_type) {
    return { reason: "cta_type_mismatch", expected: rule.cta_type, actual: p.cta_type ?? null };
  }

  if ((p.intent ?? null) !== rule.intent) {
    return { reason: "intent_mismatch", expected: rule.intent, actual: p.intent ?? null };
  }

  return null;
}
