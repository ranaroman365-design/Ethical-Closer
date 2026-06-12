import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { situation, language } = await req.json();
    if (!situation || typeof situation !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'situation' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = language === "en" ? "en" : "de";

    const systemPrompt = lang === "de"
      ? `Du bist ein Closing-Copilot fuer Live-Verkaeufsgespraeche. Du analysierst kurze Situationsbeschreibungen und gibst sofort umsetzbare Anweisungen.

REGELN:
- Antworte IMMER als valides JSON mit exakt diesen Feldern: state, cause, actions (Array mit 1-2 Strings), question (1 String), silence (Boolean)
- Maximal 15 Woerter pro Action
- Keine Theorie, keine Erklaerungen
- state muss einer sein von: surface, exploration, depth, resistance, confusion, decision
- Wenn Stille angebracht ist, setze silence auf true

Beispiel-Output:
{"state":"resistance","cause":"Preis-Einwand als Schutzmechanismus","actions":["Frage was genau sich unklar anfuehlt","Spiegle die Emotion zurueck"],"question":"Was genau haelt dich gerade zurueck?","silence":false}`
      : `You are a Closing Copilot for live sales conversations. You analyze short situation descriptions and give immediately actionable guidance.

RULES:
- ALWAYS respond as valid JSON with exactly these fields: state, cause, actions (array of 1-2 strings), question (1 string), silence (boolean)
- Maximum 15 words per action
- No theory, no explanations
- state must be one of: surface, exploration, depth, resistance, confusion, decision
- If silence is appropriate, set silence to true

Example output:
{"state":"resistance","cause":"Price objection as protection mechanism","actions":["Ask what exactly feels unclear","Mirror the emotion back"],"question":"What exactly is holding you back right now?","silence":false}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: situation },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "copilot_response",
              description: "Return structured copilot guidance for a live sales call",
              parameters: {
                type: "object",
                properties: {
                  state: { type: "string", enum: ["surface", "exploration", "depth", "resistance", "confusion", "decision"] },
                  cause: { type: "string", description: "Brief root cause (max 10 words)" },
                  actions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 },
                  question: { type: "string", description: "One suggested question to ask" },
                  silence: { type: "boolean", description: "Whether to hold silence" },
                },
                required: ["state", "cause", "actions", "question", "silence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "copilot_response" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      // Fallback: try to parse content as JSON
      const content = data.choices?.[0]?.message?.content || "{}";
      return new Response(content, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(toolCall.function.arguments, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("copilot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
