/**
 * MasterOfSales High-Intent Signal
 * ─────────────────────────────────────────────────────────────────────
 * Additiver Layer. Sammelt 5 Bedingungen während der Session und feuert
 * einmalig `MASTEROFSALES_HIGH_INTENT`, sobald ≥2 Bedingungen erfüllt sind.
 *
 * Bedingungen:
 *  - scroll_50      (Scrolltiefe ≥ 50%)
 *  - time_45        (Time on Page ≥ 45s)
 *  - hero_cta       (Hero-CTA geklickt)
 *  - quiz_started   (CTA-Klick führt zum Quiz)
 *  - quiz_step_2    (>= 2 Quiz-Schritte — wird hier nicht erfasst,
 *                    Quiz lebt auf /apply, das wir nicht anfassen.)
 *
 * Bricht NICHTS: Eigener Storage-Key, eigene Event-Namen, kein Replace.
 */
import { trackFunnelEvent } from "@/lib/track-event";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";

export type IntentSignal =
  | "scroll_50"
  | "time_45"
  | "hero_cta"
  | "quiz_started"
  | "quiz_step_2";

const SESSION_FIRED_KEY = "mos_high_intent_fired_v1";
const SESSION_FLAGS_KEY = "mos_high_intent_flags_v1";
const THRESHOLD = 2;

function readFlags(): Set<IntentSignal> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SESSION_FLAGS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as IntentSignal[]);
  } catch {
    return new Set();
  }
}

function writeFlags(set: Set<IntentSignal>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_FLAGS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function alreadyFired(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return sessionStorage.getItem(SESSION_FIRED_KEY) === "1";
  } catch {
    return false;
  }
}

function markFired() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_FIRED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Markiert ein Intent-Signal. Feuert `MASTEROFSALES_HIGH_INTENT` ab Threshold. */
export function recordIntentSignal(signal: IntentSignal): void {
  if (alreadyFired()) return;
  const flags = readFlags();
  if (flags.has(signal)) return;
  flags.add(signal);
  writeFlags(flags);
  if (flags.size < THRESHOLD) return;
  markFired();
  try {
    trackFunnelEvent("MASTEROFSALES_HIGH_INTENT", {
      funnel: "masterofsales",
      signals: [...flags],
      signal_count: flags.size,
      ab_slots: getActiveSlotSummary(),
    });
    // Kanonischer Kurz-Name (Brief-Spec).
    trackFunnelEvent("MASTER_HIGH_INTENT", {
      funnel: "masterofsales",
      signals: [...flags],
      signal_count: flags.size,
      ab_slots: getActiveSlotSummary(),
    });
  } catch {
    /* never throw */
  }
}
