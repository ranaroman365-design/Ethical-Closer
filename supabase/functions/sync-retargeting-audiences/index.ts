// Sync Retargeting Audiences — Phase 2: Routes through dispatch-communication
// Identifies no_booking / no_show cohorts and sends SMS via canonical pipeline.
// GHL dependency removed — messages go through dispatch-communication for dedup.
//
// Microcopy v2 (No-Booking / No-Show):
//  - Klarer "Next Step" pro Cohort
//  - SMS-first, kurz, direkter Booking-Link
//  - No-Booking-Reminder wird NUR enqueued, wenn der Lead aktuell keinen Termin hat
//    (Double-Check via leads.has_booking + offene Appointments). Verhindert Reminder
//    an Leads, die zwischen Quiz und Sync-Run schon gebucht haben.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOOKING_URL = Deno.env.get("APPLY_BOOKING_URL") ?? "https://ethicalcloser.de/apply";

function firstName(name?: string | null): string {
  if (!name) return "";
  const n = name.trim().split(/\s+/)[0];
  return n ? `${n}, ` : "";
}

// SMS Microcopy — No-Booking: Quiz fertig, aber kein Termin.
function noBookingSms(name?: string | null): string {
  return (
    `${firstName(name)}dein Quiz ist ausgewertet, aber dein Strategie-Call fehlt noch.\n` +
    `Nächster Schritt: 15-Min-Slot wählen → ${BOOKING_URL}\n` +
    `Ohne Call können wir dein Profil nicht final einordnen.`
  );
}

// SMS Microcopy — No-Show: Termin verpasst, klare Reschedule-Anweisung.
function noShowSms(name?: string | null): string {
  return (
    `${firstName(name)}wir haben dich heute im Call nicht erreicht.\n` +
    `Nächster Schritt: neuen Slot buchen → ${BOOKING_URL}\n` +
    `Ein zweiter Termin ist möglich – danach pausieren wir die Bewerbung.`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

    // Audience: NO BOOKING (quiz completed, no appointment within 7d)
    const { data: noBookingRaw } = await supabase
      .from("leads")
      .select("id, email, phone, name")
      .not("quiz_completed_at", "is", null)
      .eq("has_booking", false)
      .gte("quiz_completed_at", since)
      .limit(1000);

    // Guard: nur Reminder senden, wenn KEIN aktiver Termin (scheduled/confirmed/booked) existiert.
    // Schützt vor Race-Condition zwischen has_booking-Flag und tatsächlicher Buchung.
    const noBookingIds = (noBookingRaw ?? []).map((l) => l.id);
    let activeApptLeadIds = new Set<string>();
    if (noBookingIds.length) {
      const { data: activeAppts } = await supabase
        .from("appointments")
        .select("lead_id")
        .in("lead_id", noBookingIds)
        .in("appointment_status", ["scheduled", "confirmed", "booked"]);
      activeApptLeadIds = new Set((activeAppts ?? []).map((a: any) => a.lead_id));
    }
    const noBooking = (noBookingRaw ?? []).filter((l) => !activeApptLeadIds.has(l.id));
    const skippedDueToBooking = (noBookingRaw?.length ?? 0) - noBooking.length;

    // Audience: NO SHOW (appointment exists, attendance_flag=false or call_status=no_show)
    const { data: noShow } = await supabase
      .from("appointments")
      .select("lead_id, leads!inner(email, phone, name)")
      .or("call_status.eq.no_show,appointment_status.eq.no_show")
      .gte("starts_at", since)
      .limit(1000);

    // ═══ ROUTE THROUGH dispatch-communication FOR DEDUP (Phase 2) ═══
    let dispatched = 0;
    for (const l of noBooking) {
      const body = noBookingSms(l.name);
      const { error } = await supabase.functions.invoke("dispatch-communication", {
        body: {
          event_key: "retargeting_no_booking",
          lead_id: l.id,
          recipient_phone: l.phone ?? null,
          recipient_email: l.email ?? null,
          payload: {
            body,
            text: body,
            channel: "sms",
            cta_url: BOOKING_URL,
            next_step: "book_strategy_call",
            tags: ["no_booking"],
          },
        },
      });
      if (!error) dispatched++;
    }
    for (const a of noShow ?? []) {
      const lead: any = (a as any).leads;
      const body = noShowSms(lead?.name);
      const { error } = await supabase.functions.invoke("dispatch-communication", {
        body: {
          event_key: "retargeting_no_show",
          lead_id: (a as any).lead_id,
          recipient_phone: lead?.phone ?? null,
          recipient_email: lead?.email ?? null,
          payload: {
            body,
            text: body,
            channel: "sms",
            cta_url: BOOKING_URL,
            next_step: "reschedule_call",
            tags: ["no_show"],
          },
        },
      });
      if (!error) dispatched++;
    }

    return new Response(JSON.stringify({
      ok: true,
      no_booking_count: noBooking.length,
      no_booking_skipped_has_active_appt: skippedDueToBooking,
      no_show_count: noShow?.length ?? 0,
      dispatched,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
