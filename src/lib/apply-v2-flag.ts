/**
 * Apply V2 Flag — sticky, additive opt-in for the V2 quiz layer.
 *
 * Activation: visit any URL with `?apply_v2=1` once → stored in
 * sessionStorage (`apply_v2_enabled`). Subsequent navigations stay V2.
 * Deactivation: `?apply_v2=0` clears it.
 *
 * Default: V2 OFF. No behavior change for existing traffic.
 *
 * V2 adds:
 *  - commitment question (soft, "Variant C")
 *  - velocity question (intent speed)
 *  - rescaled thresholds (high≥92, mid≥53, max 124)
 *  - routing hint `&priority=1` when velocity=30d ∧ bucket=high
 */
const KEY = "apply_v2_enabled";

export function resolveApplyV2(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("apply_v2");
    if (override === "1") {
      sessionStorage.setItem(KEY, "1");
      return true;
    }
    if (override === "0") {
      sessionStorage.removeItem(KEY);
      return false;
    }
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
