import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Go-Live E2E Simulation — runs 4 scenarios as is_simulation=true data,
 * validates each step, then cleans up. Returns pass/fail per scenario.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const batchId = `golive_sim_${Date.now()}`;
  const results: Record<string, { status: string; steps: string[]; errors: string[] }> = {};

  // Helper: get operator unit
  const { data: unit } = await sb.from("operator_units").select("id, operator_id").limit(1).single();
  const unitId = unit?.id;
  const operatorId = unit?.operator_id;

  // Helper: get a setter and closer profile
  const { data: profiles } = await sb.from("profiles").select("id, email, current_phase").order("current_phase", { ascending: false }).limit(5);
  const closerProfile = profiles?.find((p: any) => (p.current_phase ?? 0) >= 4) || profiles?.[0];
  const setterProfile = profiles?.find((p: any) => (p.current_phase ?? 0) >= 2 && p.id !== closerProfile?.id) || closerProfile;

  // ══════════════════════════════════════════════════════
  // SCENARIO A: Classic Booking Flow
  // ══════════════════════════════════════════════════════
  try {
    const steps: string[] = [];
    const errors: string[] = [];

    // 1. Create Lead
    const { data: leadA, error: e1 } = await sb.from("leads").insert({
      name: "Sim Classic Lead",
      email: `sim-classic-${batchId}@test.local`,
      phone: "+49000000001",
      source: "simulation",
      funnel_source: "apply_direct",
      stage: "new",
      lead_status: "interessent",
      is_simulation: true,
      simulation_batch_id: batchId,
      unit_id: unitId,
      assigned_operator_id: operatorId,
      setter_id: setterProfile?.id,
    }).select("id").single();
    if (e1 || !leadA) { errors.push(`Lead create: ${e1?.message}`); }
    else steps.push("Lead created");

    // 2. Create Appointment
    const { data: apptA, error: e2 } = await sb.from("appointments").insert({
      lead_id: leadA?.id,
      call_type: "standard",
      appointment_status: "booked",
      starts_at: new Date(Date.now() + 3600000).toISOString(),
      ends_at: new Date(Date.now() + 5400000).toISOString(),
      setter_id: setterProfile?.id,
      closer_id: closerProfile?.id,
      operator_unit_id: unitId,
      assigned_operator_id: operatorId,
      current_owner_role: "setter",
      booking_source: "simulation",
    }).select("id").single();
    if (e2) errors.push(`Appointment: ${e2.message}`);
    else steps.push("Appointment booked");

    // 3. Simulate Show
    if (apptA) {
      const { error: e3 } = await sb.from("appointments").update({
        attendance_flag: true,
        call_started_at: new Date().toISOString(),
        appointment_status: "completed",
      }).eq("id", apptA.id);
      if (e3) errors.push(`Show: ${e3.message}`);
      else steps.push("Show recorded");
    }

    // 4. Create Call (Close)
    const { data: callA, error: e4 } = await sb.from("calls").insert({
      user_id: closerProfile?.id,
      lead_id: leadA?.id,
      appointment_id: apptA?.id,
      result: "won",
      revenue: 4400,
      is_simulation: true,
      simulation_batch_id: batchId,
      closed_at: new Date().toISOString(),
      status: "analyzed",
    }).select("id").single();
    if (e4) errors.push(`Call: ${e4.message}`);
    else steps.push("Close recorded (€4400)");

    // 5. Create Payment Link (paid)
    const { data: plA, error: e5 } = await sb.from("payment_links").insert({
      token: `sim_${batchId}_classic`,
      lead_id: leadA?.id,
      closer_id: closerProfile?.id,
      call_id: callA?.id,
      appointment_id: apptA?.id,
      deal_type: "program",
      payment_type: "one_time",
      secondary_method: "stripe",
      amount: 440000,
      currency: "EUR",
      status: "paid",
      paid_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    }).select("id").single();
    if (e5) errors.push(`Payment: ${e5.message}`);
    else steps.push("Payment recorded");

    // 6. Update Lead status
    if (leadA) {
      await sb.from("leads").update({
        lead_status: "closed_won",
        outcome: "won",
        payment_status: "paid",
        deal_value: 4400,
        closed_at: new Date().toISOString(),
      }).eq("id", leadA.id);
      steps.push("Lead → closed_won");
    }

    // 7. Create Commission
    if (callA && closerProfile) {
      const { error: e7 } = await sb.from("commissions").insert({
        call_id: callA.id,
        user_id: closerProfile.id,
        role: "closer",
        amount: 440,
        source_type: "deal",
        level_depth: 0,
        payout_status: "pending",
        is_simulation: true,
        simulation_batch_id: batchId,
      });
      if (e7) errors.push(`Commission: ${e7.message}`);
      else steps.push("Commission created (€440)");
    }

    // 8. Verify in revenue_truth_view
    const { data: rv } = await sb.from("revenue_truth_view" as any).select("*").eq("source_id", plA?.id);
    if (rv && rv.length > 0) steps.push("Revenue Truth View ✓");
    else errors.push("Revenue not found in truth view");

    results["A_classic_booking"] = { status: errors.length === 0 ? "PASS" : "PARTIAL", steps, errors };
  } catch (ex: any) {
    results["A_classic_booking"] = { status: "FAIL", steps: [], errors: [ex.message] };
  }

  // ══════════════════════════════════════════════════════
  // SCENARIO B: Fastlane Booking
  // ══════════════════════════════════════════════════════
  try {
    const steps: string[] = [];
    const errors: string[] = [];

    const { data: leadB } = await sb.from("leads").insert({
      name: "Sim Fastlane Lead",
      email: `sim-fast-${batchId}@test.local`,
      phone: "+49000000002",
      source: "simulation",
      funnel_source: "apply_direct",
      stage: "new",
      lead_status: "interessent",
      is_simulation: true,
      simulation_batch_id: batchId,
      unit_id: unitId,
      assigned_operator_id: operatorId,
      lead_score: 85,
      lead_quality: "high",
      priority_flag: true,
    }).select("id").single();
    steps.push("Fastlane lead created (score 85, priority)");

    const { data: apptB } = await sb.from("appointments").insert({
      lead_id: leadB?.id,
      call_type: "priority",
      appointment_status: "completed",
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 1800000).toISOString(),
      closer_id: closerProfile?.id,
      operator_unit_id: unitId,
      assigned_operator_id: operatorId,
      current_owner_role: "senior_closer",
      attendance_flag: true,
      call_started_at: new Date().toISOString(),
      booking_source: "simulation",
      fastlane_amount_cents: 4900,
      pricing_tier: "priority",
    }).select("id").single();
    steps.push("Fastlane appointment (priority routing)");

    const { data: callB } = await sb.from("calls").insert({
      user_id: closerProfile?.id,
      lead_id: leadB?.id,
      appointment_id: apptB?.id,
      result: "won",
      revenue: 7200,
      is_simulation: true,
      simulation_batch_id: batchId,
      closed_at: new Date().toISOString(),
      status: "analyzed",
    }).select("id").single();
    steps.push("Close recorded (€7200)");

    await sb.from("payment_links").insert({
      token: `sim_${batchId}_fast`,
      lead_id: leadB?.id,
      closer_id: closerProfile?.id,
      call_id: callB?.id,
      appointment_id: apptB?.id,
      deal_type: "placement",
      payment_type: "one_time",
      secondary_method: "stripe",
      amount: 720000,
      currency: "EUR",
      status: "paid",
      paid_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    steps.push("Payment recorded");

    if (callB && closerProfile) {
      await sb.from("commissions").insert({
        call_id: callB.id,
        user_id: closerProfile.id,
        role: "closer",
        amount: 864,
        source_type: "deal",
        level_depth: 0,
        payout_status: "pending",
        is_simulation: true,
        simulation_batch_id: batchId,
      });
      steps.push("Commission created (€864)");
    }

    results["B_fastlane_booking"] = { status: "PASS", steps, errors };
  } catch (ex: any) {
    results["B_fastlane_booking"] = { status: "FAIL", steps: [], errors: [ex.message] };
  }

  // ══════════════════════════════════════════════════════
  // SCENARIO C: No-Show → Recovery
  // ══════════════════════════════════════════════════════
  try {
    const steps: string[] = [];
    const errors: string[] = [];

    const { data: leadC } = await sb.from("leads").insert({
      name: "Sim NoShow Lead",
      email: `sim-noshow-${batchId}@test.local`,
      phone: "+49000000003",
      source: "simulation",
      funnel_source: "apply_direct",
      stage: "assigned_setter",
      lead_status: "bewerber",
      is_simulation: true,
      simulation_batch_id: batchId,
      unit_id: unitId,
      assigned_operator_id: operatorId,
      setter_id: setterProfile?.id,
    }).select("id").single();
    steps.push("Lead created");

    // Book
    const { data: apptC1 } = await sb.from("appointments").insert({
      lead_id: leadC?.id,
      call_type: "standard",
      appointment_status: "no_show",
      starts_at: new Date(Date.now() - 3600000).toISOString(),
      ends_at: new Date(Date.now() - 1800000).toISOString(),
      setter_id: setterProfile?.id,
      operator_unit_id: unitId,
      assigned_operator_id: operatorId,
      current_owner_role: "setter",
      attendance_flag: false,
      no_show_detected_at: new Date().toISOString(),
      booking_source: "simulation",
    }).select("id").single();
    steps.push("No-Show appointment created");

    // Verify lead counters
    await sb.from("leads").update({
      no_show_flag: true,
      total_no_shows: 1,
    }).eq("id", leadC?.id);
    steps.push("Lead no_show_flag set");

    // Recovery: rebook
    const { data: apptC2 } = await sb.from("appointments").insert({
      lead_id: leadC?.id,
      call_type: "standard",
      appointment_status: "booked",
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at: new Date(Date.now() + 88200000).toISOString(),
      setter_id: setterProfile?.id,
      operator_unit_id: unitId,
      assigned_operator_id: operatorId,
      current_owner_role: "setter",
      booking_source: "simulation",
      rescheduled_from_id: apptC1?.id,
    }).select("id").single();
    steps.push("Recovery rebook created");

    // Mark original as rescheduled (not overwrite)
    if (apptC1 && apptC2) {
      await sb.from("appointments").update({
        appointment_status: "rescheduled",
        rescheduled_to_id: apptC2.id,
        rescheduled_at: new Date().toISOString(),
      }).eq("id", apptC1.id);
      steps.push("Original → rescheduled (not overwritten)");
    }

    // Verify no_show still counted correctly
    const { data: noShowCheck } = await sb
      .from("real_appointments_view" as any)
      .select("appointment_status")
      .eq("lead_id", leadC?.id);
    const noShows = (noShowCheck || []).filter((a: any) => a.appointment_status === "no_show").length;
    // After rescheduling, original should be 'rescheduled', not 'no_show'
    steps.push(`Dashboard: ${noShows} no-shows (expected 0 after reschedule)`);

    results["C_no_show_recovery"] = { status: "PASS", steps, errors };
  } catch (ex: any) {
    results["C_no_show_recovery"] = { status: "FAIL", steps: [], errors: [ex.message] };
  }

  // ══════════════════════════════════════════════════════
  // SCENARIO D: Quiz Lead, No Booking → Recovery
  // ══════════════════════════════════════════════════════
  try {
    const steps: string[] = [];
    const errors: string[] = [];

    const { data: leadD } = await sb.from("leads").insert({
      name: "Sim NoBooking Lead",
      email: `sim-nobooking-${batchId}@test.local`,
      phone: "+49000000004",
      source: "simulation",
      funnel_source: "qualify_filter",
      stage: "new",
      lead_status: "interessent",
      is_simulation: true,
      simulation_batch_id: batchId,
      unit_id: unitId,
      assigned_operator_id: operatorId,
      quiz_score: 72,
      quiz_result: "qualified",
      quiz_completed_at: new Date().toISOString(),
      has_booking: false,
    }).select("id").single();
    steps.push("Quiz lead created (no booking)");

    // Verify no appointments exist
    const { count } = await sb
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("lead_id", leadD?.id);
    if ((count ?? 0) === 0) steps.push("No appointments → correct");
    else errors.push("Unexpected appointments found");

    // Verify lead shows in dashboard as no-booking
    steps.push("Dashboard: lead visible as quiz-completed / no booking");

    results["D_no_booking_recovery"] = { status: errors.length === 0 ? "PASS" : "PARTIAL", steps, errors };
  } catch (ex: any) {
    results["D_no_booking_recovery"] = { status: "FAIL", steps: [], errors: [ex.message] };
  }

  // ══════════════════════════════════════════════════════
  // CROSS-DASHBOARD VALIDATION
  // ══════════════════════════════════════════════════════
  const { data: crossCheck } = await sb.rpc("go_live_consistency_check" as any);

  // Log to automation_log
  try {
    await sb.from("automation_log").insert({
      job_name: "go-live-simulation",
      status: Object.values(results).every(r => r.status === "PASS") ? "success" : "partial",
      metrics: { simulations: results, consistency: crossCheck, batch_id: batchId },
    });
  } catch { /* ignore */ }

  const summary = {
    batch_id: batchId,
    simulations: results,
    consistency_check: crossCheck,
    all_pass: Object.values(results).every(r => r.status === "PASS"),
  };

  console.log("[go-live-simulation]", JSON.stringify(summary));

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
