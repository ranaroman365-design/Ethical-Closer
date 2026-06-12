// twilio-inbound-webhook
// Public Twilio webhook for inbound WhatsApp replies.
// Verifies X-Twilio-Signature using TWILIO_AUTH_TOKEN, parses Body,
// matches [ref:<token>] in original message → action_token in admin_alert_log,
// executes mapped action, returns TwiML ack.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-twilio-signature, content-type",
};

function twiml(message?: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(body, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/xml" } });
}

// Twilio signature: HMAC-SHA1(authToken, fullURL + sortedParamKey+paramValue concatenated), base64
function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string): boolean {
  const sorted = Object.keys(params).sort();
  let data = url;
  for (const k of sorted) data += k + params[k];
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  try {
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!authToken) {
      console.error("TWILIO_AUTH_TOKEN not configured");
      return twiml(); // silent ack — don't tell attacker
    }

    const formText = await req.text();
    const params = Object.fromEntries(new URLSearchParams(formText)) as Record<string, string>;
    const signature = req.headers.get("x-twilio-signature") ?? "";

    // Reconstruct full URL Twilio used
    const url = new URL(req.url);
    const fullUrl = `${url.origin}${url.pathname}`;

    if (!verifyTwilioSignature(authToken, fullUrl, params, signature)) {
      console.warn("invalid twilio signature", { fullUrl, sig: signature.slice(0, 8) });
      return new Response("forbidden", { status: 403 });
    }

    const fromRaw = params.From ?? "";   // "whatsapp:+49..."
    const fromPhone = fromRaw.replace(/^whatsapp:/, "");
    const messageBody = (params.Body ?? "").trim();

    // Find original alert via [ref:<token>]: scan recent logs sent to this phone, match body containing token OR fall back to most recent pending
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look for the most recent alert sent to this phone in last 24h that has not been replied to
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("admin_alert_log")
      .select("id, action_token, lead_id, recipient_user_id, event_type, replied_at")
      .eq("to_whatsapp", fromPhone)
      .eq("status", "sent")
      .is("replied_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!recent) {
      return twiml("No active alert to act on. Open the dashboard to assign manually.");
    }

    // Map reply
    const choice = messageBody.split(/\s+/)[0]; // "1", "2", "3", or text
    let action: string | null = null;
    let ack = "";

    if (recent.event_type === "HOT_LEAD" || recent.event_type === "HIGH_VALUE_LEAD") {
      if (choice === "1") { action = "assign_to_me"; ack = "✅ Assigned to you. Open dashboard for details."; }
      else if (choice === "2") { action = "snooze"; ack = "⏱ Snoozed. You'll see it in your queue."; }
      else if (choice === "3") { action = "contacted"; ack = "✓ Marked as contacted."; }
    } else if (recent.event_type === "NO_SHOW") {
      if (choice === "1") { action = "recover_now"; ack = "🔁 Recovery flow triggered."; }
      else if (choice === "2") { action = "reschedule"; ack = "📅 Reschedule flow triggered."; }
    }

    if (!action) {
      return twiml("Unknown reply. Use 1, 2, or 3 — or open the dashboard.");
    }

    // Persist reply
    await supabase.from("admin_alert_log").update({
      replied_action: action,
      replied_at: new Date().toISOString(),
    }).eq("id", recent.id);

    // Execute action (best-effort, non-blocking semantics for ack)
    if (action === "assign_to_me" && recent.lead_id) {
      // Insert lead assignment if your schema requires it; here we set closer_id on the lead as a minimal mutation.
      await supabase.from("leads").update({ closer_id: recent.recipient_user_id }).eq("id", recent.lead_id);
    } else if (action === "contacted" && recent.lead_id) {
      // record a lightweight note via setter_notes append (best-effort)
      const { data: lead } = await supabase.from("leads").select("setter_notes").eq("id", recent.lead_id).maybeSingle();
      const stamp = `[${new Date().toISOString()}] WA-reply: contacted`;
      const newNotes = lead?.setter_notes ? `${lead.setter_notes}\n${stamp}` : stamp;
      await supabase.from("leads").update({ setter_notes: newNotes }).eq("id", recent.lead_id);
    }
    // snooze / recover_now / reschedule: ack only in v1 — actual workflow wiring can be added later.

    return twiml(ack);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("twilio-inbound-webhook error:", msg);
    return twiml(); // silent ack on error
  }
});
