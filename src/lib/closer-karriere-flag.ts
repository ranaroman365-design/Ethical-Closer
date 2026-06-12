/**
 * Phase 10 — Ethical Top Closer Registrierungs-Landingpage Flag
 * --------------------------------------------------------------
 * Global kill-switch for the /closer-karriere LP. Strictly additive.
 *
 * `false` => Route returns 404 (no rendering, no tracking, no AB slots).
 * `true`  => LP renders normally.
 *
 * Set to `false` to instantly disable the LP without touching the router
 * or any existing /masterofsales code path.
 */
export const MOS_REGISTER_ENABLED = true;

/** CTA target for all registration buttons on the LP. */
export const MOS_REGISTER_CTA_TARGET = "/apply/quiz";
