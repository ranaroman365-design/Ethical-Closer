// Twilio Recording StatusCallback receiver.
// Twilio posts application/x-www-form-urlencoded with at least:
//   CallSid, RecordingSid, RecordingUrl, RecordingStatus
// We match CallSid -> calls.provider_call_id (provider='twilio'),
// then forward to receive-call-recording with audio_url+call_id.
// Auth: shared X-Webhook-Secret header (RECORDING_WEBHOOK_SECRET).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const expectedSecret = Deno.env.get("RECORDING_WEBHOOK_SECRET");

    if (expectedSecret) {
      const got = req.headers.get("x-webhook-secret");
      if (got !== expectedSecret) {
        return new Response(JSON.stringify({ error: "invalid_secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Twilio sends form-urlencoded by default; accept JSON too.
    const ct = req.headers.get("content-type") || "";
    let params: Record<string, string> = {};
    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({}));
      params = j as Record<string, string>;
    } else {
      const form = await req.formData();
      for (const [k, v] of form.entries()) params[k] = String(v);
    }

    const callSid = params.CallSid || params.call_sid;
    const recordingUrl = params.RecordingUrl || params.recording_url;
    const recordingStatus = (params.RecordingStatus || params.recording_status || "").toLowerCase();

    if (!callSid) {
      return new Response(JSON.stringify({ error: "CallSid required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!recordingUrl) {
      return new Response(JSON.stringify({ error: "RecordingUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Twilio fires multiple statuses; only act on completed
    if (recordingStatus && recordingStatus !== "completed") {
      return new Response(JSON.stringify({ skipped: true, reason: `status_${recordingStatus}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // Match Twilio CallSid -> internal call
    const { data: call } = await sb
      .from("calls")
      .select("id, transcript")
      .eq("provider", "twilio")
      .eq("provider_call_id", callSid)
      .maybeSingle();

    if (!call) {
      return new Response(
        JSON.stringify({ error: "call_not_found", call_sid: callSid, hint: "Set calls.provider='twilio' and calls.provider_call_id=<CallSid> at booking time." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (call.transcript && call.transcript.length > 50) {
      return new Response(JSON.stringify({ skipped: true, reason: "transcript_exists", call_id: call.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Twilio recording URLs need .mp3 suffix; default endpoint returns WAV.
    const audioUrl = recordingUrl.endsWith(".mp3") ? recordingUrl : `${recordingUrl}.mp3`;

    // Forward to existing receive-call-recording
    const fwd = await fetch(`${supabaseUrl}/functions/v1/receive-call-recording`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        ...(expectedSecret ? { "X-Webhook-Secret": expectedSecret } : {}),
      },
      body: JSON.stringify({ call_id: call.id, audio_url: audioUrl, provider: "twilio" }),
    });
    const fwdJson = await fwd.json().catch(() => ({}));

    return new Response(
      JSON.stringify({
        success: fwd.ok,
        call_id: call.id,
        call_sid: callSid,
        forwarded_status: fwd.status,
        result: fwdJson,
      }),
      {
        status: fwd.ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("twilio-recording-webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
