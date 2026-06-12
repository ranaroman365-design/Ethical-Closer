import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Canonical Booking Priority (mirrors computeBookingPriorityServer) ───
function deriveBookingPriority(lead: Record<string, any>): "HIGH" | "MEDIUM" | "LOW" {
  const phoneValid = lead.phone_valid === true;
  const waConfirmed = lead.whatsapp_confirmed === true;
  const waUnresponsive = lead.whatsapp_unresponsive === true;
  const noShows = Number(lead.total_no_shows ?? 0);
  const attended = Number(lead.total_calls_attended ?? 0);
  const qs = Number(lead.quiz_score ?? lead.qualification_score ?? 0);
  const lq = String(lead.lead_quality ?? "").toUpperCase();
  const quality = lq === "A" || qs >= 12 ? "high" : lq === "B" || qs >= 7 ? "mid" : "low";

  let risk: "low" | "mid" | "high" = "low";
  if (waUnresponsive && !waConfirmed) risk = "high";
  else if (noShows >= 2) risk = "high";
  else if (noShows === 1 && attended === 0) risk = waConfirmed ? "mid" : "high";
  else if (noShows === 1 && attended >= 1) risk = waConfirmed ? "low" : "mid";

  if (risk === "high" && !waConfirmed) return "LOW";
  if (phoneValid && quality !== "low" && risk !== "high" && waConfirmed) return "HIGH";
  if (qs >= 7 || (phoneValid && quality !== "low")) return "MEDIUM";
  return "LOW";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { email, slot_id, call_type, funnel_source, reschedule, lead_id } = body;
    // Free-form attribution source (e.g. "masterofsales-faq-3-a"). Parallel to
    // the constrained `funnel_source` enum so we can preserve the full A/B
    // variant string in `appointments.booking_source`. Sanitized to ASCII-safe.
    const rawAttribution = typeof body?.attribution_source === "string" ? body.attribution_source.trim().slice(0, 120) : "";
    const attributionSource = /^[a-zA-Z0-9_\-:.]+$/.test(rawAttribution) ? rawAttribution.toLowerCase() : null;
    const isPublicBooking = body?.public_booking === true;
    const contactName = typeof body?.name === "string" ? body.name.trim() : "";
    const contactPhone = typeof body?.phone === "string" ? body.phone.trim() : "";

    // Timezone sent by the client browser (fallback to Europe/Berlin)
    const bookingTimezone: string = body?.timezone || "Europe/Berlin";

    // ─── Validation ───
    // B7 — Email is required AND must be a real-looking address (must contain "@",
    // a domain part, and a TLD). We reject before doing any DB work or charging
    // through the booking flow so reminder emails can never fail for missing email.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
      return new Response(JSON.stringify({ error: "Email is required before booking." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!slot_id || typeof slot_id !== "string") {
      return new Response(JSON.stringify({ error: "slot_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!call_type || !["standard", "priority", "orientation"].includes(call_type)) {
      return new Response(JSON.stringify({ error: "call_type must be standard, priority or orientation" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const leadSelect = "id, email, name, stage, has_booking, booking_id, setter_id, closer_id, owner_id, assigned_operator_id, reschedule_count, lead_quality, lead_score, quiz_score, qualification_bucket, phone_valid, whatsapp_confirmed, whatsapp_unresponsive, total_no_shows, total_calls_attended, qualification_score, updated_at, created_at";

    // ─── 1. Resolve canonical lead context (with tracing) ───
    // Prefer the secure booking token/lead_id context. Email is only fallback,
    // because duplicate/stale emails can otherwise attach the appointment to the
    // wrong lead or return "Lead not found" after slot selection.
    const trace: Record<string, unknown> = {
      ts: new Date().toISOString(),
      input_lead_id: lead_id ?? null,
      input_email: normalizedEmail,
      has_name: !!contactName,
      has_phone: !!contactPhone,
      funnel_source: funnel_source ?? null,
    };
    let emailLeads: any[] | null = null;
    let leadErr: any = null;
    let lead: any = null;
    let resolvedVia: "lead_id" | "email" | "upsert" | "none" = "none";

    if (lead_id && typeof lead_id === "string") {
      const { data: idLead, error: idErr } = await supabase
        .from("leads")
        .select(leadSelect)
        .eq("id", lead_id)
        .maybeSingle();
      if (idErr) leadErr = idErr;
      trace.lead_id_found = !!idLead;
      trace.lead_id_email_match = idLead
        ? String((idLead as any).email ?? "").trim().toLowerCase() === normalizedEmail
        : false;
      trace.lead_id_error = idErr?.message ?? null;
      if (idLead && String((idLead as any).email ?? "").trim().toLowerCase() === normalizedEmail) {
        lead = idLead;
        resolvedVia = "lead_id";
      }
    }

    if (!lead) {
      const emailRes = await supabase
        .from("leads")
        .select(leadSelect)
        .eq("email", normalizedEmail)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(5);
      emailLeads = emailRes.data;
      leadErr = leadErr ?? emailRes.error;
      trace.email_results_count = emailLeads?.length ?? 0;
      trace.email_lead_ids = (emailLeads ?? []).map((l: any) => l.id);
      trace.email_query_error = emailRes.error?.message ?? null;
      lead = emailLeads?.[0] ?? null;
      if (lead) resolvedVia = "email";
    }

    // Last-resort restore / public booking lead creation: if the booking page
    // reached slots from stale local storage or this is a public booking (no quiz),
    // persist the lead before booking. For public bookings, name+phone+email is
    // always provided via the LeadCaptureModal.
    if (!lead && contactName && contactPhone) {
      trace.upsert_attempted = true;
      const upsertSource = isPublicBooking ? "public_booking_page" : (funnel_source ?? "booking_contact_restore");
      const { data: upserted, error: upsertErr } = await supabase.rpc("upsert_funnel_lead" as never, {
        p_name: contactName,
        p_email: normalizedEmail,
        p_phone: contactPhone,
        p_funnel_source: upsertSource,
        p_quiz_answers: {},
        p_session_id: null,
        p_traffic_owner: null,
        p_referral_code: null,
      } as never);
      trace.upsert_result = (upserted as any)?.lead_id ?? null;
      trace.upsert_error = upsertErr?.message ?? null;
      if (!upsertErr && (upserted as any)?.lead_id) {
        const { data: restoredLead } = await supabase
          .from("leads")
          .select(leadSelect)
          .eq("id", (upserted as any).lead_id)
          .maybeSingle();
        lead = restoredLead;
        if (lead) resolvedVia = "upsert";
        // For public bookings, set inception_day and origin_route
        if (lead && isPublicBooking) {
          await supabase.from("leads").update({
            inception_day: new Date().toISOString().slice(0, 10),
            lead_source: "public_booking_page",
            origin_route: "/book",
            created_from: "booking_slot_selection",
          } as any).eq("id", lead.id);
        }
      }
    }

    trace.resolved_via = resolvedVia;
    trace.resolved_lead_id = lead?.id ?? null;

    if ((emailLeads?.length ?? 0) > 1) {
      console.warn(`[create-appointment] duplicate leads for ${normalizedEmail}; using latest ${lead?.id}`);
    }

    // Always log the resolution trace for debugging "Lead not found"
    console.info(`[create-appointment:trace] ${JSON.stringify(trace)}`);

    if (leadErr || !lead) {
      // Persist trace to event_logs for post-mortem analysis
      try {
        await supabase.from("event_logs").insert({
          event_name: "create_appointment_lead_not_found",
          email: normalizedEmail,
          payload: trace,
          status: "error",
          error_message: leadErr?.message ?? "No lead resolved",
        });
      } catch { /* non-blocking */ }
      return new Response(
        JSON.stringify({
          error: "Lead not found. Please save contact info first.",
          trace_id: trace.ts,
          debug: { resolved_via: resolvedVia, input_lead_id: lead_id ?? null, email_results: (emailLeads?.length ?? 0) },
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminOverride = body?.admin_override === true;
    // Public bookings skip quiz gate and low-quality block — they have no quiz.
    // Booking Identity (lead for appointment) is separated from Platform Identity
    // (user role/access). Creating a lead here NEVER affects membership roles.
    const skipQualificationGate = isPublicBooking || adminOverride;
    let lq = (lead as any).lead_quality as string | null;
    let ls = (lead as any).lead_score as number | null;
    let qs = (lead as any).quiz_score as number | null;
    let qb = (lead as any).qualification_bucket as string | null;

    // ─── B6: Server-side quiz gate (with safe repair path) ───
    // Truth-source: quiz_score, qualification_bucket and lead_quality must all
    // be set before ANY appointment can be created. Frontend gating is not
    // sufficient — direct API calls must also be blocked.
    //
    // SAFE REPAIR: If scoring fields are null but the lead has quiz_answers
    // (e.g. legacy lead pre-dating the scoring system), trigger upsert_funnel_lead
    // RPC to recompute. We only block AFTER repair has been attempted.
    const scoringMissing = qs === null || qs === undefined || !qb || !lq;
    if (!skipQualificationGate && scoringMissing) {
      const { data: rawLead } = await supabase
        .from("leads")
        .select("quiz_answers, source_funnel")
        .eq("id", lead.id)
        .maybeSingle();
      const hasAnswers =
        rawLead?.quiz_answers && typeof rawLead.quiz_answers === "object" &&
        Object.keys(rawLead.quiz_answers as Record<string, unknown>).length > 0;

      if (hasAnswers) {
        try {
          await supabase.rpc("upsert_funnel_lead" as never, {
            p_email: normalizedEmail,
            p_quiz_answers: rawLead!.quiz_answers,
            p_source_funnel: rawLead?.source_funnel ?? funnel_source ?? null,
          } as never);
          // Re-read after repair
          const { data: repaired } = await supabase
            .from("leads")
            .select("lead_quality, lead_score, quiz_score, qualification_bucket")
            .eq("id", lead.id)
            .maybeSingle();
          if (repaired) {
            lq = repaired.lead_quality ?? lq;
            ls = repaired.lead_score ?? ls;
            qs = repaired.quiz_score ?? qs;
            qb = repaired.qualification_bucket ?? qb;
            console.info(`[create-appointment] scoring repaired for ${lead.id} → qs=${qs} qb=${qb} lq=${lq}`);
          }
        } catch (e) {
          console.warn(`[create-appointment] scoring repair failed for ${lead.id} (non-blocking):`, e);
        }
      }

      // Re-evaluate after repair attempt
      if (qs === null || qs === undefined || !qb || !lq) {
        console.warn(`[create-appointment] lead ${lead.id} missing qualification post-repair (qs=${qs} qb=${qb} lq=${lq})`);
        return new Response(
          JSON.stringify({
            error: "Bitte schließe zuerst die Qualifikation ab, bevor du buchst.",
            code: "qualification_required",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ─── B5: Low / C lead block + waitlist fallback ───
    // Hard block when qualification_bucket = low OR lead_quality = C OR
    // quiz_score < 40. Applies to standard AND priority/fastlane — fastlane
    // checkout has its OWN identical guard so a low lead can never reserve a
    // slot or fire Schedule. We log to booking_waitlist so ops can recover.
    const isLowQuality =
      qb === "low" || lq === "C" || (typeof qs === "number" && qs < 40);
    if (!skipQualificationGate && isLowQuality) {
      console.warn(`[create-appointment] low-quality lead ${lead.id} blocked (lq=${lq} ls=${ls} qs=${qs} qb=${qb})`);
      // Best-effort waitlist insert — never block the rejection on storage error.
      try {
        await supabase.from("booking_waitlist").insert({
          lead_id: lead.id,
          preferred_slot_type: call_type,
          status: "blocked_low_quality",
        });
      } catch (e) {
        console.warn("[create-appointment] waitlist insert failed (non-blocking):", e);
      }
      return new Response(
        JSON.stringify({
          error: "Dein Profil erfüllt aktuell nicht die Voraussetzungen für ein direktes Strategiegespräch. Du wurdest auf die Warteliste gesetzt.",
          code: "low_quality_lead_blocked",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 1b. Reschedule limit check ───
    if (reschedule && (lead.reschedule_count ?? 0) >= 1) {
      return new Response(JSON.stringify({ error: "Reschedule limit reached. No further bookings allowed." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 2. One Active Appointment per Lead — check & enforce ───
    let oldAppointmentData: { starts_at: string; ends_at: string } | null = null;

    // Primary: try booking_id
    let oldAptId: string | null = null;
    let oldAptStatus: string | null = null;
    if (lead.has_booking && lead.booking_id) {
      const { data: oldApt } = await supabase
        .from("appointments")
        .select("id, starts_at, ends_at, appointment_status")
        .eq("id", lead.booking_id)
        .in("appointment_status", ["booked", "confirmed", "pending_confirmation"])
        .maybeSingle();
      if (oldApt) {
        oldAptId = oldApt.id;
        oldAptStatus = oldApt.appointment_status;
        oldAppointmentData = { starts_at: oldApt.starts_at, ends_at: oldApt.ends_at };
      }
    }

    // Fallback: if booking_id missed, find active appointment by lead_id
    if (!oldAptId) {
      const { data: fallbackApt } = await supabase
        .from("appointments")
        .select("id, starts_at, ends_at, appointment_status")
        .eq("lead_id", lead.id)
        .in("appointment_status", ["booked", "confirmed", "pending_confirmation"])
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackApt) {
        oldAptId = fallbackApt.id;
        oldAptStatus = fallbackApt.appointment_status;
        oldAppointmentData = { starts_at: fallbackApt.starts_at, ends_at: fallbackApt.ends_at };
        console.log(`Fallback: found active appointment ${oldAptId} for lead ${lead.id} (booking_id was stale/null)`);
      }
    }

    // Also check by email for leads that might have duplicate lead records
    if (!oldAptId) {
      const { data: emailApt } = await supabase
        .from("appointments")
        .select("id, starts_at, ends_at, appointment_status, lead_id")
        .in("appointment_status", ["booked", "confirmed", "pending_confirmation"])
        .order("starts_at", { ascending: false })
        .limit(10);
      if (emailApt && emailApt.length > 0) {
        // Check if any of these belong to a lead with the same email
        const leadIds = emailApt.map((a: any) => a.lead_id).filter(Boolean);
        if (leadIds.length > 0) {
          const { data: matchingLeads } = await supabase
            .from("leads")
            .select("id")
            .eq("email", normalizedEmail)
            .in("id", leadIds);
          if (matchingLeads && matchingLeads.length > 0) {
            const matchId = matchingLeads[0].id;
            const match = emailApt.find((a: any) => a.lead_id === matchId);
            if (match && match.id !== oldAptId) {
              oldAptId = match.id;
              oldAptStatus = match.appointment_status;
              oldAppointmentData = { starts_at: match.starts_at, ends_at: match.ends_at };
              console.log(`Email-match: found active appointment ${oldAptId} for email ${normalizedEmail}`);
            }
          }
        }
      }
    }

    // ─── BLOCK or SUPERSEDE based on reschedule flag ───
    if (oldAptId && oldAppointmentData) {
      if (!reschedule) {
        // NOT a reschedule → block with structured response
        console.info(`[create-appointment] BLOCKED: lead ${lead.id} already has active appointment ${oldAptId}`);
        return new Response(
          JSON.stringify({
            success: false,
            error_code: "ACTIVE_APPOINTMENT_EXISTS",
            error: "Du hast bereits einen reservierten Termin.",
            existing_appointment_id: oldAptId,
            existing_starts_at: oldAppointmentData.starts_at,
            existing_ends_at: oldAppointmentData.ends_at,
            existing_status: oldAptStatus,
            can_reschedule: true,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // IS a reschedule → supersede old appointment
      await supabase
        .from("appointments")
        .update({ appointment_status: "superseded", updated_at: new Date().toISOString() })
        .eq("id", oldAptId)
        .in("appointment_status", ["booked", "confirmed", "pending_confirmation"]);

      // Belt-and-suspenders: supersede ANY remaining active appointments for this lead
      await supabase
        .from("appointments")
        .update({ appointment_status: "superseded", updated_at: new Date().toISOString() })
        .eq("lead_id", lead.id)
        .in("appointment_status", ["booked", "confirmed", "pending_confirmation", "pending_payment"])
        .neq("id", oldAptId);
    }

    // ─── 3. Validate and claim slot ───
    const { data: slot, error: slotErr } = await supabase
      .from("availability_slots")
      .select("*")
      .eq("id", slot_id)
      .eq("is_active", true)
      .maybeSingle();

    if (slotErr || !slot) {
      return new Response(JSON.stringify({ error: "Slot not found or inactive" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 2h minimum lead time guard (server-side) ───
    const minLeadTimeMs = 2 * 60 * 60 * 1000;
    const minLeadTimeCutoff = new Date(Date.now() + minLeadTimeMs).toISOString();
    if (slot.starts_at < minLeadTimeCutoff) {
      return new Response(
        JSON.stringify({ error: "Dieser Termin liegt zu nah. Bitte wähle einen Termin mindestens 2 Stunden in der Zukunft.", code: "min_lead_time" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check slot type matches call type
    if (slot.slot_type !== call_type) {
      return new Response(JSON.stringify({ error: `This slot is for ${slot.slot_type} calls only` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate reservation: if slot is reserved, it must be reserved by this lead
    const slotVisibility = (slot as any).visibility_status;
    if (slotVisibility === "reserved") {
      const reservedBy = (slot as any).reserved_by_lead_id;
      const reservedUntil = (slot as any).reserved_until;
      if (reservedBy && reservedBy !== lead.id) {
        return new Response(JSON.stringify({ error: "Dieser Termin ist gerade für jemand anderen reserviert.", code: "slot_reserved" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (reservedUntil && new Date(reservedUntil) < new Date()) {
        return new Response(JSON.stringify({ error: "Deine Reservierung ist abgelaufen. Bitte wähle erneut.", code: "reservation_expired" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Check capacity
    if (slot.current_bookings >= slot.max_bookings) {
      return new Response(JSON.stringify({ error: "Slot is fully booked" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Increment slot bookings atomically + mark as booked
    const { error: slotUpdateErr } = await supabase
      .from("availability_slots")
      .update({
        current_bookings: slot.current_bookings + 1,
        visibility_status: "booked",
        reserved_until: null,
        reserved_by_lead_id: null,
      } as any)
      .eq("id", slot_id)
      .lt("current_bookings", slot.max_bookings);

    if (slotUpdateErr) {
      return new Response(JSON.stringify({ error: "Failed to reserve slot" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 4. Create appointment (auto-generate video link) ───
    const now = new Date().toISOString();
    const paymentStatus = call_type === "priority" ? "pending" : "none";

    // Auto-generate REAL video call link via Jitsi Meet (no API key, instant).
    // Each appointment gets a unique room. Fallback to confirmed page if generation fails.
    const roomSlug = `etc-${lead.id.slice(0, 8)}-${Date.now().toString(36)}`;
    let videoCallLink = `https://meet.jit.si/${roomSlug}`;
    if (!videoCallLink || !videoCallLink.startsWith("https://")) {
      videoCallLink = "https://ethicalcloser.de/booking/confirmed";
    }

    // Compute the UTC offset for this booking's timezone
    const computeOffset = (tz: string, isoDate: string): string => {
      try {
        const d = new Date(isoDate);
        const fmt = new Intl.DateTimeFormat("en-US", {
          timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
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
    };
    const utcOffset = computeOffset(bookingTimezone, slot.starts_at);

    // Compute original local date/time in the user's timezone for accurate display
    const computeLocalDatetime = (tz: string, isoDate: string): { date: string; time: string } => {
      try {
        const d = new Date(isoDate);
        const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
        const tfmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
        return { date: fmt.format(d), time: tfmt.format(d) };
      } catch { return { date: "", time: "" }; }
    };
    const localDt = computeLocalDatetime(bookingTimezone, slot.starts_at);
    // ─── Canonical Booking Priority ───
    const bookingPriority = deriveBookingPriority(lead);
    const canonicalSetterId = lead.setter_id ?? lead.owner_id ?? lead.assigned_operator_id ?? null;
    const canonicalCloserId = lead.closer_id ?? null;
    const canonicalOwnerId = canonicalCloserId ?? canonicalSetterId;
    const canonicalOwnerRole = canonicalCloserId ? "closer" : "setter";
    console.info(`[create-appointment] lead ${lead.id} booking_priority=${bookingPriority}`);

    const { data: appointment, error: aptErr } = await supabase
      .from("appointments")
      .insert({
        lead_id: lead.id,
        current_owner_id: canonicalOwnerId,
        current_owner_role: canonicalOwnerId ? canonicalOwnerRole : null,
        original_owner_id: canonicalOwnerId,
        original_owner_role: canonicalOwnerId ? canonicalOwnerRole : null,
        assigned_operator_id: canonicalOwnerId,
        setter_id: canonicalSetterId,
        closer_id: canonicalCloserId,
        call_type,
        appointment_status: "booked",
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        payment_status: paymentStatus,
        booking_source: attributionSource || funnel_source || "internal",
        video_call_link: videoCallLink,
        booking_timezone: bookingTimezone,
        booking_utc_offset: utcOffset,
        original_local_date: localDt.date || null,
        original_local_time: localDt.time || null,
        booking_priority: bookingPriority,
      })
      .select("id")
      .single();

    if (aptErr || !appointment) {
      // Rollback slot
      await supabase
        .from("availability_slots")
        .update({ current_bookings: Math.max(0, slot.current_bookings) })
        .eq("id", slot_id);

      // ─── Dedupe guard: unique index violation = parallel booking race ───
      const isDuplicate = aptErr?.code === "23505" ||
        aptErr?.message?.includes("unique") ||
        aptErr?.message?.includes("duplicate");
      if (isDuplicate) {
        console.warn(`[create-appointment] dedupe: lead ${lead.id} already has active appointment`);
        // Return the existing active appointment so the UI can recover
        const { data: existing } = await supabase
          .from("appointments")
          .select("id, starts_at, ends_at, call_type, appointment_status")
          .eq("lead_id", lead.id)
          .in("appointment_status", ["booked", "confirmed", "pending_payment"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) {
          return new Response(
            JSON.stringify({
              success: true,
              appointment_id: existing.id,
              deduplicated: true,
              starts_at: existing.starts_at,
              message: "Dein Termin wurde bereits gebucht.",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ error: "Dein Termin wurde bereits gebucht. Bitte lade die Seite neu.", code: "duplicate_booking" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ error: "Failed to create appointment" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 5. Update lead ───
    const leadUpdate: Record<string, any> = {
      has_booking: true,
      booking_id: appointment.id,
      booking_status: "booking_verified",
      lead_status: "bewerber",
      priority_flag: call_type === "priority",
      stage: "booked",
      source_funnel: funnel_source || undefined,
      appointment_date: slot.starts_at,
      updated_at: now,
    };

    // If this is a reschedule, increment counter
    if (reschedule) {
      leadUpdate.reschedule_count = (lead.reschedule_count ?? 0) + 1;
      leadUpdate.last_reschedule_at = now;
    }

    await supabase
      .from("leads")
      .update(leadUpdate)
      .eq("id", lead.id);

    // ─── 6. Log events ───
    const eventType = reschedule ? "reschedule_booked" : "booking_created";
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      event_type: eventType,
      notes: `${reschedule ? "Rescheduled" : "New"} ${call_type} call booked for ${slot.starts_at}`,
      metadata: { appointment_id: appointment.id, call_type, slot_id, funnel_source, is_reschedule: !!reschedule },
    });

    await supabase.from("lead_transitions").insert({
      lead_id: lead.id,
      previous_stage: lead.stage,
      new_stage: "booked",
      reason: `${reschedule ? "Reschedule" : "Booking"} created: ${call_type} call`,
    });

    // Log canonical booking priority assignment
    await supabase.from("event_logs").insert({
      lead_id: lead.id,
      event_type: "BOOKING_PRIORITY_ASSIGNED",
      metadata: { appointment_id: appointment.id, booking_priority: bookingPriority, call_type },
    });

    // ─── 6b. Server-side Meta CAPI Schedule mirror ───
    // Fire-and-forget. Idempotent via deterministic event_id (one per
    // appointment + reschedule cycle). Browser pixel still fires from the UI;
    // shared event_id prevents Meta from double-counting. Does NOT block.
    try {
      const eventId = `Schedule_appt_${appointment.id}${reschedule ? "_resched" : ""}`;
      const sourceUrl = req.headers.get("origin") ?? "https://ethicalcloser.de";
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-meta-event`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            event_name: "Schedule",
            event_id: eventId,
            email: normalizedEmail,
            event_source_url: `${sourceUrl}/booking/confirmed`,
            client_user_agent: req.headers.get("user-agent") ?? undefined,
            custom_data: {
              lead_id: lead.id,
              appointment_id: appointment.id,
              call_type,
              funnel: funnel_source ?? null,
              is_reschedule: !!reschedule,
            },
          }),
        },
      ).catch((e) => console.warn("[create-appointment] Schedule mirror fetch failed:", e));
    } catch (e) {
      console.warn("[create-appointment] Schedule mirror failed (non-blocking):", e);
    }

    // ─── 7. Send booking confirmation email ───
    // CRITICAL: Format dates in the BOOKING timezone, not server UTC
    const startsDate = new Date(slot.starts_at);
    const dateStr = startsDate.toLocaleDateString("de-DE", { timeZone: bookingTimezone, day: "numeric", month: "long", year: "numeric" });
    const timeStr = startsDate.toLocaleTimeString("de-DE", { timeZone: bookingTimezone, hour: "2-digit", minute: "2-digit" });
    const callLabel = call_type === "priority" ? "Private Strategy Session" : "Persönliches Strategiegespräch";

    // Log for debugging time consistency
    console.info(`[create-appointment] Time audit: slot.starts_at=${slot.starts_at} tz=${bookingTimezone} displayed=${dateStr} ${timeStr}`);

    if (reschedule && oldAppointmentData) {
      // Reschedule-specific emails — also format in booking timezone
      const oldDate = new Date(oldAppointmentData.starts_at);
      const oldDateStr = oldDate.toLocaleDateString("de-DE", { timeZone: bookingTimezone, day: "numeric", month: "long", year: "numeric" });
      const oldTimeStr = oldDate.toLocaleTimeString("de-DE", { timeZone: bookingTimezone, hour: "2-digit", minute: "2-digit" });

      try {
        // Send reschedule confirmation to applicant
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "reschedule-confirmation",
            recipientEmail: normalizedEmail,
            idempotencyKey: `reschedule-confirm-${appointment.id}`,
            templateData: {
              name: lead.name || undefined,
              oldDate: oldDateStr,
              oldTime: oldTimeStr,
              newDate: dateStr,
              newTime: timeStr,
              callType: callLabel,
            },
          },
        });
      } catch (e) {
        console.error("Reschedule confirmation email failed (non-blocking):", e);
      }

      // Send notification to setter if assigned
      if (lead.setter_id) {
        try {
          const { data: setterProfile } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", lead.setter_id)
            .maybeSingle();

          if (setterProfile?.email) {
            await supabase.functions.invoke("send-transactional-email", {
              body: {
                templateName: "setter-reschedule-notification",
                recipientEmail: setterProfile.email,
                idempotencyKey: `setter-reschedule-${appointment.id}`,
                templateData: {
                  leadName: lead.name || normalizedEmail,
                  oldDate: oldDateStr,
                  oldTime: oldTimeStr,
                  newDate: dateStr,
                  newTime: timeStr,
                  callType: callLabel,
                  leadId: lead.id,
                },
              },
            });
          }
        } catch (e) {
          console.error("Setter reschedule notification failed (non-blocking):", e);
        }
      }

      // Log reschedule events
      await supabase.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "appointment_rescheduled",
        notes: `Old: ${oldDateStr} ${oldTimeStr} → New: ${dateStr} ${timeStr}`,
        metadata: { old_appointment_id: lead.booking_id, new_appointment_id: appointment.id },
      });
    } else {
      // Standard booking confirmation — include calendar links
      try {
        // Build calendar deep-links server-side
        const endDate = new Date(startsDate.getTime() + 30 * 60_000);
        const toGCal = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
        const gcalParams = new URLSearchParams({
          action: "TEMPLATE",
          text: callLabel,
          dates: `${toGCal(startsDate)}/${toGCal(endDate)}`,
          details: "Dein persönliches Strategiegespräch.",
          location: "Online · Video-Call",
        });
        const googleCalendarUrl = `https://calendar.google.com/calendar/event?${gcalParams.toString()}`;

        const outlookParams = new URLSearchParams({
          path: "/calendar/action/compose",
          rru: "addevent",
          subject: callLabel,
          startdt: startsDate.toISOString(),
          enddt: endDate.toISOString(),
          body: "Dein persönliches Strategiegespräch.",
          location: "Online · Video-Call",
        });
        const outlookCalendarUrl = `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams.toString()}`;

        const siteUrl = Deno.env.get("SUPABASE_URL")?.replace("supabase.co", "lovable.app") ?? "https://ethical-closing.lovable.app";

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "booking-confirmation",
            recipientEmail: normalizedEmail,
            idempotencyKey: `booking-confirm-${appointment.id}`,
            templateData: {
              name: lead.name || undefined,
              date: dateStr,
              time: timeStr,
              callType: callLabel,
              durationMinutes: 30,
              googleCalendarUrl,
              outlookCalendarUrl,
              loginUrl: "https://ethical-closing.lovable.app/members/login",
            },
          },
        });
      } catch (e) {
        console.error("Booking confirmation email failed (non-blocking):", e);
      }
    }

    // ─── 8. Trigger replenishment (non-blocking) ───
    // After booking, replenish visible slots for this day so the next visitor
    // sees a replacement slot (different time) immediately.
    try {
      const slotDate = slot.date ?? slot.starts_at?.slice(0, 10);
      await supabase.rpc("replenish_visible_slots", { p_target_date: slotDate });
      console.info(`[create-appointment] replenished visible slots for ${slotDate}`);
    } catch (e) {
      console.warn("[create-appointment] replenishment failed (non-blocking):", e);
    }

    // ─── 9. Trigger setter assignment (only for new bookings) ───
    if (!reschedule) {
      try {
        const assignUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/assign-booked-lead`;
        await fetch(assignUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ lead_id: lead.id, appointment_id: appointment.id, call_type }),
        });
      } catch (e) {
        console.error("Setter assignment trigger failed (non-blocking):", e);
      }
    }

    // ─── 9. Provision applicant account (L0) — await to get magic link ───
    // Failure here MUST NOT roll back the appointment. The user has booked
    // successfully; missing platform access is recoverable. We:
    //   1. log a structured `provisioning_failed` event (admin-visible),
    //   2. enqueue a retry via outbound_events,
    //   3. return success=true with provisioning_status so the UI can show
    //      a graceful "credentials follow by email" notice.
    let magicLink: string | null = null;
    let provisioningStatus: "ok" | "failed" | "skipped" = "skipped";
    let provisioningErrorMessage: string | null = null;
    try {
      const provisionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/provision-applicant-account`;
      const provRes = await fetch(provisionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          email: normalizedEmail,
          name: lead.name || undefined,
        }),
      });
      if (provRes.ok) {
        const provData = await provRes.json();
        magicLink = provData.magic_link || null;
        provisioningStatus = "ok";
      } else {
        provisioningStatus = "failed";
        provisioningErrorMessage = `provision_http_${provRes.status}`;
        try {
          const errBody = await provRes.text();
          provisioningErrorMessage += `: ${errBody.slice(0, 200)}`;
        } catch {/* ignore */}
      }
    } catch (e) {
      provisioningStatus = "failed";
      provisioningErrorMessage = (e as Error)?.message ?? "unknown";
      console.error("Applicant account provisioning failed (non-blocking):", e);
    }

    if (provisioningStatus === "failed") {
      // 1) Structured admin-visible failure event
      await supabase.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "provisioning_failed",
        notes: `L0 account provisioning failed for appointment ${appointment.id}. Retry queued.`,
        metadata: {
          appointment_id: appointment.id,
          email: normalizedEmail,
          error: provisioningErrorMessage,
        },
      }).catch((e) => console.error("provisioning_failed lead_events insert error", e));

      // 2) Retry queue — picked up by existing outbound_events worker
      await supabase.from("outbound_events").insert({
        event_name: "applicant_provisioning_retry",
        entity_type: "lead",
        entity_id: lead.id,
        payload: {
          appointment_id: appointment.id,
          email: normalizedEmail,
          name: lead.name ?? null,
          attempts: 0,
          first_failed_at: new Date().toISOString(),
          last_error: provisioningErrorMessage,
        },
        status: "pending",
      } as never).catch((e) => console.error("provisioning retry enqueue error", e));

      // 3) Audit log for compliance / SLA traceability
      await supabase.from("audit_logs").insert({
        action: "applicant_provisioning_failed",
        source_type: "edge_function",
        note: `provision-applicant-account failed during create-appointment for lead ${lead.id}`,
        after_state: {
          appointment_id: appointment.id,
          lead_id: lead.id,
          error: provisioningErrorMessage,
        },
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        appointment_id: appointment.id,
        lead_id: lead.id,
        starts_at: slot.starts_at,
        call_type,
        magic_link: magicLink,
        provisioning_status: provisioningStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("create-appointment error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
