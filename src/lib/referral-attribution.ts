// Captures ?ref= and ?ch= on landing and stores them for later attribution.
const KEY = 'etc_referral_attribution';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface Attribution {
  ref: string | null;
  channel: string | null;
  capturedAt: number;
}

export function captureReferralFromUrl() {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const ch = params.get('ch');
    if (!ref && !ch) return;
    const payload: Attribution = { ref, channel: ch, capturedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

export function getStoredAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const attr = JSON.parse(raw) as Attribution;
    // 30-day expiry
    if (Date.now() - attr.capturedAt > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return attr;
  } catch {
    return null;
  }
}

export function clearAttribution() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
