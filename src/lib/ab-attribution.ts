/**
 * Layer 49 — Cross-test attribution snapshot for downstream events.
 *
 * Reads currently-assigned A/B buckets from localStorage WITHOUT mutating them
 * (no new assignment is created if the visitor was never exposed). The result
 * is attached to events like `booking_created` so the Experimentation OS can
 * compute per-variant conversion.
 *
 * Hard rules:
 *  - Read-only. Never writes to localStorage.
 *  - Never throws. Returns an empty object on any error / SSR.
 *  - Never blocks the booking flow.
 */

type AbAssignment = { test: string; variant: string };

const RAW_STORAGE_KEYS: { storageKey: string; test: string }[] = [
  { storageKey: "apply_hero_ab_v1", test: "hero_variant_v1" },
  { storageKey: "apply_social_proof_ab_v1", test: "social_proof_v1" },
  { storageKey: "apply_sticky_hint_v1", test: "sticky_hint_v1" },
  { storageKey: "ab:playbook_hero_cta_v1", test: "playbook_hero_cta_v1" },
];

// Primary attribution priority — first match wins for `ab_test` / `ab_variant`.
const PRIMARY_PRIORITY = [
  "hero_variant_v1",
  "social_proof_v1",
  "sticky_hint_v1",
  "playbook_hero_cta_v1",
];

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Some legacy stores write the bucket as a plain string (not JSON).
    return raw;
  }
}

function extractVariant(parsed: unknown): string | null {
  if (parsed == null) return null;
  if (typeof parsed === "string") return parsed;
  if (typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const candidate =
      obj.variant ?? obj.bucket ?? obj.value ?? obj.assignment ?? null;
    if (typeof candidate === "string") return candidate;
  }
  return null;
}

export function readActiveAbAssignments(): AbAssignment[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  const out: AbAssignment[] = [];
  for (const { storageKey, test } of RAW_STORAGE_KEYS) {
    try {
      const variant = extractVariant(safeParse(window.localStorage.getItem(storageKey)));
      if (variant) out.push({ test, variant });
    } catch {
      /* ignore — never block caller */
    }
  }
  return out;
}

export type AbAttributionPayload = {
  ab_test?: string;
  ab_variant?: string;
  ab_assignments?: Record<string, string>;
};

/**
 * Returns a payload fragment to spread into a tracked event.
 * Empty object `{}` if no A/B assignments are present — caller behavior unchanged.
 */
export function getAbAttributionPayload(): AbAttributionPayload {
  const assignments = readActiveAbAssignments();
  if (assignments.length === 0) return {};

  const map: Record<string, string> = {};
  for (const a of assignments) map[a.test] = a.variant;

  // Pick primary by fixed priority list.
  let primary: AbAssignment | undefined;
  for (const test of PRIMARY_PRIORITY) {
    const found = assignments.find((a) => a.test === test);
    if (found) {
      primary = found;
      break;
    }
  }
  if (!primary) primary = assignments[0];

  const payload: AbAttributionPayload = {
    ab_test: primary.test,
    ab_variant: primary.variant,
  };
  if (assignments.length > 1) payload.ab_assignments = map;
  return payload;
}
