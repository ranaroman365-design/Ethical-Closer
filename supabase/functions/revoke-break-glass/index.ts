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

    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).single();
    if (roleData?.role !== "owner") return json({ error: "Owner access required" }, 403);

    const { event_id } = await req.json();
    if (!event_id) return json({ error: "event_id required" }, 400);

    await supabase.from("break_glass_events")
      .update({ status: "revoked" })
      .eq("id", event_id)
      .eq("status", "active");

    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      action: "break_glass_revoked",
      action_type: "break_glass_revoked",
      resource_type: "break_glass_events",
      resource_id: event_id,
      actor_role_key: "owner",
      risk_score: 80,
      ip_address: req.headers.get("x-forwarded-for"),
    });

    return json({ success: true, revoked: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
