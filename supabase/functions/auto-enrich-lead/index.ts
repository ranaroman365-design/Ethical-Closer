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

    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [leadResult, eventsResult, messagesResult, sessionsResult] = await Promise.all([
      supabase.from("leads").select("*").eq("id", lead_id).maybeSingle(),
      supabase.from("lead_events").select("event_type, notes, metadata, created_at").eq("lead_id", lead_id).order("created_at", { ascending: false }).limit(20),
      supabase.from("community_messages").select("content, created_at").eq("lead_id", lead_id).order("created_at", { ascending: false }).limit(10),
      supabase.from("ai_setter_sessions").select("summary_text, ai_recommendation, clarity_score, motivation_score, commitment_score, overall_ai_score").eq("lead_id", lead_id).order("created_at", { ascending: false }).limit(1),
    ]);

    const lead = leadResult.data;
    if (!lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contextParts: string[] = [];
    contextParts.push(`Lead: ${lead.name || 'Unknown'}, Email: ${lead.email || 'N/A'}, Stage: ${lead.stage}`);
    if (lead.quiz_answers) contextParts.push(`Quiz Answers: ${JSON.stringify(lead.quiz_answers)}`);
    if (lead.quiz_result) contextParts.push(`Quiz Result: ${lead.quiz_result}`);
    if (lead.setter_notes) contextParts.push(`Setter Notes: ${lead.setter_notes}`);

    if (eventsResult.data?.length) {
      const eventSummary = eventsResult.data.map(e => `[${e.event_type}] ${e.notes || ''}`).join('\n');
      contextParts.push(`Events:\n${eventSummary}`);
    }
    if (messagesResult.data?.length) {
      const chatSummary = messagesResult.data.map(m => m.content).join('\n');
      contextParts.push(`Chat Messages:\n${chatSummary}`);
    }
    if (sessionsResult.data?.length) {
      const s = sessionsResult.data[0];
      contextParts.push(`AI Setter Session: ${s.summary_text || 'No summary'} | Recommendation: ${s.ai_recommendation || 'N/A'} | Scores: Clarity ${s.clarity_score}, Motivation ${s.motivation_score}, Commitment ${s.commitment_score}, Overall ${s.overall_ai_score}`);
    }

    const fullContext = contextParts.join('\n\n');

    const hasSubstantialData = (lead.setter_notes || eventsResult.data?.length || messagesResult.data?.length || sessionsResult.data?.length);

    if (!hasSubstantialData) {
      return new Response(JSON.stringify({
        has_data: false,
        fallback_questions: [
          { key: "goal", label: "Was ist das Hauptziel des Bewerbers?" },
          { key: "problem", label: "Was ist das Hauptproblem / Pain?" },
          { key: "timing", label: "Wie dringend ist die Situation? (Timing)" },
        ],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Du bist ein Sales-Intelligence-Assistent im Ethical Top Closer System.
Deine Aufgabe: Extrahiere strukturierte Informationen aus allen verfügbaren Lead-Daten.

EXTRAHIERE:
1. besonderheit: Was macht diesen Bewerber besonders? (1-2 Sätze)
2. hauptziel: Hauptziel des Bewerbers (1 Satz)
3. hauptproblem: Hauptproblem/Pain (1 Satz)
4. kaufbereitschaft: "low", "medium" oder "high"
5. kaufwahrscheinlichkeit: Zahl 1-10 (1=unwahrscheinlich, 10=sicherer Kauf). Basiere auf allen Signalen: Engagement, Dringlichkeit, Budget-Hinweise, Commitment-Level.
6. emotionale_trigger: Array von emotionalen Auslösern die den Lead motivieren (z.B. "Freiheit", "Sicherheit", "Anerkennung", "Familie", "Unzufriedenheit im Job", "Zeitdruck"). Max 4.
7. einwaende: Array von erkannten Einwänden (kurz, max 3)
8. closer_summary: Array von exakt 3 Bullet Points für den Closer (je max 15 Wörter). Fokus auf: Pain, Motivation, wichtigster Hebel.
9. suggested_loss_reason: Wahrscheinlichster Verlustgrund falls Deal verloren geht (price, no_trust, no_need, bad_timing, no_fit, bad_call)
10. suggested_win_reasons: Wahrscheinlichste Gewinn-Gründe (clear_pain, trust_built, good_leadership, right_timing, strong_fit)
11. gespraechs_zusammenfassung: Kurze Zusammenfassung des bisherigen Kontakts (max 2 Sätze)

REGELN:
- Basiere ALLES auf echten Daten, erfinde nichts
- Sei präzise und direkt
- Kaufwahrscheinlichkeit muss realistisch sein — nicht zu optimistisch
- Emotionale Trigger müssen aus dem Kontext abgeleitet sein
- Antworte IMMER als JSON`;

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
          { role: "user", content: `Analysiere diesen Lead und extrahiere die strukturierten Daten:\n\n${fullContext}` },
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

    let extracted = {
      has_data: true,
      besonderheit: "",
      hauptziel: "",
      hauptproblem: "",
      kaufbereitschaft: "medium",
      kaufwahrscheinlichkeit: 5,
      emotionale_trigger: [] as string[],
      einwaende: [] as string[],
      closer_summary: [] as string[],
      suggested_loss_reason: null as string | null,
      suggested_win_reasons: [] as string[],
      gespraechs_zusammenfassung: "",
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        extracted = { ...extracted, ...parsed, has_data: true };
      }
    } catch {
      // partial extraction
    }

    await supabase.from("lead_events").insert({
      lead_id,
      event_type: "ai_analysis_created",
      notes: `AI analysis completed: Buy probability ${extracted.kaufwahrscheinlichkeit}/10 | ${extracted.emotionale_trigger?.length || 0} triggers detected`,
      metadata: {
        kaufbereitschaft: extracted.kaufbereitschaft,
        kaufwahrscheinlichkeit: extracted.kaufwahrscheinlichkeit,
        emotionale_trigger: extracted.emotionale_trigger,
        einwaende_count: extracted.einwaende?.length || 0,
        has_closer_summary: (extracted.closer_summary?.length || 0) > 0,
      },
    });

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Auto-enrich error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
