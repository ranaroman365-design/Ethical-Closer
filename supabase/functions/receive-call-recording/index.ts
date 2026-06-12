// Webhook endpoint for external recording providers (Zoom, Twilio, custom).
// Accepts:
//   Standard: { call_id, audio_url } or { call_id, transcript_text }
//   Zoom webhook: { event: "recording.completed", payload: { ... } }
// Optional shared-secret auth via header X-Webhook-Secret (RECORDING_WEBHOOK_SECRET).
// Downloads audio -> uploads to call-recordings bucket -> invokes transcribe-call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const expectedSecret = Deno.env.get("RECORDING_WEBHOOK_SECRET");

    // Optional shared-secret check
    if (expectedSecret) {
      const got = req.headers.get("x-webhook-secret");
      if (got !== expectedSecret) {
        return new Response(JSON.stringify({ error: "invalid_secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const sb = createClient(supabaseUrl, serviceKey);
    const rawBody = await req.json().catch(() => ({}));

    // ── Zoom Webhook Detection ──────────────────────────────────
    if (rawBody.event) {
      return await handleZoomWebhook(sb, rawBody, supabaseUrl, serviceKey, corsHeaders);
    }

    // ── Standard Ingestion ──────────────────────────────────────
    const { call_id, audio_url, transcript_text, provider } = rawBody as {
      call_id?: string; audio_url?: string; transcript_text?: string; provider?: string;
    };

    if (!call_id) {
      return new Response(JSON.stringify({ error: "call_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!audio_url && !transcript_text) {
      return new Response(JSON.stringify({ error: "audio_url or transcript_text required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return await ingestRecording(sb, call_id, audio_url, transcript_text, provider || "custom", supabaseUrl, serviceKey, corsHeaders);
  } catch (e) {
    console.error("receive-call-recording error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Zoom Webhook Handler ──────────────────────────────────────
async function handleZoomWebhook(
  sb: ReturnType<typeof createClient>,
  body: Record<string, unknown>,
  supabaseUrl: string,
  serviceKey: string,
  corsHeaders: Record<string, string>,
) {
  const event = String(body.event || "");

  // Zoom webhook validation (endpoint.url_validation)
  if (event === "endpoint.url_validation") {
    const plainToken = (body.payload as Record<string, unknown>)?.plainToken as string;
    const secret = Deno.env.get("ZOOM_WEBHOOK_SECRET") || "";
    if (!secret) {
      return new Response(JSON.stringify({ error: "ZOOM_WEBHOOK_SECRET not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // HMAC-SHA256 for Zoom verification
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(plainToken));
    const hashHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return new Response(JSON.stringify({ plainToken, encryptedToken: hashHex }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // recording.completed — main ingestion event
  if (event === "recording.completed") {
    const payload = body.payload as Record<string, unknown> || {};
    const meetingObj = payload.object as Record<string, unknown> || {};
    const meetingId = String(meetingObj.id || meetingObj.uuid || "");
    const recordingFiles = (meetingObj.recording_files || []) as Array<Record<string, unknown>>;

    // Find the best audio file (mp4 audio or m4a)
    const audioFile = recordingFiles.find(
      (f) => f.recording_type === "audio_only" || f.file_type === "M4A"
    ) || recordingFiles.find(
      (f) => f.file_type === "MP4" && f.recording_type === "shared_screen_with_speaker_view"
    ) || recordingFiles[0];

    if (!audioFile) {
      console.warn("Zoom recording.completed but no files found for meeting", meetingId);
      return new Response(JSON.stringify({ skipped: true, reason: "no_recording_files" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const downloadUrl = String(audioFile.download_url || "");
    const downloadToken = String(payload.download_token || "");
    const audioUrlWithToken = downloadToken ? `${downloadUrl}?access_token=${downloadToken}` : downloadUrl;

    // Match meeting to appointment/call via meeting_id or meeting_provider
    const { data: appointment } = await sb
      .from("appointments")
      .select("id, lead_id")
      .or(`meeting_id.eq.${meetingId},video_room_name.eq.${meetingId}`)
      .maybeSingle();

    let callId: string | null = null;

    if (appointment) {
      // Find or create call record linked to this appointment
      const { data: existingCall } = await sb
        .from("calls")
        .select("id")
        .eq("appointment_id", appointment.id)
        .maybeSingle();

      if (existingCall) {
        callId = existingCall.id;
      } else {
        // Create a call record for this appointment
        const { data: newCall } = await sb
          .from("calls")
          .insert({
            appointment_id: appointment.id,
            lead_id: appointment.lead_id,
            status: "recording_received",
            call_type: "closing",
          } as Record<string, unknown>)
          .select("id")
          .single();
        callId = newCall?.id || null;
      }
    } else {
      // No matching appointment — create orphaned call with zoom metadata
      const { data: newCall } = await sb
        .from("calls")
        .insert({
          status: "recording_received",
          call_type: "closing",
          file_url: downloadUrl,
        } as Record<string, unknown>)
        .select("id")
        .single();
      callId = newCall?.id || null;
      console.warn("Zoom recording for unknown meeting:", meetingId, "→ orphan call", callId);
    }

    if (!callId) {
      return new Response(JSON.stringify({ error: "could_not_create_call" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log the zoom event
    await sb.from("video_events").insert({
      appointment_id: appointment?.id || null,
      event_type: "zoom.recording.completed",
      payload: { meeting_id: meetingId, file_type: audioFile.file_type, recording_type: audioFile.recording_type },
    }).catch(() => {});

    return await ingestRecording(sb, callId, audioUrlWithToken, undefined, "zoom", supabaseUrl, serviceKey, corsHeaders);
  }

  // Other Zoom events — log and acknowledge
  await sb.from("video_events").insert({
    event_type: `zoom.${event}`,
    payload: body,
  }).catch(() => {});

  return new Response(JSON.stringify({ acknowledged: true, event }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Core Ingestion Logic ──────────────────────────────────────
async function ingestRecording(
  sb: ReturnType<typeof createClient>,
  callId: string,
  audioUrl: string | undefined,
  transcriptText: string | undefined,
  provider: string,
  supabaseUrl: string,
  serviceKey: string,
  corsHeaders: Record<string, string>,
) {
  // Verify call exists
  const { data: call, error: cErr } = await sb
    .from("calls").select("id, transcript").eq("id", callId).maybeSingle();
  if (cErr || !call) {
    return new Response(JSON.stringify({ error: "call_not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotency
  if (call.transcript && String(call.transcript).length > 50) {
    return new Response(JSON.stringify({ skipped: true, reason: "transcript_exists" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const invokePayload: Record<string, unknown> = { call_id: callId };

  if (transcriptText) {
    invokePayload.transcript_text = transcriptText;
  } else if (audioUrl) {
    // Download from external provider URL
    const dl = await fetch(audioUrl);
    if (!dl.ok) {
      return new Response(JSON.stringify({ error: `download_failed_${dl.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const ext = (audioUrl.split("?")[0].split(".").pop() || "mp3").toLowerCase().slice(0, 5);
    const path = `${callId}/${Date.now()}.${ext}`;
    const contentType = dl.headers.get("content-type") || `audio/${ext}`;

    const { error: upErr } = await sb.storage
      .from("call-recordings")
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) {
      return new Response(JSON.stringify({ error: `upload_failed: ${upErr.message}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store file_url on call
    await sb.from("calls").update({ file_url: path } as Record<string, unknown>).eq("id", callId);
    invokePayload.file_path = path;
  }

  // Invoke transcribe-call
  const transcribeRes = await fetch(`${supabaseUrl}/functions/v1/transcribe-call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(invokePayload),
  });
  const trJson = await transcribeRes.json().catch(() => ({}));

  return new Response(
    JSON.stringify({
      success: transcribeRes.ok,
      call_id: callId,
      provider,
      transcribe_status: transcribeRes.status,
      transcribe_result: trJson,
    }),
    {
      status: transcribeRes.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
