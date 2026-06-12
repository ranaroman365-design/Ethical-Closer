import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch completed sessions with outcome and state events
    const { data: sessions, error: sessErr } = await sb
      .from("copilot_sessions")
      .select("id, user_id, outcome, duration_seconds, dominant_state, final_momentum, final_commitment, final_risk, summary_json")
      .in("outcome", ["won", "lost", "no_decision", "fragile_yes"])
      .order("created_at", { ascending: false })
      .limit(200);

    if (sessErr) throw sessErr;
    if (!sessions || sessions.length < 5) {
      return new Response(JSON.stringify({ message: "Not enough data yet", sessions_count: sessions?.length || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch state events for these sessions
    const sessionIds = sessions.map(s => s.id);
    const { data: stateEvents } = await sb
      .from("copilot_state_events")
      .select("session_id, state, confidence, momentum, commitment_quality, risk_level, likely_issue, matched_signals, offset_seconds")
      .in("session_id", sessionIds)
      .order("offset_seconds", { ascending: true });

    // Fetch signal logs
    const { data: signalLogs } = await sb
      .from("copilot_signal_log")
      .select("session_id, signal_cluster, signal_pattern, occurrence_count")
      .in("session_id", sessionIds);

    // Build analysis payload
    const sessionSummaries = sessions.map(s => {
      const events = (stateEvents || []).filter(e => e.session_id === s.id);
      const signals = (signalLogs || []).filter(l => l.session_id === s.id);
      const stateSequence = events.map(e => e.state);
      const signalClusters: Record<string, number> = {};
      signals.forEach(sig => {
        signalClusters[sig.signal_cluster] = (signalClusters[sig.signal_cluster] || 0) + sig.occurrence_count;
      });

      return {
        outcome: s.outcome,
        duration: s.duration_seconds,
        dominant_state: s.dominant_state,
        final_momentum: s.final_momentum,
        final_commitment: s.final_commitment,
        final_risk: s.final_risk,
        state_sequence: stateSequence,
        signal_clusters: signalClusters,
        total_states: events.length,
        issues: events.map(e => e.likely_issue).filter(Boolean),
      };
    });

    const wonSessions = sessionSummaries.filter(s => s.outcome === "won");
    const lostSessions = sessionSummaries.filter(s => s.outcome === "lost" || s.outcome === "no_decision");
    const fragileSessions = sessionSummaries.filter(s => s.outcome === "fragile_yes");

    const analysisPrompt = `Analyze these sales call data patterns and extract actionable insights.

DATA:
Won calls (${wonSessions.length}): ${JSON.stringify(wonSessions.slice(0, 50))}
Lost/No-Decision calls (${lostSessions.length}): ${JSON.stringify(lostSessions.slice(0, 50))}
Fragile commitments (${fragileSessions.length}): ${JSON.stringify(fragileSessions.slice(0, 20))}

TASK:
1. Identify 3-5 state sequence patterns that correlate with won calls
2. Identify 3-5 signal patterns that correlate with lost calls
3. Identify fragile commitment predictors
4. For each pattern, estimate confidence (low/medium/high) based on sample size
5. Provide one concrete recommendation per pattern`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a sales analytics engine. Extract patterns from call data. Return insights via the tool call. Be specific and data-driven." },
          { role: "user", content: analysisPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "store_patterns",
            description: "Store extracted call patterns",
            parameters: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      insight_type: { type: "string", enum: ["winning_pattern", "losing_pattern", "fragile_predictor", "risk_indicator"] },
                      pattern_description: { type: "string", description: "Clear description of the pattern" },
                      correlation_outcome: { type: "string", enum: ["won", "lost", "no_decision", "fragile_yes"] },
                      confidence_score: { type: "number", description: "0-1 confidence" },
                      state_sequence: { type: "array", items: { type: "string" } },
                      signal_indicators: { type: "array", items: { type: "string" } },
                      recommendation: { type: "string" },
                    },
                    required: ["insight_type", "pattern_description", "correlation_outcome", "confidence_score", "recommendation"],
                  },
                },
              },
              required: ["insights"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "store_patterns" } },
      }),
    });

    if (!aiResponse.ok) {
      const t = await aiResponse.text();
      console.error("AI error:", aiResponse.status, t);
      throw new Error("AI analysis failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call returned");

    const { insights } = JSON.parse(toolCall.function.arguments);

    // Store insights
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7);

    const insightRows = insights.map((i: any) => ({
      insight_type: i.insight_type,
      pattern_description: i.pattern_description,
      correlation_outcome: i.correlation_outcome,
      sample_size: sessions.length,
      confidence_score: i.confidence_score,
      state_sequence: i.state_sequence || [],
      signal_indicators: i.signal_indicators || [],
      recommendation: i.recommendation,
      valid_until: validUntil.toISOString(),
    }));

    const { error: insertErr } = await sb.from("copilot_pattern_insights").insert(insightRows);
    if (insertErr) throw insertErr;

    await sb.from("automation_log").insert({
      job_name: "extract-call-patterns",
      status: "success",
      metrics: {
        sessions_analyzed: sessions.length,
        patterns_created: insights.length,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      sessions_analyzed: sessions.length,
      patterns_created: insights.length,
      insights_generated: insights.length,
      insights,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-patterns error:", e);
    try {
      const sb2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await sb2.from("automation_log").insert({
        job_name: "extract-call-patterns",
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
        metrics: { patterns_created: 0 },
      });
    } catch {}
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
