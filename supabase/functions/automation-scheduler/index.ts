// Automation Scheduler — runs every 5 min via pg_cron
// Handles: setter T-30min reminders, SLA breaches, no-show detection, outbound event emission
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const now = new Date();
  const metrics: Record<string, number> = {
    setter_reminders_sent: 0,
    sla_escalations: 0,
    no_shows_detected: 0,
    no_show_stage2: 0,
    no_show_stage3: 0,
    no_show_stage4: 0,
    no_show_stage5: 0,
    no_booking_touches: 0,
  };
  const errors: string[] = [];

  try {
    // ── 1. Setter T-30min reminders ──
    // Appointments starting in 25-35 min window, not yet reminded
    const in25 = new Date(now.getTime() + 25 * 60_000).toISOString();
    const in35 = new Date(now.getTime() + 35 * 60_000).toISOString();
    const { data: setterUpcoming } = await supabase
      .from("appointments")
      .select("id, lead_id, setter_id, starts_at")
     .in("appointment_status", ["booked", "scheduled", "confirmed"])
      .is("setter_reminder_sent_at", null)
      .gte("starts_at", in25)
      .lte("starts_at", in35);

    for (const appt of setterUpcoming ?? []) {
      // Mark sent first to avoid race on next run
      await supabase
        .from("appointments")
        .update({ setter_reminder_sent_at: now.toISOString() } as never)
        .eq("id", appt.id);

      // Emit internal event (in-app notification + optional email via existing pipeline)
      await supabase.from("outbound_events").insert({
        event_name: "setter_reminder_30m",
        entity_type: "appointment",
        entity_id: appt.id,
        payload: { setter_id: appt.setter_id, lead_id: appt.lead_id, starts_at: appt.starts_at },
        status: "pending",
      } as never);
      metrics.setter_reminders_sent++;
    }

    // ── 2. SLA escalation: appointment within 10 min, still not confirmed ──
    const in10 = new Date(now.getTime() + 10 * 60_000).toISOString();
    const { data: slaBreach } = await supabase
      .from("appointments")
      .select("id, lead_id, setter_id, starts_at")
      .in("appointment_status", ["booked", "scheduled"])
      .is("sla_escalated_at", null)
      .lte("starts_at", in10)
      .gte("starts_at", now.toISOString());

    for (const appt of slaBreach ?? []) {
      await supabase
        .from("appointments")
        .update({ sla_escalated_at: now.toISOString() } as never)
        .eq("id", appt.id);

      await supabase.from("outbound_events").insert({
        event_name: "sla_breach",
        entity_type: "appointment",
        entity_id: appt.id,
        payload: { setter_id: appt.setter_id, lead_id: appt.lead_id, starts_at: appt.starts_at },
        status: "pending",
      } as never);
      metrics.sla_escalations++;
    }

    // ── 3. No-show detection: appointment ended 15+ min ago, never marked attended ──
    const past15 = new Date(now.getTime() - 15 * 60_000).toISOString();
    const past120 = new Date(now.getTime() - 120 * 60_000).toISOString();
    const { data: noShows } = await supabase
      .from("appointments")
      .select("id, lead_id, setter_id, starts_at, ends_at")
      .in("appointment_status", ["booked", "scheduled", "confirmed"])
      .is("no_show_detected_at", null)
      .is("call_started_at", null)
      .lte("ends_at", past15)
      .gte("ends_at", past120);

    for (const appt of noShows ?? []) {
      await supabase
        .from("appointments")
        .update({
          no_show_detected_at: now.toISOString(),
          appointment_status: "no_show",
          outcome: "no_show",
        } as never)
        .eq("id", appt.id);

      // V6.1: emit canonical no_show event for GHL dispatcher
      await supabase.from("outbound_events").insert({
        event_name: "no_show",
        entity_type: "lead",
        entity_id: appt.lead_id,
        payload: {
          source: "automation_scheduler.detect_no_shows",
          appointment_id: appt.id,
          setter_id: appt.setter_id,
          starts_at: appt.starts_at,
        },
        status: "pending",
      } as never);

      // ── No-Show Recovery Email ──
      // DISABLED: Recovery email is now sent ONLY by process-appointment-sla
      // (idempotencyKey: `noshow-recovery-${apt.id}`) with proper lead_events dedup.
      // Sending here too caused DUPLICATE recovery emails because the idempotency
      // keys differed (`no-show-recovery-` vs `noshow-recovery-`).
      // automation-scheduler handles detection + status marking only.

      // ── Stage 1: Immediate recovery (+5 min) ──
      try {
        await supabase.functions.invoke("mark-no-show-and-recover", {
          body: { appointment_id: appt.id, stage: 1 },
        });
      } catch (e) {
        errors.push(`recovery_stage1_${appt.id}: ${(e as Error).message}`);
      }

      metrics.no_shows_detected++;
    }

    // ── 4. No-Show Stage 2: 2h recovery — appointments marked no_show 1h50–2h10 ago ──
    const noShow2hStart = new Date(now.getTime() - 130 * 60_000).toISOString(); // 2h10m ago
    const noShow2hEnd   = new Date(now.getTime() - 110 * 60_000).toISOString(); // 1h50m ago
    const { data: stage2Appts } = await supabase
      .from("appointments")
      .select("id")
      .eq("appointment_status", "no_show")
      .gte("no_show_detected_at", noShow2hEnd)
      .lte("no_show_detected_at", noShow2hStart);

    for (const appt of stage2Appts ?? []) {
      try {
        await supabase.functions.invoke("mark-no-show-and-recover", {
          body: { appointment_id: appt.id, stage: 2 },
        });
        metrics.no_show_stage2 = (metrics.no_show_stage2 ?? 0) + 1;
      } catch (e) {
        errors.push(`recovery_stage2_${appt.id}: ${(e as Error).message}`);
      }
    }

    // ── 5. No-Show Stage 3: 24h decision — appointments marked no_show 23h50–24h10 ago ──
    const noShow24hStart = new Date(now.getTime() - (24 * 60 + 10) * 60_000).toISOString();
    const noShow24hEnd   = new Date(now.getTime() - (23 * 60 + 50) * 60_000).toISOString();
    const { data: stage3Appts } = await supabase
      .from("appointments")
      .select("id")
      .eq("appointment_status", "no_show")
      .gte("no_show_detected_at", noShow24hEnd)
      .lte("no_show_detected_at", noShow24hStart);

    for (const appt of stage3Appts ?? []) {
      try {
        await supabase.functions.invoke("mark-no-show-and-recover", {
          body: { appointment_id: appt.id, stage: 3 },
        });
        metrics.no_show_stage3 = (metrics.no_show_stage3 ?? 0) + 1;
      } catch (e) {
        errors.push(`recovery_stage3_${appt.id}: ${(e as Error).message}`);
      }
    }

    // ── 6. No-Show Stage 4: +24h email reschedule (parallel to WA stage 3) ──
    // Same window as stage 3: no_show_detected_at 23h50–24h10 ago.
    for (const appt of stage3Appts ?? []) {
      try {
        await supabase.functions.invoke("mark-no-show-and-recover", {
          body: { appointment_id: appt.id, stage: 4 },
        });
        metrics.no_show_stage4 = (metrics.no_show_stage4 ?? 0) + 1;
      } catch (e) {
        errors.push(`recovery_stage4_${appt.id}: ${(e as Error).message}`);
      }
    }

    // ── 7. No-Show Stage 5: +72h final email — appointments marked no_show 71h50–72h10 ago ──
    const noShow72hStart = new Date(now.getTime() - (72 * 60 + 10) * 60_000).toISOString();
    const noShow72hEnd   = new Date(now.getTime() - (71 * 60 + 50) * 60_000).toISOString();
    const { data: stage5Appts } = await supabase
      .from("appointments")
      .select("id")
      .eq("appointment_status", "no_show")
      .gte("no_show_detected_at", noShow72hEnd)
      .lte("no_show_detected_at", noShow72hStart);

    for (const appt of stage5Appts ?? []) {
      try {
        await supabase.functions.invoke("mark-no-show-and-recover", {
          body: { appointment_id: appt.id, stage: 5 },
        });
        metrics.no_show_stage5 = (metrics.no_show_stage5 ?? 0) + 1;
      } catch (e) {
        errors.push(`recovery_stage5_${appt.id}: ${(e as Error).message}`);
      }
    }

    // ── 8. No-Booking Retargeting Funnel (WA 5m → SMS 2h → Email 24h → SMS 48h → Email 72h) ──
    // The function is self-stateful (per-lead cadence cursor in leads.retargeting_state)
    // and idempotent — safe to invoke every scheduler tick. It picks the next
    // due touch per lead and routes through dispatch-communication (Phase 2 canon).
    try {
      const { data: nbResult, error: nbErr } = await supabase.functions.invoke(
        "retargeting-no-booking",
        { body: {} },
      );
      if (nbErr) {
        errors.push(`retargeting_no_booking: ${nbErr.message ?? "invoke_error"}`);
      } else {
        metrics.no_booking_touches = (nbResult as any)?.processed ?? 0;
      }
    } catch (e) {
      errors.push(`retargeting_no_booking: ${(e as Error).message}`);
    }
  } catch (e) {
    errors.push((e as Error).message);
  }

  const status = errors.length > 0 ? "partial" : "success";
  await supabase.from("automation_log").insert({
    job_name: "automation-scheduler",
    status,
    metrics,
    error: errors.length > 0 ? errors.join("; ") : null,
  } as never);

  return new Response(
    JSON.stringify({ ok: true, status, metrics, errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
