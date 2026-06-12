// LAYER 34 — Full Funnel Intelligence refresh
// Idempotent: refresh aggregates + run deterministic insight engine.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const days: number = body?.days ?? 30;

    const { data: refreshed, error: rErr } = await supabase.rpc(
      "refresh_funnel_metrics_daily",
      { p_days: days },
    );
    if (rErr) console.warn("refresh error:", rErr.message);

    const { data: insights, error: iErr } = await supabase.rpc("detect_funnel_insights");
    if (iErr) console.warn("detect error:", iErr.message);

    return new Response(
      JSON.stringify({
        ok: true,
        refreshed_rows: refreshed ?? 0,
        insights_count: insights ?? 0,
        ts: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
