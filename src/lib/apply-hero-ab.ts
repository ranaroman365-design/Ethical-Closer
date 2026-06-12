/**
 * /apply Hero-Variant A/B/C Test (independent of social-proof test).
 *
 * Tests 3 above-the-fold hero treatments without removing or breaking the
 * existing time-bucket micro-commitment or any running CTA copy. Sticky per
 * browser via localStorage with a 30-day TTL.
 *
 * Variants:
 *  - "TIME"   (33 %): control. Existing time-investment micro-commitment.
 *  - "INCOME" (33 %): swaps the time chips for income chips
 *                     ("2.000–5.000 €", "5.000–10.000 €", "10.000 €+"). Routes
 *                     to /apply/quiz?intent=<bucket> (read by ApplyQuiz only
 *                     for tracking — does NOT mutate quiz logic).
 *  - "CTA90"  (34 %): keeps the time chips control AND swaps the default
 *                     ApplyCTA label to "Bewerbung starten (90 Sek)".
 *
 * No holdout cell — the existing social-proof A/B already provides one.
 *
 * Bucket assignment is logged via `apply_hero_ab_assigned` so we can split
 * conversion by bucket.
 */
import { trackFunnelEvent } from "@/lib/track-event";
import { getAbStorage } from "@/lib/ab-storage";

export type ApplyHeroVariant = "TIME" | "INCOME" | "CTA90";

const STORAGE_KEY = "apply_hero_ab_v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TEST_KEY = "hero_variant_v1";

interface Stored {
  variant: ApplyHeroVariant;
  assignedAt: number;
}

function isVariant(v: unknown): v is ApplyHeroVariant {
  return v === "TIME" || v === "INCOME" || v === "CTA90";
}

function isStored(v: unknown): v is Stored {
  if (!v || typeof v !== "object") return false;
  const o = v as Partial<Stored>;
  return isVariant(o.variant) && typeof o.assignedAt === "number";
}

function rollVariant(): ApplyHeroVariant {
  const r = Math.random();
  if (r < 1 / 3) return "TIME";
  if (r < 2 / 3) return "INCOME";
  return "CTA90";
}

export function getApplyHeroVariant(): ApplyHeroVariant {
  if (typeof window === "undefined") return "TIME";
  try {
    const storage = getAbStorage();
    const raw = storage.read(STORAGE_KEY);
    const now = Date.now();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (isStored(parsed) && now - parsed.assignedAt < TTL_MS) {
          return parsed.variant;
        }
      } catch {
        /* fall through to re-roll */
      }
    }
    const variant = rollVariant();
    storage.write(STORAGE_KEY, JSON.stringify({ variant, assignedAt: now }));
    trackFunnelEvent("apply_hero_ab_assigned", {
      funnel: "apply",
      test: TEST_KEY,
      ab_test: TEST_KEY,
      ab_variant: variant,
      ttl_days: 30,
    });
    return variant;
  } catch {
    return "TIME";
  }
}

export const APPLY_HERO_AB_TEST_KEY = TEST_KEY;

export const CTA90_LABEL = "Bewerbung starten (90 Sek)";
