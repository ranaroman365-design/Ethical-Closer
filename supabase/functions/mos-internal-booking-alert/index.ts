// MOS internal booking alert dispatcher.
// Sends WhatsApp/SMS to setter, senior closer and admin AFTER a successful
// MOS booking. The lead NEVER receives anything from this function.
//
// Idempotent per (appointment_id, recipient_role) via mos_internal_dispatch_dedup.
// Non-blocking: errors here must never break the booking UX.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AlertBody {
  appointment_id: string;
  lead_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  lead_phone?: string | null;   // FOR DISPLAY ONLY — never a recipient
  lead_email?: string | null;
  starts_at?: string | null;    // ISO
  attribution_source?: string | null;
  master_funnel_id?: string | null;
  development_score?: number | string | null;
  placement_intent_score?: number | string | null;
  qualification_cluster?: string | null;
  quiz_summary?: string | null;
  booking_url?: string | null;
}

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function formatBerlin(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "—" };
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
    const time = new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit",
    }).format(d);
    return { date, time };
  } catch { return { date: "—", time: "—" }; }
}

function buildIcsUrl(appointmentId: string): string {
  return `${SUPABASE_URL}/functions/v1/appointment-ics?id=${encodeURIComponent(appointmentId)}`;
}

function buildMessage(b: AlertBody): string {
  const { date, time } = formatBerlin(b.starts_at);
  const ics = buildIcsUrl(b.appointment_id);
  const name = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim() || "—";
  const lines = [
    "🔔 Neuer MOS-Termin gebucht",
    "",
    `Lead: ${name}`,
    `Telefon: ${b.lead_phone ?? "—"}`,
    `E-Mail: ${b.lead_email ?? "—"}`,
    "",
    `Termin: ${date} um ${time} Uhr`,
    `Zeitzone: Europe/Berlin`,
    `Quelle: ${b.attribution_source ?? "—"}`,
    "",
    `Development Score: ${b.development_score ?? "—"}`,
    `Placement Intent Score: ${b.placement_intent_score ?? "—"}`,
    `Qualification Cluster: ${b.qualification_cluster ?? "—"}`,
    "",
    `Quiz Antworten: ${b.quiz_summary ?? "—"}`,
    "",
    b.booking_url ? `Booking Link: ${b.booking_url}` : "",
    `ICS Kalenderdatei: ${ics}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function last4(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-4);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: AlertBody;
  try { body = await req.json() as AlertBody; }
  catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body?.appointment_id) {
    return new Response(JSON.stringify({ error: "appointment_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1) Load active internal recipients (setter, senior_closer, admin).
  const { data: recipients, error: recErr } = await sb
    .from("mos_internal_notification_recipients")
    .select("id, role, name, phone, is_active, notification_type")
    .eq("is_active", true)
    .in("role", ["setter", "senior_closer", "admin"]);

  if (recErr) {
    console.error("[mos-internal-booking-alert] recipients query failed", recErr);
    return new Response(JSON.stringify({ error: "recipients_query_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!recipients || recipients.length === 0) {
    return new Response(JSON.stringify({ status: "no_recipients_configured" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const messageBody = buildMessage(body);
  const icsUrl = buildIcsUrl(body.appointment_id);
  const results: Array<Record<string, unknown>> = [];

  for (const r of recipients) {
    // Per (appointment_id, role) idempotency.
    const { error: dedupErr } = await sb
      .from("mos_internal_dispatch_dedup")
      .insert({ appointment_id: body.appointment_id, recipient_role: r.role });

    if (dedupErr && dedupErr.code === "23505") {
      results.push({ role: r.role, status: "suppressed_dedup" });
      continue;
    }
    if (dedupErr) {
      results.push({ role: r.role, status: "dedup_failed", error: dedupErr.message });
      continue;
    }

    // Choose channels.
    const chans: Array<"whatsapp" | "sms"> =
      r.notification_type === "both" ? ["whatsapp", "sms"]
      : r.notification_type === "sms" ? ["sms"]
      : ["whatsapp"];

    let anyOk = false;
    for (const ch of chans) {
      const event_key = ch === "whatsapp" ? "hot_lead_alert_internal" : "no_show_immediate";
      // Both event_keys are internal-grade; we only need them so dispatch-communication
      // routes via Twilio. recipient_phone is the INTERNAL staff phone, never the lead.
      const { data: dispData, error: dispErr } = await sb.functions.invoke(
        "dispatch-communication",
        {
          body: {
            event_key,
            recipient_phone: r.phone,
            template_key: "mos_internal_booking_alert_v1",
            variant_key: r.role,
            force: true, // dedup is owned by THIS function
            payload: {
              appointment_id: body.appointment_id,
              recipient_role: r.role,
              message_body: messageBody,
              ics_url: icsUrl,
              source: "masterofsales",
            },
          },
        },
      );

      const ok = !dispErr && (dispData as { status?: string } | null)?.status === "sent";
      results.push({
        role: r.role, channel: ch, recipient_phone_last4: last4(r.phone),
        status: ok ? "sent" : "failed",
        error: dispErr?.message ?? (dispData as { error?: string } | null)?.error ?? null,
      });
      if (ok) anyOk = true;
    }

    // Roll the dedup row back if every channel failed, so a retry can resend.
    if (!anyOk) {
      await sb.from("mos_internal_dispatch_dedup")
        .delete()
        .eq("appointment_id", body.appointment_id)
        .eq("recipient_role", r.role);
    }
  }

  return new Response(JSON.stringify({
    status: "ok",
    appointment_id: body.appointment_id,
    ics_url: icsUrl,
    results,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
