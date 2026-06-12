// Layer 33 — Voice A/B Auto-Promotion Check
// Refreshes call_stats + objection heatmap, evaluates significance per script,
// and auto-promotes winners if call_performance_settings.auto_promote_enabled = true.
// Idempotent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await supabase
      .from("call_performance_settings")
      .select("enabled, auto_promote_enabled, significance_p_value, min_sample_size")
      .eq("id", 1)
      .maybeSingle();

    if (!settings?.enabled) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "tracking disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: refreshedRows } = await supabase.rpc("refresh_call_stats");

    const { data: scripts } = await supabase
      .from("call_stats")
      .select("script_key");

    const uniqueScripts = Array.from(
      new Set((scripts ?? []).map((r: any) => r.script_key)),
    );

    const evaluations: any[] = [];
    const promotions: any[] = [];

    for (const sk of uniqueScripts) {
      const { data: evalRows } = await supabase.rpc("evaluate_call_ab_significance", {
        p_script_key: sk,
      });
      const evalRow = (evalRows ?? [])[0];
      if (!evalRow) continue;
      evaluations.push(evalRow);

      if (
        settings.auto_promote_enabled &&
        evalRow.is_significant &&
        evalRow.total_sample >= (settings.min_sample_size ?? 100) &&
        evalRow.approx_p_value <= (settings.significance_p_value ?? 0.05)
      ) {
        const { data: decisionId, error: applyErr } = await supabase.rpc(
          "apply_call_ab_winner",
          {
            p_script_key: sk,
            p_winner_variant: evalRow.winner_variant,
            p_decision_type: "auto",
            p_reason: `auto: p=${evalRow.approx_p_value}, n=${evalRow.total_sample}, lift=${evalRow.lift}`,
          },
        );
        if (!applyErr) {
          promotions.push({ script_key: sk, decision_id: decisionId, eval: evalRow });
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        refreshed_rows: refreshedRows,
        scripts_evaluated: evaluations.length,
        auto_promotions: promotions.length,
        promotions,
        evaluations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
