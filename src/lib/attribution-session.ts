/**
 * Browser-side attribution session id.
 *
 * One stable id per browser session (sessionStorage). Used as the join key
 * between `lead_attribution` (captured anonymously on /apply mount) and the
 * `leads` row created later via `upsert_funnel_lead`. The link is closed via
 * RPC `link_lead_attribution(p_session_id, p_lead_id)`.
 */
const KEY = "etc_attribution_session_id_v1";

function rand(): string {
  // crypto.randomUUID is available in all evergreen browsers we ship to.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateAttributionSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = rand();
    window.sessionStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage blocked — fall back to per-call ephemeral id.
    return rand();
  }
}

export function readAttributionSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
