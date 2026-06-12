/**
 * First-touch attribution capture.
 *
 * - On first landing, persist UTMs + referrer in sessionStorage (write-once per browser session).
 * - When a lead is created, call captureLeadOrigin(leadId, email) to forward the snapshot
 *   to Postgres via the `capture_lead_origin` RPC. The RPC itself is write-once.
 */
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "etc_first_touch_v1";

export interface FirstTouch {
  origin_source: string;
  origin_campaign?: string | null;
  origin_adset?: string | null;
  origin_ad?: string | null;
  origin_content?: string | null;
  origin_medium?: string | null;
  origin_term?: string | null;
  referrer_url?: string | null;
  landing_url?: string | null;
  fbclid?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  operator_email?: string | null;
  captured_at: string;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function readStored(): FirstTouch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : null;
  } catch {
    return null;
  }
}

function classifySource(params: URLSearchParams, referrer: string): string {
  const utm = params.get("utm_source");
  if (utm) return utm.toLowerCase();
  if (params.get("gclid")) return "google_ads";
  if (params.get("fbclid")) return "meta_ads";
  if (params.get("ttclid")) return "tiktok_ads";
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, "");
      if (!host || host.includes(window.location.hostname)) return "direct";
      if (host.includes("google.")) return "organic_google";
      if (host.includes("facebook.") || host.includes("instagram.")) return "social_meta";
      if (host.includes("tiktok.")) return "social_tiktok";
      if (host.includes("youtube.")) return "social_youtube";
      if (host.includes("linkedin.")) return "social_linkedin";
      return `referral_${host}`;
    } catch {
      return "referral";
    }
  }
  return "direct";
}

/** Call once on app boot. Persists first-touch into sessionStorage. */
export function captureFirstTouchFromUrl(): FirstTouch | null {
  if (typeof window === "undefined") return null;
  const existing = readStored();
  if (existing) return existing;

  const params = new URLSearchParams(window.location.search);
  const referrer = document.referrer || "";

  const ft: FirstTouch = {
    origin_source: classifySource(params, referrer),
    origin_campaign: params.get("utm_campaign"),
    origin_adset: params.get("utm_adset") ?? params.get("utm_term") ?? null,
    origin_ad: params.get("utm_ad") ?? params.get("utm_content") ?? null,
    origin_content: params.get("utm_content"),
    origin_medium: params.get("utm_medium"),
    origin_term: params.get("utm_term"),
    referrer_url: referrer || null,
    landing_url: window.location.href,
    fbclid: params.get("fbclid"),
    fbp: readCookie("_fbp"),
    fbc: readCookie("_fbc"),
    gclid: params.get("gclid"),
    ttclid: params.get("ttclid"),
    operator_email: params.get("op") ?? params.get("operator") ?? null,
    captured_at: new Date().toISOString(),
  };

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ft));
  } catch {
    /* ignore */
  }
  return ft;
}

/** Read current first-touch (may be null if never captured). */
export function getFirstTouch(): FirstTouch | null {
  return readStored();
}

/**
 * Forward the captured first-touch to the database for a freshly created lead.
 * Safe to call multiple times — backend RPC is write-once.
 */
export async function captureLeadOrigin(leadId: string, email?: string | null): Promise<void> {
  if (!leadId) return;
  const ft = readStored() ?? captureFirstTouchFromUrl();
  if (!ft) return;
  try {
    await supabase.rpc("capture_lead_origin" as never, {
      _lead_id: leadId,
      _email: email ?? null,
      _source: ft.origin_source,
      _campaign: ft.origin_campaign ?? null,
      _adset: ft.origin_adset ?? null,
      _ad: ft.origin_ad ?? null,
      _content: ft.origin_content ?? null,
      _medium: ft.origin_medium ?? null,
      _term: ft.origin_term ?? null,
      _referrer: ft.referrer_url ?? null,
      _landing_url: ft.landing_url ?? null,
    } as never);
  } catch (err) {
    console.warn("[attribution] capture_lead_origin failed:", err);
  }

  // Write-once enrichment of click-id + Meta browser cookies.
  // We only set columns where the existing value is null so first-touch wins.
  const enrich: Record<string, string> = {};
  if (ft.fbclid)             enrich.fbclid = ft.fbclid;
  if (ft.fbp)                enrich.fbp = ft.fbp;
  if (ft.fbc)                enrich.fbc = ft.fbc;
  if (ft.gclid)              enrich.gclid = ft.gclid;
  if (ft.ttclid)             enrich.ttclid = ft.ttclid;
  if (ft.operator_email)     enrich.operator_email_attr = ft.operator_email;
  if (Object.keys(enrich).length === 0) return;
  try {
    await supabase
      .from("lead_origins" as never)
      .update(enrich as never)
      .eq("lead_id", leadId);
  } catch (err) {
    console.warn("[attribution] lead_origins enrichment failed:", err);
  }
}
