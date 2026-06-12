import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { input, lead_context, mode, session_notes, language } = await req.json();

    if (!input || typeof input !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'input'" }), {
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
    const isPostCall = mode === "summary";

    // Build context block from lead data
    let contextBlock = "";
    if (lead_context) {
      const lc = lead_context;
      const parts: string[] = [];
      if (lc.name) parts.push(`Lead: ${lc.name}`);
      if (lc.source_funnel) parts.push(`Funnel: ${lc.source_funnel}`);
      if (lc.qualification_score != null) parts.push(`Qual-Score: ${lc.qualification_score}`);
      if (lc.qualification_bucket) parts.push(`Bucket: ${lc.qualification_bucket}`);
      if (lc.stage) parts.push(`Stage: ${lc.stage}`);
      if (lc.deal_value) parts.push(`Deal-Value: ${lc.deal_value}€`);
      if (lc.setter_notes) parts.push(`Setter-Notizen: ${lc.setter_notes}`);
      if (lc.closer_notes) parts.push(`Closer-Notizen: ${lc.closer_notes}`);
      if (lc.ai_setter_summary) parts.push(`AI-Setter-Analyse: ${lc.ai_setter_summary}`);
      if (lc.ai_setter_recommendation) parts.push(`AI-Empfehlung: ${lc.ai_setter_recommendation}`);
      if (lc.setter_budget_readiness) parts.push(`Budget-Readiness: ${lc.setter_budget_readiness}`);
      if (lc.setter_decision_readiness) parts.push(`Decision-Readiness: ${lc.setter_decision_readiness}`);
      if (lc.setter_problem_clarity) parts.push(`Problem-Klarheit: ${lc.setter_problem_clarity}`);
      contextBlock = parts.join("\n");
    }

    const previousNotes = (session_notes || []).join("\n");

    const systemPrompt = isPostCall
      ? buildSummaryPrompt(lang, contextBlock, previousNotes)
      : buildAnalysisPrompt(lang, contextBlock, previousNotes);

    const toolDef = isPostCall
      ? {
          name: "post_call_summary",
          description: "Generate structured post-call summary",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "What happened in the call (2-3 sentences)" },
              main_concern: { type: "string", description: "Primary concern or blocker" },
              decision_status: { type: "string", enum: ["decided", "leaning_yes", "undecided", "leaning_no", "rejected"] },
              went_well: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
              blocked_deal: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
              next_steps: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 },
              suggested_outcome: { type: "string", enum: ["closed_won", "follow_up", "closed_lost"] },
            },
            required: ["summary", "main_concern", "decision_status", "went_well", "blocked_deal", "next_steps", "suggested_outcome"],
            additionalProperties: false,
          },
        }
      : {
          name: "closer_analysis",
          description: "Analyze closer input and return tactical guidance",
          parameters: {
            type: "object",
            properties: {
              phase: { type: "string", enum: ["rapport", "discovery", "qualification", "objection", "closing", "follow_up"] },
              objection_type: { type: "string", enum: ["price", "timing", "trust", "uncertainty", "decision_authority", "overwhelm", "unclear_fit", "none"] },
              suggested_response: { type: "string", description: "One short usable response the closer can say (max 25 words)" },
              next_action: { type: "string", description: "What the closer should do next (max 15 words)" },
              backup_action: { type: "string", description: "Optional alternative action (max 15 words)" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["phase", "objection_type", "suggested_response", "next_action", "confidence"],
            additionalProperties: false,
          },
        };

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
          { role: "user", content: input },
        ],
        tools: [{ type: "function", function: toolDef }],
        tool_choice: { type: "function", function: { name: toolDef.name } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = toolCall
      ? toolCall.function.arguments
      : data.choices?.[0]?.message?.content || "{}";

    return new Response(result, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("closer-copilot-v2 error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ─── Prompt Builders ─── */

function buildAnalysisPrompt(lang: string, context: string, previousNotes: string): string {
  const contextSection = context ? `\n\nLEAD CONTEXT (use this — responses MUST reference specific lead data, NEVER be generic):\n${context}` : "";
  const notesSection = previousNotes ? `\n\nPREVIOUS CALL NOTES:\n${previousNotes}` : "";

  const core = `You are a high-performance sales closer assistant inside the Ethical Closing (ETC) system.

PURPOSE:
- Help the closer win the deal
- Not entertain, not educate broadly, not explain theory
- Every output must be immediately usable, short, precise, situational

CONTEXT AWARENESS:
- You ALWAYS use: lead context, AI Setter summary (if available), qualification level, prior notes, conversation input
- If context is missing: reduce certainty, NEVER hallucinate

DECISION INTELLIGENCE:
- If vague input: assume uncertainty, recommend clarification
- If resistance: identify real objection layer (surface vs real). Example: "zu teuer" may mean no trust, no clarity, or fear of failure. Help closer uncover the real reason.
- If emotional signal: prioritize labeling, mirroring, slowing down
- If buying signal: shift toward closing phase

RESPONSE PATTERNS (use implicitly, do NOT name them):
- mirror: repeat in own words
- label: name the emotion/state
- clarify: ask a precision question
- isolate: separate the objection from the rest
- reframe: show new perspective
- future_pace: paint the outcome
- commitment_check: test readiness

CLOSING LOGIC:
- When lead shows readiness: recommend moving to close
- BUT only if: clarity is sufficient, objection is resolved, intent is visible
- Otherwise: block premature closing

CONFIDENCE HANDLING:
- If unsure: reflect uncertainty in next_action (e.g. "first clarify if this is really about price or trust")

STYLE:
- Concise, calm, confident, direct, practical, realistic
- No long paragraphs, no over-explaining, no coach/guru tone, no hype, no aggressive manipulation, no invented facts
- Responses must sound natural and be speakable in real conversation
- Max 25 words per suggested response`;

  if (lang === "de") {
    return `${core}

LANGUAGE: Respond in German. All suggested responses must be in natural German.${contextSection}${notesSection}`;
  }

  return `${core}${contextSection}${notesSection}`;
}

function buildSummaryPrompt(lang: string, context: string, notes: string): string {
  const contextSection = context ? `\n\nLEAD CONTEXT:\n${context}` : "";

  const core = `You create structured post-call summaries for closers in the Ethical Closing (ETC) system.

Analyze the call notes and produce:
1. Summary: What happened (2-3 sentences, factual)
2. Main concern: The primary blocker or worry
3. Decision status: Where the lead stands
4. What went well: 1-3 specific positives
5. What blocked: 1-3 specific blockers
6. Next steps: 1-2 concrete actions
7. Suggested outcome: closed_won / follow_up / closed_lost

RULES:
- Short and precise — no essays
- No guesses about unknown facts
- Base everything on actual notes
- Use lead context to add specificity
- Be honest about deal health — do not sugarcoat`;

  if (lang === "de") {
    return `${core}

LANGUAGE: Respond in German.${contextSection}

CALL-NOTIZEN:
${notes}`;
  }

  return `${core}${contextSection}

CALL NOTES:
${notes}`;
}
