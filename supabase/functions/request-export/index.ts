import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RISK_MAP: Record<string, string> = {
  user_list: "low", pipeline_segment: "medium", tenant_export: "high",
  config_export: "critical", prompt_export: "critical", workflow_export: "critical",
  finance_report: "medium", ip_asset_export: "critical",
};

const Schema = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  export_type: z.string().min(1),
  export_scope: z.string().min(1),
  reason: z.string().min(5),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    ).auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const { tenant_id, export_type, export_scope, reason } = parsed.data;
    const risk_level = RISK_MAP[export_type] ?? "medium";
    const needs_approval = risk_level === "high" || risk_level === "critical";
    const step_up = risk_level === "critical";

    // Check permission
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).single();
    const role = roleData?.role ?? "member";
    const exportPerm = `export_${risk_level}`;

    // Only owner can do critical exports
    if (risk_level === "critical" && role !== "owner") {
      await supabase.from("security_events").insert({
        severity: "high", event_type: "forbidden_export_attempt",
        actor_user_id: user.id, tenant_id,
        summary: `Non-owner attempted critical export: ${export_type}`,
        details: { export_type, role },
      });
      return json({ error: "Critical exports require owner access" }, 403);
    }

    const forensic_marker = `EXP-${Date.now()}-${user.id.slice(0, 8)}`;

    const { data: exp, error: expErr } = await supabase.from("export_requests").insert({
      requested_by: user.id,
      requester_role_key: role,
      tenant_id,
      export_type,
      resource_type: export_type,
      export_scope,
      requested_reason: reason,
      risk_level,
      status: needs_approval ? "requested" : "queued",
      step_up_required: step_up,
      forensic_marker,
    }).select().single();

    if (expErr) return json({ error: expErr.message }, 500);

    // Audit
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      action: "export_requested",
      action_type: "export_requested",
      resource_type: "export_requests",
      resource_id: exp.id,
      actor_role_key: role,
      acting_tenant_id: tenant_id,
      risk_score: risk_level === "critical" ? 90 : risk_level === "high" ? 70 : 30,
      after_state: { export_type, risk_level, forensic_marker },
    });

    return json({ success: true, export_id: exp.id, risk_level, needs_approval, step_up_required: step_up });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
