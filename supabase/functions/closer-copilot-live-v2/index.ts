/**
 * closer-copilot-live-v2
 *
 * Real-time live coaching engine. Called every ~4s during a call.
 * Input: rolling transcript window + session context.
 * Output: phase, buyer state, deal risk, exact phrase, alt phrase,
 *         risk alert, 5 component scores. Latency target < 3s.
 *
 * Auth: requires Bearer JWT (closer himself). Owner-only writes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash-lite";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM_PROMPT = `You are an elite real-time sales copilot for a B2B closer in DACH.
You receive a rolling transcript window. Reply ONLY with a JSON tool-call.

Hard rules:
- exact_phrase and alt_phrase: max 15 words, German, immediately speakable.
- No theory, no greetings, no preamble.
- If transcript is too short for a real signal, return phase=opening with a discovery opener.
- risk_alert: only set if a clear risk exists, else null.
- All 5 scores are 0-100 integers reflecting the closer's performance so far.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "live_coaching_tick",
    description: "Return one tick of live closer coaching",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "phase",
        "buyer_state",
        "deal_risk",
        "detected_objection",
        "next_best_action",
        "exact_phrase",
        "alt_phrase",
        "reasoning",
        "risk_alert",
        "clarity_score",
        "confidence_score",
        "control_score",
        "objection_score",
        "ethical_score",
      ],
      properties: {
        phase: {
          type: "string",
          enum: ["opening", "discovery", "pitch", "objection", "closing"],
        },
        buyer_state: {
          type: "string",
          enum: ["interested", "skeptical", "resistant", "emotional", "neutral"],
        },
        deal_risk: {
          type: "string",
          enum: ["strong", "neutral", "weak", "at_risk"],
        },
        detected_objection: {
          type: "string",
          enum: ["price", "trust", "timing", "authority", "need", "none"],
        },
        next_best_action: { type: "string", maxLength: 80 },
        exact_phrase: { type: "string", maxLength: 200 },
        alt_phrase: { type: "string", maxLength: 200 },
        reasoning: { type: "string", maxLength: 160 },
        risk_alert: { type: ["string", "null"], maxLength: 120 },
        clarity_score: { type: "integer", minimum: 0, maximum: 100 },
        confidence_score: { type: "integer", minimum: 0, maximum: 100 },
        control_score: { type: "integer", minimum: 0, maximum: 100 },
        objection_score: { type: "integer", minimum: 0, maximum: 100 },
        ethical_score: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
  },
};

interface ReqBody {
  session_id?: string;
  call_id?: string | null;
  transcript_window: string;
  tick_index?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = (await req.json()) as ReqBody;
    if (!body?.transcript_window || typeof body.transcript_window !== "string") {
      return json({ error: "transcript_window is required" }, 400);
    }
    const window = body.transcript_window.slice(-4000); // keep prompt small for latency

    // Ensure session exists / create
    let sessionId = body.session_id;
    if (!sessionId) {
      const { data: created, error: cErr } = await supabase
        .from("copilot_sessions")
        .insert({
          user_id: userId,
          call_id: body.call_id ?? null,
          consent_given: true,
        })
        .select("id")
        .single();
      if (cErr) {
        console.error("session insert failed", cErr);
        return json({ error: "session_create_failed" }, 500);
      }
      sessionId = created.id;
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "missing LOVABLE_API_KEY" }, 500);

    const aiResp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `TRANSCRIPT (last ~60s):\n"""\n${window}\n"""\n\nReturn the tool call.`,
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "live_coaching_tick" } },
      }),
    });

    if (aiResp.status === 429) {
      return json({ error: "rate_limited" }, 429);
    }
    if (aiResp.status === 402) {
      return json({ error: "credits_exhausted" }, 402);
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return json({ error: "ai_gateway_error" }, 502);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return json({ error: "no_tool_call" }, 502);
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return json({ error: "bad_tool_json" }, 502);
    }

    const latencyMs = Date.now() - t0;
    const tickIndex =
      typeof body.tick_index === "number" ? body.tick_index : 0;

    // Persist tick
    const { error: insErr } = await supabase.from("copilot_live_events").insert({
      session_id: sessionId,
      user_id: userId,
      tick_index: tickIndex,
      phase: parsed.phase ?? null,
      buyer_state: parsed.buyer_state ?? null,
      deal_risk: parsed.deal_risk ?? null,
      detected_objection: parsed.detected_objection ?? null,
      next_best_action: parsed.next_best_action ?? null,
      exact_phrase: parsed.exact_phrase ?? null,
      alt_phrase: parsed.alt_phrase ?? null,
      reasoning: parsed.reasoning ?? null,
      risk_alert: parsed.risk_alert ?? null,
      clarity_score: parsed.clarity_score ?? null,
      confidence_score: parsed.confidence_score ?? null,
      control_score: parsed.control_score ?? null,
      objection_score: parsed.objection_score ?? null,
      ethical_score: parsed.ethical_score ?? null,
      latency_ms: latencyMs,
      transcript_window: window,
    });
    if (insErr) console.error("tick insert failed", insErr);

    // (no per-tick session update — ticks_count column doesn't exist)

    // Mirror scores into call_ai_scores if call_id present (best-effort)
    if (body.call_id) {
      await supabase.from("call_ai_scores").upsert(
        {
          call_id: body.call_id,
          user_id: userId,
          clarity_score: parsed.clarity_score ?? null,
          structure_score: parsed.control_score ?? null,
          objection_handling_score: parsed.objection_score ?? null,
          ethical_alignment_score: parsed.ethical_score ?? null,
          trust_score: parsed.confidence_score ?? null,
          overall_call_score: averageScore(parsed),
          scoring_status: "live",
          scoring_version: "copilot-live-v2",
        },
        { onConflict: "call_id" },
      );
    }

    return json({
      session_id: sessionId,
      tick_index: tickIndex,
      latency_ms: latencyMs,
      ...parsed,
    });
  } catch (e) {
    console.error("copilot-live error", e);
    return json(
      { error: e instanceof Error ? e.message : "unknown" },
      500,
    );
  }
});

function averageScore(p: Record<string, unknown>): number {
  const keys = [
    "clarity_score",
    "confidence_score",
    "control_score",
    "objection_score",
    "ethical_score",
  ];
  const vals = keys
    .map((k) => Number(p[k]))
    .filter((n) => Number.isFinite(n));
  if (!vals.length) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
