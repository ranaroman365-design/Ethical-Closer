/**
 * Lightweight cookie-based A/B/n variant assignment.
 *
 * - Sticky per (testKey, browser) via `localStorage` + cookie fallback.
 * - Equal-weight random split across provided variants.
 * - URL override: ?v=A (or ?<testKey>=A) forces a variant for QA.
 *
 * Usage:
 *   const variant = getOrAssignVariant("system_hero_v1", ["A", "B", "C"]);
 */

const STORAGE_PREFIX = "ab.";
const COOKIE_MAX_AGE_DAYS = 90;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function getOrAssignVariant<V extends string>(
  testKey: string,
  variants: readonly V[],
): V {
  if (variants.length === 0) {
    throw new Error("getOrAssignVariant: variants[] required");
  }
  const storageKey = `${STORAGE_PREFIX}${testKey}`;
  const cookieKey = `ab_${testKey}`;

  // 1. URL override (QA)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const override = (params.get("v") || params.get(testKey) || "").toUpperCase();
    if (override && (variants as readonly string[]).includes(override)) {
      try {
        localStorage.setItem(storageKey, override);
      } catch {
        /* ignore */
      }
      writeCookie(cookieKey, override);
      return override as V;
    }
  }

  // 2. Existing assignment
  let existing: string | null = null;
  try {
    existing = typeof localStorage !== "undefined"
      ? localStorage.getItem(storageKey)
      : null;
  } catch {
    /* ignore */
  }
  if (!existing) existing = readCookie(cookieKey);
  if (existing && (variants as readonly string[]).includes(existing)) {
    return existing as V;
  }

  // 3. Fresh assignment — equal split
  const idx = Math.floor(Math.random() * variants.length);
  const assigned = variants[idx];
  try {
    localStorage.setItem(storageKey, assigned);
  } catch {
    /* ignore */
  }
  writeCookie(cookieKey, assigned);
  return assigned;
}
