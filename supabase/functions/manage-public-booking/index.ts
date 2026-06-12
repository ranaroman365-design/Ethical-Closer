/**
 * manage-public-booking — Cancel or Reschedule a public booking
 *
 * Auth: NONE (public endpoint). Identity verified via appointment_id + email.
 * Actions:
 *   cancel    → sets appointment_status = 'cancelled', decrements slot, sends cancellation email
 *   reschedule → cancels old appointment, creates new one on new slot, sends reschedule email with calendar links
 *
 * Canon: Canonical Calendar & Booking Stack (BINDING)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Format a date in Europe/Berlin as "15. Januar 2026" */
function formatDateDE(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(isoStr));
  } catch {
    return isoStr;
  }
}

/** Format time in Europe/Berlin as "14:00" */
function formatTimeDE(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      timeZone: "Europe/Berlin",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoStr));
  } catch {
    return "";
  }
}

/** Build Google Calendar deep-link */
function buildGoogleCalendarUrl(startsAt: string, callType: string): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + 30 * 60_000);
  const toGCal = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: callType,
    dates: `${toGCal(start)}/${toGCal(end)}`,
    details: "Dein persönliches Strategiegespräch.",
    location: "Online · Video-Call",
  });
  return `https://calendar.google.com/calendar/event?${params.toString()}`;
}

/** Build Outlook Calendar deep-link */
function buildOutlookCalendarUrl(startsAt: string, callType: string): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + 30 * 60_000);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: callType,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    body: "Dein persönliches Strategiegespräch.",
    location: "Online · Video-Call",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, appointment_id, email, new_slot_id } = await req.json();

    // ── Validate input ──────────────────────────────────────
    if (!action || !appointment_id || !email) {
      return json({ error: "action, appointment_id, and email are required." }, 400);
    }
    if (!["cancel", "reschedule"].includes(action)) {
      return json({ error: "action must be 'cancel' or 'reschedule'." }, 400);
    }
    if (action === "reschedule" && !new_slot_id) {
      return json({ error: "new_slot_id is required for reschedule." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── Verify ownership: appointment must belong to this email ──
    const { data: appt, error: apptErr } = await sb
      .from("appointments")
      .select("id, lead_id, appointment_status, starts_at, ends_at, video_call_link, call_type")
      .eq("id", appointment_id)
      .single();

    if (apptErr || !appt) {
      return json({ error: "Termin nicht gefunden." }, 404);
    }

    // Verify email matches the lead
    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select("id, email, name")
      .eq("id", appt.lead_id)
      .single();

    if (leadErr || !lead) {
      return json({ error: "Lead nicht gefunden." }, 404);
    }

    if (lead.email?.toLowerCase() !== email.toLowerCase()) {
      return json({ error: "E-Mail stimmt nicht überein." }, 403);
    }

    // ── Guard: only future, non-cancelled appointments ──
    if (appt.appointment_status === "cancelled") {
      return json({ error: "Termin ist bereits storniert." }, 400);
    }
    if (new Date(appt.starts_at) < new Date()) {
      return json({ error: "Vergangene Termine können nicht geändert werden." }, 400);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const callLabel = appt.call_type === "priority" ? "Priority Strategiegespräch" : "Strategiegespräch";

    // ── CANCEL ──────────────────────────────────────────────
    if (action === "cancel") {
      const { error: upErr } = await sb
        .from("appointments")
        .update({ appointment_status: "cancelled" })
        .eq("id", appointment_id);

      if (upErr) {
        console.error("[manage-public-booking] cancel update failed", upErr);
        return json({ error: "Stornierung fehlgeschlagen." }, 500);
      }

      // Free up the slot
      await releaseSlot(sb, appt.starts_at, appt.ends_at);

      // ── Send cancellation email ──
      try {
        await sb.functions.invoke("send-transactional-email", {
          body: {
            templateName: "appointment-cancelled",
            recipientEmail: normalizedEmail,
            idempotencyKey: `cancel-confirm-${appointment_id}`,
            templateData: {
              name: lead.name || undefined,
              date: formatDateDE(appt.starts_at),
              time: formatTimeDE(appt.starts_at),
              callType: callLabel,
              rebookUrl: "https://ethicalcloser.de/book",
            },
          },
        });
      } catch (e) {
        console.error("[manage-public-booking] cancellation email failed (non-blocking):", e);
      }

      return json({ success: true, action: "cancelled" });
    }

    // ── RESCHEDULE ──────────────────────────────────────────
    // 1. Verify new slot exists and has capacity
    const { data: newSlot, error: slotErr } = await sb
      .from("availability_slots")
      .select("id, starts_at, ends_at, current_bookings, max_bookings, is_active")
      .eq("id", new_slot_id)
      .single();

    if (slotErr || !newSlot) {
      return json({ error: "Neuer Slot nicht gefunden." }, 404);
    }
    if (!newSlot.is_active) {
      return json({ error: "Dieser Slot ist nicht mehr verfügbar." }, 400);
    }
    if (newSlot.current_bookings >= newSlot.max_bookings) {
      return json({ error: "Dieser Slot ist bereits ausgebucht." }, 400);
    }
    if (new Date(newSlot.starts_at) < new Date()) {
      return json({ error: "Slot liegt in der Vergangenheit." }, 400);
    }

    // 2. Cancel old appointment
    const { error: cancelErr } = await sb
      .from("appointments")
      .update({
        appointment_status: "rescheduled",
        rescheduled_at: new Date().toISOString(),
      })
      .eq("id", appointment_id);

    if (cancelErr) {
      console.error("[manage-public-booking] reschedule cancel failed", cancelErr);
      return json({ error: "Umbuchung fehlgeschlagen." }, 500);
    }

    // 3. Release old slot
    await releaseSlot(sb, appt.starts_at, appt.ends_at);

    // 4. Generate video link for new appointment
    const roomSlug = `etc-${lead.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const videoCallLink = `https://meet.jit.si/${roomSlug}`;

    // 5. Create new appointment
    const { data: newAppt, error: newApptErr } = await sb
      .from("appointments")
      .insert({
        lead_id: appt.lead_id,
        starts_at: newSlot.starts_at,
        ends_at: newSlot.ends_at,
        appointment_status: "booked",
        call_type: appt.call_type || "standard",
        booking_source: "public_reschedule",
        rescheduled_from_id: appointment_id,
        video_call_link: videoCallLink,
        booking_timezone: "Europe/Berlin",
        booking_utc_offset: "+01:00",
      })
      .select("id, starts_at")
      .single();

    if (newApptErr || !newAppt) {
      console.error("[manage-public-booking] new appointment insert failed", newApptErr);
      return json({ error: "Neuer Termin konnte nicht erstellt werden." }, 500);
    }

    // 6. Link old → new
    await sb
      .from("appointments")
      .update({ rescheduled_to_id: newAppt.id })
      .eq("id", appointment_id);

    // 7. Increment new slot bookings
    await sb
      .from("availability_slots")
      .update({ current_bookings: newSlot.current_bookings + 1 })
      .eq("id", new_slot_id);

    // ── Send reschedule confirmation email with calendar links ──
    try {
      const newDate = formatDateDE(newSlot.starts_at);
      const newTime = formatTimeDE(newSlot.starts_at);
      const oldDate = formatDateDE(appt.starts_at);
      const oldTime = formatTimeDE(appt.starts_at);

      const googleCalendarUrl = buildGoogleCalendarUrl(newSlot.starts_at, callLabel);
      const outlookCalendarUrl = buildOutlookCalendarUrl(newSlot.starts_at, callLabel);

      await sb.functions.invoke("send-transactional-email", {
        body: {
          templateName: "reschedule-confirmation",
          recipientEmail: normalizedEmail,
          idempotencyKey: `reschedule-confirm-${newAppt.id}`,
          templateData: {
            name: lead.name || undefined,
            oldDate,
            oldTime,
            newDate,
            newTime,
            callType: callLabel,
            googleCalendarUrl,
            outlookCalendarUrl,
            meetingLink: videoCallLink,
          },
        },
      });
    } catch (e) {
      console.error("[manage-public-booking] reschedule email failed (non-blocking):", e);
    }

    return json({
      success: true,
      action: "rescheduled",
      new_appointment_id: newAppt.id,
      new_starts_at: newAppt.starts_at,
    });

  } catch (e) {
    console.error("[manage-public-booking] unexpected error", e);
    return json({ error: "Unerwarteter Fehler." }, 500);
  }
});

/** Release a slot by matching start/end time and decrementing current_bookings */
async function releaseSlot(
  sb: ReturnType<typeof createClient>,
  startsAt: string,
  endsAt: string,
) {
  const { data: slots } = await sb
    .from("availability_slots")
    .select("id, current_bookings")
    .eq("starts_at", startsAt)
    .eq("ends_at", endsAt)
    .limit(1);

  if (slots && slots.length > 0) {
    const slot = slots[0];
    const newCount = Math.max(0, (slot.current_bookings ?? 1) - 1);
    await sb
      .from("availability_slots")
      .update({ current_bookings: newCount })
      .eq("id", slot.id);
  }
}
