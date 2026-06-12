// Zoom Recording webhook receiver.
// Handles two Zoom event flows:
//  1) endpoint.url_validation -> echoes back encrypted token (Zoom verification)
//  2) recording.completed     -> downloads first audio recording, uploads to call-recordings, triggers transcribe-call
//
// Matching: Zoom payload.object.uuid -> calls.provider_call_id (provider='zoom').
// Auth: shared X-Webhook-Secret (RECORDING_WEBHOOK_SECRET) OR Zoom verification token in payload.
// For url_validation we use ZOOM_WEBHOOK_SECRET_TOKEN if present.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

interface ZoomRecordingFile {
  id: string;
  file_type: string; // "MP4" | "M4A" | "TRANSCRIPT" | etc.
  file_extension?: string;
  download_url: string;
  recording_type?: string;
  status?: string;
}

interface ZoomPayload {
  event?: string;
  payload?: {
    plainToken?: string;
    object?: {
      uuid?: string;
      id?: string;
      topic?: string;
      recording_files?: ZoomRecordingFile[];
    };
  };
  download_token?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sharedSecret = Deno.env.get("RECORDING_WEBHOOK_SECRET");
    const zoomVerificationToken = Deno.env.get("ZOOM_WEBHOOK_SECRET_TOKEN");

    const body = (await req.json().catch(() => ({}))) as ZoomPayload;

    // 1) Zoom URL validation handshake
    if (body.event === "endpoint.url_validation" && body.payload?.plainToken) {
      const plainToken = body.payload.plainToken;
      let encryptedToken = plainToken;
      if (zoomVerificationToken) {
        encryptedToken = createHmac("sha256", zoomVerificationToken).update(plainToken).digest("hex");
      }
      return new Response(JSON.stringify({ plainToken, encryptedToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Auth for recording events
    if (sharedSecret) {
      const got = req.headers.get("x-webhook-secret");
      if (got !== sharedSecret) {
        return new Response(JSON.stringify({ error: "invalid_secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (body.event !== "recording.completed") {
      return new Response(JSON.stringify({ skipped: true, reason: `event_${body.event ?? "unknown"}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meetingUuid = body.payload?.object?.uuid;
    const downloadToken = body.download_token;
    const files = body.payload?.object?.recording_files ?? [];

    if (!meetingUuid) {
      return new Response(JSON.stringify({ error: "meeting_uuid_missing" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prefer audio-only M4A; fall back to MP4 video (audio track is enough for transcription)
    const audioFile =
      files.find((f) => f.file_type === "M4A") ??
      files.find((f) => f.file_type === "MP4") ??
      null;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "no_audio_recording", meeting_uuid: meetingUuid }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    const { data: call } = await sb
      .from("calls")
      .select("id, transcript")
      .eq("provider", "zoom")
      .eq("provider_call_id", meetingUuid)
      .maybeSingle();

    if (!call) {
      return new Response(
        JSON.stringify({
          error: "call_not_found",
          meeting_uuid: meetingUuid,
          hint: "Set calls.provider='zoom' and calls.provider_call_id=<meeting uuid> at booking time.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (call.transcript && call.transcript.length > 50) {
      return new Response(JSON.stringify({ skipped: true, reason: "transcript_exists", call_id: call.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download recording (Zoom requires download_token as Bearer or query param)
    const dlUrl = downloadToken
      ? `${audioFile.download_url}?access_token=${encodeURIComponent(downloadToken)}`
      : audioFile.download_url;

    const dl = await fetch(dlUrl, {
      headers: downloadToken ? { Authorization: `Bearer ${downloadToken}` } : {},
    });
    if (!dl.ok) {
      return new Response(JSON.stringify({ error: `zoom_download_failed_${dl.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = new Uint8Array(await dl.arrayBuffer());
    const ext = (audioFile.file_extension || audioFile.file_type || "m4a").toLowerCase();
    const path = `${call.id}/zoom-${Date.now()}.${ext}`;
    const contentType = dl.headers.get("content-type") || (ext === "mp4" ? "video/mp4" : "audio/mp4");

    const { error: upErr } = await sb.storage
      .from("call-recordings")
      .upload(path, bytes, { contentType, upsert: true });
    if (upErr) {
      return new Response(JSON.stringify({ error: `upload_failed: ${upErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trigger transcription
    const tr = await fetch(`${supabaseUrl}/functions/v1/transcribe-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ call_id: call.id, file_path: path }),
    });
    const trJson = await tr.json().catch(() => ({}));

    return new Response(
      JSON.stringify({
        success: tr.ok,
        call_id: call.id,
        meeting_uuid: meetingUuid,
        file_path: path,
        transcribe_status: tr.status,
        transcribe_result: trJson,
      }),
      { status: tr.ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("zoom-recording-webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
