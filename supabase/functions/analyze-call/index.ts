// analyze-call — AI call analysis + call_ai_scores
// Supports BOTH:
//   1. User-JWT auth (interactive, from frontend): { callId }
//   2. Service-role auth (automated pipeline from process-pending-analyses): { call_id }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === serviceKey;

    const body = await req.json();
    const callId = body.callId || body.call_id;
    if (!callId) {
      return new Response(JSON.stringify({ error: "callId or call_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);
    let userId: string | null = null;

    if (isServiceRole) {
      // Automated pipeline — fetch call with service role, get user_id from call
      const { data: call, error: callError } = await serviceClient
        .from("calls").select("*").eq("id", callId).maybeSingle();
      if (callError || !call) {
        return new Response(JSON.stringify({ error: "Call not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = call.user_id;
      // Continue with call data below
      return await runAnalysis(serviceClient, call, userId, callId, LOVABLE_API_KEY, corsHeaders);
    } else {
      // User-JWT auth
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
      const { data: call, error: callError } = await userClient
        .from("calls").select("*").eq("id", callId).eq("user_id", user.id).single();
      if (callError || !call) {
        return new Response(JSON.stringify({ error: "Call not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return await runAnalysis(serviceClient, call, userId, callId, LOVABLE_API_KEY, corsHeaders);
    }
  } catch (e) {
    console.error("analyze-call error:", e);
    try {
      const sb2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb2.from("automation_log").insert({
        job_name: "analyze-call",
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
        metrics: { analyzed_calls: 0 },
      });
    } catch { /* ignore */ }
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function runAnalysis(
  serviceClient: ReturnType<typeof createClient>,
  call: Record<string, unknown>,
  userId: string | null,
  callId: string,
  LOVABLE_API_KEY: string,
  corsHeaders: Record<string, string>,
) {
  const analysisPrompt = `Du bist ein Top 1% High-Ticket Sales Analyst für Ethical Closing.

Analysiere den folgenden Sales Call anhand des Call Frameworks, der Objection Handling Systeme und der Closing-Psychologie.

CALL METADATA:
- Call-Typ: ${call.call_type || "unknown"}
- Funnel-Stufe: ${call.funnel_stage || "unknown"}
- Angebot: ${call.offer_type || "unknown"} (${call.price_point || 0}€)
- Awareness-Level: ${call.awareness_level || "unknown"}
- Emotionaler Zustand: ${call.emotional_state || "unknown"}
- Lead-Quelle: ${call.lead_source || "unknown"}
- Ergebnis: ${call.result || "pending"}
- Deal-Größe: ${call.deal_size || 0}€
- Einwand-Typ: ${call.objection_type || "Nicht angegeben"}
- Selbstbewertung: ${call.self_rating || "N/A"}/10
- Wo brach das Gespräch?: ${call.self_breakpoint || "Nicht angegeben"}
- Wo war Unsicherheit?: ${call.self_uncertainty || "Nicht angegeben"}

${call.transcript ? `TRANSKRIPT:\n${String(call.transcript).substring(0, 8000)}` : `DATEINAME: ${call.file_url || "Unbekannt"}\n(Kein Transkript verfügbar – analysiere basierend auf Metadaten und Selbsteinschätzung)`}

REGELN:
- Kein generisches Feedback
- Sei präzise und direkt
- Vergleiche mit Top 1% Closer Benchmark (8.9+ Durchschnitt)
- Identifiziere Conversion-Leaks
- Erkenne echte vs. oberflächliche Einwände
- Liefere exakte alternative Formulierungen`;

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Du bist ein Elite-Sales-Analyst. Antworte ausschließlich über die submit_analysis Funktion." },
        { role: "user", content: analysisPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_analysis",
            description: "Submit the complete call analysis",
            parameters: {
              type: "object",
              properties: {
                overall_score: { type: "number", description: "Overall score 0-10" },
                opening_score: { type: "number", description: "Opening phase score 0-10" },
                rapport_score: { type: "number", description: "Rapport building score 0-10" },
                qualification_score: { type: "number", description: "Qualification score 0-10" },
                pain_score: { type: "number", description: "Pain extraction score 0-10" },
                desire_score: { type: "number", description: "Desire amplification score 0-10" },
                pitch_score: { type: "number", description: "Pitch delivery score 0-10" },
                closing_score: { type: "number", description: "Closing execution score 0-10" },
                talk_ratio: { type: "number", description: "Talk ratio percentage 0-100" },
                question_depth_score: { type: "number", description: "Question depth score 0-10" },
                engagement_score: { type: "number", description: "Engagement score 0-10" },
                objection_score: { type: "number", description: "Objection handling score 0-10" },
                closing_efficiency: { type: "number", description: "Closing efficiency score 0-10" },
                top_3_mistakes: { type: "array", items: { type: "string" } },
                objections_detected: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string" }, objection: { type: "string" },
                      handling: { type: "string" }, improvement: { type: "string" },
                    },
                    required: ["type", "objection", "handling", "improvement"],
                  },
                },
                language_feedback: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      issue: { type: "string" }, example: { type: "string" }, alternative: { type: "string" },
                    },
                    required: ["issue", "example", "alternative"],
                  },
                },
                closing_feedback: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { observation: { type: "string" }, recommendation: { type: "string" } },
                    required: ["observation", "recommendation"],
                  },
                },
                action_plan: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                      action: { type: "string" }, expected_impact: { type: "string" },
                    },
                    required: ["priority", "action", "expected_impact"],
                  },
                },
              },
              required: [
                "overall_score", "opening_score", "rapport_score", "qualification_score",
                "pain_score", "desire_score", "pitch_score", "closing_score",
                "talk_ratio", "question_depth_score", "engagement_score",
                "objection_score", "closing_efficiency",
                "top_3_mistakes", "objections_detected", "language_feedback",
                "closing_feedback", "action_plan",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_analysis" } },
    }),
  });

  if (!aiResponse.ok) {
    const t = await aiResponse.text();
    if (aiResponse.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit erreicht" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResponse.status === 402) {
      return new Response(JSON.stringify({ error: "AI-Credits aufgebraucht" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("AI error:", aiResponse.status, t);
    return new Response(JSON.stringify({ error: "AI analysis failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aiResult = await aiResponse.json();
  const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    return new Response(JSON.stringify({ error: "AI returned no analysis" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const analysis = JSON.parse(toolCall.function.arguments);

  // Insert analysis
  const { data: analysisRow, error: insertError } = await serviceClient
    .from("call_analysis")
    .insert({
      call_id: callId,
      overall_score: analysis.overall_score,
      opening_score: analysis.opening_score,
      rapport_score: analysis.rapport_score,
      qualification_score: analysis.qualification_score,
      pain_score: analysis.pain_score,
      desire_score: analysis.desire_score,
      pitch_score: analysis.pitch_score,
      closing_score: analysis.closing_score,
      talk_ratio: analysis.talk_ratio,
      question_depth_score: analysis.question_depth_score,
      engagement_score: analysis.engagement_score,
      objection_score: analysis.objection_score,
      closing_efficiency: analysis.closing_efficiency,
      top_3_mistakes: analysis.top_3_mistakes,
      objections_detected: analysis.objections_detected,
      language_feedback: analysis.language_feedback,
      closing_feedback: analysis.closing_feedback,
      action_plan: analysis.action_plan,
      structure_details: {
        opening: analysis.opening_score,
        rapport: analysis.rapport_score,
        qualification: analysis.qualification_score,
        pain: analysis.pain_score,
        desire: analysis.desire_score,
        pitch: analysis.pitch_score,
        closing: analysis.closing_score,
      },
    })
    .select()
    .single();

  if (insertError) {
    console.error("Insert error:", insertError);
    return new Response(JSON.stringify({ error: "Failed to save analysis" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update call status
  await serviceClient.from("calls").update({ status: "analyzed" }).eq("id", callId);

  // Create call_ai_scores entry
  if (userId) {
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10)));
    const objH = clamp(analysis.objection_score);
    const clarity = clamp(analysis.qualification_score);
    const trust = clamp(analysis.rapport_score);
    const structure = clamp((analysis.opening_score + analysis.pitch_score) / 2);
    const ethical = clamp(analysis.closing_score);
    const readiness = clamp(analysis.closing_efficiency);
    const overall = Math.round(
      objH * 0.20 + clarity * 0.15 + trust * 0.20 + structure * 0.15 + ethical * 0.15 + readiness * 0.15
    );

    await serviceClient.from("call_ai_scores").upsert(
      {
        call_id: callId,
        user_id: userId,
        objection_handling_score: objH,
        clarity_score: clarity,
        trust_score: trust,
        structure_score: structure,
        ethical_alignment_score: ethical,
        closing_readiness_score: readiness,
        overall_call_score: overall,
        scoring_status: "completed",
        scoring_version: "v2-auto",
      },
      { onConflict: "call_id" }
    );

    // Recalc enhanced performance
    try {
      await serviceClient.rpc("recalc_enhanced_performance", { p_user_id: userId });
    } catch (e) {
      console.warn("recalc_enhanced_performance failed (non-critical):", e);
    }
  }

  // Update performance metrics
  if (userId) {
    try {
      const { data: allAnalyses } = await serviceClient
        .from("call_analysis")
        .select("overall_score, objection_score, closing_efficiency")
        .in(
          "call_id",
          (await serviceClient.from("calls").select("id").eq("user_id", userId)).data?.map(
            (c: { id: string }) => c.id
          ) || []
        );

      if (allAnalyses && allAnalyses.length > 0) {
        const avgScore =
          allAnalyses.reduce((s: number, a: { overall_score: number }) => s + Number(a.overall_score), 0) /
          allAnalyses.length;
        const avgObjection =
          allAnalyses.reduce((s: number, a: { objection_score: number }) => s + Number(a.objection_score), 0) /
          allAnalyses.length;

        const { data: userCalls } = await serviceClient
          .from("calls")
          .select("result")
          .eq("user_id", userId);
        const totalCalls = userCalls?.length || 1;
        const wonCalls = userCalls?.filter((c: { result: string }) => c.result === "won").length || 0;
        const closingRate = (wonCalls / totalCalls) * 100;

        await serviceClient.from("performance_metrics").upsert(
          {
            user_id: userId,
            avg_call_score: Math.round(avgScore * 10) / 10,
            closing_rate: Math.round(closingRate * 10) / 10,
            objection_score: Math.round(avgObjection * 10) / 10,
            total_calls: totalCalls,
            trend_score: 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      }
    } catch (e) {
      console.warn("performance metrics update failed (non-critical):", e);
    }
  }

  await serviceClient.from("automation_log").insert({
    job_name: "analyze-call",
    status: "success",
    metrics: { analyzed_calls: 1, call_id: callId, user_id: userId, source: userId ? "user" : "auto" },
  });

  return new Response(JSON.stringify({ analysis: analysisRow }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
