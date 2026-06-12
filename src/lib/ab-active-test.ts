/**
 * Lean A/B Test Layer — Single Active Test
 * ──────────────────────────────────────────────────────────────────────────
 * Rules (per spec):
 *  - Exactly ONE active test at a time. Change `ACTIVE_TEST` to roll a new one.
 *  - Deterministic 50/50 split derived from the browser session id, so the
 *    same session always sees the same variant — no flicker, no reroll.
 *  - Persisted in localStorage (`ab_active_test_v1`) keyed by test_name; if the
 *    active test_name changes, the stored bucket is automatically replaced.
 *  - Every tracked Pixel event is auto-enriched with `ab_test_name`, `ab_variant`,
 *    `funnel_source`, `landing_page`, `session_id`.
 *  - Set ACTIVE_TEST to null to disable A/B injection entirely.
 */
import { getBrowserSessionId } from "@/lib/ab-session";

export interface ActiveAbTest {
  /** Stable test identifier — appears on every event as `ab_test_name`. */
  name: string;
  /** Two variants only. 50/50 deterministic split. */
  variants: readonly ["A", "B"];
  /** Optional human description for the admin dashboard. */
  description?: string;
}

/**
 * The single active A/B test. Set to `null` to disable.
 * Change `name` to start a new test (re-assigns all sessions).
 */
export const ACTIVE_TEST: ActiveAbTest | null = {
  name: "masterofsales_hero_angle_v1",
  variants: ["A", "B"] as const,
  description: "Hero angle test on /apply landing.",
};

const STORAGE_KEY = "ab_active_test_v1";

interface StoredBucket {
  test_name: string;
  variant: "A" | "B";
  assigned_at: number;
}

/** Deterministic 0/1 hash of session id → variant index. */
function hashToBit(input: string): 0 | 1 {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 2) as 0 | 1;
}

export interface AbAssignment {
  ab_test_name: string;
  ab_variant: "A" | "B";
}

/** Returns the active assignment, or null if no test is active. */
export function getActiveAbAssignment(): AbAssignment | null {
  if (typeof window === "undefined" || !ACTIVE_TEST) return null;
  const test = ACTIVE_TEST;

  // Try cached
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as StoredBucket;
      if (
        stored?.test_name === test.name &&
        (stored.variant === "A" || stored.variant === "B")
      ) {
        return { ab_test_name: stored.test_name, ab_variant: stored.variant };
      }
    }
  } catch {
    /* fall through to re-assign */
  }

  // Assign — deterministic per browser session.
  const sessionId = getBrowserSessionId();
  const variant = test.variants[hashToBit(`${test.name}:${sessionId}`)];
  const next: StoredBucket = {
    test_name: test.name,
    variant,
    assigned_at: Date.now(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return { ab_test_name: test.name, ab_variant: variant };
}

/** Pull funnel/source context that should ride along on every event. */
export function getAbContextParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const ctx: Record<string, string> = {};
  const a = getActiveAbAssignment();
  if (a) {
    ctx.ab_test_name = a.ab_test_name;
    ctx.ab_variant = a.ab_variant;
  }
  try {
    ctx.session_id = getBrowserSessionId();
  } catch { /* ignore */ }
  try {
    const fs = window.localStorage.getItem("funnel_source");
    if (fs) ctx.funnel_source = fs;
  } catch { /* ignore */ }
  try {
    if (typeof window.location !== "undefined") {
      ctx.landing_page = window.location.pathname;
    }
  } catch { /* ignore */ }
  return ctx;
}
