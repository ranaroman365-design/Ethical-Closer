// Layer 32 — A/B Auto-Promotion Check
// Refreshes stats, evaluates significance per template, and auto-promotes
// winners if message_performance_settings.auto_promote_enabled = true.
// Idempotent: safe to run on cron.

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
      .from("message_performance_settings")
      .select("enabled, auto_promote_enabled, significance_p_value, min_sample_size")
      .eq("id", 1)
      .maybeSingle();

    if (!settings?.enabled) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "tracking disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Refresh aggregates
    const { data: refreshedRows } = await supabase.rpc("refresh_message_stats");

    // 2. Get all distinct templates with stats
    const { data: templates } = await supabase
      .from("message_stats")
      .select("template_key");

    const uniqueTemplates = Array.from(
      new Set((templates ?? []).map((r: any) => r.template_key)),
    );

    const evaluations: any[] = [];
    const promotions: any[] = [];

    for (const tk of uniqueTemplates) {
      const { data: evalRows } = await supabase.rpc("evaluate_ab_significance", {
        p_template_key: tk,
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
          "apply_ab_winner",
          {
            p_template_key: tk,
            p_winner_variant: evalRow.winner_variant,
            p_decision_type: "auto",
            p_reason: `auto: p=${evalRow.approx_p_value}, n=${evalRow.total_sample}, lift=${evalRow.lift}`,
          },
        );
        if (!applyErr) {
          promotions.push({ template_key: tk, decision_id: decisionId, eval: evalRow });
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        refreshed_rows: refreshedRows,
        templates_evaluated: evaluations.length,
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
