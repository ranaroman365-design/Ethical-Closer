/**
 * MasterOfSales Quiz Events — additive Lernsignale auf /apply/quiz.
 *
 * Bricht NICHTS: feuert NUR, wenn die Session-Attribution `masterofsales*` ist
 * (Männer-Funnel via /masterofsales). Jedes Event maximal 1× pro Session.
 * Bestehende Events (quiz_view/quiz_started/quiz_completed/quiz_completed_men)
 * bleiben unangetastet.
 */
import { trackFunnelEvent } from "@/lib/track-event";
import { getAttributionSource } from "@/lib/attribution-source";
import { getActiveSlotSummary } from "@/lib/ab-multivariant";

const FIRED_KEY = "mos_quiz_events_fired_v1";

type MosQuizEvent =
  | "MASTER_QUIZ_STARTED"
  | "MASTER_QUIZ_STEP_1"
  | "MASTER_QUIZ_STEP_2"
  | "MASTER_QUIZ_STEP_3"
  | "MASTER_QUIZ_STEP_4"
  | "MASTER_QUIZ_STEP_5"
  | "MASTER_QUIZ_STEP_6"
  | "MASTER_QUIZ_STEP_7"
  | "MASTER_QUIZ_STEP_8"
  | "MASTER_QUIZ_STEP_9"
  | "MASTER_QUIZ_COMPLETED"
  | "MASTER_QUIZ_DROPOFF";

function isMosSession(): boolean {
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

export function fireMosQuizEvent(
  name: MosQuizEvent,
  extra?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!isMosSession()) return;
  const fired = readFired();
  if (fired.has(name)) return;
  fired.add(name);
  writeFired(fired);
  try {
    trackFunnelEvent(name, {
      funnel: "masterofsales",
      source: getAttributionSource(),
      ab_slots: getActiveSlotSummary(),
      ...extra,
    });
  } catch {
    /* never throw */
  }
}
