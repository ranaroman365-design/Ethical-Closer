/**
 * Attribution Source — free-form `?source=` capture, parallel to the
 * constrained `funnel_source` enum in funnel-source.ts.
 *
 * Why a second channel?
 * - `funnel_source` is a Postgres enum (apply_direct | qualify_filter | ...).
 *   It cannot store free-form values like `masterofsales-faq-3-a`.
 * - We still need the full attribution string to survive the trip
 *   /masterofsales-faq → /apply → /apply/quiz → /booking → appointments.
 *
 * Contract:
 * - First-touch wins (write-once per session).
 * - Read from `?source=` query param on capture.
 * - Stored in sessionStorage, key `etc_attribution_source_v1`.
 * - Length-limited to 120 chars, ASCII-safe (a-z, 0-9, _ and -).
 */

const SS_KEY = "etc_attribution_source_v1";
const MAX_LEN = 120;
const SAFE_RE = /^[a-zA-Z0-9_\-:.]+$/;

const sanitize = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, MAX_LEN);
  if (!trimmed || !SAFE_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
};

/** Capture (write-once) the `?source=` value for this browser session. */
export function captureAttributionSource(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(SS_KEY);
    if (existing) return existing;
    const params = new URLSearchParams(window.location.search);
    const raw = sanitize(params.get("source"));
    if (raw) {
      window.sessionStorage.setItem(SS_KEY, raw);
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Read the captured attribution source. If nothing has been persisted yet
 * but the current URL carries `?source=`, capture lazily so first-touch is
 * never missed by a call site that reads before any explicit capture has
 * run (e.g. debug overlay mounts before the page's useEffect).
 */
export function getAttributionSource(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(SS_KEY);
    if (stored) return stored;
    return captureAttributionSource();
  } catch {
    return null;
  }
}
