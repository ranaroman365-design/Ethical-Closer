/**
 * Social Proof Dwell-Time helper.
 * The /apply landing page measures cumulative ms a mobile user spends with the
 * social-proof block ≥50% in viewport (see ApplyLanding.tsx). The value is
 * persisted in sessionStorage so downstream booking surfaces can attach it to
 * conversion events for correlation analysis.
 *
 * Single source of truth for both keys + bucketing logic. Never throws.
 */

const SESSION_KEY = "apply:social_proof_dwell_ms";
const VIEWED_KEY = "apply:social_proof_viewed";

export type DwellBucket = "none" | "<1s" | "1-3s" | "3-5s" | "5-10s" | "10s+";

export const dwellBucketFor = (ms: number): DwellBucket => {
  if (!ms || ms <= 0) return "none";
  if (ms >= 10_000) return "10s+";
  if (ms >= 5_000) return "5-10s";
  if (ms >= 3_000) return "3-5s";
  if (ms >= 1_000) return "1-3s";
  return "<1s";
};

/**
 * Read dwell metadata for attaching to a conversion event.
 * Always returns flat, JSON-safe primitives — safe to spread into trackFunnelEvent payloads.
 */
export const getSocialProofDwellAttribution = (): {
  social_proof_viewed: boolean;
  social_proof_dwell_ms: number;
  social_proof_dwell_bucket: DwellBucket;
} => {
  try {
    if (typeof window === "undefined") {
      return { social_proof_viewed: false, social_proof_dwell_ms: 0, social_proof_dwell_bucket: "none" };
    }
    const raw = sessionStorage.getItem(SESSION_KEY);
    const viewed = sessionStorage.getItem(VIEWED_KEY) === "1";
    const ms = Math.max(0, Math.min(600_000, Number(raw ?? "0") || 0));
    return {
      social_proof_viewed: viewed,
      social_proof_dwell_ms: Math.round(ms),
      social_proof_dwell_bucket: dwellBucketFor(ms),
    };
  } catch {
    return { social_proof_viewed: false, social_proof_dwell_ms: 0, social_proof_dwell_bucket: "none" };
  }
};
