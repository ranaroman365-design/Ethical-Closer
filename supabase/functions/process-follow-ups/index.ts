import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * V6+V7 Automation Engine: Reminder, No-Show Recovery, Risk Scoring, Setter Alerts
 *
 * Actions:
 *  - process_due: Send due reminders from lead_reminders table
 *  - detect_no_shows: Flag appointments with no join click after 10min
 *  - calculate_risk: Predict no-show risk for upcoming appointments
 *  - setter_alerts: Alert setters about high-risk upcoming calls
 *  - all: Run all of the above
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "process_due";
    const results: Record<string, unknown> = {};

    // ─── 1. PROCESS DUE REMINDERS ───
    if (action === "process_due" || action === "all") {
      const now = new Date().toISOString();

      const { data: dueReminders } = await supabase
        .from("lead_reminders")
        .select("*, leads!inner(first_name, email, owner_id), appointments!inner(starts_at, video_call_link, setter_id, join_clicked_at)")
        .eq("status", "pending")
        .lte("scheduled_for", now)
        .order("scheduled_for", { ascending: true })
        .limit(50);

      const processed: { id: string; type: string; action: string }[] = [];

      for (const reminder of dueReminders || []) {
        // SMART TIMING: Skip if user already joined
        if (reminder.appointments?.join_clicked_at) {
          await supabase
            .from("lead_reminders")
            .update({ status: "skipped", cancelled_at: now })
            .eq("id", reminder.id);
          processed.push({ id: reminder.id, type: reminder.reminder_type, action: "skipped_joined" });
          continue;
        }

        // Skip if lead is closed
        const { data: lead } = await supabase
          .from("leads")
          .select("stage")
          .eq("id", reminder.lead_id)
          .single();

        if (lead && ["closed_won", "closed_lost", "cancelled", "converted_to_L1"].includes(lead.stage)) {
          await supabase
            .from("lead_reminders")
            .update({ status: "skipped", cancelled_at: now })
            .eq("id", reminder.id);
          processed.push({ id: reminder.id, type: reminder.reminder_type, action: "skipped_closed" });
          continue;
        }

        // Log event
        await supabase.from("lead_events").insert({
          lead_id: reminder.lead_id,
          event_type: `reminder_${reminder.reminder_type}`,
          notes: buildMessage(reminder),
          metadata: {
            reminder_id: reminder.id,
            reminder_type: reminder.reminder_type,
            channel: reminder.channel,
            appointment_id: reminder.appointment_id,
          },
        });

        // Queue for outbound (GHL / email)
        if (reminder.leads?.email) {
          await supabase.from("outbound_events").insert({
            event_name: `reminder_${reminder.reminder_type}`,
            entity_type: "lead",
            entity_id: reminder.lead_id,
            email: reminder.leads.email,
            payload: {
              event_name: `reminder_${reminder.reminder_type}`,
              email: reminder.leads.email,
              timestamp: now,
              metadata: {
                lead_name: reminder.leads.first_name,
                reminder_type: reminder.reminder_type,
                appointment_starts: reminder.appointments?.starts_at,
                meeting_link: reminder.appointments?.video_call_link,
                subject: getReminderSubject(reminder.reminder_type),
              },
            },
          });
        }

        // Mark sent
        await supabase
          .from("lead_reminders")
          .update({ status: "sent", sent_at: now })
          .eq("id", reminder.id);

        // Update lead tracking
        await supabase
          .from("leads")
          .update({ last_reminder_sent_at: now })
          .eq("id", reminder.lead_id);

        processed.push({ id: reminder.id, type: reminder.reminder_type, action: "sent" });
      }

      results.reminders_processed = processed.length;
      results.reminder_details = processed;
    }

    // ─── 2. DETECT NO-SHOWS ───
    if (action === "detect_no_shows" || action === "all") {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const { data: noShows } = await supabase
        .from("appointments")
        .select("id, lead_id, setter_id, starts_at")
        .eq("call_status", "scheduled")
        .eq("appointment_status", "confirmed")
        .is("join_clicked_at", null)
        .lt("starts_at", tenMinAgo)
        .limit(50);

      const detected: string[] = [];

      for (const apt of noShows || []) {
        // Mark no-show (triggers schedule_no_show_recovery via DB trigger)
        await supabase
          .from("appointments")
          .update({ call_status: "no_show", attendance_flag: false })
          .eq("id", apt.id);

        await supabase.from("lead_events").insert({
          lead_id: apt.lead_id,
          event_type: "no_show_detected",
          actor_user_id: apt.setter_id,
          notes: `Auto: No-Show erkannt — kein Join-Click nach ${new Date(apt.starts_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`,
          metadata: { appointment_id: apt.id, trigger: "auto_detect" },
        });

        // V6.1: emit canonical no_show event for the GHL dispatcher
        // (tag-only, no stage move — per ETC V6.1 spec).
        await supabase.from("outbound_events").insert({
          event_name: "no_show",
          entity_type: "lead",
          entity_id: apt.lead_id,
          payload: {
            source: "process_follow_ups.detect_no_shows",
            appointment_id: apt.id,
            setter_id: apt.setter_id,
            starts_at: apt.starts_at,
          },
          status: "pending",
        } as never);

        // Setter alert task
        if (apt.setter_id) {
          await supabase.from("daily_tasks").insert({
            user_id: apt.setter_id,
            role: "setter",
            task_type: "no_show_alert",
            task_title: "No-Show: Lead nicht erschienen",
            task_description: "Lead ist nicht zum Bewerbungsgespräch erschienen. Recovery-Flow wurde automatisch gestartet.",
            task_status: "pending",
            priority: 1,
            due_date: new Date().toISOString().split("T")[0],
            related_id: apt.lead_id,
            related_table: "leads",
          });
        }

        detected.push(apt.id);
      }

      results.no_shows_detected = detected.length;
    }

    // ─── 3. NO-SHOW RISK PREDICTION (V7) ───
    if (action === "calculate_risk" || action === "all") {
      const { data: upcoming } = await supabase
        .from("appointments")
        .select("id, lead_id, starts_at")
        .eq("appointment_status", "confirmed")
        .eq("call_status", "scheduled")
        .gt("starts_at", new Date().toISOString())
        .lt("starts_at", new Date(Date.now() + 48 * 3600000).toISOString())
        .limit(100);

      const risks: { appointment_id: string; score: number; tier: string }[] = [];

      for (const apt of upcoming || []) {
        const { data: ld } = await supabase
          .from("leads")
          .select("no_show_count, reschedule_count, lead_score, total_no_shows")
          .eq("id", apt.lead_id)
          .single();

        if (!ld) continue;

        let riskScore = 0;
        const signals: Record<string, number> = {};

        // Past no-shows (heaviest)
        const noShowHistory = (ld.no_show_count ?? 0) + (ld.total_no_shows ?? 0);
        signals.past_no_shows = Math.min(noShowHistory * 25, 50);
        riskScore += signals.past_no_shows;

        // Reschedules
        signals.reschedules = Math.min((ld.reschedule_count ?? 0) * 10, 20);
        riskScore += signals.reschedules;

        // Low lead score
        const ls = ld.lead_score ?? 50;
        signals.low_lead_score = ls < 40 ? 20 : ls < 60 ? 10 : 0;
        riskScore += signals.low_lead_score;

        // Time distance
        const hoursUntil = (new Date(apt.starts_at).getTime() - Date.now()) / 3600000;
        signals.time_distance = hoursUntil > 24 ? 10 : 0;
        riskScore += signals.time_distance;

        riskScore = Math.min(100, Math.max(0, riskScore));
        const tier = riskScore >= 70 ? "high" : riskScore >= 30 ? "medium" : "low";

        await supabase
          .from("no_show_risk_scores")
          .upsert({ lead_id: apt.lead_id, appointment_id: apt.id, risk_score: riskScore, risk_tier: tier, input_signals: signals }, { onConflict: "appointment_id" });

        await supabase.from("leads").update({ no_show_risk_score: riskScore }).eq("id", apt.lead_id);

        // HIGH RISK → extra 6h reminder
        if (tier === "high") {
          const sixHBefore = new Date(new Date(apt.starts_at).getTime() - 6 * 3600000);
          if (sixHBefore > new Date()) {
            const { data: existing } = await supabase
              .from("lead_reminders")
              .select("id")
              .eq("appointment_id", apt.id)
              .eq("reminder_type", "high_risk_6h")
              .eq("status", "pending")
              .limit(1);

            if (!existing || existing.length === 0) {
              await supabase.from("lead_reminders").insert({
                lead_id: apt.lead_id,
                appointment_id: apt.id,
                reminder_type: "high_risk_6h",
                channel: "email",
                scheduled_for: sixHBefore.toISOString(),
                message_key: "high_risk_confirmation",
              });
            }
          }
        }

        risks.push({ appointment_id: apt.id, score: riskScore, tier });
      }

      results.risks_calculated = risks.length;
      results.risk_distribution = {
        high: risks.filter(r => r.tier === "high").length,
        medium: risks.filter(r => r.tier === "medium").length,
        low: risks.filter(r => r.tier === "low").length,
      };
    }

    // ─── 4. SETTER ALERTS (V7) ───
    if (action === "setter_alerts" || action === "all") {
      const { data: highRisk } = await supabase
        .from("no_show_risk_scores")
        .select("*, appointments!inner(setter_id, starts_at, lead_id)")
        .eq("risk_tier", "high")
        .gt("appointments.starts_at", new Date().toISOString())
        .lt("appointments.starts_at", new Date(Date.now() + 24 * 3600000).toISOString())
        .limit(20);

      let alertCount = 0;
      for (const risk of highRisk || []) {
        if (!risk.appointments?.setter_id) continue;
        const today = new Date().toISOString().split("T")[0];
        const { data: existingTask } = await supabase
          .from("daily_tasks")
          .select("id")
          .eq("user_id", risk.appointments.setter_id)
          .eq("task_type", "high_risk_alert")
          .eq("due_date", today)
          .eq("related_id", risk.appointments.lead_id)
          .limit(1);

        if (!existingTask || existingTask.length === 0) {
          await supabase.from("daily_tasks").insert({
            user_id: risk.appointments.setter_id,
            role: "setter",
            task_type: "high_risk_alert",
            task_title: "⚠️ High Risk: No-Show Gefahr",
            task_description: `Lead hat hohes No-Show Risiko (Score: ${risk.risk_score}). Bitte persönlich bestätigen.`,
            task_status: "pending",
            priority: 1,
            due_date: today,
            related_id: risk.appointments.lead_id,
            related_table: "leads",
          });
          alertCount++;
        }
      }
      results.setter_alerts_sent = alertCount;
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Process follow-ups error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildMessage(reminder: any): string {
  const name = reminder.leads?.first_name || "Bewerber";
  const time = reminder.appointments?.starts_at
    ? new Date(reminder.appointments.starts_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" })
    : "";
  const msgs: Record<string, string> = {
    "24h": `${name}, dein Bewerbungsgespräch steht morgen an (${time}). Bereite dich vor!`,
    "2h": `${name}, dein Gespräch startet in 2 Stunden (${time}). Sei bereit!`,
    "15min": `${name}, dein Gespräch startet gleich! Geh jetzt in den Gesprächsraum.`,
    "pre_call_activation": `${name}, bereite dich kurz vor: ruhiger Ort, stabile Verbindung, 20–30 Min. Zeit.`,
    "recovery_1": `${name}, du hast dein Bewerbungsgespräch verpasst. Sichere dir jetzt einen neuen Termin.`,
    "recovery_2": `${name}, die besten Kandidaten sichern sich aktiv ihren Termin. Buche jetzt neu.`,
    "recovery_3": `${name}, letzte Chance deinen Platz im Bewerbungsprozess zu sichern.`,
    "high_risk_6h": `${name}, wir haben deinen Termin reserviert — bestätige kurz, dass du dabei bist.`,
  };
  return msgs[reminder.reminder_type] ?? `Reminder für ${name}`;
}

function getReminderSubject(type: string): string {
  const subjects: Record<string, string> = {
    "24h": "Morgen ist es soweit – bist du bereit?",
    "2h": "Dein Termin startet gleich 🔔",
    "15min": "Jetzt starten – dein Gespräch wartet!",
    "pre_call_activation": "So bereitest du dich optimal vor",
    "recovery_1": "Termin verpasst? Buche jetzt neu",
    "recovery_2": "Dein Platz wartet — jetzt sichern",
    "recovery_3": "Letzte Chance: Bewerbungsgespräch",
    "high_risk_6h": "Bitte bestätige deinen Termin",
  };
  return subjects[type] ?? "Erinnerung";
}