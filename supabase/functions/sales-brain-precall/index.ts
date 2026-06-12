// Sales Brain — Pre-Call Intelligence Generator (Layer 41)
// Inputs: { lead_id }
// Generates: lead profile + pre-call insight, persists both, returns combined view.
//
// Hard rules:
//  - Advisory only; never auto-closes.
//  - Skips silently if engine disabled or pre_call_enabled=false.
//  - Falls back to heuristic probability if AI call fails.
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

function heuristicProbability(input: {
  lead_score?: number | null;
  message_count?: number | null;
  booking_status?: string | null;
  has_objections?: boolean;
}) {
  let p = 0.2;
  if ((input.lead_score ?? 0) >= 70) p += 0.25;
  else if ((input.lead_score ?? 0) >= 40) p += 0.1;
  if ((input.message_count ?? 0) >= 4) p += 0.15;
  if (input.booking_status === "booked") p += 0.25;
  if (input.has_objections) p -= 0.05;
  return clamp01(p);
}

function probabilityToRiskTier(p: number): "low" | "medium" | "high" {
  if (p >= 0.6) return "low";
  if (p >= 0.3) return "medium";
  return "high";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await sb
      .from("sales_brain_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (!settings?.enabled || !settings?.pre_call_enabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "engine_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pull lead + WA conversation
    const { data: lead } = await sb
      .from("leads")
      .select(
        "id, name, source_funnel, source, lead_score, booking_status, lead_quality, qualification_score, setter_call_outcome",
      )
      .eq("id", lead_id)
      .maybeSingle();

    if (!lead) {
      return new Response(JSON.stringify({ error: "lead_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: wa } = await sb
      .from("wa_conversations")
      .select(
        "dominant_personality, dominant_state, message_count, last_intent",
      )
      .eq("lead_id", lead_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: recentMsgs } = await sb
      .from("wa_messages")
      .select("direction, body, created_at")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Detect prior objections from recent inbound messages (best-effort).
    const inbound = (recentMsgs ?? [])
      .filter((m: any) => m.direction === "inbound")
      .map((m: any) => String(m.body ?? ""))
      .join(" | ")
      .toLowerCase();

    const objectionMap: Array<[string, RegExp]> = [
      ["no_time", /(keine zeit|no time|busy|beschäftigt)/],
      ["too_expensive", /(zu teuer|too expensive|kann ich mir nicht leisten)/],
      ["think_about_it", /(überleg|think about|denk darüber)/],
      ["send_info", /(schick.*info|send.*info|infos? bitte)/],
      ["not_now", /(nicht jetzt|not now|später)/],
      ["have_solution", /(habe schon|already have|nicht nötig)/],
    ];
    const detectedObjections = objectionMap
      .filter(([_, re]) => re.test(inbound))
      .map(([k]) => k);

    const personality = wa?.dominant_personality ?? "unknown";
    const state = wa?.dominant_state ?? "neutral";
    const messageCount = wa?.message_count ?? 0;

    let probability = heuristicProbability({
      lead_score: lead.lead_score ?? lead.qualification_score,
      message_count: messageCount,
      booking_status: lead.booking_status,
      has_objections: detectedObjections.length > 0,
    });

    // Try AI for richer insight
    let aiInsight: any = null;
    let aiConfidence = 0.5;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (apiKey) {
      try {
        const sys = `You are a senior sales coach. Generate a pre-call brief.
Strict rules: NEVER suggest pressure tactics, NEVER fabricate facts about the lead, NEVER claim guaranteed outcomes. Recommendations are advisory only.`;
        const user = `Lead context:
- name: ${lead.name ?? "unknown"}
- funnel: ${lead.source_funnel ?? "unknown"}
- lead_score: ${lead.lead_score ?? lead.qualification_score ?? "n/a"}
- booking_status: ${lead.booking_status ?? "n/a"}
- personality: ${personality}
- psych_state: ${state}
- recent inbound (truncated): ${inbound.slice(0, 600)}
- detected objections so far: ${detectedObjections.join(", ") || "none"}
- baseline probability (heuristic): ${probability.toFixed(2)}
Return a brief.`;

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
                    name: "pre_call_brief",
                    description: "Structured pre-call brief.",
                    parameters: {
                      type: "object",
                      properties: {
                        recommended_approach: { type: "string" },
                        best_opening_line: { type: "string" },
                        likely_objections: {
                          type: "array",
                          items: { type: "string" },
                        },
                        key_leverage_points: {
                          type: "array",
                          items: { type: "string" },
                        },
                        avoid: { type: "array", items: { type: "string" } },
                        close_probability: {
                          type: "number",
                          description: "0..1",
                        },
                        confidence: { type: "number", description: "0..1" },
                        summary_profile: { type: "string" },
                      },
                      required: [
                        "recommended_approach",
                        "best_opening_line",
                        "likely_objections",
                        "key_leverage_points",
                        "avoid",
                        "close_probability",
                        "confidence",
                        "summary_profile",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: {
                type: "function",
                function: { name: "pre_call_brief" },
              },
            }),
          },
        );

        if (aiResp.ok) {
          const json = await aiResp.json();
          const tc =
            json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (tc) {
            aiInsight = JSON.parse(tc);
            if (typeof aiInsight.close_probability === "number") {
              probability = clamp01(aiInsight.close_probability);
            }
            if (typeof aiInsight.confidence === "number") {
              aiConfidence = clamp01(aiInsight.confidence);
            }
          }
        } else {
          console.log("[sales-brain] AI gateway non-ok", aiResp.status);
        }
      } catch (e) {
        console.log("[sales-brain] AI failure", String(e));
      }
    }

    const objectionUnion = Array.from(
      new Set([
        ...(aiInsight?.likely_objections ?? []),
        ...detectedObjections,
      ]),
    ).slice(0, 8);

    const summary =
      aiInsight?.summary_profile ??
      `${personality} personality, ${state} state. Score ${lead.lead_score ?? "n/a"}.`;

    const riskTier = probabilityToRiskTier(probability);

    // Upsert profile
    await sb
      .from("lead_sales_profiles")
      .upsert(
        {
          lead_id,
          funnel_key: lead.source_funnel ?? null,
          dominant_personality: personality,
          dominant_state: state,
          conversion_probability: probability,
          risk_tier: riskTier,
          objections_raised: objectionUnion,
          conversation_message_count: messageCount,
          summary_profile: summary,
          generated_at: new Date().toISOString(),
          generated_model:
            settings.default_model ?? "google/gemini-3-flash-preview",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "lead_id" },
      );

    const { data: insertedInsight } = await sb
      .from("pre_call_insights")
      .insert({
        lead_id,
        funnel_key: lead.source_funnel ?? null,
        personality,
        state,
        likely_objections: objectionUnion,
        recommended_approach:
          aiInsight?.recommended_approach ??
          `Approach with ${personality}/${state} guardrails.`,
        best_opening_line:
          aiInsight?.best_opening_line ??
          `Hey ${lead.name ?? ""}, gut dass es geklappt hat — wo stehst du gerade?`,
        key_leverage_points: aiInsight?.key_leverage_points ?? [],
        avoid: aiInsight?.avoid ?? ["pressure", "vague claims"],
        close_probability: probability,
        confidence: aiConfidence,
        generated_model:
          settings.default_model ?? "google/gemini-3-flash-preview",
      })
      .select()
      .single();

    return new Response(
      JSON.stringify({
        ok: true,
        profile: {
          lead_id,
          personality,
          state,
          probability,
          risk_tier: riskTier,
          summary,
          objections: objectionUnion,
        },
        insight: insertedInsight,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[sales-brain] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
