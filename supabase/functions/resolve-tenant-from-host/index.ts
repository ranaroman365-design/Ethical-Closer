// Resolve tenant from request host (partner_domains lookup with safe fallback)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INTERNAL_TENANT_ID = "00000000-0000-0000-0000-000000000001";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let host = "";
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      host = (body.host ?? "").toString().toLowerCase().trim();
    }
    if (!host) {
      const url = new URL(req.url);
      host = (url.searchParams.get("host") ?? req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase().trim();
    }
  } catch {
    host = "";
  }

  // Strip port
  host = host.replace(/:\d+$/, "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let tenantId = INTERNAL_TENANT_ID;
  let tenantName = "etc-internal";
  let domainStatus: string | null = null;
  let matched = false;

  if (host) {
    const { data: dom } = await supabase
      .from("partner_domains")
      .select("tenant_id, status, tenants(name)")
      .eq("domain", host)
      .eq("status", "verified")
      .maybeSingle();

    if (dom?.tenant_id) {
      tenantId = dom.tenant_id;
      tenantName = (dom as any).tenants?.name ?? tenantName;
      domainStatus = dom.status;
      matched = true;
    }
  }

  return new Response(
    JSON.stringify({
      tenant_id: tenantId,
      tenant_name: tenantName,
      domain_status: domainStatus,
      matched,
      fallback: !matched,
      host,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
});
