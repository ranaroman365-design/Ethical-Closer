import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id; // optional: evaluate single user

    let userIds: string[] = [];

    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      // Get all active users (logged in within 30 days or recent signup)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .or("updated_at.gte." + new Date(Date.now() - 30 * 86400000).toISOString());
      userIds = (profiles ?? []).map((p: any) => p.id);
    }

    const results: Record<string, string> = {};
    let errors = 0;

    for (const uid of userIds) {
      try {
        const { data, error } = await supabase.rpc("evaluate_monetization_state", {
          p_user_id: uid,
        });
        if (error) {
          console.error(`Error evaluating ${uid}:`, error.message);
          errors++;
        } else {
          results[uid] = data;
        }
      } catch (e) {
        console.error(`Exception for ${uid}:`, e);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        evaluated: Object.keys(results).length,
        errors,
        states: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
