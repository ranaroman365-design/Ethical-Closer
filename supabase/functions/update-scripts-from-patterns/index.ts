// Reads top-performing copilot_pattern_insights and appends them as
// AI_PATTERN script_blocks. Never overwrites manual blocks.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map insight_type → recommended phase
function inferPhase(insight: any): string {
  const states = (insight.state_sequence as string[] | null) || [];
  const desc = (insight.pattern_description || "").toLowerCase();
  if (insight.insight_type === "fragile_predictor") return "closing";
  if (states.some(s => /objection/i.test(s)) || /einwand|objection/i.test(desc)) return "objection";
  if (states.some(s => /open|intro/i.test(s)) || /opening|eröffn/i.test(desc)) return "opening";
  if (states.some(s => /pain|problem/i.test(s)) || /pain|schmerz/i.test(desc)) return "pain";
  if (states.some(s => /pitch|offer/i.test(s)) || /pitch|angebot/i.test(desc)) return "pitch";
  if (states.some(s => /close|commit/i.test(s)) || /closing|abschluss/i.test(desc)) return "closing";
  return "discovery";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Determine target script (Closer Master Script)
    const { data: script } = await sb.from("sales_scripts")
      .select("id, current_version")
      .eq("name", "Closer Master Script")
      .maybeSingle();
    if (!script) throw new Error("Target script 'Closer Master Script' not found");

    // Fetch winning patterns (last 30d, valid, sufficient sample)
    const { data: patterns } = await sb
      .from("copilot_pattern_insights")
      .select("id, insight_type, pattern_description, recommendation, correlation_outcome, sample_size, confidence_score, state_sequence, signal_indicators")
      .in("insight_type", ["winning_pattern", "fragile_predictor", "losing_pattern"])
      .gte("confidence_score", 0.5)
      .gte("sample_size", 5)
      .order("confidence_score", { ascending: false })
      .limit(30);

    if (!patterns || patterns.length === 0) {
      return new Response(JSON.stringify({ message: "No qualifying patterns yet", inserted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const p of patterns) {
      const phase = inferPhase(p);
      const content = (p.recommendation || p.pattern_description || "").trim();
      if (!content || content.length < 20) continue;

      // Check if a block from this exact pattern already exists (idempotent)
      const { data: existing } = await sb.from("script_blocks")
        .select("id, score")
        .eq("source_pattern_id", p.id)
        .maybeSingle();

      if (existing) {
        // Update score if changed
        await sb.from("script_blocks").update({
          score: Number((p.confidence_score * 100).toFixed(2)),
          content,
          updated_at: now,
        }).eq("id", existing.id);
        updated++;
      } else {
        const { error } = await sb.from("script_blocks").insert({
          script_id: script.id,
          phase,
          content,
          context: p.insight_type,
          score: Number((p.confidence_score * 100).toFixed(2)),
          source: "AI_PATTERN",
          status: "active",
          source_pattern_id: p.id,
        });
        if (!error) inserted++;
      }
    }

    // Snapshot a new version if anything changed
    if (inserted > 0 || updated > 0) {
      const { data: blocks } = await sb.from("script_blocks").select("*").eq("script_id", script.id);
      const newVersion = (script.current_version || 1) + 1;
      await sb.from("script_versions").insert({
        script_id: script.id,
        version: newVersion,
        snapshot: { blocks, generated_at: now },
        change_summary: `AI_PATTERN writeback: ${inserted} inserted, ${updated} updated`,
      });
      await sb.from("sales_scripts").update({ current_version: newVersion, updated_at: now }).eq("id", script.id);
    }

    await sb.from("automation_log").insert({
      job_name: "update-scripts-from-patterns",
      status: "success",
      metrics: {
        patterns_evaluated: patterns.length,
        script_blocks_inserted: inserted,
        script_blocks_updated: updated,
      },
    });

    return new Response(JSON.stringify({ success: true, inserted, updated, script_blocks_updated: inserted + updated, patterns_evaluated: patterns.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("update-scripts-from-patterns error:", e);
    try {
      const sb2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb2.from("automation_log").insert({
        job_name: "update-scripts-from-patterns",
        status: "error",
        error: e instanceof Error ? e.message : "Unknown",
        metrics: { script_blocks_updated: 0 },
      });
    } catch {}
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
