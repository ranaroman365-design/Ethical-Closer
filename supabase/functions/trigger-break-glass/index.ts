import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    // Owner-only check
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).single();
    if (roleData?.role !== "owner") {
      await supabase.from("security_events").insert({
        severity: "critical",
        event_type: "break_glass_non_owner_attempt",
        actor_user_id: user.id,
        summary: `Non-owner ${user.id} attempted break-glass activation`,
        status: "open",
      });
      return json({ error: "Owner access required" }, 403);
    }

    const { reason, duration_minutes = 30 } = await req.json();
    if (!reason || typeof reason !== "string" || reason.length < 10) {
      return json({ error: "Reason required (min 10 chars)" }, 400);
    }

    const expiresAt = new Date(Date.now() + Math.min(duration_minutes, 60) * 60 * 1000).toISOString();

    const { data: event, error } = await supabase.from("break_glass_events").insert({
      triggered_by_user_id: user.id,
      trigger_reason: reason,
      expires_at: expiresAt,
      status: "active",
    }).select().single();

    if (error) return json({ error: error.message }, 500);

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      action: "break_glass_activated",
      action_type: "break_glass_activated",
      resource_type: "break_glass_events",
      resource_id: event.id,
      actor_role_key: "owner",
      risk_score: 95,
      after_state: { reason, expires_at: expiresAt, duration_minutes },
      ip_address: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });

    // Security event for visibility
    await supabase.from("security_events").insert({
      severity: "critical",
      event_type: "break_glass_activated",
      actor_user_id: user.id,
      summary: `Break-glass activated by owner. Reason: ${reason}. Expires: ${expiresAt}`,
      status: "open",
    });

    return json({ success: true, event_id: event.id, expires_at: expiresAt });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
