/**
 * Master Funnel ID — stable funnel identity for /masterofsales → /apply/quiz → /booking.
 *
 * Why: session_id is per-browser-session and is lost when users open the
 * booking page in a new tab or when CAPI duplicates fire. To correctly
 * deduplicate funnel stages and enforce monotonic sequence (LP ≥ Start ≥
 * Step1 ≥ … ≥ Complete ≥ Booking) we need a single id that survives the
 * whole journey AND can be used as Meta event_id.
 *
 * Scope: ADDITIVE. Pure read/write helpers. No side effects on existing
 * tracking until explicitly called.
 */
import { getAttributionSource } from "@/lib/attribution-source";


const LS_KEY = "etc_master_funnel_id_v1";
const SS_FIRED_KEY = "etc_master_event_fired_v1";
const SS_BOOTED_KEY = "etc_master_funnel_booted_v1";
export const TRACKING_VERSION = "master_tracking_v2";

function randId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Ensure a master_funnel_id exists for this browser. Persisted in
 * localStorage so it survives navigation across /masterofsales → /apply/quiz
 * → /booking and reload, but does NOT survive across true new browser
 * profiles or after a user explicitly clears storage.
 */
export function ensureMasterFunnelId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.localStorage.getItem(LS_KEY);
    if (existing) return existing;
    const fresh = randId();
    window.localStorage.setItem(LS_KEY, fresh);
    return fresh;
  } catch {
    return randId();
  }
}

export function getMasterFunnelId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

/** Was the funnel already booted in this session? Used for idempotent LP_VIEW. */
export function markFunnelBooted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(SS_BOOTED_KEY) === "1") return false;
    window.sessionStorage.setItem(SS_BOOTED_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

/**
 * Deterministic Meta event_id for Pixel+CAPI dedup.
 * Format: <funnel_id>:<event_name>[:<step>] — stable across pixel & server.
 */
export function eventIdFor(eventName: string, step?: number | string): string {
  const fid = getMasterFunnelId() ?? "no-funnel";
  return step !== undefined && step !== null
    ? `${fid}:${eventName}:${step}`
    : `${fid}:${eventName}`;
}

/**
 * Returns true the FIRST time an event_id is seen in this session; subsequent
 * calls return false → caller must skip the dispatch. Idempotency layer for
 * MASTER_* events that must fire max 1× per funnel run.
 */
export function claimMasterEvent(eventId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.sessionStorage.getItem(SS_FIRED_KEY);
    const set = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    if (set.has(eventId)) return false;
    set.add(eventId);
    window.sessionStorage.setItem(SS_FIRED_KEY, JSON.stringify([...set]));
    return true;
  } catch {
    return true;
  }
}

/** All fired event_ids — debug overlay only. */
export function readFiredMasterEvents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(SS_FIRED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Read a tracking context object to merge into every event payload.
 *
 * Tracking-Konsistenz (Funnel-Join):
 * Garantiert, dass JEDES Event eine `master_funnel_id` trägt. Wenn noch
 * keine existiert, wird sie hier lazy erstellt (gleiche localStorage-Quelle
 * wie `ensureMasterFunnelId`). Dadurch landen LP-Views, Quiz-Start,
 * Frage 1–7, Quiz-Completion, Calendly-Open und Booking derselben
 * physischen Session zwingend in EINER Identity (mfid), unabhängig vom
 * Entry-Point. Identity-Priorität downstream: mfid → session_id → lead_id.
 *
 * Includes `attribution_source` (free-form `?source=` value) so dashboard
 * filters like `source=masterofsales` work across the full journey without
 * extra plumbing at each call site.
 */
export function getMasterTrackingContext(): {
  master_funnel_id: string | null;
  tracking_version: string;
  attribution_source: string | null;
} {
  let attribution_source: string | null = null;
  try {
    attribution_source = getAttributionSource();
  } catch {
    attribution_source = null;
  }
  // Lazy-ensure: jede Dispatch-Stelle bekommt eine stabile mfid, auch
  // wenn der Visitor nie über /masterofsales kam. Reiner localStorage-
  // Write, kein Netzwerk, kein Tracking-Side-Effect.
  let master_funnel_id: string | null = null;
  try {
    master_funnel_id = ensureMasterFunnelId();
  } catch {
    master_funnel_id = getMasterFunnelId();
  }
  return {
    master_funnel_id,
    tracking_version: TRACKING_VERSION,
    attribution_source,
  };
}
