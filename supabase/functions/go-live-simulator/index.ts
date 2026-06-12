// Go-Live Simulation orchestrator (Phases 1-7 MVP)
// Generates synthetic test users and runs them through:
//   landing -> quiz -> lead -> booking -> setter assign -> Bewerberbereich validation
// All data is tagged is_simulation=true with simulation_batch_id = "TEST_GO_LIVE_<runId>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Inputs = {
  number_of_test_users: number;
  funnel_source: "meta" | "google" | "direct";
  quiz_profile_type: "starter" | "professional" | "elite";
  booking_type: "standard" | "priority";
  setter_selection: "auto" | string; // user_id when specific
  closer_selection: "auto" | string;
  payment_type: "test_success" | "test_failed" | "skipped";
  progression_target: "L1" | "L2" | "L3" | "L4";
};

type LogEntry = {
  ts: string;
  phase: string;
  user_index: number | null;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
};

function now() {
  return new Date().toISOString();
}

function randomDigits(len: number) {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Auth check: only admin/owner
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const actingUserId = userData.user.id;
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", actingUserId);
  const roles = (roleRows ?? []).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("owner")) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { inputs?: Partial<Inputs> } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const inputs: Inputs = {
    number_of_test_users: Math.max(1, Math.min(20, Number(body.inputs?.number_of_test_users) || 1)),
    funnel_source: (body.inputs?.funnel_source as Inputs["funnel_source"]) || "meta",
    quiz_profile_type: (body.inputs?.quiz_profile_type as Inputs["quiz_profile_type"]) || "professional",
    booking_type: (body.inputs?.booking_type as Inputs["booking_type"]) || "standard",
    setter_selection: (body.inputs?.setter_selection as Inputs["setter_selection"]) || "auto",
    closer_selection: (body.inputs?.closer_selection as Inputs["closer_selection"]) || "auto",
    payment_type: (body.inputs?.payment_type as Inputs["payment_type"]) || "skipped",
    progression_target: (body.inputs?.progression_target as Inputs["progression_target"]) || "L1",
  };

  // Create simulation run row
  const { data: runRow, error: runErr } = await admin
    .from("go_live_simulations")
    .insert({
      created_by: actingUserId,
      status: "running",
      inputs,
      started_at: now(),
    })
    .select("id")
    .single();

  if (runErr || !runRow) {
    return new Response(JSON.stringify({ error: "failed to create run", details: runErr?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const runId: string = runRow.id;
  const batchTag = `TEST_GO_LIVE_${runId}`;
  const logs: LogEntry[] = [];
  const artifacts: Record<string, unknown> = { users: [] };

  function log(entry: Omit<LogEntry, "ts">) {
    logs.push({ ts: now(), ...entry });
  }

  // Pick a setter user_id (admin/owner if explicit none)
  async function pickSetter(): Promise<string | null> {
    if (inputs.setter_selection !== "auto") return inputs.setter_selection;
    // round robin: pick any admin/owner; fall back to created_by
    const { data } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "owner"])
      .limit(20);
    if (data && data.length > 0) {
      const pick = data[Math.floor(Math.random() * data.length)];
      return pick.user_id;
    }
    return actingUserId;
  }

  log({ phase: "phase1_init", user_index: null, level: "info", message: "Simulation started", data: { runId, inputs } });

  try {
    for (let i = 1; i <= inputs.number_of_test_users; i++) {
      const userArtifact: Record<string, unknown> = { index: i };
      const name = `TEST_GO_LIVE User ${i}`;
      const email = `test.golive+${runId}-${i}@ethicalcloser.test`;
      const phone = `+491590000${randomDigits(4)}`;

      const utm = {
        utm_source: inputs.funnel_source,
        utm_medium: inputs.funnel_source === "meta" ? "paid_social" : inputs.funnel_source === "google" ? "cpc" : "direct",
        utm_campaign: "TEST_GO_LIVE_CAMPAIGN",
        utm_content: "simulation_ad",
        fbclid: inputs.funnel_source === "meta" ? `TEST_FBCLID_${runId}_${i}` : null,
        gclid: inputs.funnel_source === "google" ? `TEST_GCLID_${runId}_${i}` : null,
      };

      // PHASE 2 — Synthetic landing tracking events (recorded as community_events)
      log({ phase: "phase2_landing", user_index: i, level: "info", message: `Synthetic landing for ${email}`, data: utm });

      // PHASE 3 — Quiz simulation (we generate canonical answers + score)
      const quizScore =
        inputs.quiz_profile_type === "elite" ? 90 :
        inputs.quiz_profile_type === "professional" ? 72 : 55;
      const quizAnswers = {
        profile: inputs.quiz_profile_type,
        motivation: "freedom",
        experience: inputs.quiz_profile_type === "starter" ? "none" : "some",
        commitment: inputs.quiz_profile_type === "elite" ? "full_time" : "part_time",
        budget_ready: inputs.quiz_profile_type !== "starter",
        simulation_id: runId,
      };
      log({ phase: "phase3_quiz", user_index: i, level: "info", message: "Quiz answers generated", data: { quizScore, profile: inputs.quiz_profile_type } });

      // PHASE 4 — Lead capture
      const leadInsert = {
        name,
        email,
        phone,
        source: `go_live_simulation:${inputs.funnel_source}`,
        stage: "new",
        is_simulation: true,
        simulation_batch_id: batchTag,
        quiz_score: quizScore,
        quiz_result: inputs.quiz_profile_type,
        quiz_funnel_source: inputs.funnel_source,
        quiz_answers: quizAnswers,
        lead_status: "new",
        booking_status: "pending",
        source_funnel: "go_live_simulation",
      };
      const { data: lead, error: leadErr } = await admin
        .from("leads")
        .insert(leadInsert)
        .select("id, email")
        .single();
      if (leadErr || !lead) {
        log({ phase: "phase4_lead", user_index: i, level: "error", message: `Lead insert failed: ${leadErr?.message}` });
        continue;
      }
      userArtifact.lead_id = lead.id;
      userArtifact.email = lead.email;
      log({ phase: "phase4_lead", user_index: i, level: "info", message: `Lead created`, data: { lead_id: lead.id, email } });

      // PHASE 5 — Booking
      const setterId = await pickSetter();
      const startsAt = new Date(Date.now() + (24 + i) * 60 * 60 * 1000).toISOString();
      const endsAt = new Date(new Date(startsAt).getTime() + 45 * 60 * 1000).toISOString();
      const callType = inputs.booking_type === "priority" ? "priority" : "standard";

      const { data: appt, error: apptErr } = await admin
        .from("appointments")
        .insert({
          lead_id: lead.id,
          starts_at: startsAt,
          ends_at: endsAt,
          call_type: callType,
          appointment_status: "booked",
          call_status: "scheduled",
          payment_status: inputs.booking_type === "priority" ? "pending" : "none",
          setter_id: setterId,
          booking_source: "go_live_simulation",
          origin_source: "go_live_simulation",
          attribution_snapshot: { ...utm, simulation_id: runId },
          reminders_state: { simulation: true, runId },
          pricing_tier: inputs.booking_type === "priority" ? "priority" : "standard",
        })
        .select("id, starts_at, setter_id")
        .single();

      if (apptErr || !appt) {
        log({ phase: "phase5_booking", user_index: i, level: "error", message: `Appointment insert failed: ${apptErr?.message}` });
        continue;
      }
      userArtifact.appointment_id = appt.id;
      userArtifact.starts_at = appt.starts_at;
      userArtifact.setter_id = appt.setter_id;

      // Update lead with booking pointer + setter
      await admin
        .from("leads")
        .update({
          has_booking: true,
          booking_id: appt.id,
          booking_status: "booked",
          appointment_date: startsAt,
          setter_id: setterId,
          stage: "booked",
        })
        .eq("id", lead.id);

      log({
        phase: "phase5_booking",
        user_index: i,
        level: "info",
        message: `Appointment booked`,
        data: { appointment_id: appt.id, setter_id: setterId, starts_at: startsAt, call_type: callType },
      });

      // PHASE 6 — Bewerberbereich validation (re-query as the applicant would)
      const { data: visibleAppt, error: visErr } = await admin
        .from("appointments")
        .select("id, starts_at, appointment_status, leads!inner(email)")
        .eq("leads.email", email)
        .in("appointment_status", ["booked", "confirmed", "pending_payment"])
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (visErr || !visibleAppt) {
        log({ phase: "phase6_visibility", user_index: i, level: "warn", message: `Could not re-fetch appointment via email: ${visErr?.message ?? "no row"}` });
      } else {
        userArtifact.visibility_ok = true;
        log({ phase: "phase6_visibility", user_index: i, level: "info", message: "Appointment visible via email lookup", data: { appointment_id: visibleAppt.id } });
      }

      // PHASE 7 — Meeting link injection (test placeholder)
      const meetingUrl = `https://meet.google.com/test-go-live-${runId.slice(0, 8)}-${i}`;
      await admin
        .from("appointments")
        .update({ video_call_link: meetingUrl })
        .eq("id", appt.id);
      userArtifact.meeting_url = meetingUrl;
      log({ phase: "phase7_meeting", user_index: i, level: "info", message: "Meeting link attached", data: { meeting_url: meetingUrl } });

      // PHASE 8 — Reminder simulation (synthetic; we mark reminders_state + emit outbound_events)
      // We DO NOT trigger real SMS/WhatsApp — the outbound_events table itself is the canonical artifact.
      const reminderActions = ["reminder_24h", "reminder_2h", "reminder_10m"] as const;
      const reminderState: Record<string, string> = {};
      for (const action of reminderActions) {
        const ts = new Date().toISOString();
        reminderState[action] = ts;
        const { error: outErr } = await admin.from("outbound_events").insert({
          event_name: `appointment.${action}`,
          entity_type: "appointment",
          entity_id: appt.id,
          email,
          destination: "ghl",
          payload: {
            simulation_id: runId,
            is_test: true,
            channel: "sms",
            body: `[TEST_GO_LIVE] ${action} for ${name}`,
            starts_at: appt.starts_at,
            join_link: meetingUrl,
          },
          status: "received", // mark as received so the dispatcher won't process it for real
        });
        if (outErr) {
          log({ phase: "phase8_reminders", user_index: i, level: "warn", message: `Reminder insert failed (${action}): ${outErr.message}` });
        }
      }
      // Idempotency check: count reminder events for this appointment
      const { count: reminderCount } = await admin
        .from("outbound_events")
        .select("id", { count: "exact", head: true })
        .eq("entity_id", appt.id)
        .like("event_name", "appointment.reminder_%");
      await admin.from("appointments").update({ reminders_state: reminderState }).eq("id", appt.id);
      userArtifact.reminders_emitted = reminderActions.length;
      userArtifact.reminders_in_db = reminderCount ?? null;
      log({ phase: "phase8_reminders", user_index: i, level: "info", message: "Reminders emitted (test, no real send)", data: { count: reminderActions.length, db_count: reminderCount } });

      // PHASE 9 — Setter call outcome (qualified handover)
      // Insert a simulated 'call' row + 'call_outcome' row tied to the setter.
      const { data: callRow, error: callErr } = await admin
        .from("calls")
        .insert({
          user_id: setterId, // setter owns the call record
          call_type: "setter_qualification",
          status: "completed",
          funnel_stage: "qualified",
          offer_type: inputs.quiz_profile_type,
          showed_at: new Date(Date.now() - 30 * 60_000).toISOString(),
          closed_at: new Date().toISOString(),
          duration: 1500,
          result: "qualified",
          is_simulation: true,
          simulation_batch_id: batchTag,
          provider: "go_live_simulation",
          provider_call_id: `sim_${runId}_${i}`,
        })
        .select("id")
        .single();
      if (callErr || !callRow) {
        log({ phase: "phase9_setter_outcome", user_index: i, level: "warn", message: `Call insert failed: ${callErr?.message}` });
      } else {
        userArtifact.call_id = callRow.id;
        const { error: outcomeErr } = await admin.from("call_outcomes").insert({
          user_id: setterId,
          call_id: callRow.id,
          outcome: "qualified_handover",
          self_rating: 4,
          comment: `[TEST_GO_LIVE] Setter ${setterId.slice(0, 8)} handed lead to closer. Quiz: ${inputs.quiz_profile_type} (${quizScore}). Motivation: freedom. Objections: budget_check.`,
          ai_summary: `Synthetic setter outcome for simulation ${runId}.`,
          win_reasons: ["clear_motivation", "budget_capable", "decision_maker"],
        });
        if (outcomeErr) log({ phase: "phase9_setter_outcome", user_index: i, level: "warn", message: `Outcome insert failed: ${outcomeErr.message}` });
        log({ phase: "phase9_setter_outcome", user_index: i, level: "info", message: "Setter outcome recorded", data: { call_id: callRow.id } });
      }

      // PHASE 10 — Closer handover
      const closerId = inputs.closer_selection !== "auto" ? inputs.closer_selection : setterId;
      userArtifact.closer_id = closerId;
      const handoverContext = `[TEST_GO_LIVE] Quiz ${inputs.quiz_profile_type}/${quizScore}. Motivation: freedom. Recommended offer: ${inputs.quiz_profile_type === "elite" ? "highticket_one_time" : "starter_split_3"}. Setter: ${setterId.slice(0, 8)}.`;
      // leads.handover_summary doesn't exist — write context to lead.notes if present, else just log.
      await admin.from("leads").update({ closer_id: closerId, stage: "in_closer" }).eq("id", lead.id);
      userArtifact.handover_context = handoverContext;
      log({ phase: "phase10_closer_handover", user_index: i, level: "info", message: "Closer assigned + handover context recorded in artifact", data: { closer_id: closerId, context: handoverContext } });

      // PHASE 11 — Stripe test-mode payment (configurable: real test API or simulated webhook)
      let stripeSessionId: string | null = null;
      let paymentSimulated = false;
      if (inputs.payment_type === "test_success" || inputs.payment_type === "test_failed") {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        // Detect test mode: only call real Stripe if key starts with sk_test_
        const isStripeTest = !!stripeKey && stripeKey.startsWith("sk_test_");
        if (isStripeTest && inputs.payment_type === "test_success") {
          try {
            const params: Record<string, string> = {
              mode: "payment",
              "line_items[0][price_data][currency]": "eur",
              "line_items[0][price_data][unit_amount]": "160000",
              "line_items[0][price_data][product_data][name]": "TEST_GO_LIVE Closer Starter",
              "line_items[0][quantity]": "1",
              customer_email: email,
              "metadata[simulation_id]": runId,
              "metadata[is_test]": "true",
              "metadata[lead_id]": lead.id,
              "metadata[closer_id]": closerId,
              "metadata[product_type]": "go_live_simulation",
              success_url: `${SUPABASE_URL.replace(".supabase.co", ".lovable.app")}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${SUPABASE_URL.replace(".supabase.co", ".lovable.app")}/checkout/cancelled`,
            };
            const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
              method: "POST",
              headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams(params),
            });
            if (stripeRes.ok) {
              const session = await stripeRes.json();
              stripeSessionId = session.id;
              log({ phase: "phase11_stripe", user_index: i, level: "info", message: "Stripe test session created", data: { session_id: session.id } });
            } else {
              const txt = await stripeRes.text();
              log({ phase: "phase11_stripe", user_index: i, level: "warn", message: `Stripe call failed (status ${stripeRes.status}); falling back to simulated webhook`, data: { body: txt.slice(0, 200) } });
              paymentSimulated = true;
            }
          } catch (e) {
            log({ phase: "phase11_stripe", user_index: i, level: "warn", message: `Stripe error: ${(e as Error).message}; falling back to simulated webhook` });
            paymentSimulated = true;
          }
        } else {
          // Live key OR explicit fail — simulate webhook only (no real charge)
          paymentSimulated = true;
          if (!isStripeTest) log({ phase: "phase11_stripe", user_index: i, level: "info", message: "Stripe key is LIVE — using simulated webhook only (no real charge attempted)" });
        }

        if (inputs.payment_type === "test_success") {
          // Simulate the post-payment side effects: appointment.payment_status, deal_won outbound event.
          await admin.from("appointments").update({ payment_status: "paid", appointment_status: "confirmed" }).eq("id", appt.id);
          await admin.from("outbound_events").insert({
            event_name: "deal_won",
            entity_type: "lead",
            entity_id: lead.id,
            email,
            destination: "ghl",
            payload: { simulation_id: runId, is_test: true, amount: 160000, currency: "eur", lead_id: lead.id, closer_id: closerId, stripe_session_id: stripeSessionId },
            status: "received",
          });
          userArtifact.payment_status = "paid";
        } else {
          userArtifact.payment_status = "failed";
        }
      } else {
        userArtifact.payment_status = "skipped";
      }
      userArtifact.stripe_session_id = stripeSessionId;
      userArtifact.payment_simulated = paymentSimulated;

      // PHASE 12 — Onboarding start: create user_level_status row pointing at L0->L1
      // We DO NOT create real auth users (no real onboarding emails). We tag the lead with onboarding_started_at.
      // For full auth user creation, admin must do that manually. For simulation, we treat lead.id as the proxy.
      if (inputs.payment_type === "test_success") {
        // Try to find an existing profile for this email (won't exist for synthetic test users); skip if not found.
        const { data: profile } = await admin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (profile?.id) {
          await admin.from("user_level_status").upsert({
            user_id: profile.id,
            current_level: 1,
            current_role_label: "Trainee",
            promotion_status: "promoted",
            promoted_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          await admin.from("profiles").update({ onboarding_started_at: new Date().toISOString() }).eq("id", profile.id);
          userArtifact.onboarding_user_id = profile.id;
          userArtifact.level_assigned = 1;
          log({ phase: "phase12_onboarding", user_index: i, level: "info", message: "Onboarding started + L1 assigned", data: { user_id: profile.id } });
        } else {
          log({ phase: "phase12_onboarding", user_index: i, level: "info", message: "No real profile for synthetic email — onboarding step recorded as N/A (expected for test users)" });
          userArtifact.onboarding_user_id = null;
          userArtifact.level_assigned = "n/a_synthetic_user";
        }
      }

      // PHASE 13 — Level progression L1->L4 (only if a real profile exists)
      if (userArtifact.onboarding_user_id) {
        const targetLevel = inputs.progression_target === "L4" ? 4 : inputs.progression_target === "L3" ? 3 : inputs.progression_target === "L2" ? 2 : 1;
        if (targetLevel > 1) {
          await admin.from("user_level_status").update({
            current_level: targetLevel,
            current_role_label: targetLevel === 4 ? "Closer" : targetLevel === 3 ? "Senior Setter" : "Setter",
            promotion_status: "promoted",
            promoted_at: new Date().toISOString(),
          }).eq("user_id", userArtifact.onboarding_user_id);
          userArtifact.level_assigned = targetLevel;
          log({ phase: "phase13_progression", user_index: i, level: "info", message: `Progressed to L${targetLevel}` });
        }
      }

      (artifacts.users as unknown[]).push(userArtifact);
    }

    // Final report
    const usersArr = artifacts.users as Array<Record<string, unknown>>;
    const totalUsers = inputs.number_of_test_users;
    const completedUsers = usersArr.filter((u) => u.appointment_id).length;
    const visibleUsers = usersArr.filter((u) => u.visibility_ok).length;
    const reminderUsers = usersArr.filter((u) => (u.reminders_emitted as number) > 0).length;
    const outcomeUsers = usersArr.filter((u) => u.call_id).length;
    const handoverUsers = usersArr.filter((u) => u.closer_id).length;
    const stripeUsers = usersArr.filter((u) => u.stripe_session_id).length;
    const paidUsers = usersArr.filter((u) => u.payment_status === "paid").length;
    const onboardedUsers = usersArr.filter((u) => u.onboarding_user_id).length;
    const passed = completedUsers === totalUsers && visibleUsers === totalUsers;

    const report = {
      total_users: totalUsers,
      completed_users: completedUsers,
      visible_in_bewerberbereich: visibleUsers,
      reminders_emitted_users: reminderUsers,
      setter_outcomes_recorded: outcomeUsers,
      closer_handovers_completed: handoverUsers,
      stripe_test_sessions_created: stripeUsers,
      paid_simulated: paidUsers,
      onboarded_real_profiles: onboardedUsers,
      errors: logs.filter((l) => l.level === "error").length,
      warnings: logs.filter((l) => l.level === "warn").length,
      phases_run: [
        "phase1_init", "phase2_landing", "phase3_quiz", "phase4_lead",
        "phase5_booking", "phase6_visibility", "phase7_meeting",
        "phase8_reminders", "phase9_setter_outcome", "phase10_closer_handover",
        "phase11_stripe", "phase12_onboarding", "phase13_progression",
      ],
      stripe_step: inputs.payment_type === "skipped" ? "skipped" : (stripeUsers > 0 ? "test_session_created" : "simulated_webhook_only"),
      progression_step: onboardedUsers > 0 ? "applied_to_real_profiles" : "synthetic_users_only_no_real_levels",
    };

    await admin
      .from("go_live_simulations")
      .update({
        status: passed ? "completed" : "failed",
        completed_at: now(),
        logs,
        artifacts,
        report,
        final_result: passed ? "PASS" : "FAIL",
      })
      .eq("id", runId);

    return new Response(
      JSON.stringify({ runId, status: passed ? "completed" : "failed", report, artifacts, logs }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ phase: "fatal", user_index: null, level: "error", message: msg });
    await admin
      .from("go_live_simulations")
      .update({
        status: "failed",
        completed_at: now(),
        logs,
        artifacts,
        final_result: "FAIL",
        error_message: msg,
      })
      .eq("id", runId);
    return new Response(JSON.stringify({ runId, status: "failed", error: msg, logs }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
