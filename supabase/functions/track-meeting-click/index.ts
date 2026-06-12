/**
 * track-meeting-click — Tracking Redirect for Meeting Links
 * 
 * Logs when an applicant clicks a meeting link (from email/WhatsApp/SMS),
 * then redirects them to the actual meeting URL.
 *
 * URL format: /track-meeting-click?t=<token>
 * The token encodes: appointmentId, leadId, channel, and the target URL.
 *
 * GDPR: IP is hashed with SHA-256 before storage. No raw IP stored.
 * Canon: Layer 47 · Conversion · Visualization
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t");

    if (!token) {
      return new Response("Missing token", { status: 400, headers: corsHeaders });
    }

    // Decode the token (base64url-encoded JSON)
    let payload: {
      a: string; // appointment_id
      l: string; // lead_id
      c: string; // channel
      u: string; // target URL
    };

    try {
      const decoded = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
      payload = JSON.parse(decoded);
    } catch {
      return new Response("Invalid token", { status: 400, headers: corsHeaders });
    }

    if (!payload.u) {
      return new Response("No target URL", { status: 400, headers: corsHeaders });
    }

    // Hash IP for GDPR-safe dedup
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(ip + "meeting-click-salt-2026"),
    );
    const ipHash = Array.from(new Uint8Array(ipHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const userAgent = req.headers.get("user-agent") || null;

    // Log the click (fire-and-forget — don't block redirect)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Insert click event
    const { error: insertErr } = await supabase.from("meeting_link_clicks").insert({
      appointment_id: payload.a || null,
      lead_id: payload.l || null,
      tracking_token: token.slice(0, 64), // truncate for index
      channel: payload.c || "unknown",
      user_agent: userAgent?.slice(0, 500),
      ip_hash: ipHash,
    });

    if (insertErr) {
      console.error("[track-meeting-click] insert error:", insertErr);
    }

    // Redirect to actual meeting URL
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: payload.u,
        "Cache-Control": "no-store, no-cache",
      },
    });
  } catch (e) {
    console.error("[track-meeting-click] error:", e);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
