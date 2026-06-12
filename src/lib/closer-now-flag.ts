/**
 * Phase 12 — /closer-now LP kill switch.
 * `false` → route returns 404 (no render, no tracking, no AB exposure).
 * `true`  → LP renders normally.
 * Strictly additive. Does not affect /masterofsales or /closer-karriere.
 */
export const CLOSER_NOW_ENABLED = true;
