/**
 * Forward known tracking / attribution query parameters from the current URL
 * onto an outbound link so the click-ID chain (Meta fbclid, Google gclid,
 * TikTok ttclid, UTM set) is preserved across the quiz → booking funnel.
 *
 * Additive helper — does not mutate any existing routing. Returns a path
 * string ready to be passed to <Link to=...>.
 *
 * Rules:
 *  - SSR-safe: returns the input unchanged when `window` is missing.
 *  - Never overrides params already present on the target (target wins).
 *  - Only known keys are forwarded — no PII, no full-window scrape.
 */
const FORWARD_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "fbclid",
  "gclid",
  "ttclid",
  "msclkid",
  "li_fat_id",
] as const;

export function forwardTrackingParams(targetPath: string): string {
  if (typeof window === "undefined") return targetPath;
  try {
    const incoming = new URLSearchParams(window.location.search);
    // Split target into path+query+hash so we can merge cleanly.
    const hashIndex = targetPath.indexOf("#");
    const hash = hashIndex >= 0 ? targetPath.slice(hashIndex) : "";
    const pathAndQuery = hashIndex >= 0 ? targetPath.slice(0, hashIndex) : targetPath;
    const qIndex = pathAndQuery.indexOf("?");
    const basePath = qIndex >= 0 ? pathAndQuery.slice(0, qIndex) : pathAndQuery;
    const targetQuery = new URLSearchParams(qIndex >= 0 ? pathAndQuery.slice(qIndex + 1) : "");

    for (const key of FORWARD_KEYS) {
      const val = incoming.get(key);
      if (val && !targetQuery.has(key)) {
        targetQuery.set(key, val);
      }
    }
    const qs = targetQuery.toString();
    return `${basePath}${qs ? `?${qs}` : ""}${hash}`;
  } catch {
    return targetPath;
  }
}
