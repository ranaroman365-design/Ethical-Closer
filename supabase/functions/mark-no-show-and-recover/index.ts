// Layer 27 — No-Show Recovery Engine (LIVE)
// 5-stage reschedule cadence:
//   Stage 1 (+5 min):  WhatsApp "wa.no_show.immediate" — low-pressure reschedule
//   Stage 2 (+2 h):    WhatsApp "wa.no_show.2h_reminder" — soft check-in
//   Stage 3 (+24 h):   WhatsApp "wa.no_show.24h_decision" + setter call task
//   Stage 4 (+24 h):   Email reschedule (parallel email-channel touch)
//   Stage 5 (+72 h):   Email final (close-or-reactivate) + SOP exit transition
//
// Triggered by automation-scheduler after no-show detection.
// Each stage is idempotent (checked via attendance_events dedup).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESCHEDULE_BASE = "https://ethicalcloser.de/booking?reschedule=true";

interface RecoveryRequest {
  appointment_id: string;
  /** Optional: skip to a specific stage (1|2|3). Default = 1. */
  stage?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body: RecoveryRequest = await req.json().catch(() => ({} as any));
    if (!body.appointment_id) {
      return respond(400, { error: "appointment_id required" });
    }

    // ── Fetch appointment + lead ──
    const { data: appt, error: apptErr } = await supabase
      .from("appointments")
      .select(
        "id, lead_id, setter_id, starts_at, appointment_status, no_show_detected_at, booking_timezone, original_local_date, original_local_time"
      )
      .eq("id", body.appointment_id)
      .maybeSingle();

    if (apptErr || !appt) {
      return respond(404, { error: "appointment_not_found" });
    }

    if (appt.appointment_status !== "no_show") {
      return respond(200, {
        ok: true,
        skipped: true,
        reason: "not_no_show",
        status: appt.appointment_status,
      });
    }

    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, email, phone")
      .eq("id", appt.lead_id)
      .maybeSingle();

    if (!lead?.phone && !lead?.email) {
      return respond(200, {
        ok: true,
        skipped: true,
        reason: "no_contact_info",
      });
    }

    const rescheduleLink = `${RESCHEDULE_BASE}&email=${encodeURIComponent(lead.email || "")}`;
    const firstName = lead.name?.split(" ")[0] ?? "";
    const stage = body.stage ?? 1;

    const results: Record<string, unknown> = { appointment_id: appt.id, stage };

    // ── Stage 1: +5 min — Immediate recovery WhatsApp ──
    if (stage <= 1) {
      const dedupKey = `no_show_immediate:${appt.id}`;
      if (await alreadySent(supabase, dedupKey)) {
        results.stage1 = "already_sent";
      } else {
        const dispatchResult = await dispatch(supabase, {
          event_key: "no_show_immediate",
          lead_id: lead.id,
          recipient_phone: lead.phone,
          template_key: "wa.no_show.immediate",
          payload: {
            name: firstName,
            reschedule_link: rescheduleLink,
            body: buildBody("immediate", firstName, rescheduleLink),
          },
        });
        results.stage1 = dispatchResult;
        await logEvent(supabase, appt.id, "no_show_recovery_stage_1", {
          dispatch: dispatchResult,
        });
      }
    }

    // ── Stage 2: +2h — Soft reminder ──
    if (stage <= 2 && stage >= 2) {
      const dedupKey = `no_show_2h_reminder:${appt.id}`;
      if (await alreadySent(supabase, dedupKey)) {
        results.stage2 = "already_sent";
      } else {
        const dispatchResult = await dispatch(supabase, {
          event_key: "no_show_2h_reminder",
          lead_id: lead.id,
          recipient_phone: lead.phone,
          template_key: "wa.no_show.2h_reminder",
          payload: {
            name: firstName,
            reschedule_link: rescheduleLink,
            body: buildBody("2h", firstName, rescheduleLink),
          },
        });
        results.stage2 = dispatchResult;
        await logEvent(supabase, appt.id, "no_show_recovery_stage_2", {
          dispatch: dispatchResult,
        });
      }
    }

    // ── Stage 3: +24h — Decision force + call task ──
    if (stage === 3) {
      const dedupKey = `no_show_24h_decision:${appt.id}`;
      if (await alreadySent(supabase, dedupKey)) {
        results.stage3 = "already_sent";
      } else {
        // 3a: Send decision-force WhatsApp
        const dispatchResult = await dispatch(supabase, {
          event_key: "no_show_24h_followup",
          lead_id: lead.id,
          recipient_phone: lead.phone,
          template_key: "wa.no_show.24h_decision",
          payload: {
            name: firstName,
            reschedule_link: rescheduleLink,
            body: buildBody("24h", firstName, rescheduleLink),
          },
        });
        results.stage3_wa = dispatchResult;

        // 3b: Create call task for setter
        if (appt.setter_id) {
          const { error: taskErr } = await supabase
            .from("follow_ups")
            .insert({
              user_id: appt.setter_id,
              lead_id: lead.id,
              type: "call_task",
              status: "pending",
              priority: "high",
              notes: `No-Show Recovery: ${firstName || lead.email} hat den Termin verpasst. Bitte anrufen und neuen Termin vereinbaren.`,
              due_at: new Date().toISOString(),
              metadata: {
                source: "no_show_recovery",
                appointment_id: appt.id,
                stage: 3,
              },
            } as never);
          results.stage3_task = taskErr
            ? { ok: false, error: taskErr.message }
            : { ok: true };
        }

        // 3c: Emit GHL outbound event for CRM tagging
        await supabase.from("outbound_events").insert({
          event_name: "no_show_recovery_24h",
          entity_type: "lead",
          entity_id: lead.id,
          payload: {
            source: "mark-no-show-and-recover",
            appointment_id: appt.id,
            setter_id: appt.setter_id,
            stage: 3,
          },
          status: "pending",
        } as never);

        await logEvent(supabase, appt.id, "no_show_recovery_stage_3", {
          dispatch: dispatchResult,
          task_created: !!appt.setter_id,
        });
      }
    }

    // ── Stage 4: +24h — Email reschedule (parallel to WA decision force) ──
    if (stage === 4 && lead.email) {
      const dedupKey = `no_show_24h_email:${appt.id}`;
      if (await alreadySent(supabase, dedupKey)) {
        results.stage4 = "already_sent";
      } else {
        const subject = `${firstName ? firstName + ", " : ""}neuer Termin in 60 Sekunden`;
        const body =
          `Hey ${firstName || "du"},\n\n` +
          `dein Termin gestern hat nicht geklappt — passiert.\n\n` +
          `Wenn du weiterhin willst, nimm dir einen neuen Slot. ` +
          `Wir reservieren dir noch diese Woche einen Platz:\n\n` +
          `→ ${rescheduleLink}\n\n` +
          `Ohne neuen Termin schließen wir die Akte in 48 Stunden.`;
        const dispatchResult = await dispatch(supabase, {
          event_key: "no_show_24h_email",
          lead_id: lead.id,
          recipient_email: lead.email,
          payload: {
            subject,
            body,
            text: body,
            channel: "email",
            reschedule_link: rescheduleLink,
          },
        });
        results.stage4 = dispatchResult;
        await logEvent(supabase, appt.id, "no_show_recovery_stage_4", {
          dispatch: dispatchResult,
        });
      }
    }

    // ── Stage 5: +72h — Final email (close-or-reactivate) ──
    if (stage === 5 && lead.email) {
      const dedupKey = `no_show_72h_final:${appt.id}`;
      if (await alreadySent(supabase, dedupKey)) {
        results.stage5 = "already_sent";
      } else {
        const subject = "Wir schließen deine Bewerbung";
        const body =
          `Hey ${firstName || "du"},\n\n` +
          `wir archivieren heute deine Bewerbung.\n\n` +
          `Falls das ein Missverständnis war — du kannst in 60 Sekunden ` +
          `einen neuen Termin nehmen:\n\n→ ${rescheduleLink}\n\n` +
          `Sonst gehen wir davon aus, dass das Timing aktuell nicht passt. ` +
          `Alles Gute auf deinem Weg.`;
        const dispatchResult = await dispatch(supabase, {
          event_key: "no_show_72h_final",
          lead_id: lead.id,
          recipient_email: lead.email,
          payload: {
            subject,
            body,
            text: body,
            channel: "email",
            reschedule_link: rescheduleLink,
          },
        });
        results.stage5 = dispatchResult;
        await logEvent(supabase, appt.id, "no_show_recovery_stage_5", {
          dispatch: dispatchResult,
        });

        // Move lead to UNRESPONSIVE state — canonical SOP exit transition
        try {
          await supabase.rpc("sop_apply_transition", {
            p_lead_id: lead.id,
            p_event: "lead_exited",
            p_meta: { source: "no_show_recovery_stage_5", appointment_id: appt.id },
          });
        } catch (e) {
          console.warn("[no-show stage5] sop_apply_transition failed", e);
        }
      }
    }

    return respond(200, { ok: true, ...results });
  } catch (e) {
    console.error("[no-show-recovery]", e);
    return respond(500, { ok: false, error: String(e) });
  }
});

// ── Helpers ──

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function dispatch(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) {
  try {
    const { data, error } = await supabase.functions.invoke(
      "dispatch-communication",
      { body: { ...payload, force: true } }
    );
    if (error)
      return { ok: false, error: error.message ?? "dispatch_error" };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function alreadySent(
  supabase: ReturnType<typeof createClient>,
  dedupKey: string
): Promise<boolean> {
  const { data } = await supabase
    .from("attendance_events")
    .select("id")
    .eq("event_type", dedupKey)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function logEvent(
  supabase: ReturnType<typeof createClient>,
  appointmentId: string,
  eventType: string,
  payload: Record<string, unknown>
) {
  await supabase.from("attendance_events").insert({
    event_type: eventType,
    appointment_id: appointmentId,
    payload,
  } as never);
}

function buildBody(
  stage: "immediate" | "2h" | "24h",
  name: string,
  link: string
): string {
  const n = name || "du";
  switch (stage) {
    case "immediate":
      return `Hey ${n},\n\nsieht aus, als hättest du es nicht geschafft.\n\nKein Problem — passiert.\n\nWenn du trotzdem weitergehen willst:\n→ ${link}`;
    case "2h":
      return `Hey ${n},\n\nkurzes Check-in.\n\nDein Gespräch ist noch verfügbar — wähle einfach einen neuen Termin:\n→ ${link}`;
    case "24h":
      return `Kurze Frage:\n\nWillst du dir das noch ansehen, oder soll ich das von meiner Seite schließen?\n\n→ ${link}`;
  }
}
