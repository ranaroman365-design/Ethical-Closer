/**
 * Playbook Microcopy A/B Test (`playbook_microcopy_v1`)
 *
 * Dedicated test for the microcopy block under the playbook lead-magnet CTA.
 * Independent from the global Apply A/B test so we can isolate the lift on the
 * **secondary conversion** (lead-magnet submit) without confounding it with the
 * primary landing-page copy variants.
 *
 * Buckets:
 *   - A  → Outcome-oriented "Was du bekommst" framing (control hypothesis)
 *   - B  → Risk-reversal + speed framing ("kein Spam, sofort im Postfach")
 *   - H  → Holdout: shows the original, neutral expectation note (true baseline)
 *
 * Split: 45 / 45 / 10  (matches APPLY_AB holdout sizing convention)
 *
 * Persisted in localStorage so a returning visitor stays in the same bucket.
 */

import { migrateLegacyAbValue } from "@/lib/ab-legacy-migration";
import { trackFunnelEvent } from "@/lib/track-event";
import { trackAbReassigned, getBrowserSessionId } from "@/lib/ab-session";
import { markAbReassigned } from "@/lib/ab-debug";
import { getAbStorage } from "@/lib/ab-storage";

export type PlaybookAbBucket = "A" | "B" | "H";

export const PLAYBOOK_AB_TEST_KEY = "playbook_microcopy_v1";
const STORAGE_KEY = `ab:${PLAYBOOK_AB_TEST_KEY}`;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d, an apply/sticky angeglichen

interface StoredBucket {
  bucket: PlaybookAbBucket;
  assignedAt: number;
}

export interface PlaybookCopy {
  /** Primary benefit line — bold, reassuring. */
  benefit: string;
  /** Secondary expectation/legal note — small print under benefit. */
  note: string;
}

export const PLAYBOOK_AB_COPY: Record<PlaybookAbBucket, PlaybookCopy> = {
  // Control: outcome framing — what the reader gets.
  A: {
    benefit: "In 10 Minuten lesbar — direkt anwendbar im nächsten Gespräch.",
    note: "Kein Ersatz für Praxis · Ergebnisse hängen vom Einsatz ab · Lieferung per E-Mail",
  },
  // Variant: risk-reversal + immediacy — addresses the two top objections
  // (spam fear + delay) explicitly to lift email submits.
  B: {
    benefit: "Sofort im Postfach — kein Spam, jederzeit abbestellbar.",
    note: "PDF · 7 Seiten · Lieferung in unter 60 Sekunden · DSGVO-konform",
  },
  // Holdout: identical to A copy but tagged separately so we can detect any
  // drift caused purely by re-bucketing / observer-effect noise.
  H: {
    benefit: "In 10 Minuten lesbar — direkt anwendbar im nächsten Gespräch.",
    note: "Kein Ersatz für Praxis · Ergebnisse hängen vom Einsatz ab · Lieferung per E-Mail",
  },
};

const isBrowser = () => typeof window !== "undefined";

const isValidBucket = (v: unknown): v is PlaybookAbBucket =>
  v === "A" || v === "B" || v === "H";

function isStored(v: unknown): v is StoredBucket {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<StoredBucket>;
  return isValidBucket(o.bucket) && typeof o.assignedAt === "number";
}

/**
 * Returns a sticky bucket for this visitor.
 * 45% A · 45% B · 10% H (holdout). SSR-safe: returns "A" off-browser.
 *
 * Migriert Plain-Legacy-Werte ("A" / "B" / "H") einmalig ins
 * `{ bucket, assignedAt }`-Schema, ohne den Bucket zu ändern.
 */
export const getPlaybookAbBucket = (): PlaybookAbBucket => {
  if (!isBrowser()) return "A";
  try {
    const stored = migrateLegacyAbValue<StoredBucket>({
      storageKey: STORAGE_KEY,
      allowedPlain: ["A", "B", "H"],
      toSchema: (plain, now) => ({ bucket: plain as PlaybookAbBucket, assignedAt: now }),
      isValidSchema: isStored,
      testKey: PLAYBOOK_AB_TEST_KEY,
    });
    const now = Date.now();
    if (stored && now - stored.assignedAt < TTL_MS) return stored.bucket;

    const r = Math.random();
    const bucket: PlaybookAbBucket = r < 0.1 ? "H" : r < 0.55 ? "A" : "B";
    getAbStorage().write(
      STORAGE_KEY,
      JSON.stringify({ bucket, assignedAt: now } satisfies StoredBucket),
    );

    const wasReassign = Boolean(stored);

    trackFunnelEvent(`${PLAYBOOK_AB_TEST_KEY}_assigned`, {
      funnel: "apply",
      ab_test: PLAYBOOK_AB_TEST_KEY,
      ab_variant: bucket,
      holdout: bucket === "H",
      reassigned: wasReassign,
      ttl_days: 30,
      browser_session_id: getBrowserSessionId(),
    });

    if (wasReassign && stored) {
      trackAbReassigned({
        testKey: PLAYBOOK_AB_TEST_KEY,
        fromVariant: stored.bucket,
        toVariant: bucket,
        expiredAfterDays: (now - stored.assignedAt) / (24 * 60 * 60 * 1000),
        ttlDays: 30,
        meta: {
          holdout_before: stored.bucket === "H",
          holdout_after: bucket === "H",
        },
      });
      markAbReassigned({ testKey: PLAYBOOK_AB_TEST_KEY, from: stored.bucket, to: bucket, at: now });
    }

    return bucket;
  } catch {
    return "A";
  }
};
