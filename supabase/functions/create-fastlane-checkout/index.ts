import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FASTLANE_AMOUNT_CENTS = 2900; // €29
const RESERVATION_MINUTES = 10;

/**
 * Fastlane / Priority deposit (€29) — RESERVE-THEN-PAY model.
 *
 *   1. Validate lead + slot.
 *   2. Atomically claim the slot (increment current_bookings) and create the
 *      appointment in `pending_payment` state with reservation_expires_at = now()+10m.
 *   3. Create Stripe Checkout in payment mode, carrying appointment_id in metadata.
 *   4. Persist the Stripe session id back onto the appointment.
 *   5. Return the checkout URL.
 *
 * On `checkout.session.completed`, the webhook flips the SAME appointment to
 * `confirmed/paid`. If the user abandons checkout, a pg_cron job
 * (expire_pending_appointments) frees the slot after 10 minutes.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return json({ error: "Stripe not configured" }, 503);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email;
    const lead_id: string | undefined = body?.lead_id;
    const slot_id: string | undefined = body?.slot_id;
    const bookingTimezone: string = body?.timezone || "Europe/Berlin";
    const funnel_source: string = body?.funnel_source ?? "start";
    const reschedule: boolean = Boolean(body?.reschedule);

    // B7: strict email validation (mirrors create-appointment) — reminders die
    // silently when an invalid email slips through, so block at the door.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      return json({ error: "Email is required before booking." }, 400);
    }
    if (!slot_id || typeof slot_id !== "string") return json({ error: "slot_id is required" }, 400);

    const normalizedEmail = email.trim().toLowerCase();

    // ── 1. Resolve freshest lead by email ──
    const { data: emailLeads } = await supabase
      .from("leads")
      .select("id, name, has_booking, booking_id, lead_quality, lead_score, quiz_score, qualification_bucket, updated_at, created_at")
      .eq("email", normalizedEmail)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(5);

    let lead = emailLeads?.[0] ?? null;

    if (!lead && lead_id && typeof lead_id === "string") {
      const { data: idLead } = await supabase
        .from("leads")
        .select("id, email, name, has_booking, booking_id, lead_quality, lead_score, quiz_score, qualification_bucket, updated_at, created_at")
        .eq("id", lead_id)
        .maybeSingle();
      if (idLead && String((idLead as any).email ?? "").trim().toLowerCase() === normalizedEmail) {
        lead = idLead;
      }
    }

    if ((emailLeads?.length ?? 0) > 1) {
      console.warn(`[fastlane] duplicate leads for ${normalizedEmail}; using latest ${lead?.id}`);
    }

    if (!lead?.id) {
      return json({ error: "Lead not found — please complete the contact step first." }, 404);
    }

    const lq = (lead as any).lead_quality as string | null;
    const ls = (lead as any).lead_score as number | null;
    const qs = (lead as any).quiz_score as number | null;
    const qb = (lead as any).qualification_bucket as string | null;

    // ── B6: server-side quiz gate (mirrors create-appointment) ──
    if (qs === null || qs === undefined || !qb || !lq) {
      return json({ error: "Please complete the qualification quiz before booking.", code: "qualification_required" }, 403);
    }

    // ── B5: low-quality block also applies to fastlane ──
    // Per readiness blocker: low/C/<40 leads MUST NOT reserve a slot or trigger
    // Schedule, even on the paid path. Insert a waitlist record for ops follow-up.
    const isLowQuality = qb === "low" || lq === "C" || (typeof qs === "number" && qs < 40);
    if (isLowQuality) {
      console.warn(`[fastlane] low-quality lead ${lead.id} blocked (lq=${lq} ls=${ls} qs=${qs} qb=${qb})`);
      try {
        await supabase.from("booking_waitlist").insert({
          lead_id: lead.id,
          preferred_slot_type: "priority",
          status: "blocked_low_quality",
        });
      } catch (e) {
        console.warn("[fastlane] waitlist insert failed (non-blocking):", e);
      }
      return json({
        error: "Dein Profil erfüllt aktuell nicht die Voraussetzungen für ein direktes Strategiegespräch. Du wurdest auf die Warteliste gesetzt.",
        code: "low_quality_lead_blocked",
      }, 403);
    }

    // ── 2. Validate slot ──
    const { data: slot } = await supabase
      .from("availability_slots")
      .select("id, is_active, current_bookings, max_bookings, slot_type, starts_at, ends_at")
      .eq("id", slot_id)
      .maybeSingle();
    if (!slot || !slot.is_active) {
      return json({ error: "This slot is no longer available." }, 409);
    }
    if ((slot.current_bookings ?? 0) >= (slot.max_bookings ?? 1)) {
      return json({ error: "This slot is fully booked." }, 409);
    }

    // ── 3. Supersede any active appointment for this lead (booked/confirmed/pending_payment) ──
    await supabase
      .from("appointments")
      .update({ appointment_status: "superseded", updated_at: new Date().toISOString() })
      .eq("lead_id", lead.id)
      .in("appointment_status", ["booked", "confirmed", "pending_payment"]);

    // ── 4. Atomically claim slot capacity ──
    const { error: slotErr } = await supabase
      .from("availability_slots")
      .update({ current_bookings: (slot.current_bookings ?? 0) + 1 })
      .eq("id", slot_id)
      .lt("current_bookings", slot.max_bookings ?? 1);
    if (slotErr) {
      return json({ error: "Slot was taken — please pick another." }, 409);
    }

    // ── 5. Create the pending_payment appointment ──
    const reservationExpiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60_000).toISOString();
    const roomSlug = `etc-${lead.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const videoCallLink = `https://meet.jit.si/${roomSlug}`;

    // Compute original local date/time
    const computeLocalDt = (tz: string, iso: string): { date: string; time: string } => {
      try {
        const d = new Date(iso);
        return {
          date: new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d),
          time: new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d),
        };
      } catch { return { date: "", time: "" }; }
    };
    const localDt = computeLocalDt(bookingTimezone, slot.starts_at);

    const { data: appointment, error: aptErr } = await supabase
      .from("appointments")
      .insert({
        lead_id: lead.id,
        call_type: "priority",
        appointment_status: "pending_payment",
        payment_status: "pending",
        pricing_tier: "priority",
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        booking_source: funnel_source,
        video_call_link: videoCallLink,
        reservation_expires_at: reservationExpiresAt,
        fastlane_amount_cents: FASTLANE_AMOUNT_CENTS,
        booking_timezone: bookingTimezone,
        original_local_date: localDt.date || null,
        original_local_time: localDt.time || null,
        booking_utc_offset: (() => {
          try {
            const d = new Date(slot.starts_at);
            const fmt = new Intl.DateTimeFormat("en-US", {
              timeZone: bookingTimezone, year: "numeric", month: "2-digit", day: "2-digit",
              hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
            });
            const parts = fmt.formatToParts(d);
            const gp = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? "0");
            const localMs = Date.UTC(gp("year"), gp("month") - 1, gp("day"), gp("hour"), gp("minute"), 0);
            const offMin = (localMs - d.getTime()) / 60000;
            const sign = offMin >= 0 ? "+" : "-";
            const abs = Math.abs(offMin);
            return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
          } catch { return "+01:00"; }
        })(),
      })
      .select("id")
      .single();

    if (aptErr || !appointment) {
      // Rollback slot capacity
      await supabase
        .from("availability_slots")
        .update({ current_bookings: slot.current_bookings ?? 0 })
        .eq("id", slot_id);
      console.error("[fastlane] appointment insert failed", aptErr);
      return json({ error: "Could not create reservation." }, 500);
    }

    // Mark lead with pending booking pointer
    await supabase
      .from("leads")
      .update({ has_booking: true, booking_id: appointment.id })
      .eq("id", lead.id);

    // Funnel analytics (funnel_events_v2 uses `event_type`) — best-effort, non-blocking
    try {
      await supabase.from("funnel_events_v2").insert([
        {
          event_type: "appointment_created_pending_payment",
          lead_id: lead.id,
          metadata: { appointment_id: appointment.id, slot_id, funnel_source },
        },
        {
          event_type: "fastlane_checkout_started",
          lead_id: lead.id,
          metadata: { appointment_id: appointment.id, slot_id, funnel_source },
        },
      ] as unknown as never);
    } catch (_e) { /* analytics must never block checkout */ }

    // ── 6. Create Stripe checkout session ──
    const appUrl =
      Deno.env.get("APP_URL") ??
      req.headers.get("origin") ??
      "https://ethical-closing.lovable.app";

    const params: Record<string, string> = {
      mode: "payment",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(FASTLANE_AMOUNT_CENTS),
      "line_items[0][price_data][product_data][name]":
        "Priority Strategiegespräch — Schutzgebühr",
      "line_items[0][price_data][product_data][description]":
        "Wird vollständig auf das Programm angerechnet, falls du teilnimmst.",
      "line_items[0][quantity]": "1",
      customer_email: normalizedEmail,
      // Reservation expires at 10 min — match Stripe session expiry to ~30 min minimum allowed
      expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
      "metadata[productKey]": "fastlane",
      "metadata[appointment_id]": appointment.id,
      "metadata[lead_id]": lead.id,
      "metadata[slot_id]": slot_id,
      "metadata[call_type]": "priority",
      "metadata[funnel_source]": funnel_source,
      "metadata[reschedule]": reschedule ? "true" : "false",
      "metadata[lead_quality]": lq ?? "unknown",
      "metadata[lead_score]": String(ls ?? 0),
      "payment_intent_data[metadata][appointment_id]": appointment.id,
      "payment_intent_data[metadata][productKey]": "fastlane",
      success_url: `${appUrl}/booking?fastlane=success&appointment=${appointment.id}`,
      cancel_url: `${appUrl}/booking?fastlane=cancelled&appointment=${appointment.id}`,
    };

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
    });

    if (!stripeRes.ok) {
      const errBody = await stripeRes.text();
      console.error("[fastlane] Stripe error:", errBody);
      // Best-effort rollback so the slot doesn't sit reserved on a broken session
      await supabase
        .from("appointments")
        .update({ appointment_status: "expired", payment_status: "expired", reservation_expires_at: null })
        .eq("id", appointment.id);
      await supabase
        .from("availability_slots")
        .update({ current_bookings: slot.current_bookings ?? 0 })
        .eq("id", slot_id);
      return json({ error: "Stripe session failed" }, 500);
    }

    const session = await stripeRes.json();

    // Persist session id on the appointment so the webhook can look it up by either id
    await supabase
      .from("appointments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", appointment.id);

    return json({
      url: session.url,
      sessionId: session.id,
      appointmentId: appointment.id,
      reservationExpiresAt,
    });
  } catch (err) {
    console.error("create-fastlane-checkout error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
