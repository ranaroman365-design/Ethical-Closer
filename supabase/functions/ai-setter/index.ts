import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Du bist der AI Setter für ETC (Ethical Trust Closing). Du qualifizierst Bewerber vor ihrem Setter-Call.

REGELN:
- Stelle strukturierte Fragen in 3 Blöcken: Ziel, Situation, Commitment
- Sei direkt, professionell, nicht therapeutisch
- Keine Motivation, kein Coaching — nur Klarheit
- Maximal 2–3 Fragen pro Block, dann weiter
- Nach Block 3: Fasse zusammen und gib eine klare Einschätzung
- Antworte immer auf Deutsch
- Halte Antworten kurz (max 3 Sätze pro Nachricht)

FLOW:
1. Begrüßung + erste Frage zu ZIEL
2. Folgefragen zu ZIEL (max 2)
3. Übergang zu SITUATION (was machst du aktuell, wie viel Zeit)
4. Übergang zu COMMITMENT (wie ernst, was passiert wenn nicht)
5. Zusammenfassung + Einschätzung

Wenn der Bewerber vage antwortet, hake einmal nach. Wenn immer noch vage → weiter zum nächsten Block.

Am Ende deiner letzten Nachricht, füge IMMER einen versteckten Analyse-Block ein:
[AI_ANALYSIS]
motivation: <0-100>
clarity: <0-100>
commitment: <0-100>
recommendation: <closable|needs_call|not_ready>
summary: <1 Satz Zusammenfassung für den Setter>
[/AI_ANALYSIS]`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, session_id } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build conversation for AI
    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit erreicht. Bitte versuche es in einer Minute erneut." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI-Kontingent aufgebraucht." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream response back
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-setter error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
