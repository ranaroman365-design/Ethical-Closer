// Sales Brain — Post-Call Analyzer (Layer 41)
// Inputs: { call_id?, lead_id?, transcript?, outcome?, objection_type? }
// Pulls latest pre_call_insight, asks AI to compare vs reality, persists analysis,
// updates objection_intelligence aggregate.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { call_id, lead_id } = body;
    let { transcript, outcome, objection_type } = body;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await sb
      .from("sales_brain_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (!settings?.enabled || !settings?.post_call_enabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "engine_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Hydrate from calls table if needed
    if (call_id && (!transcript || !outcome)) {
      const { data: call } = await sb
        .from("calls")
        .select("transcript, result, objection_type, user_id, duration")
        .eq("id", call_id)
        .maybeSingle();
      if (call) {
        transcript ??= call.transcript ?? "";
        outcome ??= call.result ?? "no_decision";
        objection_type ??= call.objection_type ?? null;
      }
    }

    let funnelKey: string | null = null;
    if (lead_id) {
      const { data: lead } = await sb
        .from("leads")
        .select("source_funnel")
        .eq("id", lead_id)
        .maybeSingle();
      funnelKey = lead?.source_funnel ?? null;
    }

    // Latest pre-call insight
    let preInsight: any = null;
    if (lead_id) {
      const { data } = await sb
        .from("pre_call_insights")
        .select("*")
        .eq("lead_id", lead_id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      preInsight = data;
    }

    // AI analysis
    let analysis: any = {
      objections: objection_type ? [objection_type] : [],
      sentiment: "neutral",
      what_worked: [],
      what_failed: [],
      improvement_suggestions: [],
      pre_call_match_score: 0.5,
    };

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (apiKey && transcript) {
      try {
        const sys = `You are a senior sales analyst. Analyze a sales call transcript honestly. Never invent facts. Stay advisory.`;
        const user = `Outcome: ${outcome ?? "unknown"}
Pre-call brief: ${preInsight ? JSON.stringify({
          approach: preInsight.recommended_approach,
          opener: preInsight.best_opening_line,
          likely_objections: preInsight.likely_objections,
          probability: preInsight.close_probability,
        }) : "none"}

Transcript (truncated):
${String(transcript).slice(0, 6000)}`;

        const aiResp = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: settings.default_model ?? "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: sys },
                { role: "user", content: user },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "post_call_analysis",
                    description: "Structured post-call analysis.",
                    parameters: {
                      type: "object",
                      properties: {
                        objections: {
                          type: "array",
                          items: { type: "string" },
                        },
                        sentiment: {
                          type: "string",
                          enum: ["positive", "neutral", "negative"],
                        },
                        what_worked: {
                          type: "array",
                          items: { type: "string" },
                        },
                        what_failed: {
                          type: "array",
                          items: { type: "string" },
                        },
                        improvement_suggestions: {
                          type: "array",
                          items: { type: "string" },
                        },
                        pre_call_match_score: {
                          type: "number",
                          description: "0..1 — how well pre-call brief matched reality",
                        },
                      },
                      required: [
                        "objections",
                        "sentiment",
                        "what_worked",
                        "what_failed",
                        "improvement_suggestions",
                        "pre_call_match_score",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: {
                type: "function",
                function: { name: "post_call_analysis" },
              },
            }),
          },
        );

        if (aiResp.ok) {
          const json = await aiResp.json();
          const tc =
            json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (tc) {
            const parsed = JSON.parse(tc);
            analysis = { ...analysis, ...parsed };
            analysis.pre_call_match_score = clamp01(
              parsed.pre_call_match_score ?? 0.5,
            );
          }
        }
      } catch (e) {
        console.log("[sales-brain post] AI failure", String(e));
      }
    }

    // Persist analysis
    const { data: inserted } = await sb
      .from("post_call_analyses")
      .insert({
        call_id: call_id ?? null,
        lead_id: lead_id ?? null,
        funnel_key: funnelKey,
        outcome: outcome ?? "no_decision",
        objections: analysis.objections,
        sentiment: analysis.sentiment,
        what_worked: analysis.what_worked,
        what_failed: analysis.what_failed,
        improvement_suggestions: analysis.improvement_suggestions,
        pre_call_match_score: analysis.pre_call_match_score,
        generated_model:
          settings.default_model ?? "google/gemini-3-flash-preview",
      })
      .select()
      .single();

    // Update objection intelligence aggregate
    const personality = preInsight?.personality ?? "unknown";
    for (const obj of analysis.objections ?? []) {
      const objStr = String(obj).toLowerCase().trim().slice(0, 80);
      if (!objStr) continue;
      // upsert via select then update/insert
      const { data: existing } = await sb
        .from("objection_intelligence")
        .select("id, count")
        .eq("funnel_key", funnelKey)
        .eq("personality", personality)
        .eq("objection_type", objStr)
        .maybeSingle();
      if (existing) {
        await sb
          .from("objection_intelligence")
          .update({
            count: (existing.count ?? 0) + 1,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await sb.from("objection_intelligence").insert({
          funnel_key: funnelKey,
          personality,
          objection_type: objStr,
          count: 1,
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, analysis: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[sales-brain post] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
