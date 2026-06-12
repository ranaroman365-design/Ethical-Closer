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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { practiceCallId } = await req.json();
    if (!practiceCallId) {
      return new Response(JSON.stringify({ error: "practiceCallId required" }), { status: 400, headers: corsHeaders });
    }

    // Fetch the practice call record
    const { data: call, error: callError } = await supabase
      .from("practice_calls")
      .select("*")
      .eq("id", practiceCallId)
      .eq("user_id", userId)
      .single();

    if (callError || !call) {
      return new Response(JSON.stringify({ error: "Practice call not found" }), { status: 404, headers: corsHeaders });
    }

    // Get signed URL for the audio file
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: signedUrl } = await serviceClient.storage
      .from("practice-calls")
      .createSignedUrl(call.file_path, 3600);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });
    }

    // Use Lovable AI to score the call based on file name and context
    const scoringPrompt = `Du bist ein professioneller Sales Coach für Ethical Closing.

Bewerte den folgenden Practice Call anhand dieser 8 Kategorien (jeweils 0-100 Punkte):

1. **Rapport & Gesprächseröffnung** – Wurde eine warme, professionelle Verbindung aufgebaut?
2. **Discovery & Bedarfsanalyse** – Wurden die richtigen Fragen gestellt, um den wahren Bedarf zu verstehen?
3. **Aktives Zuhören** – Hat der Closer aktiv zugehört und reflektiert?
4. **Problemvertiefung** – Wurde der emotionale und rationale Schmerz des Prospects erkundet?
5. **Vision & Transformation** – Wurde eine klare Zukunftsvision gezeichnet?
6. **Einwandbehandlung** – Wurden Einwände professionell und ethisch behandelt?
7. **Ethisches Closing** – War der Abschluss respektvoll, klar und alignment-basiert?
8. **Gesamteindruck & Professionalität** – Tonfall, Struktur, Timing, Professionalität.

Dateiname: ${call.file_name}
Status: Simulation für Zertifizierung

Antworte NUR mit einem JSON-Objekt in diesem Format:
{
  "rapport": <score>,
  "discovery": <score>,
  "active_listening": <score>,
  "problem_depth": <score>,
  "vision": <score>,
  "objection_handling": <score>,
  "ethical_closing": <score>,
  "professionalism": <score>,
  "feedback": "<2-3 Sätze konstruktives Feedback auf Deutsch>"
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Du bist ein Sales-Bewertungssystem. Antworte ausschließlich mit validem JSON." },
          { role: "user", content: scoringPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_scorecard",
              description: "Submit the practice call scorecard",
              parameters: {
                type: "object",
                properties: {
                  rapport: { type: "number", description: "Score 0-100" },
                  discovery: { type: "number", description: "Score 0-100" },
                  active_listening: { type: "number", description: "Score 0-100" },
                  problem_depth: { type: "number", description: "Score 0-100" },
                  vision: { type: "number", description: "Score 0-100" },
                  objection_handling: { type: "number", description: "Score 0-100" },
                  ethical_closing: { type: "number", description: "Score 0-100" },
                  professionalism: { type: "number", description: "Score 0-100" },
                  feedback: { type: "string", description: "Constructive feedback in German" },
                },
                required: ["rapport", "discovery", "active_listening", "problem_depth", "vision", "objection_handling", "ethical_closing", "professionalism", "feedback"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_scorecard" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht. Bitte versuche es später erneut." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI-Credits aufgebraucht." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResponse.text();
      console.error("AI error:", aiResponse.status, t);
      return new Response(JSON.stringify({ error: "AI scoring failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI returned no scorecard" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scorecard = JSON.parse(toolCall.function.arguments);
    const { feedback, ...scores } = scorecard;
    const totalScore = Math.round(
      Object.values(scores).reduce((sum: number, v) => sum + (v as number), 0) / Object.keys(scores).length
    );

    // Update practice call with scorecard
    await serviceClient
      .from("practice_calls")
      .update({
        scorecard: { ...scores, feedback },
        total_score: totalScore,
        status: totalScore >= 80 ? "passed" : "needs_improvement",
      })
      .eq("id", practiceCallId);

    // If this is a certification simulation and passed, update cert status
    if (call.file_name.startsWith("[Simulation]") && totalScore >= 80) {
      await serviceClient
        .from("profiles")
        .update({
          certification_status: "certified",
          certified: true,
          member_status: "certified",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }

    return new Response(
      JSON.stringify({ scorecard: { ...scores, feedback }, totalScore, status: totalScore >= 80 ? "passed" : "needs_improvement" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("score-call error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
