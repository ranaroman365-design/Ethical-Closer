import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await sb
      .from("user_streaks")
      .update({ week_actions: {}, updated_at: new Date().toISOString() })
      .lt("updated_at", new Date(
        Date.now() - (new Date().getDay() || 7) * 86400000
      ).toISOString())
      .select("id");

    const resetCount = data?.length ?? 0;

    await sb.from("audit_logs").insert({
      action: "weekly_streak_reset",
      source_type: "system",
      note: `week_actions reset for ${resetCount} users`,
    });

    return new Response(
      JSON.stringify({ reset_count: resetCount }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[reset-weekly-streaks] error:", err);
    return new Response(
      JSON.stringify({ error: "internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
