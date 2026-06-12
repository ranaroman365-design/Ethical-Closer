/**
 * AI Closer Companion — local progression store.
 *
 * Lightweight, frontend-only progression tracker. Stores per-user simulation
 * stats in localStorage so we don't need a new DB table for this iteration.
 * Tracks: sessions completed, average score, last 10 scores (for trend),
 * weak dimension (for personalization), and a derived level L1 → L6.
 *
 * Optionally fires `community_events` rows for analytics
 * (SIMULATION_STARTED / SIMULATION_COMPLETED / READY_FOR_REAL_FLAG).
 */

import { supabase } from "@/integrations/supabase/client";

const KEY = "etc.closer_companion.v1";

export type CompanionDimension =
  | "clarity"
  | "confidence"
  | "framing"
  | "objection_handling";

export type CompanionState = {
  sessionsCompleted: number;
  scores: number[]; // last 50 overall scores (rolling)
  weakDim: CompanionDimension | null;
  pressureUnlocked: boolean;
  readyForRealFlag: boolean;
  lastSessionAt: string | null;
};

const initial: CompanionState = {
  sessionsCompleted: 0,
  scores: [],
  weakDim: null,
  pressureUnlocked: false,
  readyForRealFlag: false,
  lastSessionAt: null,
};

function read(): CompanionState {
  if (typeof window === "undefined") return { ...initial };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...initial };
    const parsed = JSON.parse(raw) as Partial<CompanionState>;
    return { ...initial, ...parsed };
  } catch {
    return { ...initial };
  }
}

function write(s: CompanionState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

export function getCompanionState(): CompanionState {
  return read();
}

export function avgScore(state = read()): number {
  if (!state.scores.length) return 0;
  return Math.round(state.scores.reduce((a, b) => a + b, 0) / state.scores.length);
}

/** Map avg score + sessions to a closing level L1–L6. */
export function deriveLevel(state = read()): {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
} {
  const avg = avgScore(state);
  const n = state.sessionsCompleted;

  if (n < 1) return { level: 1, label: "Beginner" };
  if (n < 3 || avg < 45) return { level: 2, label: "Aufbau" };
  if (avg < 60) return { level: 3, label: "Fortgeschritten" };
  if (avg < 72) return { level: 4, label: "Deal-Ready" };
  if (avg < 82) return { level: 5, label: "Senior Closer" };
  return { level: 6, label: "Elite Closer" };
}

/** Improvement trend: last 5 vs previous 5. Returns delta in points. */
export function improvementDelta(state = read()): number {
  const s = state.scores;
  if (s.length < 6) return 0;
  const last5 = s.slice(-5);
  const prev5 = s.slice(-10, -5);
  if (!prev5.length) return 0;
  const a = last5.reduce((x, y) => x + y, 0) / last5.length;
  const b = prev5.reduce((x, y) => x + y, 0) / prev5.length;
  return Math.round(a - b);
}

/** Fire-and-forget analytics — never blocks UI. */
async function track(eventType: string, metadata: Record<string, unknown> = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("community_events" as any).insert({
      user_id: data.user.id,
      event_type: eventType.toLowerCase(),
      metadata: { surface: "closer_companion", ...metadata },
    } as any);
  } catch {
    /* swallow */
  }
}

export async function recordSimulationStarted(scenario: string, mode: string) {
  void track("SIMULATION_STARTED", { scenario, mode });
}

/**
 * Record completion of a simulation. Updates rolling state and fires events.
 * Returns the new state.
 */
export async function recordSimulationCompleted(input: {
  scenario: string;
  mode: string;
  finalOverall: number;
  weakDim: CompanionDimension | null;
}): Promise<CompanionState> {
  const state = read();
  const next: CompanionState = {
    ...state,
    sessionsCompleted: state.sessionsCompleted + 1,
    scores: [...state.scores, Math.max(0, Math.min(100, Math.round(input.finalOverall)))].slice(-50),
    weakDim: input.weakDim ?? state.weakDim,
    lastSessionAt: new Date().toISOString(),
  };

  // Pressure mode unlocks at L4 (deal-ready)
  if (deriveLevel(next).level >= 4) next.pressureUnlocked = true;

  // Ready-for-real flag: 3+ sessions AND avg ≥ 65
  const newlyReady = !state.readyForRealFlag && next.sessionsCompleted >= 3 && avgScore(next) >= 65;
  if (newlyReady) next.readyForRealFlag = true;

  write(next);

  void track("SIMULATION_COMPLETED", {
    scenario: input.scenario,
    mode: input.mode,
    final_overall: input.finalOverall,
    avg_score: avgScore(next),
    sessions_completed: next.sessionsCompleted,
  });
  if (newlyReady) {
    void track("READY_FOR_REAL_FLAG", { sessions_completed: next.sessionsCompleted });
  }
  return next;
}

export function resetCompanion() {
  write({ ...initial });
}
