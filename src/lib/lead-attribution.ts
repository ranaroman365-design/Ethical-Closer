import { supabase } from "@/integrations/supabase/client";
import { getOrCreateAttributionSessionId, readAttributionSessionId } from "@/lib/attribution-session";

const CAPTURED_FLAG_PREFIX = "etc_lead_attribution_captured_v1:";

export function captureCurrentPageAttribution(scope: string): string | null {
  if (typeof window === "undefined") return null;

  const sessionId = getOrCreateAttributionSessionId();
  const flag = `${CAPTURED_FLAG_PREFIX}${scope}`;
  if (window.sessionStorage.getItem(flag) === "1") return sessionId;

  const params = new URLSearchParams(window.location.search);
  const payload = {
    p_session_id: sessionId,
    p_utm_source: params.get("utm_source"),
    p_utm_medium: params.get("utm_medium"),
    p_utm_campaign: params.get("utm_campaign"),
    p_utm_content: params.get("utm_content"),
    p_utm_term: params.get("utm_term"),
    p_fbclid: params.get("fbclid"),
    p_gclid: params.get("gclid"),
    p_referrer: document.referrer || null,
    p_landing_page_url: window.location.href,
    p_user_agent: navigator.userAgent,
  };

  window.sessionStorage.setItem(flag, "1");
  supabase.rpc("capture_lead_attribution", payload).then(({ error }) => {
    if (error) {
      console.warn(`[${scope}] capture_lead_attribution failed:`, error);
      window.sessionStorage.removeItem(flag);
    }
  });

  return sessionId;
}

export function getCurrentAttributionSessionId(): string | null {
  return readAttributionSessionId();
}

export async function linkCurrentLeadAttribution(leadId?: string | null, email?: string | null): Promise<void> {
  const sessionId = readAttributionSessionId();
  if (!sessionId || !leadId) return;

  const { error } = await supabase.rpc("link_lead_attribution" as never, {
    p_session_id: sessionId,
    p_lead_id: leadId,
    p_email: email?.trim().toLowerCase() || null,
  } as never);
  if (error) console.warn("[lead-attribution] link_lead_attribution failed:", error);
}