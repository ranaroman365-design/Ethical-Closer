/**
 * MasterOfSales CRO event layer — purely additive.
 *
 * Canonical event names (all MOS-gated, session-deduped):
 *   MASTER_LP_MICRO_TRUST_VIEW
 *   MASTER_LP_FIRST_WIN_VIEW           (additive — Part 1)
 *   MASTER_LP_RISK_REDUCER_VIEW        (additive — Part 1)
 *   MASTER_LP_STICKY_CTA_VIEW          (additive — Part 1)
 *   MASTER_QUIZ_INTRO_MODE_VIEW
 *   MASTER_QUIZ_ENTRY_MODE_VIEW        (additive — Part 2)
 *   MASTER_QUIZ_Q1_SOFT_VIEW
 *   MASTER_Q1_VISUAL_VIEW              (additive — Part 2)
 *   MASTER_QUIZ_LENGTH_VARIANT_VIEW
 *   MASTER_QUIZ_RESULT_ANTICIPATION_VIEW
 *   MASTER_COMPLETION_BOOSTER_VIEW     (additive — Part 3)
 *   MASTER_AVATAR_FILTER_VIEW
 *   MASTER_GLOBALCLOSER_REDIRECT
 *   MASTER_DEVELOPMENT_SCORE           (additive — Part 4)
 *   MASTER_PLACEMENT_SCORE             (additive — Part 4)
 *   MASTER_LEAD_COMMITMENT_VIEW        (additive — Part 5)
 *   MASTER_DEVELOPMENT_SCORE_CALCULATED (legacy alias — kept)
 *
 * Hard rules:
 *   • Only fire when current session attribution starts with "masterofsales".
 *   • Each event max 1× per browser session (sessionStorage-deduped).
 *   • Always attach `master_funnel_id`, `attribution_source`, `ab_slots`.
 *   • Never throw.
 *
 * NOTHING here mutates CRM, lead-capture, pixel, CAPI, attribution, booking,
 * routing, or scoring of other funnels.
 */
import { trackFunnelEvent } from "@/lib/track-event";
import { getAttributionSource } from "@/lib/attribution-source";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";
import { ensureMasterFunnelId } from "@/lib/master-funnel-id";

const FIRED_KEY = "mos_cro_events_fired_v1";

export type MosCroEvent =
  | "MASTER_LP_MICRO_TRUST_VIEW"
  | "MASTER_LP_FIRST_WIN_VIEW"
  | "MASTER_LP_RISK_REDUCER_VIEW"
  | "MASTER_LP_STICKY_CTA_VIEW"
  | "MASTER_QUIZ_INTRO_MODE_VIEW"
  | "MASTER_QUIZ_ENTRY_MODE_VIEW"
  | "MASTER_QUIZ_Q1_SOFT_VIEW"
  | "MASTER_Q1_VISUAL_VIEW"
  | "MASTER_QUIZ_LENGTH_VARIANT_VIEW"
  | "MASTER_QUIZ_RESULT_ANTICIPATION_VIEW"
  | "MASTER_COMPLETION_BOOSTER_VIEW"
  | "MASTER_AVATAR_FILTER_VIEW"
  | "MASTER_GLOBALCLOSER_REDIRECT"
  | "MASTER_DEVELOPMENT_SCORE"
  | "MASTER_PLACEMENT_SCORE"
  | "MASTER_LEAD_COMMITMENT_VIEW"
  | "MASTER_DEVELOPMENT_SCORE_CALCULATED"
  // Hero-Simplification Sprint — additive (MOS-gated, deduped).
  | "MASTER_SIMPLE_HERO_VIEW"
  | "MASTER_QUIZ_DIRECT_ENTRY_VIEW"
  | "MASTER_Q1_INSTANT_ANSWER_VIEW"
  | "MASTER_Q1_VISIBLE"
  | "MASTER_Q1_FIRST_ANSWER"
  // Ultra-Fast Sprint — additive (MOS-gated, deduped).
  | "MASTER_LP_ABOVE_FOLD_V2_VIEW"
  | "MASTER_LP_CTA_V2_VIEW"
  | "MASTER_LP_REMOVE_FRICTION_VIEW"
  | "MASTER_Q1_ULTRA_FAST_VIEW"
  | "MASTER_Q1_MICRO_COMMITMENT_VIEW"
  | "MASTER_PROGRESS_FAST_VIEW"
  // Zero-Friction Hero Sprint — additive (MOS-gated, deduped, 1×/session).
  | "MASTER_ZERO_FRICTION_HERO_VIEW"
  | "MASTER_ZERO_FRICTION_HERO_CTA_CLICK"
  // Phase 9 LP→Quiz Start optimization — additive (MOS-gated, deduped).
  | "MASTER_LP_PSYCHOLOGY_HERO_VIEW"
  | "MASTER_LP_PSYCHOLOGY_CTA_CLICK"
  | "MASTER_LP_MICRO_TRUST_INLINE_VIEW"
  | "MASTER_LP_TRUST_BLOCK_POSITION_VIEW"
  | "MASTER_LP_SCROLL_PROGRESS_VIEW"
  | "MASTER_LP_COMPETING_CTA_SUPPRESS"
  // Phase 9.5 — Conversion-First Hero (additive, MOS-gated, deduped).
  | "MASTER_LP_CONVERSION_HERO_VIEW"
  | "MASTER_LP_CONVERSION_HERO_CTA_CLICK";


function isMosSession(): boolean {
  if (typeof window === "undefined") return false;
  const src = getAttributionSource();
  return !!src && src.startsWith("masterofsales");
}

function readFired(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(FIRED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeFired(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FIRED_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/**
 * Fire a CRO event exactly once per session (keyed by name + variantKey).
 * variantKey lets us track distinct variant views without re-firing for the
 * same one (e.g. `MASTER_QUIZ_INTRO_MODE_VIEW:auto`).
 */
export function fireMosCroEvent(
  name: MosCroEvent,
  variantKey: string,
  extra?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!isMosSession()) return;
  const dedupKey = `${name}:${variantKey}`;
  const fired = readFired();
  if (fired.has(dedupKey)) return;
  fired.add(dedupKey);
  writeFired(fired);
  try {
    const master_funnel_id = (() => {
      try {
        return ensureMasterFunnelId();
      } catch {
        return null;
      }
    })();
    trackFunnelEvent(name, {
      funnel: "masterofsales",
      attribution_source: getAttributionSource(),
      master_funnel_id,
      ab_slots: getActiveSlotSummary(),
      variant: variantKey,
      ...extra,
    });
  } catch {
    /* never throw */
  }
}
