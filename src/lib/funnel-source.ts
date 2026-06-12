/**
 * Funnel Source + Traffic Owner — client canon.
 *
 * One lead = exactly one funnel_source. Assigned at first touch, immutable.
 * Persisted in sessionStorage so it survives every page in the visit.
 *
 * Allowed values mirror the Postgres enum `funnel_source_t`.
 */
import { supabase } from "@/integrations/supabase/client";

export const FUNNEL_SOURCES = [
  "apply_direct",
  "qualify_filter",
  "high_income_angle",
  "external_inbound",
] as const;
export type FunnelSource = (typeof FUNNEL_SOURCES)[number];

const SS_KEY = "etc_funnel_source_v1";
const SS_OWNER_KEY = "etc_traffic_owner_v1";

/** Map a pathname to its canonical funnel_source. Null = unknown route. */
export function funnelSourceForPath(pathname: string): FunnelSource | null {
  const p = pathname.toLowerCase();
  if (p.startsWith("/apply")) return "apply_direct";
  if (p.startsWith("/qualify")) return "qualify_filter";
  if (p.startsWith("/high-income-skill")) return "high_income_angle";
  return null;
}

/** Capture (write-once) the funnel_source for this browser session. */
export function captureFunnelSourceFromUrl(): FunnelSource | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.sessionStorage.getItem(SS_KEY) as FunnelSource | null;
    if (existing && (FUNNEL_SOURCES as readonly string[]).includes(existing)) {
      return existing;
    }
    const fromPath = funnelSourceForPath(window.location.pathname);
    if (fromPath) {
      window.sessionStorage.setItem(SS_KEY, fromPath);
      return fromPath;
    }
  } catch { /* ignore */ }
  return null;
}

/** Read the captured funnel_source (may be null on first paint of unknown route). */
export function getFunnelSource(): FunnelSource | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(SS_KEY) as FunnelSource | null;
    return v && (FUNNEL_SOURCES as readonly string[]).includes(v) ? v : null;
  } catch { return null; }
}

/**
 * Resolve a funnel_source for a lead-creation call site.
 * Order: explicit > session > current path > 'external_inbound' fallback.
 * Fallback ONLY applies if neither route nor session has spoken — that
 * matches the spec's "external" bucket for non-funnel entry points.
 */
export function resolveFunnelSource(explicit?: FunnelSource | null): FunnelSource {
  if (explicit && (FUNNEL_SOURCES as readonly string[]).includes(explicit)) return explicit;
  return getFunnelSource()
      ?? (typeof window !== "undefined" ? funnelSourceForPath(window.location.pathname) : null)
      ?? "external_inbound";
}

/** Resolve traffic_owner from UTM params via the server mapping table. */
export async function resolveTrafficOwnerFromUtm(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const cached = window.sessionStorage.getItem(SS_OWNER_KEY);
    if (cached) return cached || null;

    const params = new URLSearchParams(window.location.search);
    const campaign = params.get("utm_campaign");
    if (!campaign) return null;
    const source = params.get("utm_source");

    const { data, error } = await supabase.rpc("resolve_traffic_owner" as never, {
      p_utm_campaign: campaign,
      p_utm_source: source,
    } as never);
    if (error) return null;
    const owner = (data as string | null) ?? null;
    try { window.sessionStorage.setItem(SS_OWNER_KEY, owner ?? ""); } catch { /* ignore */ }
    return owner;
  } catch {
    return null;
  }
}

/** Read cached traffic_owner without a network call. */
export function getCachedTrafficOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(SS_OWNER_KEY);
    return v ? v : null;
  } catch { return null; }
}
