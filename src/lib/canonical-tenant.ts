/**
 * Canonical Tenant Helpers (Phase 1 of Coherence Upgrade)
 * Non-breaking, opt-in. Existing flows fall back to internal tenant.
 */
import { supabase } from "@/integrations/supabase/client";

export const INTERNAL_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export interface TenantResolution {
  tenant_id: string;
  tenant_name: string;
  domain_status: string | null;
  matched: boolean;
  fallback: boolean;
  host: string;
}

/**
 * Resolve tenant from a host string. Falls back to internal tenant on miss.
 * Calls the resolve-tenant-from-host edge function.
 */
export async function resolveTenantFromHost(host?: string): Promise<TenantResolution> {
  const h = (host ?? (typeof window !== "undefined" ? window.location.host : "")).toLowerCase();
  const { data, error } = await supabase.functions.invoke("resolve-tenant-from-host", {
    body: { host: h },
  });
  if (error || !data) {
    return {
      tenant_id: INTERNAL_TENANT_ID,
      tenant_name: "etc-internal",
      domain_status: null,
      matched: false,
      fallback: true,
      host: h,
    };
  }
  return data as TenantResolution;
}

/**
 * Get the current user's assigned tenant (for partner_admin users).
 * Returns internal tenant for non-partner users.
 */
export async function getCurrentTenantId(userId: string): Promise<string> {
  const { data } = await supabase
    .from("partner_tenant_assignments")
    .select("tenant_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.tenant_id as string | undefined) ?? INTERNAL_TENANT_ID;
}
