/**
 * Auto A/B System – Channel resolver.
 *
 * Normalizes UTM attribution into a small, stable channel taxonomy used by
 * the per-channel allocator. Purely deterministic, no side effects.
 *
 * Taxonomy (kept tiny on purpose so each bucket reaches significance):
 *   - meta         → Facebook / Instagram ads
 *   - tiktok       → TikTok ads
 *   - google       → Google ads / search
 *   - retargeting  → any source with utm_medium ∈ {retargeting, remarketing} or *_rt suffix
 *   - direct       → no attribution at all
 *   - other        → anything else (organic, referral, partner, …)
 */
export type AbChannel =
  | "meta"
  | "tiktok"
  | "google"
  | "retargeting"
  | "organic"
  | "referral"
  | "direct"
  | "other";

export const AB_CHANNELS: AbChannel[] = [
  "meta",
  "tiktok",
  "google",
  "retargeting",
  "organic",
  "referral",
  "direct",
  "other",
];

export type AbDevice = "mobile" | "desktop";

export interface ChannelInput {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
}

export function resolveAbChannel(input: ChannelInput | null | undefined): AbChannel {
  const src = (input?.utm_source ?? "").toLowerCase().trim();
  const med = (input?.utm_medium ?? "").toLowerCase().trim();
  const cmp = (input?.utm_campaign ?? "").toLowerCase().trim();

  if (!src && !med && !cmp) {
    // No UTM at all → check document.referrer if available (client-only).
    if (typeof document !== "undefined" && document.referrer) {
      try {
        const host = new URL(document.referrer).hostname;
        if (host && !host.endsWith(window.location.hostname)) {
          if (/(google|bing|duckduckgo|ecosia|yahoo)\./.test(host)) return "organic";
          return "referral";
        }
      } catch { /* ignore */ }
    }
    return "direct";
  }

  if (med === "retargeting" || med === "remarketing" || cmp.includes("retarget") || src.endsWith("_rt")) {
    return "retargeting";
  }
  if (src.includes("facebook") || src.includes("instagram") || src === "meta" || src === "fb" || src === "ig") {
    return "meta";
  }
  if (src.includes("tiktok") || src === "tt") return "tiktok";
  if (src.includes("google") || src === "adwords" || src === "gads") return "google";
  if (med === "organic" || med === "seo") return "organic";
  if (med === "referral") return "referral";

  return "other";
}

/** Device fingerprint from User-Agent (mobile vs desktop). Tablets → desktop. */
export function resolveAbDevice(userAgent?: string | null): AbDevice {
  const ua = (userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")) || "";
  return /mobi|android|iphone|ipod/i.test(ua) ? "mobile" : "desktop";
}

/** Composite bucket key used as the `channel` text in ab_channel_weights. */
export function deviceChannelKey(channel: AbChannel, device: AbDevice): string {
  return `${channel}:${device}`;
}
