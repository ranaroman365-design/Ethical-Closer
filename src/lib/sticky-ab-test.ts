/**
 * Generic Sticky A/B(/C) Bucket Store
 *
 * Lightweight, dependency-free bucket assigner usable for many parallel tests
 * on /apply (sticky CTA hint, future modal tests, …). Each test key gets its
 * own localStorage entry with a 30-day TTL, independent from the social-proof
 * copy test (which lives in apply-ab-test.ts and uses A/B/H buckets).
 *
 * Default behaviour = 50/50 A/B (backwards compatible).
 * Pass `variants: ["A","B","C"]` to enroll a 3-arm test with equal weights.
 *
 * Tracking convention: assignment fires `<test_key>_assigned` once per (re)roll
 * with `{ ab_test, ab_variant }` so it is consumable by the same dashboard /
 * RPC pattern as the main test.
 */
import { trackFunnelEvent } from "@/lib/track-event";
import { migrateLegacyAbValue } from "@/lib/ab-legacy-migration";
import { trackAbReassigned, getBrowserSessionId } from "@/lib/ab-session";
import { markAbReassigned } from "@/lib/ab-debug";
import { getAbStorage } from "@/lib/ab-storage";

export type StickyAbVariant = "A" | "B" | "C";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TTL_DAYS = 30;

interface StoredBucket {
  variant: StickyAbVariant;
  assignedAt: number;
}

function storageKey(testKey: string) {
  return `ab_${testKey}_v1`;
}

function makeIsStored(allowed: ReadonlyArray<StickyAbVariant>) {
  return (v: unknown): v is StoredBucket => {
    if (!v || typeof v !== "object") return false;
    const o = v as Partial<StoredBucket>;
    return (
      typeof o.variant === "string" &&
      (allowed as readonly string[]).includes(o.variant) &&
      typeof o.assignedAt === "number"
    );
  };
}

/**
 * Returns the sticky A/B(/C) variant for a given test key.
 *
 * @param testKey  Stable test identifier (used for storage key + assigned event).
 * @param opts.variants  Optional variant pool (default: ["A","B"], equal-weight).
 *                       Pass ["A","B","C"] to enroll a 3-arm test.
 * @param opts.assignedEventName  Custom event name for the assignment event.
 */
export function getStickyAbVariant(
  testKey: string,
  opts?: {
    assignedEventName?: string;
    variants?: ReadonlyArray<StickyAbVariant>;
  },
): StickyAbVariant {
  if (typeof window === "undefined") return "A";

  const variants = opts?.variants && opts.variants.length > 0 ? opts.variants : (["A", "B"] as const);
  const isStored = makeIsStored(variants);

  try {
    const key = storageKey(testKey);
    const stored = migrateLegacyAbValue<StoredBucket>({
      storageKey: key,
      allowedPlain: variants as ReadonlyArray<string>,
      toSchema: (plain, now) => ({ variant: plain as StickyAbVariant, assignedAt: now }),
      isValidSchema: isStored,
      testKey,
    });
    const now = Date.now();

    // Defensive: if a stored variant is no longer in the active pool (e.g.
    // pool was shrunk from A/B/C back to A/B), treat as expired and re-roll.
    if (stored && now - stored.assignedAt < TTL_MS && (variants as readonly string[]).includes(stored.variant)) {
      return stored.variant;
    }

    // Equal-weight assignment across the active pool (deterministic randomness).
    const variant: StickyAbVariant = variants[Math.floor(Math.random() * variants.length)];
    getAbStorage().write(
      key,
      JSON.stringify({ variant, assignedAt: now } satisfies StoredBucket),
    );

    const wasReassign = Boolean(stored);

    trackFunnelEvent(opts?.assignedEventName ?? `${testKey}_assigned`, {
      funnel: "apply",
      ab_test: testKey,
      ab_variant: variant,
      reassigned: wasReassign,
      ttl_days: TTL_DAYS,
      arms: variants.length,
      browser_session_id: getBrowserSessionId(),
    });

    if (wasReassign && stored) {
      trackAbReassigned({
        testKey,
        fromVariant: stored.variant,
        toVariant: variant,
        expiredAfterDays: (now - stored.assignedAt) / (24 * 60 * 60 * 1000),
        ttlDays: TTL_DAYS,
      });
      markAbReassigned({ testKey, from: stored.variant, to: variant, at: now });
    }

    return variant;
  } catch {
    return "A";
  }
}
