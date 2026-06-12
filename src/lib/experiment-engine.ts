/**
 * Canonical Experiment Engine — additive analysis layer
 * ──────────────────────────────────────────────────────────────────────────
 * Sits next to `ab-multivariant.ts` (assignment) and `ab-winner-rollup`
 * (server-side scoring) and emits per-variant business-conversion signals
 * for each slot the visitor was exposed to.
 *
 * Goals:
 *  - NEVER replace existing events (quiz_completed, booking_created, …).
 *  - Emit internal MASTER_VARIANT_* events 1× per (event, session, slot:variant)
 *    so the rollup can attribute downstream business outcomes without
 *    refactoring every call site.
 *  - Strictly client-side; SSR-safe; never throws.
 *
 * Pipeline:
 *   trackFunnelEvent("quiz_completed", …)         ← unchanged
 *     └── (inside trackEvent) fireVariantConversion("quiz_completed", ab_slots)
 *           └── for each (slot,variant):
 *                  trackFunnelEvent("MASTER_VARIANT_QUIZ_COMPLETED", { slot, variant })
 *
 * Conversion gating: only the funnel-success events listed in
 * BUSINESS_CONVERSION_MAP get attributed. CTR/clicks are intentionally
 * excluded — winners must be earned by real business outcomes.
 */

/** Maps canonical funnel events → internal analysis event names. */
const BUSINESS_CONVERSION_MAP: Record<string, string> = {
  // Quiz milestones
  quiz_started: "MASTER_VARIANT_QUIZ_STARTED",
  MASTER_QUIZ_STARTED: "MASTER_VARIANT_QUIZ_STARTED",
  APPLY_QUIZ_STARTED: "MASTER_VARIANT_QUIZ_STARTED",
  quiz_completed: "MASTER_VARIANT_QUIZ_COMPLETED",
  quiz_completed_men: "MASTER_VARIANT_QUIZ_COMPLETED",
  quiz_completed_women: "MASTER_VARIANT_QUIZ_COMPLETED",
  MASTER_QUIZ_COMPLETED: "MASTER_VARIANT_QUIZ_COMPLETED",
  APPLY_QUIZ_COMPLETED: "MASTER_VARIANT_QUIZ_COMPLETED",
  // Lead
  lead_capture_submitted: "MASTER_VARIANT_LEAD",
  application_submitted: "MASTER_VARIANT_LEAD",
  qualified: "MASTER_VARIANT_HQL",
  not_qualified: "MASTER_VARIANT_LEAD",
  // Booking
  booking_created: "MASTER_VARIANT_BOOKING",
  booking_completed: "MASTER_VARIANT_BOOKING",
  // Downstream (if/when fired)
  appointment_showed: "MASTER_VARIANT_SHOWUP",
};

const SS_PREFIX = "experiment_variant_event_v1:";

function alreadyFired(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (sessionStorage.getItem(SS_PREFIX + key) === "1") return true;
    sessionStorage.setItem(SS_PREFIX + key, "1");
    return false;
  } catch {
    return false;
  }
}

/** Parses "slot_a:variant_x,slot_b:variant_y" → [[slot, variant], …]. */
function parseSlotSummary(ab_slots: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (!ab_slots) return out;
  for (const pair of ab_slots.split(",")) {
    const idx = pair.indexOf(":");
    if (idx <= 0) continue;
    const slot = pair.slice(0, idx).trim();
    const variant = pair.slice(idx + 1).trim();
    if (slot && variant) out.push([slot, variant]);
  }
  return out;
}

/**
 * Fan out a canonical funnel conversion into per-variant analysis events.
 * Called from inside `trackEvent` — never call directly to avoid recursion.
 */
export function fireVariantConversion(eventName: string, ab_slots: string): void {
  // Skip MASTER_VARIANT_* themselves to prevent recursion.
  if (eventName.startsWith("MASTER_VARIANT_")) return;
  const analysisEvent = BUSINESS_CONVERSION_MAP[eventName];
  if (!analysisEvent) return;

  const pairs = parseSlotSummary(ab_slots);
  if (pairs.length === 0) return;

  // Lazy import to avoid circular dep with track-event.
  void import("@/lib/track-event").then(({ trackFunnelEvent }) => {
    for (const [slot, variant] of pairs) {
      const dedupKey = `${analysisEvent}:${slot}:${variant}`;
      if (alreadyFired(dedupKey)) continue;
      void trackFunnelEvent(analysisEvent, {
        slot,
        variant,
        source_event: eventName,
        // Skip the auto-injection by setting ab_slots explicitly — empty so
        // we don't double-fan-out.
        ab_slots: "",
      });
    }
  }).catch(() => { /* never throw */ });
}

export const __EXPERIMENT_ENGINE_BUSINESS_EVENTS__ = BUSINESS_CONVERSION_MAP;
