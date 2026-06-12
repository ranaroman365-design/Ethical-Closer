import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { call_id, outcome, comment, deal_value } = await req.json();

    // Fetch related data for context
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let callContext = "";
    if (call_id) {
      const { data: call } = await supabase
        .from("calls")
        .select("call_type, offer_type, lead_source, funnel_stage, transcript, duration")
        .eq("id", call_id)
        .maybeSingle();
      if (call) {
        callContext = `Call type: ${call.call_type}, Offer: ${call.offer_type}, Stage: ${call.funnel_stage}, Duration: ${call.duration || 'unknown'}min. ${call.transcript ? `Transcript excerpt: ${call.transcript.slice(0, 500)}` : ''}`;
      }
    }

    const systemPrompt = `Du bist ein Sales-Analyst im Ethical Top Closer System.
Deine Aufgabe: Analysiere den Deal und gib eine kurze, präzise Einschätzung.

REGELN:
- Maximal 2 Sätze Zusammenfassung
- Verlustgründe NUR aus: price, no_trust, no_need, bad_timing, no_fit, bad_call, no_authority, no_show, other
- Gewinn-Gründe NUR aus: clear_pain, trust_built, good_leadership, right_timing, strong_fit
- Sei direkt, keine Floskeln
- Antworte IMMER als JSON: {"suggested_loss_reason": "...", "suggested_win_reasons": [...], "summary": "..."}`;

    const userPrompt = `Outcome: ${outcome}
${deal_value ? `Deal Value: €${deal_value}` : ''}
${comment ? `Closer Comment: ${comment}` : ''}
${callContext ? `Context: ${callContext}` : 'No additional context available.'}

Analysiere diesen ${outcome === 'won' ? 'gewonnenen' : outcome === 'lost' ? 'verlorenen' : 'No-Show'} Deal.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
    let result = { suggested_loss_reason: null, suggested_win_reasons: [], summary: content };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          suggested_loss_reason: parsed.suggested_loss_reason || null,
          suggested_win_reasons: parsed.suggested_win_reasons || [],
          summary: parsed.summary || content,
        };
      }
    } catch {
      // Use raw content as summary
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Deal analysis error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
