import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du bist ein hochpräziser Closing-Coach für Ethical Top Closer.
Du bewertest einen Practice-Call (oder seine Scorecard) und lieferst:
1) 3 konkrete Stärken (sehr spezifisch, beobachtungsbasiert, jeweils 1 Satz)
2) 3 konkrete Verbesserungen (jeweils 1 Satz, mit "Wie")
3) GENAU EINE "Next Action" für den nächsten Call (1 Satz, klar messbar)
Sprache: Deutsch. Ton: ruhig, direkt, premium. Keine Floskeln. Kein Hype.
Antworte NUR über das Tool save_feedback.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { request_id } = await req.json();
    if (!request_id) {
      return new Response(JSON.stringify({ error: "request_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load request + practice call
    const { data: reqRow } = await supabase.from("feedback_requests").select("*").eq("id", request_id).maybeSingle();
    if (!reqRow || reqRow.requester_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (reqRow.track !== "ai") {
      return new Response(JSON.stringify({ error: "not_ai_track" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (reqRow.status === "answered") {
      return new Response(JSON.stringify({ ok: true, already: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let scorecard: any = null;
    let fileName = "";
    if (reqRow.practice_call_id) {
      const { data: pc } = await supabase.from("practice_calls").select("scorecard, file_name, total_score").eq("id", reqRow.practice_call_id).maybeSingle();
      scorecard = pc?.scorecard ?? null;
      fileName = pc?.file_name ?? "";
    }

    const userMsg = `Practice Call: ${fileName || "(kein Datei-Kontext)"}\nScorecard JSON: ${JSON.stringify(scorecard ?? reqRow.context ?? {})}\nLevel des Trainees: ${reqRow.level_at_request ?? 0}`;

    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) {
      return new Response(JSON.stringify({ error: "ai_key_missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const t0 = Date.now();
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
        tools: [{
          type: "function",
          function: {
            name: "save_feedback",
            description: "Strukturiertes Feedback speichern",
            parameters: {
              type: "object",
              properties: {
                strengths: { type: "string", description: "3 Stärken als Bulletliste, je 1 Satz" },
                improvements: { type: "string", description: "3 Verbesserungen als Bulletliste, je 1 Satz mit Wie" },
                next_action: { type: "string", description: "Genau 1 messbare Next Action" },
                score: { type: "number", description: "0-100 Gesamtscore" },
              },
              required: ["strengths", "improvements", "next_action", "score"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "save_feedback" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "credits_required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiResp.ok) {
      const txt = await aiResp.text();
      return new Response(JSON.stringify({ error: "ai_failed", detail: txt }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "no_tool_call" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const args = JSON.parse(toolCall.function.arguments);
    const elapsed = Math.round((Date.now() - t0) / 1000);

    // Persist as system response (responder_id = null, track = ai)
    await supabase.from("feedback_responses").insert({
      request_id,
      responder_id: null,
      track: "ai",
      scorecard: { score: args.score },
      strengths: args.strengths,
      improvements: args.improvements,
      next_action: args.next_action,
      response_time_seconds: elapsed,
    });

    await supabase.from("feedback_requests").update({ status: "answered" }).eq("id", request_id);

    return new Response(JSON.stringify({ ok: true, score: args.score }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
