import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Schema = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  requested_role_key: z.string().min(1),
  requested_permissions: z.array(z.string()).optional().default([]),
  reason: z.string().min(10),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user
    const { data: { user }, error: authErr } = await createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    ).auth.getUser(authHeader.replace("Bearer ", ""));

    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const { tenant_id, requested_role_key, requested_permissions, reason } = parsed.data;

    // Get user's current role
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).single();
    const currentRole = roleData?.role ?? "member";

    // Forbidden escalation targets
    const FORBIDDEN = ["owner"];
    if (FORBIDDEN.includes(requested_role_key)) {
      return json({ error: "Cannot escalate to owner role" }, 403);
    }

    // Create escalation request
    const { data: esc, error: escErr } = await supabase
      .from("role_escalation_requests")
      .insert({
        requester_id: user.id,
        tenant_id,
        requested_role: requested_role_key,
        requested_permissions,
        reason,
        status: "pending",
      })
      .select()
      .single();

    if (escErr) return json({ error: escErr.message }, 500);

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      action: "role_escalation_requested",
      action_type: "role_escalation_requested",
      resource_type: "role_escalation_requests",
      resource_id: esc.id,
      actor_role_key: currentRole,
      acting_tenant_id: tenant_id,
      risk_score: 30,
      after_state: { requested_role_key, reason },
    });

    return json({ success: true, escalation_id: esc.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
