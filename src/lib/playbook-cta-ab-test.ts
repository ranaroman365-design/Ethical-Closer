/**
 * Playbook Hero-CTA A/B Test (`playbook_hero_cta_v1`)
 *
 * Dedicated 2×2 factorial test on the **secondary "Playbook" button** in the
 * hero of /apply. Independent from `playbook_microcopy_v1` (which tests the
 * sub-text under the lead-magnet form) so we can isolate this CTA's lift on
 * **downstream booked calls** without confounding it with form-microcopy noise.
 *
 * Dimensions (factorial):
 *   - copy:      ANSEHEN  → "Playbook ansehen"            (control)
 *                ERHALTEN → "Kostenloses Playbook erhalten" (variant — explicit value + price)
 *   - placement: BELOW    → rendered under the primary CTA (control, current)
 *                ABOVE    → rendered above the primary CTA (variant — higher prominence)
 *
 * Buckets (4 total): A, B, C, D
 *   A → copy=ANSEHEN  · placement=BELOW   (control, ~30%)
 *   B → copy=ERHALTEN · placement=BELOW   (~30%)
 *   C → copy=ANSEHEN  · placement=ABOVE   (~20%)
 *   D → copy=ERHALTEN · placement=ABOVE   (~20%)
 *
 * Why this split: A is the established control and gets the largest share to
 * keep statistical power on the existing baseline. B isolates the copy effect
 * while holding placement constant. C/D explore the placement lever but get
 * less traffic since moving the playbook above the primary CTA carries some
 * cannibalization risk on the primary "Bewerbung starten" conversion.
 *
 * Persisted in localStorage (TTL 30d) so a returning visitor stays in bucket.
 * Bucket assignment fires `playbook_hero_cta_v1_assigned` for funnel joining.
 */

import { migrateLegacyAbValue } from "@/lib/ab-legacy-migration";
import { trackFunnelEvent } from "@/lib/track-event";
import { trackAbReassigned, getBrowserSessionId } from "@/lib/ab-session";
import { markAbReassigned } from "@/lib/ab-debug";
import { getAbStorage } from "@/lib/ab-storage";

export type PlaybookHeroCtaBucket = "A" | "B" | "C" | "D";
export type PlaybookHeroCtaCopy = "ANSEHEN" | "ERHALTEN";
export type PlaybookHeroCtaPlacement = "BELOW" | "ABOVE";

export const PLAYBOOK_HERO_CTA_TEST_KEY = "playbook_hero_cta_v1";
const STORAGE_KEY = `ab:${PLAYBOOK_HERO_CTA_TEST_KEY}`;
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d

interface StoredBucket {
  bucket: PlaybookHeroCtaBucket;
  assignedAt: number;
}

export interface PlaybookHeroCtaConfig {
  copy: PlaybookHeroCtaCopy;
  placement: PlaybookHeroCtaPlacement;
  /** Visible label for the CTA. */
  label: string;
}

export const PLAYBOOK_HERO_CTA_VARIANTS: Record<PlaybookHeroCtaBucket, PlaybookHeroCtaConfig> = {
  A: { copy: "ANSEHEN",  placement: "BELOW", label: "Playbook ansehen" },
  B: { copy: "ERHALTEN", placement: "BELOW", label: "Kostenloses Playbook erhalten" },
  C: { copy: "ANSEHEN",  placement: "ABOVE", label: "Playbook ansehen" },
  D: { copy: "ERHALTEN", placement: "ABOVE", label: "Kostenloses Playbook erhalten" },
};

const isBrowser = () => typeof window !== "undefined";

const isValidBucket = (v: unknown): v is PlaybookHeroCtaBucket =>
  v === "A" || v === "B" || v === "C" || v === "D";

function isStored(v: unknown): v is StoredBucket {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<StoredBucket>;
  return isValidBucket(o.bucket) && typeof o.assignedAt === "number";
}

/**
 * Returns sticky bucket. SSR-safe: returns "A" off-browser.
 * Split: A 30% / B 30% / C 20% / D 20%.
 */
export const getPlaybookHeroCtaBucket = (): PlaybookHeroCtaBucket => {
  if (!isBrowser()) return "A";
  try {
    const stored = migrateLegacyAbValue<StoredBucket>({
      storageKey: STORAGE_KEY,
      allowedPlain: ["A", "B", "C", "D"],
      toSchema: (plain, now) => ({ bucket: plain as PlaybookHeroCtaBucket, assignedAt: now }),
      isValidSchema: isStored,
      testKey: PLAYBOOK_HERO_CTA_TEST_KEY,
    });
    const now = Date.now();
    if (stored && now - stored.assignedAt < TTL_MS) return stored.bucket;

    const r = Math.random();
    // 0.00 – 0.30 → A · 0.30 – 0.60 → B · 0.60 – 0.80 → C · 0.80 – 1.00 → D
    const bucket: PlaybookHeroCtaBucket =
      r < 0.30 ? "A" : r < 0.60 ? "B" : r < 0.80 ? "C" : "D";

    getAbStorage().write(
      STORAGE_KEY,
      JSON.stringify({ bucket, assignedAt: now } satisfies StoredBucket),
    );

    const wasReassign = Boolean(stored);
    const config = PLAYBOOK_HERO_CTA_VARIANTS[bucket];

    trackFunnelEvent(`${PLAYBOOK_HERO_CTA_TEST_KEY}_assigned`, {
      funnel: "apply",
      ab_test: PLAYBOOK_HERO_CTA_TEST_KEY,
      ab_variant: bucket,
      copy_variant: config.copy,
      placement_variant: config.placement,
      reassigned: wasReassign,
      ttl_days: 30,
      browser_session_id: getBrowserSessionId(),
    });

    if (wasReassign && stored) {
      trackAbReassigned({
        testKey: PLAYBOOK_HERO_CTA_TEST_KEY,
        fromVariant: stored.bucket,
        toVariant: bucket,
        expiredAfterDays: (now - stored.assignedAt) / (24 * 60 * 60 * 1000),
        ttlDays: 30,
      });
      markAbReassigned({ testKey: PLAYBOOK_HERO_CTA_TEST_KEY, from: stored.bucket, to: bucket, at: now });
    }

    return bucket;
  } catch {
    return "A";
  }
};
