import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function verifyUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { authorization: authHeader } } }
  );
  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function transcribeAudio(base64Audio: string, mimeType: string, apiKey: string): Promise<string> {
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Transcribe the following audio exactly as spoken. Return ONLY the transcription text, nothing else. The audio is in German." },
        { role: "user", content: [{ type: "input_audio", input_audio: { data: base64Audio, format: mimeType.split("/")[1] } }] },
      ],
      temperature: 0.1,
    }),
  });
  if (!res.ok) throw new Error(`Transcription failed: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function analyzeTranscript(transcript: string, aiPrompt: string, expectedSkill: string, apiKey: string) {
  const prompt = `You are an elite, world-class ethical sales coach evaluating a closing trainee's spoken response.

Context:
- The AI buyer said: "${aiPrompt || "N/A"}"
- Expected skill focus: ${expectedSkill || "general"}
- The trainee responded (transcript): "${transcript}"

Evaluate this response STRICTLY and CRITICALLY on these 5 dimensions (each 1-10):

1. **Clarity** — Was the message clear, concise, and easy to understand?
2. **Structure** — Was there a logical flow? Opening, body, conclusion?
3. **Emotional Control** — Did the trainee stay calm, grounded, professional?
4. **Objection Handling** — How well did they address the buyer's concern or objection?
5. **Closing Direction** — Did they move the conversation toward a decision ethically?

Also evaluate:
6. **filler_words_detected** — Were filler words (ähm, also, halt, sozusagen, etc.) used excessively? (true/false)
7. **confidence_level** — How confident did the trainee sound overall? (1-10)

Provide:
- **strengths**: 1-2 sentences on what was done well (be specific, no generic praise)
- **weaknesses**: 1-2 sentences on what needs work (be direct)
- **improvement_actions**: Exactly 3 specific, actionable improvement tips as an array

Return ONLY valid JSON:
{
  "clarity": <number>,
  "structure": <number>,
  "emotional_control": <number>,
  "objection_handling": <number>,
  "closing_direction": <number>,
  "filler_words_detected": <boolean>,
  "confidence_level": <number>,
  "strengths": "<string>",
  "weaknesses": "<string>",
  "improvement_actions": ["<string>", "<string>", "<string>"]
}`;

  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are an expert sales coach. Respond ONLY with valid JSON. Be critical, specific, and actionable. No generic feedback." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Analysis failed: ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  return JSON.parse(raw.replace(/```json\n?/g, "").replace(/```/g, "").trim());
}

async function updateProgress(supabase: any, userId: string, simulationLevel: number) {
  // Get all completed attempts for this user+level
  const { data: attempts } = await supabase
    .from("simulation_attempts")
    .select("total_score, created_at")
    .eq("user_id", userId)
    .eq("completed", true)
    .in("simulation_id", supabase.from("simulations").select("id").eq("level", simulationLevel));

  // Fallback: get all attempts for simulations at this level
  const { data: sims } = await supabase
    .from("simulations")
    .select("id")
    .eq("level", simulationLevel);

  const simIds = (sims || []).map((s: any) => s.id);
  if (simIds.length === 0) return;

  const { data: allAttempts } = await supabase
    .from("simulation_attempts")
    .select("total_score, created_at")
    .eq("user_id", userId)
    .in("simulation_id", simIds);

  const validAttempts = (allAttempts || []).filter((a: any) => a.total_score != null);
  if (validAttempts.length === 0) return;

  const scores = validAttempts.map((a: any) => a.total_score);
  const avgScore = Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10;
  const bestScore = Math.round(Math.max(...scores) * 10) / 10;
  const lastAt = validAttempts.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at;

  await supabase
    .from("simulation_user_progress")
    .upsert({
      user_id: userId,
      level: simulationLevel,
      avg_score: avgScore,
      best_score: bestScore,
      total_attempts: validAttempts.length,
      last_attempt_at: lastAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,level" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await verifyUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { audio_path, step_id, attempt_id, ai_prompt, expected_skill, is_last_step, simulation_level } = body;

    if (!audio_path || !step_id || !attempt_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    // 1) Download audio
    const { data: audioData, error: dlError } = await supabase.storage
      .from("audio-messages")
      .download(audio_path);

    if (dlError || !audioData) {
      return new Response(JSON.stringify({ error: "Audio download failed", details: dlError?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Transcribe
    const audioBytes = new Uint8Array(await audioData.arrayBuffer());
    const base64Audio = btoa(String.fromCharCode(...audioBytes));
    const mimeType = audio_path.endsWith(".mp4") ? "audio/mp4" : "audio/webm";

    let transcript: string;
    try {
      transcript = await transcribeAudio(base64Audio, mimeType, LOVABLE_KEY);
    } catch (err) {
      console.error("Transcription error:", err);
      return new Response(JSON.stringify({ error: "Transcription failed", details: String(err) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!transcript || transcript.length < 5) {
      return new Response(JSON.stringify({ error: "Transcription empty or too short" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) AI Analysis
    let scores: any;
    try {
      scores = await analyzeTranscript(transcript, ai_prompt || "", expected_skill || "general", LOVABLE_KEY);
    } catch (err) {
      console.error("Analysis error:", err);
      // Save transcript even if analysis fails
      await supabase.from("simulation_responses").insert({
        attempt_id, step_id, audio_url: audio_path, transcript,
      });
      return new Response(JSON.stringify({ error: "AI analysis failed", transcript }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize scores
    const safeScore = (v: any) => Math.min(10, Math.max(1, Number(v) || 5));
    const normalized = {
      clarity: safeScore(scores.clarity),
      structure: safeScore(scores.structure),
      emotional_control: safeScore(scores.emotional_control),
      objection_handling: safeScore(scores.objection_handling),
      closing_direction: safeScore(scores.closing_direction),
    };

    const totalScore = Object.values(normalized).reduce((a, b) => a + b, 0) / 5;
    const improvementActions = Array.isArray(scores.improvement_actions)
      ? scores.improvement_actions.slice(0, 3)
      : [scores.improvement_actions || scores.improvement || "Übe regelmäßig."];

    // 4) Save response
    await supabase.from("simulation_responses").insert({
      attempt_id,
      step_id,
      audio_url: audio_path,
      transcript,
      score_clarity: normalized.clarity,
      score_structure: normalized.structure,
      score_emotional_control: normalized.emotional_control,
      score_objection_handling: normalized.objection_handling,
      score_closing_direction: normalized.closing_direction,
      feedback_text: JSON.stringify({
        strengths: scores.strengths || "",
        weaknesses: scores.weaknesses || "",
      }),
      improvement_text: JSON.stringify(improvementActions),
    });

    // 5) Update attempt score (running average)
    const { data: allResponses } = await supabase
      .from("simulation_responses")
      .select("score_clarity, score_structure, score_emotional_control, score_objection_handling, score_closing_direction")
      .eq("attempt_id", attempt_id);

    let avgTotal = totalScore;
    if (allResponses && allResponses.length > 0) {
      const sum = allResponses.reduce((acc: number, r: any) => {
        return acc + ((r.score_clarity || 0) + (r.score_structure || 0) + (r.score_emotional_control || 0) + (r.score_objection_handling || 0) + (r.score_closing_direction || 0)) / 5;
      }, 0);
      avgTotal = Math.round((sum / allResponses.length) * 10) / 10;
    }

    const updatePayload: any = { total_score: avgTotal };
    if (is_last_step) updatePayload.completed = true;

    await supabase
      .from("simulation_attempts")
      .update(updatePayload)
      .eq("id", attempt_id);

    // 6) Update user progress if completed
    if (is_last_step && simulation_level) {
      try {
        await updateProgress(supabase, user.id, simulation_level);
      } catch (e) {
        console.error("Progress update error:", e);
      }
    }

    return new Response(
      JSON.stringify({
        transcript,
        scores: normalized,
        feedback: {
          strengths: scores.strengths || "",
          weaknesses: scores.weaknesses || "",
          improvement_actions: improvementActions,
        },
        filler_words_detected: !!scores.filler_words_detected,
        confidence_level: safeScore(scores.confidence_level),
        total_score: Math.round(totalScore * 10) / 10,
        attempt_avg: avgTotal,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal error", message: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
