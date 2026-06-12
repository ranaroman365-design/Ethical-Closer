/**
 * /apply Social-Proof A/B Test (with Holdout)
 *
 * Tests the result-pill copy + microcopy note on the testimonial grid.
 * Goal: increase click-through rate on "Strategie-Call sichern".
 *
 * Buckets:
 *  - "A" (45 %): cautious, process-oriented copy
 *  - "B" (45 %): outcome-oriented, more concrete copy
 *  - "H" (10 %): HOLDOUT — receives the original control copy (== "A")
 *                and is excluded from A/B variant analysis. Used as a true
 *                baseline to measure the *combined* lift of the test itself
 *                vs. doing nothing.
 *
 * Bucket assignment is sticky per browser (localStorage) with a 30-day TTL,
 * and logged via `apply_ab_assigned` (with `holdout: true|false`).
 */
import { trackFunnelEvent } from "@/lib/track-event";
import { migrateLegacyAbValue } from "@/lib/ab-legacy-migration";
import { trackAbReassigned, getBrowserSessionId } from "@/lib/ab-session";
import { markAbReassigned } from "@/lib/ab-debug";
import { getAbStorage } from "@/lib/ab-storage";

/** Visible copy variants only. Holdout reuses "A" copy without being labeled "A". */
export type ApplyAbVariant = "A" | "B";
/** Storage/analytics bucket — includes the holdout cell. */
export type ApplyAbBucket = ApplyAbVariant | "H";

const STORAGE_KEY = "apply_social_proof_ab_v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TEST_KEY = "social_proof_v1";
const HOLDOUT_RATIO = 0.1; // 10 % holdout

export interface TestimonialCopy {
  result: string;
  note: string;
}

export const APPLY_AB_COPY: Record<
  ApplyAbVariant,
  Record<"max" | "leon" | "daniel", TestimonialCopy> & { microcopy: string }
> = {
  A: {
    max: {
      result: "Erster echter Call in Woche 4",
      note: "Eigenbericht · individueller Verlauf",
    },
    leon: {
      result: "Klares Feedback nach jedem Call",
      note: "Eigenbericht · kein garantiertes Ergebnis",
    },
    daniel: {
      result: "Arbeitet heute remote",
      note: "Eigenbericht · Verlauf abhängig vom Einsatz",
    },
    microcopy: "Ergebnisse variieren je nach Einsatz und Performance",
  },
  B: {
    max: {
      result: "Vom Quereinstieg in den ersten Closing-Call",
      note: "Echter Verlauf · kein Versprechen",
    },
    leon: {
      result: "Schneller besser durch direktes Coaching",
      note: "Persönliche Erfahrung · individueller Fortschritt",
    },
    daniel: {
      result: "Raus aus dem 9–5, rein in echte Kontrolle",
      note: "Persönlicher Weg · Resultat hängt vom Einsatz ab",
    },
    microcopy: "Echte Wege echter Teilnehmer · keine garantierten Ergebnisse",
  },
};

interface StoredBucket {
  bucket: ApplyAbBucket;
  assignedAt: number; // epoch ms
}

function isBucket(v: unknown): v is ApplyAbBucket {
  return v === "A" || v === "B" || v === "H";
}

function isStored(v: unknown): v is StoredBucket {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<StoredBucket> & { variant?: unknown };
  // Forward-compat: prior shape used `variant`; accept it by normalising.
  const bucket = isBucket(o.bucket) ? o.bucket : isBucket(o.variant) ? (o.variant as ApplyAbBucket) : null;
  if (!bucket || typeof o.assignedAt !== "number") return false;
  // Mutiere geparsten Wert auf kanonisches Feld, damit Aufrufer immer `bucket` sieht.
  (o as StoredBucket).bucket = bucket;
  return true;
}

function rollBucket(): ApplyAbBucket {
  const r = Math.random();
  if (r < HOLDOUT_RATIO) return "H";
  // Remaining (1 - HOLDOUT_RATIO) is split 50/50 between A and B.
  return r < HOLDOUT_RATIO + (1 - HOLDOUT_RATIO) / 2 ? "A" : "B";
}

/** Returns the storage bucket (A / B / H). Use this for analytics + tracking. */
export function getApplyAbBucket(): ApplyAbBucket {
  if (typeof window === "undefined") return "A";

  try {
    const stored = migrateLegacyAbValue<StoredBucket>({
      storageKey: STORAGE_KEY,
      allowedPlain: ["A", "B", "H"],
      toSchema: (plain, now) => ({ bucket: plain as ApplyAbBucket, assignedAt: now }),
      isValidSchema: isStored,
      testKey: TEST_KEY,
    });
    const now = Date.now();

    if (stored && now - stored.assignedAt < TTL_MS) {
      return stored.bucket;
    }

    const bucket = rollBucket();
    const next: StoredBucket = { bucket, assignedAt: now };
    getAbStorage().write(STORAGE_KEY, JSON.stringify(next));

    const wasReassign = Boolean(stored);

    trackFunnelEvent("apply_ab_assigned", {
      funnel: "apply",
      test: TEST_KEY,
      ab_test: TEST_KEY,
      ab_variant: bucket,
      holdout: bucket === "H",
      reassigned: wasReassign,
      ttl_days: 30,
      holdout_ratio: HOLDOUT_RATIO,
      browser_session_id: getBrowserSessionId(),
    });

    if (wasReassign && stored) {
      trackAbReassigned({
        testKey: TEST_KEY,
        fromVariant: stored.bucket,
        toVariant: bucket,
        expiredAfterDays: (now - stored.assignedAt) / (24 * 60 * 60 * 1000),
        ttlDays: 30,
        meta: {
          holdout_before: stored.bucket === "H",
          holdout_after: bucket === "H",
          holdout_ratio: HOLDOUT_RATIO,
        },
      });
      markAbReassigned({ testKey: TEST_KEY, from: stored.bucket, to: bucket, at: now });
    }

    return bucket;
  } catch {
    return "A";
  }
}

/**
 * Returns the copy variant to RENDER. Holdout receives the original ("A") copy
 * so it sits at the true baseline of "no change". Use `getApplyAbBucket()`
 * when reporting / tagging events.
 */
export function getApplyAbVariant(): ApplyAbVariant {
  const bucket = getApplyAbBucket();
  return bucket === "H" ? "A" : bucket;
}

export const APPLY_AB_TEST_KEY = TEST_KEY;
export const APPLY_AB_HOLDOUT_RATIO = HOLDOUT_RATIO;
