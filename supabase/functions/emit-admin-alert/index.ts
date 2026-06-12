// emit-admin-alert
// Receives {event_type, lead_id, appointment_id?, payload?}.
// Resolves L6+ recipients, applies dedupe + DNC + quiet hours,
// composes WhatsApp message, dispatches via existing attendance-send-twilio,
// writes admin_alert_log per recipient.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventType = "HOT_LEAD" | "BOOKED_CALL" | "NO_SHOW" | "HIGH_VALUE_LEAD";

interface Body {
  event_type: EventType;
  lead_id: string;
  appointment_id?: string | null;
  payload?: Record<string, unknown>;
}

const APP_BASE = "https://ethicalcloser.de"; // dashboard deep-link base

function buildMessage(eventType: EventType, lead: any, payload: any, actionToken: string, leadUrl: string): string {
  const name = lead?.name ?? "Unknown";
  const score = payload?.score ?? lead?.qualification_score ?? "—";
  const dealVal = lead?.deal_value ? `€${Number(lead.deal_value).toLocaleString()}` : null;

  switch (eventType) {
    case "HOT_LEAD":
      return [
        "🔥 *Hot Lead Ready*",
        "",
        `Name: ${name}`,
        `Score: ${score}`,
        dealVal ? `Target: ${dealVal}` : null,
        "Status: Ready to book",
        "",
        `→ ${leadUrl}`,
        "",
        "Reply *1* assign to me · *2* later · *3* contacted",
        `[ref:${actionToken}]`,
      ].filter(Boolean).join("\n");
    case "HIGH_VALUE_LEAD":
      return [
        "💎 *High-Value Lead*",
        "",
        `Name: ${name}`,
        `Score: ${score} (premium)`,
        dealVal ? `Target: ${dealVal}` : null,
        "",
        `→ ${leadUrl}`,
        "",
        "Reply *1* assign to me · *2* later · *3* contacted",
        `[ref:${actionToken}]`,
      ].filter(Boolean).join("\n");
    case "BOOKED_CALL": {
      const when = payload?.starts_at ? new Date(String(payload.starts_at)).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "—";
      return [
        "📅 *New Call Booked*",
        "",
        `Lead: ${name}`,
        `When: ${when}`,
        score !== "—" ? `Score: ${score}` : null,
        "",
        `→ ${leadUrl}`,
        `[ref:${actionToken}]`,
      ].filter(Boolean).join("\n");
    }
    case "NO_SHOW":
      return [
        "⚠️ *No-Show Detected*",
        "",
        `Lead: ${name}`,
        score !== "—" ? `Score: ${score}` : null,
        "",
        `→ ${leadUrl}`,
        "",
        "Reply *1* recover now · *2* reschedule",
        `[ref:${actionToken}]`,
      ].filter(Boolean).join("\n");
  }
}

function isInQuietHours(start: number | null, end: number | null, tz: string): boolean {
  if (start == null || end == null) return false;
  // Get current hour in recipient's tz
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
  const hour = parseInt(fmt.format(now), 10);
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // overnight, e.g. 22 → 7
  return hour >= start || hour < end;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = (await req.json()) as Body;
    if (!body?.event_type || !body?.lead_id) {
      return new Response(JSON.stringify({ error: "missing event_type or lead_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Global gate
    const { data: settings } = await supabase
      .from("attendance_settings")
      .select("whatsapp_alerts_enabled, twilio_whatsapp_from, smart_attendance_enabled")
      .eq("scope", "global").maybeSingle();
    if (!settings?.whatsapp_alerts_enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "wa_alerts_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Dedupe
    const { error: dedupErr } = await supabase
      .from("lead_alert_dedup")
      .insert({ lead_id: body.lead_id, event_type: body.event_type });
    if (dedupErr && !String(dedupErr.message).includes("duplicate")) {
      console.error("dedup insert error", dedupErr);
    }
    if (dedupErr) {
      return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Lead context
    const { data: lead } = await supabase
      .from("leads")
      .select("id,name,phone,qualification_score,deal_value,do_not_contact")
      .eq("id", body.lead_id).maybeSingle();
    if (!lead) {
      return new Response(JSON.stringify({ ok: true, skipped: "lead_not_found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (lead.do_not_contact) {
      // Still alert admins about no-show, but skip outbound for HOT/HIGH_VALUE/BOOKED if DNC
      // Decision: alerts to ADMINS are about leads, not TO leads → DNC does NOT block admin alerts.
      // Keep this no-op block for clarity; do not skip.
    }

    // Recipients (L6+ active, opted-in for this event)
    const { data: recipients } = await supabase
      .from("admin_alert_recipients")
      .select("user_id, whatsapp_e164, events_enabled, quiet_hours_start, quiet_hours_end, timezone")
      .eq("active", true)
      .contains("events_enabled", [body.event_type]);

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_recipients" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Filter to L6+ (current_phase >= 6) — canonical level source
    const userIds = recipients.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles").select("id, current_phase").in("id", userIds);
    const eligibleIds = new Set(
      (profiles ?? []).filter((p: any) => (p.current_phase ?? 0) >= 6).map((p: any) => p.id),
    );

    const leadUrl = `${APP_BASE}/members/leads/${lead.id}`;
    const results: any[] = [];

    for (const r of recipients) {
      if (!eligibleIds.has(r.user_id)) continue;
      const inQuiet = isInQuietHours(r.quiet_hours_start ?? null, r.quiet_hours_end ?? null, r.timezone || "Europe/Berlin");
      // Quiet hours skip NON-urgent alerts. NO_SHOW + HIGH_VALUE bypass quiet hours.
      const urgent = body.event_type === "NO_SHOW" || body.event_type === "HIGH_VALUE_LEAD";
      if (inQuiet && !urgent) {
        const { data: row } = await supabase.from("admin_alert_log").insert({
          event_type: body.event_type, lead_id: lead.id, appointment_id: body.appointment_id ?? null,
          recipient_user_id: r.user_id, to_whatsapp: r.whatsapp_e164,
          body: "(skipped — quiet hours)", status: "skipped", skip_reason: "quiet_hours",
          payload: body.payload ?? {},
        }).select("action_token").maybeSingle();
        results.push({ user: r.user_id, status: "skipped", reason: "quiet_hours", token: row?.action_token });
        continue;
      }

      // Pre-create log row to get action_token
      const { data: logRow, error: logErr } = await supabase.from("admin_alert_log").insert({
        event_type: body.event_type, lead_id: lead.id, appointment_id: body.appointment_id ?? null,
        recipient_user_id: r.user_id, to_whatsapp: r.whatsapp_e164,
        body: "", status: "pending", payload: body.payload ?? {},
      }).select("id, action_token").single();
      if (logErr || !logRow) {
        results.push({ user: r.user_id, status: "log_error", error: logErr?.message });
        continue;
      }

      const message = buildMessage(body.event_type, lead, body.payload ?? {}, logRow.action_token, leadUrl);

      // Update log body
      await supabase.from("admin_alert_log").update({ body: message }).eq("id", logRow.id);

      // Dispatch via existing twilio sender
      const sendRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/attendance-send-twilio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          channel: "whatsapp",
          to: r.whatsapp_e164,
          body: message,
          source: "manual",
          lead_id: lead.id,
          appointment_id: body.appointment_id ?? null,
          operator_id: r.user_id,
        }),
      });
      const sendJson = await sendRes.json().catch(() => ({}));
      const ok = sendRes.ok && sendJson?.ok !== false;

      await supabase.from("admin_alert_log").update({
        status: ok ? "sent" : "failed",
        twilio_sid: sendJson?.sid ?? null,
        skip_reason: ok ? null : (sendJson?.mode === "stub" ? "stub_mode" : "send_failed"),
      }).eq("id", logRow.id);

      results.push({ user: r.user_id, status: ok ? "sent" : "failed", sid: sendJson?.sid });
    }

    return new Response(JSON.stringify({ ok: true, event: body.event_type, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("emit-admin-alert error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
