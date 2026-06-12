/**
 * Apply Quiz Events — APPLY_* parity layer mirroring mos-quiz-events.ts.
 *
 * Bricht NICHTS: additiv, idempotent (1× pro Session pro Event-Name),
 * Meta/CAPI-kompatibel via track-event → meta-pixel mapping.
 *
 * Gate: feuert NUR wenn die Session NICHT als `masterofsales*` attribuiert
 * ist — sonst übernimmt mos-quiz-events.ts (MASTER_*). So bleibt jede
 * Quiz-Session genau einer Funnel-Identität zugeordnet, keine Duplikate.
 *
 * Bestehende Events (quiz_view/quiz_started/quiz_completed/qualified/
 * not_qualified) bleiben vollständig unangetastet.
 */
import { trackFunnelEvent } from "@/lib/track-event";
import { getAttributionSource } from "@/lib/attribution-source";

const FIRED_KEY = "apply_quiz_events_fired_v1";

type ApplyQuizEvent =
  | "APPLY_QUIZ_STARTED"
  | "APPLY_QUIZ_STEP_1"
  | "APPLY_QUIZ_STEP_2"
  | "APPLY_QUIZ_STEP_3"
  | "APPLY_QUIZ_STEP_4"
  | "APPLY_QUIZ_STEP_5"
  | "APPLY_QUIZ_STEP_6"
  | "APPLY_QUIZ_STEP_7"
  | "APPLY_QUIZ_STEP_8"
  | "APPLY_QUIZ_STEP_9"
  | "APPLY_QUIZ_COMPLETED"
  | "APPLY_QUIZ_DROPOFF"
  | "APPLY_HIGH_INTENT";

function isApplySession(): boolean {
  const src = getAttributionSource();
  // Apply-Funnel = alles, was NICHT masterofsales ist (inkl. null/direct).
  return !src || !src.startsWith("masterofsales");
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

export function fireApplyQuizEvent(
  name: ApplyQuizEvent,
  extra?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!isApplySession()) return;
  const fired = readFired();
  if (fired.has(name)) return;
  fired.add(name);
  writeFired(fired);
  try {
    trackFunnelEvent(name, {
      funnel: "apply",
      source: getAttributionSource(),
      ...extra,
    });
  } catch {
    /* never throw */
  }
}
