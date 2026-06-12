// Public endpoint: returns a downloadable .ics for a given appointment id.
// GET /functions/v1/appointment-ics?id=<appointment_id>
// No JWT required (calendar clients won't send one). Appointment id is a UUID
// which acts as an unguessable token; we only return non-sensitive fields.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BUSINESS_TIMEZONE = "Europe/Berlin";

const fmtIcs = (d: Date) =>
  d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

/** Format a Date as local time in Europe/Berlin for DTSTART;TZID */
function fmtIcsLocal(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const h = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}${parts.month}${parts.day}T${h}${parts.minute}${parts.second}`;
}

const escapeIcsText = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !UUID_RE.test(id)) {
      return new Response("Missing or invalid id", { status: 400, headers: corsHeaders });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: apt, error } = await sb
      .from("appointments")
      .select("id, starts_at, ends_at, video_call_link, call_type, appointment_status, call_status, outcome, updated_at, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[appointment-ics] db error", error);
      return new Response("Lookup failed", { status: 500, headers: corsHeaders });
    }
    if (!apt || !apt.starts_at) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    // Normalize cancelled-equivalent states. Calendar clients honour
    // STATUS:CANCELLED + METHOD:CANCEL to drop the event from the user's
    // calendar — so any state that means "this slot is no longer valid"
    // must surface as cancelled, not just "cancelled" / "expired".
    const status = String(apt.appointment_status ?? "").toLowerCase();
    const callStatus = String(apt.call_status ?? "").toLowerCase();
    const outcome = String(apt.outcome ?? "").toLowerCase();

    const CANCELLED_STATES = new Set([
      "cancelled",
      "canceled",
      "expired",
      "rescheduled",
      "deleted",
      "removed",
      "no_show",
      "no-show",
      "noshow",
      "abandoned",
    ]);

    const cancelled =
      CANCELLED_STATES.has(status) ||
      CANCELLED_STATES.has(callStatus) ||
      CANCELLED_STATES.has(outcome);

    const startsAt = new Date(apt.starts_at as string);
    const endsAt = apt.ends_at
      ? new Date(apt.ends_at as string)
      : new Date(startsAt.getTime() + 45 * 60_000);

    const meetingLink = (apt.video_call_link as string | null) ?? "";
    const REBOOK_URL = "https://ethical-closing.lovable.app/booking?src=reschedule";
    const MEMBERS_URL = "https://ethical-closing.lovable.app/members/login";

    // Derive a short, human-readable reason from the existing state fields.
    // No dedicated reason column exists — we map the strongest signal we have.
    const reasonFor = (s: string, cs: string, oc: string): string => {
      if (s === "rescheduled" || cs === "rescheduled" || oc === "rescheduled") return "Termin wurde verschoben.";
      if (s === "deleted" || s === "removed" || cs === "deleted" || cs === "removed") return "Termin wurde gelöscht.";
      if (s === "expired" || cs === "expired") return "Reservierung ist abgelaufen.";
      if (s.includes("no") && s.includes("show")) return "Als No-Show markiert.";
      if (cs.includes("no") && cs.includes("show")) return "Als No-Show markiert.";
      if (oc.includes("no") && oc.includes("show")) return "Als No-Show markiert.";
      if (s === "abandoned" || cs === "abandoned") return "Termin wurde nicht bestätigt.";
      return "Termin wurde abgesagt.";
    };

    const title = cancelled
      ? "ABGESAGT — Ethical Closer Qualifikationsgespräch"
      : "Ethical Closer Qualifikationsgespräch";
    const description = cancelled
      ? [
          reasonFor(status, callStatus, outcome),
          "",
          `Neuen Termin buchen: ${REBOOK_URL}`,
          `Bewerberbereich: ${MEMBERS_URL}`,
        ].join("\n")
      : [
          meetingLink ? `Meeting-Link: ${meetingLink}` : "",
          `Bewerberbereich: ${MEMBERS_URL}`,
        ].filter(Boolean).join("\n");

    // SEQUENCE bumped on every update so calendar clients overwrite the
    // previous event instead of creating a duplicate. Cancelled events
    // get an extra bump to guarantee monotonic ordering.
    const updatedAt = apt.updated_at ? new Date(apt.updated_at as string) : null;
    const createdAt = apt.created_at ? new Date(apt.created_at as string) : null;
    const sequence = updatedAt && createdAt
      ? Math.max(0, Math.floor((updatedAt.getTime() - createdAt.getTime()) / 60_000))
      : 0;

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//EthicalCloser//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:" + (cancelled ? "CANCEL" : "PUBLISH"),
      "BEGIN:VTIMEZONE",
      `TZID:${BUSINESS_TIMEZONE}`,
      "BEGIN:DAYLIGHT", "TZNAME:CEST", "DTSTART:19700329T020000",
      "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
      "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "END:DAYLIGHT",
      "BEGIN:STANDARD", "TZNAME:CET", "DTSTART:19701025T030000",
      "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
      "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      `UID:${apt.id}@ethical-closing`,
      `DTSTAMP:${fmtIcs(new Date())}`,
      `DTSTART;TZID=${BUSINESS_TIMEZONE}:${fmtIcsLocal(startsAt)}`,
      `DTEND;TZID=${BUSINESS_TIMEZONE}:${fmtIcsLocal(endsAt)}`,
      `SEQUENCE:${cancelled ? sequence + 1 : sequence}`,
      `SUMMARY:${escapeIcsText(title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      !cancelled && meetingLink ? `URL:${meetingLink}` : "",
      cancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
      cancelled ? "TRANSP:TRANSPARENT" : "TRANSP:OPAQUE",
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");

    return new Response(lines, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="ethical-closer-${apt.id}.ics"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("[appointment-ics] unexpected", e);
    return new Response("Server error", { status: 500, headers: corsHeaders });
  }
});
