/**
 * Ad Attribution Capture (additive).
 *
 * Captures UTM + click-id parameters once per session and exposes them so
 * every `trackEvent` call can stamp them into `event_logs.payload`.
 *
 * Convention (Meta Ads dynamic URL parameters):
 *   utm_source   = traffic source (e.g. "facebook", "google")
 *   utm_medium   = paid / organic / referral
 *   utm_campaign = campaign name / id
 *   utm_term     = adset name / id
 *   utm_content  = ad / creative name / id
 *
 * Storage: sessionStorage so the attribution survives SPA navigation but
 * resets per visit (matches how `funnel_source` is resolved). Lives entirely
 * client-side — no schema change required.
 */

const STORAGE_KEY = "etc:ad_attribution:v1";

export interface AdAttribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbclid: string | null;
  gclid: string | null;
}

const EMPTY: AdAttribution = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_term: null,
  utm_content: null,
  fbclid: null,
  gclid: null,
};

const KEYS: Array<keyof AdAttribution> = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
];

function readSession(): AdAttribution {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<AdAttribution>;
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

function writeSession(attr: AdAttribution): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

/**
 * Reads URL params on the current page and merges any present UTM/click-id
 * values into the session cache. Existing values are NOT overwritten with
 * nulls so first-touch attribution is preserved across SPA navigation.
 */
export function captureAdAttributionFromUrl(): AdAttribution {
  if (typeof window === "undefined") return { ...EMPTY };
  const current = readSession();
  let changed = false;
  try {
    const params = new URLSearchParams(window.location.search);
    for (const k of KEYS) {
      const v = params.get(k);
      if (v && !current[k]) {
        current[k] = v;
        changed = true;
      }
    }
  } catch {
    /* never throw */
  }
  if (changed) writeSession(current);
  return current;
}

/** Pure getter — does NOT mutate. Used by trackEvent on every call. */
export function getAdAttribution(): AdAttribution {
  return readSession();
}

/** True if at least one attribution field has been captured. */
export function hasAdAttribution(attr: AdAttribution = readSession()): boolean {
  return KEYS.some((k) => !!attr[k]);
}
