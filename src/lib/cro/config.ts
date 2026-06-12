/**
 * CRO Layer — global kill-switch.
 * --------------------------------------------------------------
 * If `CRO_ENABLED` is `false`, every `useCopyVariant()` call short-circuits
 * to its Control default and renders identical to the pre-test state. No DB
 * change required to disable an active test — flip this and ship.
 *
 * Strictly additive: this file only exposes a constant. Nothing else
 * in the app reads it unless explicitly opted in via `useCopyVariant`.
 */
export const CRO_ENABLED = true;

/** Stable list of experiment keys this layer is allowed to read. */
export const CRO_EXPERIMENT_KEYS = [
  "hero_copy_v1",
  "cta_label_v1",
  "trust_order_v1",
] as const;

export type CroExperimentKey = (typeof CRO_EXPERIMENT_KEYS)[number];
