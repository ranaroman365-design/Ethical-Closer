import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Collect all user data from relevant tables
  const [profile, consents, agreements, calls, commissions, reflections, auditLogs] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_consents").select("*").eq("user_id", user.id),
    supabase.from("legal_agreements").select("*").eq("user_id", user.id),
    supabase.from("calls").select("id,call_type,status,result,revenue,created_at").eq("user_id", user.id).limit(500),
    supabase.from("commissions").select("id,amount,role,payout_status,created_at").eq("user_id", user.id).limit(500),
    supabase.from("daily_reflections").select("*").eq("user_id", user.id).limit(200),
    supabase.from("audit_logs").select("action,note,created_at").eq("actor_id", user.id).limit(200),
  ]);

  const exportData = {
    export_date: new Date().toISOString(),
    user_id: user.id,
    email: user.email,
    profile: profile.data,
    consents: consents.data,
    legal_agreements: agreements.data,
    calls: calls.data,
    commissions: commissions.data,
    daily_reflections: reflections.data,
    audit_logs: auditLogs.data,
  };

  // Log the export
  const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await serviceClient.from("audit_logs").insert({
    action: "gdpr_data_export",
    actor_id: user.id,
    source_type: "system",
    note: "DSGVO Datenauskunft exportiert",
  });

  return new Response(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="data-export-${user.id}.json"`,
    },
  });
});
