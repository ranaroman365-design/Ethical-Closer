// Learning Loop — Insight Generator (Layer 42)
// Aggregates approved/published pool entries by category × funnel × level
// and asks Lovable AI to synthesize a learning insight (with source_count).
// Inserts into learning_insights with status='pending'.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { funnel_key, category, recommended_level } = await req.json();
    if (!category) {
      return new Response(JSON.stringify({ error: "category_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await sb
      .from("learning_loop_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (!settings?.enabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "engine_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let q = sb
      .from("learning_data_pool")
      .select("anonymized_content, performance_metric, level_relevance, confidence_score, funnel_key")
      .in("approval_status", ["approved", "published"])
      .eq("category", category)
      .order("confidence_score", { ascending: false })
      .limit(40);
    if (funnel_key) q = q.eq("funnel_key", funnel_key);

    const { data: rows } = await q;

    if (!rows || rows.length < 3) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "insufficient_samples", count: rows?.length ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let title = `Pattern: ${category}`;
    let summary = `${rows.length} curated samples in category "${category}".`;
    let suggested_application = "script_library";

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (apiKey) {
      try {
        const samples = rows
          .slice(0, 25)
          .map((r, i) => `${i + 1}. (${r.performance_metric ?? "n/a"}) ${r.anonymized_content}`)
          .join("\n");

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
                {
                  role: "system",
                  content:
                    "You are a sales-training editor. Summarize what the samples teach. Never invent facts. Reference only patterns visible in the samples. Output structured insight only.",
                },
                {
                  role: "user",
                  content: `Category: ${category}\nFunnel: ${funnel_key ?? "all"}\nLevel: ${recommended_level ?? "any"}\n\nSamples:\n${samples}`,
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "learning_insight",
                    description: "Structured learning insight.",
                    parameters: {
                      type: "object",
                      properties: {
                        insight_title: { type: "string" },
                        insight_summary: { type: "string" },
                        suggested_application: {
                          type: "string",
                          enum: [
                            "script_library", "roleplay_trainer", "objection_library",
                            "call_review", "assessment", "playbook",
                          ],
                        },
                      },
                      required: ["insight_title", "insight_summary", "suggested_application"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: {
                type: "function",
                function: { name: "learning_insight" },
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
            title = parsed.insight_title ?? title;
            summary = parsed.insight_summary ?? summary;
            suggested_application = parsed.suggested_application ?? suggested_application;
          }
        }
      } catch (e) {
        console.log("[learning-loop insight] AI failure", String(e));
      }
    }

    const avgPerf =
      rows.reduce((s, r) => s + Number(r.performance_metric ?? 0), 0) / rows.length;

    const { data: inserted } = await sb
      .from("learning_insights")
      .insert({
        insight_title: title.slice(0, 200),
        insight_summary: summary.slice(0, 2000),
        category,
        funnel_key: funnel_key ?? null,
        recommended_level: recommended_level ?? null,
        source_count: rows.length,
        supporting_metrics: { avg_performance: Number.isFinite(avgPerf) ? avgPerf : null },
        suggested_application,
        approval_status: "pending",
        generated_model: settings.default_model ?? "google/gemini-3-flash-preview",
      })
      .select()
      .single();

    return new Response(
      JSON.stringify({ ok: true, insight: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[learning-loop insight] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
