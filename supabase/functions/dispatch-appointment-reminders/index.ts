// ═══════════════════════════════════════════════════════════════════════
// Show-Up Reminder Stack — CANONICAL (Layer 53)
// ═══════════════════════════════════════════════════════════════════════
// Sends 24h / 2h / 10min reminders for booked appointments.
// Routes ALL messages through dispatch-communication for dedup enforcement.
// Uses appointments.reminders_state to stay idempotent across cron invocations.
//
// DEDUP ENFORCEMENT:
//   Every reminder goes through dispatch-communication → communication_dedup
//   Dedup key: recipient + channel + template + event + scheduled_window
//
// LEGACY NOTE: Previously wrote directly to outbound_events.
//   Now routes through dispatch-communication for unified dedup + logging.
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Generate a tracked meeting URL that routes through the tracking edge function */
function createTrackedUrl(meetingUrl: string, appointmentId: string, leadId: string, channel: string): string {
  if (!meetingUrl) return meetingUrl;
  const payload = { a: appointmentId, l: leadId, c: channel, u: meetingUrl };
  const token = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/track-meeting-click?t=${token}`;
}

type ReminderKey = "reminder_24h" | "reminder_2h" | "reminder_15m";

function programFitLine(quizResult?: string | null, bucket?: string | null): string {
  const key = (quizResult || bucket || "").toLowerCase();
  if (key.includes("priority") || key.includes("a_player") || key === "a") return "Priority-Track-Profil";
  if (key.includes("qualified") || key === "b") return "Standard-Track-Profil";
  if (key.includes("starter") || key === "c") return "Einstiegs-Track-Profil";
  return "Programm-Profil";
}

function preferredWindowLine(answers: any): string {
  const w = answers?.preferred_time || answers?.time_window || answers?.availability;
  if (typeof w === "string" && w.trim()) return ` (Wunsch-Zeitfenster: ${w.trim()})`;
  return "";
}

function formatStartLocal(starts: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(starts));
  } catch { return ""; }
}

function formatDateTimeLocal(starts: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(starts));
  } catch { return ""; }
}

// Map reminder keys to dispatch-communication event_keys
const REMINDER_TO_EVENT_KEY: Record<ReminderKey, string> = {
  reminder_24h: "pre_call_24h",
  reminder_2h: "pre_call_3h",   // closest match in MATRIX
  reminder_15m: "pre_call_30m", // closest match in MATRIX
};

const TEMPLATES: Record<ReminderKey, { channel: "sms"; body: string }> = {
  reminder_24h: {
    channel: "sms",
    body:
      "Morgen {date_time} (MEZ) ist dein Call ({fit}{window}).\n\n" +
      "Quiz-Ergebnis: {quiz_outcome}.\n" +
      "Wichtig: Sei vorbereitet – das ist kein Standard-Gespräch.\n" +
      "Die, die es ernst nehmen, bekommen Ergebnisse.\n\n" +
      "{link_block}",
  },
  reminder_2h: {
    channel: "sms",
    body:
      "Dein Call ist in 2 Stunden ({start_time} MEZ).\n" +
      "Profil: {fit}. Quiz: {quiz_outcome}.\n\n" +
      "Sei an einem ruhigen Ort. Halte etwas zum Schreiben bereit.\n" +
      "Wir gehen direkt in deine Situation rein.\n\n" +
      "{link_block}",
  },
  reminder_15m: {
    channel: "sms",
    body:
      "Wir starten in 15 Minuten ({start_time} MEZ).\n" +
      "Jetzt dem Videocall beitreten: {join_link}",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();
    const winStart = new Date(now -  1 * 3600_000).toISOString();
    const winEnd   = new Date(now + 30 * 3600_000).toISOString();

    const { data: appts, error } = await supabase
      .from("appointments")
      .select("id, lead_id, starts_at, video_call_link, reminders_state, appointment_status")
      .in("appointment_status", ["booked", "confirmed"])
      .gte("starts_at", winStart)
      .lte("starts_at", winEnd)
      .limit(500);
    if (error) throw error;

    const isTestContact = (email?: string | null, phone?: string | null) => {
      const e = (email ?? "").toLowerCase();
      if (!e && !phone) return true;
      if (e.includes("+test") || e.includes("example.com") || e.includes("test@") || e.endsWith(".test")) return true;
      if (e.startsWith("noreply") || e.startsWith("no-reply")) return true;
      return false;
    };

    const results: Array<{ appt: string; action: ReminderKey | string }> = [];

    for (const a of appts ?? []) {
      const startMs = new Date(a.starts_at).getTime();
      const minutesUntil = (startMs - now) / 60_000;
      const state = (a.reminders_state ?? {}) as Record<string, string>;

      let action: ReminderKey | null = null;
      if      (minutesUntil <=  15 && minutesUntil >= -5  && !state.reminder_15m) action = "reminder_15m";
      else if (minutesUntil <= 120 && minutesUntil >  15  && !state.reminder_2h)  action = "reminder_2h";
      else if (minutesUntil <= 1440 && minutesUntil > 120 && !state.reminder_24h) action = "reminder_24h";

      if (!action) continue;

      const { data: lead } = await supabase
        .from("leads")
        .select("email, phone, name, quiz_result, quiz_score, quiz_answers, qualification_bucket")
        .eq("id", a.lead_id)
        .maybeSingle();

      if (isTestContact((lead as any)?.email, (lead as any)?.phone)) {
        results.push({ appt: a.id, action: `${action}_skipped_test_contact` });
        continue;
      }

      const tpl = TEMPLATES[action];
      const quizOutcome = (lead as any)?.quiz_result
        || ((lead as any)?.quiz_score != null ? `Score ${(lead as any).quiz_score}` : "Qualifiziert");
      const fit = programFitLine((lead as any)?.quiz_result, (lead as any)?.qualification_bucket);
      const windowLine = preferredWindowLine((lead as any)?.quiz_answers);
      const startTime = formatStartLocal(a.starts_at);
      const dateTime = formatDateTimeLocal(a.starts_at);
      const rawJoinLink = a.video_call_link ?? "";

      // ═══ MEETING LINK VALIDATION — block on hard errors ═══
      let linkValid = true;
      let linkErrors: string[] = [];
      if (rawJoinLink) {
        try {
          const parsed = new URL(rawJoinLink);
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            linkValid = false;
            linkErrors.push(`Bad protocol: ${parsed.protocol}`);
          }
          if (!parsed.hostname || parsed.hostname === "localhost") {
            linkValid = false;
            linkErrors.push(`Bad hostname: ${parsed.hostname}`);
          }
          if (/[<>{}|\\^`]/.test(rawJoinLink)) {
            linkValid = false;
            linkErrors.push("URL contains special chars");
          }
        } catch {
          linkValid = false;
          linkErrors.push(`Malformed URL: ${rawJoinLink.slice(0, 80)}`);
        }
      }

      if (!linkValid) {
        console.error(`[reminders] meeting link invalid for ${a.id}/${action}:`, linkErrors);
        results.push({ appt: a.id, action: `${action}_link_invalid` });
        continue;
      }

      // Generate tracked link for SMS/WhatsApp channel
      const trackedJoinLink = rawJoinLink ? createTrackedUrl(rawJoinLink, a.id, a.lead_id, "sms") : "";
      const linkBlock = trackedJoinLink
        ? `Jetzt dem Videocall beitreten: ${trackedJoinLink}`
        : "";

      const body = tpl.body
        .replaceAll("{join_link}", trackedJoinLink)
        .replaceAll("{link_block}", linkBlock)
        .replaceAll("{quiz_outcome}", quizOutcome)
        .replaceAll("{fit}", fit)
        .replaceAll("{window}", windowLine)
        .replaceAll("{start_time}", startTime)
        .replaceAll("{date_time}", dateTime);

      // ═══ ROUTE THROUGH dispatch-communication FOR DEDUP ═══
      const eventKey = REMINDER_TO_EVENT_KEY[action];
      const { error: dispatchErr } = await supabase.functions.invoke("dispatch-communication", {
        body: {
          event_key: eventKey,
          lead_id: a.lead_id,
          recipient_phone: (lead as any)?.phone ?? null,
          recipient_email: (lead as any)?.email ?? null,
          payload: {
            body,
            text: body,
            starts_at: a.starts_at,
            join_link: a.video_call_link,
            action,
            personalization: {
              quiz_outcome: quizOutcome,
              program_fit: fit,
              preferred_window: windowLine,
              start_time_local: startTime,
            },
          },
        },
      });

      if (dispatchErr) {
        console.error(`[reminders] dispatch-communication failed for ${a.id}/${action}`, dispatchErr);
        results.push({ appt: a.id, action: `${action}_dispatch_failed` });
        continue;
      }

      // Mark reminder as sent in idempotent state
      await supabase
        .from("appointments")
        .update({ reminders_state: { ...state, [action]: new Date().toISOString() } })
        .eq("id", a.id);

      results.push({ appt: a.id, action });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
