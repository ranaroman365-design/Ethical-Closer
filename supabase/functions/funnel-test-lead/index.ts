// Funnel Test-Lead Simulator
// Creates a test lead and walks it through the ENTIRE funnel following the
// canonical state machine: new → booked → assigned_setter → setter_qualified →
// ready_for_closer → assigned_closer → closer_in_progress → offer_made → closed_won
// Also supports: no_show, no_close, full_recovery scenarios.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function errStr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) return JSON.stringify(e);
  return String(e);
}

interface StepLog {
  step: number | string;
  name: string;
  status: "success" | "failed" | "skipped";
  duration_ms: number;
  detail: string;
  checks: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const scenario = body.scenario ?? "happy_path";
    const testPrefix = `TEST-${Date.now()}`;
    const logs: StepLog[] = [];
    let leadId: string | null = null;
    let appointmentId: string | null = null;

    // Helper: update lead stage with error capture
    async function updateLead(updates: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
      const { error } = await sb.from("leads").update(updates).eq("id", leadId);
      if (error) return { ok: false, error: errStr(error) };
      return { ok: true };
    }

    // ─── STEP 1: Quiz Submission (Lead Created) ───
    const s1 = Date.now();
    try {
      const quizScore = 8;
      const { data: lead, error } = await sb.from("leads").insert({
        name: `${testPrefix} Max Mustermann`,
        email: `${testPrefix.toLowerCase()}@test.ethicalcloser.de`,
        phone: "+4917612345678",
        source: "quiz",
        stage: "new",
        lead_status: "interessent",
        is_simulation: true,
        simulation_batch_id: testPrefix,
        quiz_score: quizScore,
        quiz_result: "qualified",
        quiz_answers: { experience: "some", motivation: "income", availability: "full_time" },
        quiz_funnel_source: "apply_direct",
        lead_score: quizScore,
        lead_quality: "A",
        source_funnel: "organic",
        funnel_source: "apply_direct",
        lead_level: "L0",
      }).select().single();

      if (error) throw new Error(errStr(error));
      leadId = lead.id;

      logs.push({
        step: 1, name: "Quiz Submission", status: "success", duration_ms: Date.now() - s1,
        detail: `Lead ${lead.id} | Score: ${quizScore} | Quality: A`,
        checks: { lead_id: lead.id, quiz_score: quizScore, stage: "new" },
      });
    } catch (err) {
      logs.push({ step: 1, name: "Quiz Submission", status: "failed", duration_ms: Date.now() - s1, detail: errStr(err), checks: {} });
      return jsonRes({ scenario, logs, final_status: "FAILED_AT_QUIZ" });
    }

    // ─── STEP 2: Lead Capture Validation ───
    const s2 = Date.now();
    const { data: capturedLead } = await sb.from("leads").select("name, email, phone, lead_score").eq("id", leadId).single();
    const valid = !!(capturedLead?.name && capturedLead?.email && capturedLead?.phone);
    logs.push({
      step: 2, name: "Lead Capture Validation", status: valid ? "success" : "failed",
      duration_ms: Date.now() - s2,
      detail: valid ? "Name + Email + Phone ✓" : "PFLICHTFELDER FEHLEN",
      checks: { has_name: !!capturedLead?.name, has_email: !!capturedLead?.email, has_phone: !!capturedLead?.phone },
    });

    // ─── STEP 3: Booking (new → booked) ───
    const s3 = Date.now();
    try {
      const startsAt = new Date(Date.now() + 3600000);
      // Transition: new → booked
      const res3 = await updateLead({ stage: "booked", has_booking: true, booking_status: "confirmed", appointment_date: startsAt.toISOString() });
      if (!res3.ok) throw new Error(res3.error);

      const { data: appt, error: apptErr } = await sb.from("appointments").insert({
        lead_id: leadId,
        call_type: "standard",
        appointment_status: "booked",
        starts_at: startsAt.toISOString(),
        ends_at: new Date(startsAt.getTime() + 1800000).toISOString(),
        booking_source: "test_simulation",
      }).select().single();
      if (apptErr) throw new Error(errStr(apptErr));
      appointmentId = appt.id;

      await updateLead({ booking_id: appt.id });

      logs.push({
        step: 3, name: "Booking Created", status: "success", duration_ms: Date.now() - s3,
        detail: `Appt ${appt.id} | ${startsAt.toISOString()} | Stage: booked`,
        checks: { appointment_id: appt.id, stage: "booked" },
      });
    } catch (err) {
      logs.push({ step: 3, name: "Booking Created", status: "failed", duration_ms: Date.now() - s3, detail: errStr(err), checks: {} });
    }

    // ─── STEP 4: Setter Assignment (booked → assigned_setter) ───
    const s4 = Date.now();
    const res4 = await updateLead({ stage: "assigned_setter", contact_count: 1, first_action_at: new Date().toISOString(), last_action_at: new Date().toISOString() });
    logs.push({
      step: 4, name: "Setter Assignment", status: res4.ok ? "success" : "failed",
      duration_ms: Date.now() - s4,
      detail: res4.ok ? "Stage: assigned_setter" : res4.error!,
      checks: { stage: "assigned_setter" },
    });

    // ─── STEP 5: Setter Qualification (assigned_setter → setter_contacting → setter_qualified) ───
    const s5 = Date.now();
    let res5 = await updateLead({ stage: "setter_contacting" });
    if (res5.ok) res5 = await updateLead({ stage: "setter_qualified", setter_call_outcome: "qualified", setter_qualification_score: 85 });
    logs.push({
      step: 5, name: "Setter Qualification", status: res5.ok ? "success" : "failed",
      duration_ms: Date.now() - s5,
      detail: res5.ok ? "Setter qualified lead (score 85)" : res5.error!,
      checks: { stage: "setter_qualified" },
    });

    // ─── STEP 6: NO-SHOW PATH ───
    if (scenario === "no_show" || scenario === "full_recovery") {
      const s6 = Date.now();
      if (appointmentId) {
        await sb.from("appointments").update({
          appointment_status: "no_show",
          no_show_detected_at: new Date().toISOString(),
          attendance_flag: "no_show",
        }).eq("id", appointmentId);
      }

      logs.push({
        step: 6, name: "No-Show Detected", status: "success", duration_ms: Date.now() - s6,
        detail: "Lead nicht erschienen → Recovery",
        checks: { appointment_status: "no_show" },
      });

      // AI Operator Recovery
      const s6a = Date.now();
      try {
        const { data: aiRes, error: aiErr } = await sb.functions.invoke("ai-operator", {
          body: { event_type: "no_show", lead_id: leadId, payload: { step: 0 } },
        });
        if (aiErr) throw aiErr;
        logs.push({
          step: "6a", name: "No-Show Recovery (AI)", status: "success", duration_ms: Date.now() - s6a,
          detail: `AI: ${JSON.stringify(aiRes?.action_type ?? aiRes?.message ?? "processed")}`,
          checks: { ai_active: true },
        });
      } catch (err) {
        logs.push({ step: "6a", name: "No-Show Recovery (AI)", status: "failed", duration_ms: Date.now() - s6a, detail: errStr(err), checks: {} });
      }

      // Enforcement Check
      const s6b = Date.now();
      try {
        const { data: enfRes, error: enfErr } = await sb.functions.invoke("enforcement-check");
        if (enfErr) throw enfErr;
        logs.push({
          step: "6b", name: "Enforcement Check", status: "success", duration_ms: Date.now() - s6b,
          detail: `${JSON.stringify(enfRes?.results ?? enfRes?.message ?? "ok")}`,
          checks: { enforcement_ran: true },
        });
      } catch (err) {
        logs.push({ step: "6b", name: "Enforcement Check", status: "failed", duration_ms: Date.now() - s6b, detail: errStr(err), checks: {} });
      }

      if (scenario === "full_recovery") {
        // Rebook
        const s6c = Date.now();
        const newStart = new Date(Date.now() + 86400000);
        const { data: rebookedAppt, error: rbErr } = await sb.from("appointments").insert({
          lead_id: leadId, call_type: "standard", appointment_status: "booked",
          starts_at: newStart.toISOString(), ends_at: new Date(newStart.getTime() + 1800000).toISOString(),
          booking_source: "recovery_rebook",
        }).select().single();
        appointmentId = rebookedAppt?.id ?? appointmentId;

        logs.push({
          step: "6c", name: "Recovery Rebooking", status: rbErr ? "failed" : "success",
          duration_ms: Date.now() - s6c,
          detail: rbErr ? errStr(rbErr) : `Rebooked: ${rebookedAppt?.id}`,
          checks: { rebooked: !rbErr },
        });
      }
    }

    // ─── STEP 7: Ready for Closer (setter_qualified → ready_for_closer → assigned_closer) ───
    if (scenario === "happy_path" || scenario === "no_close" || scenario === "full_recovery") {
      const s7 = Date.now();
      let res7 = await updateLead({ stage: "ready_for_closer" });
      if (res7.ok) res7 = await updateLead({ stage: "assigned_closer" });
      if (res7.ok) res7 = await updateLead({ stage: "closer_in_progress" });

      if (appointmentId) {
        await sb.from("appointments").update({
          appointment_status: "completed", attendance_flag: "attended",
          call_started_at: new Date().toISOString(), call_completed_at: new Date().toISOString(), call_status: "completed",
        }).eq("id", appointmentId);
      }

      logs.push({
        step: 7, name: "Closer Call (Show)", status: res7.ok ? "success" : "failed",
        duration_ms: Date.now() - s7,
        detail: res7.ok ? "Stage: closer_in_progress → Call attended ✓" : res7.error!,
        checks: { stage: "closer_in_progress", attendance: "attended" },
      });
    }

    // ─── STEP 8: Close / No-Close ───
    if (scenario === "happy_path" || scenario === "full_recovery") {
      const s8 = Date.now();
      // closer_in_progress → offer_made → closed_won
      let res8 = await updateLead({ stage: "offer_made" });
      if (res8.ok) res8 = await updateLead({ stage: "closed_won", deal_value: 2997, closed_at: new Date().toISOString(), outcome: "won" });

      // Note: calls table requires user_id (auth.users FK) — skipped in simulation
      logs.push({
        step: 8, name: "Deal Closed (Won)", status: res8.ok ? "success" : "failed",
        duration_ms: Date.now() - s8,
        detail: res8.ok ? `Deal: €2.997 | Stage: closed_won ✓` : res8.error!,
        checks: { deal_value: 2997, stage: "closed_won" },
      });
    } else if (scenario === "no_close") {
      const s8 = Date.now();
      // closer_in_progress → offer_made → closed_lost
      let res8 = await updateLead({ stage: "offer_made" });
      if (res8.ok) res8 = await updateLead({ stage: "closed_lost", outcome: "lost", close_reason: "price_objection" });

      logs.push({
        step: 8, name: "No-Close (Deal Lost)", status: res8.ok ? "success" : "failed",
        duration_ms: Date.now() - s8,
        detail: res8.ok ? `Objection: price | Stage: closed_lost` : res8.error!,
        checks: { stage: "closed_lost", objection: "price" },
      });

      // AI Operator no-close recovery
      const s8a = Date.now();
      try {
        const { data: ncRes, error: ncErr } = await sb.functions.invoke("ai-operator", {
          body: { event_type: "call_completed", lead_id: leadId, payload: { outcome: "no_close", objection_type: "price" } },
        });
        if (ncErr) throw ncErr;
        logs.push({
          step: "8a", name: "No-Close Recovery (AI)", status: "success", duration_ms: Date.now() - s8a,
          detail: `AI: ${JSON.stringify(ncRes?.action_type ?? ncRes?.message ?? "processed")}`,
          checks: { recovery: true },
        });
      } catch (err) {
        logs.push({ step: "8a", name: "No-Close Recovery (AI)", status: "failed", duration_ms: Date.now() - s8a, detail: errStr(err), checks: {} });
      }
    }

    // ─── STEP 9: Final Verification ───
    const s9 = Date.now();
    const { data: finalLead } = await sb.from("leads").select("*").eq("id", leadId).single();
    const { data: finalAppts } = await sb.from("appointments").select("id, appointment_status").eq("lead_id", leadId);
    const { data: aiActions } = await sb.from("ai_operator_actions").select("id, event_type, action_type, success").eq("lead_id", leadId);
    const { data: violations } = await sb.from("enforcement_violations").select("id, status").eq("lead_id", leadId);

    logs.push({
      step: 9, name: "Final Verification", status: "success", duration_ms: Date.now() - s9,
      detail: `Stage: ${finalLead?.stage} | Appointments: ${finalAppts?.length ?? 0} | AI Actions: ${aiActions?.length ?? 0} | Violations: ${violations?.length ?? 0}`,
      checks: {
        final_stage: finalLead?.stage,
        final_lead_status: finalLead?.lead_status,
        deal_value: finalLead?.deal_value,
        appointments: finalAppts?.length ?? 0,
        appointment_statuses: finalAppts?.map((a: any) => a.appointment_status),
        ai_actions: aiActions?.length ?? 0,
        violations: violations?.length ?? 0,
        is_simulation: finalLead?.is_simulation,
      },
    });

    const passed = logs.filter((l) => l.status === "success").length;
    const failed = logs.filter((l) => l.status === "failed").length;

    return jsonRes({
      scenario, test_id: testPrefix, lead_id: leadId,
      summary: { total_steps: logs.length, passed, failed, result: failed === 0 ? "✅ PASS" : "⚠️ PARTIAL" },
      logs,
      final_state: {
        stage: finalLead?.stage, deal_value: finalLead?.deal_value,
        appointments: finalAppts?.length ?? 0, ai_actions: aiActions?.length ?? 0, violations: violations?.length ?? 0,
      },
    });
  } catch (err) {
    console.error("Funnel test error:", err);
    return jsonRes({ error: errStr(err) }, 500);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
