/**
 * Apply Debug Mode — single source of truth for `?debug=ab` activation.
 *
 * Used both by the global `ApplyDebugOverlay` (event log) and by inline debug
 * widgets like the mobile sticky badge that shows live A/B + hint state.
 *
 *   ?debug=ab  → enables for the tab (persists via sessionStorage)
 *   ?debug=off → disables
 *   ab_debug=1 → legacy alias
 */

const STORAGE_KEY = "apply_ab_debug";

export function isApplyDebugActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "ab" || params.get("ab_debug") === "1") {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (params.get("debug") === "off") {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
