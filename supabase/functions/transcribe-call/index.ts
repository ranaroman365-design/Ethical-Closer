import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(supabaseUrl, serviceKey);
    const body = await req.json().catch(() => ({}));
    const { call_id, file_path, transcript_text } = body as {
      call_id?: string; file_path?: string; transcript_text?: string;
    };
    if (!call_id) throw new Error("call_id required");

    // Idempotency: skip if transcript already exists
    const { data: existing } = await sb.from("calls").select("id, transcript, user_id").eq("id", call_id).maybeSingle();
    if (!existing) throw new Error("call not found");
    if (existing.transcript && existing.transcript.length > 50) {
      return new Response(JSON.stringify({ skipped: true, reason: "transcript exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let finalTranscript = "";

    // Path A: paste-fallback (closer pasted transcript text)
    if (transcript_text && transcript_text.length > 50) {
      finalTranscript = transcript_text.trim();
    } else if (file_path) {
      // Path B: download audio from storage and send to Lovable AI (Gemini multimodal)
      const { data: fileData, error: dlErr } = await sb.storage.from("call-recordings").download(file_path);
      if (dlErr || !fileData) throw new Error(`download failed: ${dlErr?.message}`);

      const arr = new Uint8Array(await fileData.arrayBuffer());
      // base64 encode in chunks (avoid stack overflow on large files)
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < arr.length; i += chunk) {
        binary += String.fromCharCode(...arr.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);
      const mimeType = fileData.type || "audio/webm";

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: "You are a transcription engine. Transcribe the audio verbatim in the original language. Output ONLY the transcript text — no preamble, no labels, no timestamps unless speakers are clearly distinguishable (then prefix lines with 'Closer:' or 'Lead:')." },
            { role: "user", content: [
              { type: "text", text: "Transcribe this sales call." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } },
            ] },
          ],
        }),
      });

      if (!aiRes.ok) {
        const t = await aiRes.text();
        if (aiRes.status === 429) throw new Error("Rate limit exceeded");
        if (aiRes.status === 402) throw new Error("Payment required — top up Lovable AI credits");
        throw new Error(`AI transcription failed [${aiRes.status}]: ${t}`);
      }
      const data = await aiRes.json();
      finalTranscript = data.choices?.[0]?.message?.content?.trim() || "";
      if (!finalTranscript) throw new Error("Empty transcript from AI");
    } else {
      throw new Error("Either file_path or transcript_text required");
    }

    // Write transcript — this fires the auto-analyze trigger
    const { error: upErr } = await sb.from("calls").update({ transcript: finalTranscript }).eq("id", call_id);
    if (upErr) throw upErr;

    // In-app notification: closer sees that analysis & outcome step are ready
    if (existing.user_id) {
      await sb.from("notifications").insert({
        recipient_id: existing.user_id,
        type: "system",
        title: "Transkript bereit",
        message: "Die Analyse läuft. Bitte erfasse jetzt das Gesprächsergebnis.",
        link_path: `/members/calls/${call_id}`,
        metadata: { call_id, length: finalTranscript.length, source: "transcribe-call" },
      } as never);
    }

    return new Response(JSON.stringify({ success: true, call_id, length: finalTranscript.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-call error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
