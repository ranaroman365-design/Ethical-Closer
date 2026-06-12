/**
 * Auto A/B System – persistent session id (30-day localStorage cookie-lite).
 *
 * Separate from `ab-session.getBrowserSessionId()` (which is tab-scoped) so the
 * auto-allocator can attribute multi-visit funnels (LP → Quiz → Booking) to
 * the same session even after the tab closes. SSR-safe.
 */
const KEY = "ab_auto_session_v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fallthrough */
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id: string; ts: number };
      if (parsed?.id && Date.now() - parsed.ts < TTL_MS) {
        return parsed.id;
      }
    }
  } catch {
    /* fall through to fresh id */
  }
  const id = newId();
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ id, ts: Date.now() }));
  } catch {
    /* private mode → ephemeral */
  }
  return id;
}
