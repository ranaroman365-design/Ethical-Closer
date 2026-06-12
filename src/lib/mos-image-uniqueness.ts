/**
 * Phase 9.6B — Image-uniqueness guard for visible Human-Proof sections.
 *
 * Two enforcement layers (BOTH active):
 *
 *   1. Runtime dev warning  → `assertMosProofImagesUnique()` is called from
 *      MosHumanProofRail on mount. In dev (`import.meta.env.DEV`) it logs
 *      a console.error when duplicate CDN URLs or empty slots are detected
 *      in simultaneously-visible proof rows.
 *
 *   2. Hard build/CI fail   → `src/test/mos-phase96-image-uniqueness.test.ts`
 *      enumerates every visible proof slot, resolves the fallback variant,
 *      and asserts no duplicate URLs + no empty slots. Vitest fails the
 *      build on any violation.
 *
 * Tracking / Thompson Sampling / force_slot / ab_slot_weights / Winner Engine
 * are NOT touched. This is presentation-time validation only.
 */
import {
  MOS_HUMAN_PROOF_COPY,
  MOS_HUMAN_PROOF_FALLBACK_VARIANT_BY_SLOT,
  resolveHumanProofImageCopy,
} from "@/lib/mos-human-proof-slots";

export interface ProofImageBinding {
  /** Section slot id, e.g. `mos_training_proof`. */
  slot: string;
  /** Currently rendered variant id (sticky bucket OR fallback). */
  variant: string;
  /** Resolved CDN URL (or null when nothing renders). */
  url: string | null;
}

export interface UniquenessReport {
  ok: boolean;
  duplicates: Array<{ url: string; slots: string[] }>;
  empties: string[];
}

/**
 * Compute the report for an array of visible (slot, variant) bindings.
 * Pure — no I/O. Used by both runtime check and Vitest test.
 */
export function computeProofUniquenessReport(
  bindings: ProofImageBinding[],
): UniquenessReport {
  const byUrl = new Map<string, string[]>();
  const empties: string[] = [];

  for (const b of bindings) {
    if (!b.url) {
      empties.push(b.slot);
      continue;
    }
    const existing = byUrl.get(b.url) ?? [];
    existing.push(b.slot);
    byUrl.set(b.url, existing);
  }

  const duplicates: UniquenessReport["duplicates"] = [];
  for (const [url, slots] of byUrl) {
    if (slots.length > 1) duplicates.push({ url, slots });
  }

  return {
    ok: duplicates.length === 0 && empties.length === 0,
    duplicates,
    empties,
  };
}

/**
 * Resolve the deterministic FALLBACK URL for a proof slot — the URL that
 * renders when the sticky bucket is `control` or missing. Used by the
 * Vitest test to verify the baseline visible state is conflict-free.
 */
export function resolveFallbackUrl(slot: string): string | null {
  const fallbackVariant = MOS_HUMAN_PROOF_FALLBACK_VARIANT_BY_SLOT[slot];
  if (!fallbackVariant) return null;
  const copy = MOS_HUMAN_PROOF_COPY[slot]?.[fallbackVariant];
  return copy?.src ?? null;
}

/**
 * Resolve the URL for an arbitrary (slot, variantId) — mirrors the runtime
 * resolver used by MosImageSlot, but URL-only.
 */
export function resolveProofUrl(
  slot: string,
  variantId: string,
): string | null {
  return resolveHumanProofImageCopy(slot, variantId)?.src ?? null;
}

/**
 * Dev-only runtime assert. Safe in prod (no-op). Never throws.
 */
export function assertMosProofImagesUniqueDev(
  bindings: ProofImageBinding[],
): UniquenessReport {
  const report = computeProofUniquenessReport(bindings);
  if (
    typeof import.meta !== "undefined" &&
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV &&
    !report.ok
  ) {
    if (report.duplicates.length) {
      // eslint-disable-next-line no-console
      console.error(
        "[mos-image-uniqueness] Duplicate proof images in visible sections:",
        report.duplicates,
      );
    }
    if (report.empties.length) {
      // eslint-disable-next-line no-console
      console.error(
        "[mos-image-uniqueness] Empty proof image slots:",
        report.empties,
      );
    }
  }
  return report;
}
