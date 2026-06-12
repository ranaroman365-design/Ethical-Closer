import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Owner override — always receive all notifications
const OWNER_OVERRIDE_EMAILS = [
  "jq.diaz@iCloud.com",
  "mmagnet888@web.de",
];

/**
 * process-appointment-sla
 * Runs on a schedule (every 5 min). Checks for:
 * - Unacknowledged appointments past SLA (60min standard, 15min priority)
 * - Sends setter T-30min reminders before calls
 * - Sends lead T-60min reminders before calls
 * - Escalates SLA breaches with email to owner
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const nowISO = now.toISOString();
    const results: string[] = [];

    // ─── 1. SLA CHECK: Unacknowledged appointments ───
    const { data: unackedAppointments } = await supabase
      .from("appointments")
      .select("id, lead_id, setter_id, call_type, created_at, starts_at")
      .eq("appointment_status", "booked")
      .is("acknowledged_at", null)
      .not("setter_id", "is", null);

    for (const apt of unackedAppointments ?? []) {
      const createdAt = new Date(apt.created_at);
      const slaMinutes = apt.call_type === "priority" ? 15 : 60;
      const slaDeadline = new Date(createdAt.getTime() + slaMinutes * 60000);

      if (now > slaDeadline) {
        results.push(`SLA breach: appointment ${apt.id} (${apt.call_type})`);

        const escalationKey = `sla_breach_${apt.id}`;
        const { data: existingEsc } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", apt.lead_id)
          .eq("event_type", "sla_escalation_triggered")
          .contains("metadata", { escalation_key: escalationKey })
          .limit(1);

        if (!existingEsc || existingEsc.length === 0) {
          await supabase.from("lead_events").insert({
            lead_id: apt.lead_id,
            event_type: "sla_breach",
            notes: `${apt.call_type} SLA breached: setter did not acknowledge within ${slaMinutes}min`,
            metadata: { appointment_id: apt.id, setter_id: apt.setter_id, sla_minutes: slaMinutes },
          });

          await supabase
            .from("leads")
            .update({
              next_action_type: "at_risk_unacknowledged",
              next_action_at: nowISO,
              updated_at: nowISO,
            })
            .eq("id", apt.lead_id);

          const { data: lead } = await supabase
            .from("leads")
            .select("name")
            .eq("id", apt.lead_id)
            .maybeSingle();

          const { data: setterProfile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", apt.setter_id)
            .maybeSingle();

          let appointmentDate = "";
          let appointmentTime = "";
          if (apt.starts_at) {
            const d = new Date(apt.starts_at);
            appointmentDate = d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
            appointmentTime = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
          }

          const callLabel = apt.call_type === "priority" ? "Priority Strategiegespräch" : "Strategiegespräch";
          const escalationData = {
            setterName: setterProfile?.full_name || "Unbekannt",
            leadName: lead?.name || "Lead",
            callType: callLabel,
            slaMinutes,
            appointmentDate,
            appointmentTime,
          };

          for (const ownerEmail of OWNER_OVERRIDE_EMAILS) {
            try {
              await supabase.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "sla-escalation",
                  recipientEmail: ownerEmail,
                  idempotencyKey: `sla-esc-${apt.id}-${ownerEmail.replace(/[^a-z0-9]/gi, "")}`,
                  templateData: escalationData,
                },
              });
            } catch (e) {
              console.error(`SLA escalation email to ${ownerEmail} failed:`, e);
            }
          }

          if (setterProfile?.email) {
            try {
              await supabase.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "setter-assigned",
                  recipientEmail: setterProfile.email,
                  idempotencyKey: `sla-renotify-${apt.id}`,
                  templateData: {
                    setterName: `⚠️ DRINGEND: ${setterProfile.full_name}`,
                    leadName: lead?.name || "Lead",
                    appointmentDate,
                    appointmentTime,
                    callType: callLabel,
                  },
                },
              });
            } catch (e) {
              console.error("SLA re-notification failed:", e);
            }
          }

          await supabase.from("lead_events").insert({
            lead_id: apt.lead_id,
            event_type: "sla_escalation_triggered",
            notes: `SLA escalation sent to owner + setter re-notified`,
            metadata: { appointment_id: apt.id, escalation_key: escalationKey, setter_id: apt.setter_id, sla_minutes: slaMinutes },
          });

          try {
            const assignUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/assign-booked-lead`;
            const res = await fetch(assignUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                lead_id: apt.lead_id,
                appointment_id: apt.id,
                call_type: apt.call_type,
              }),
            });
            const reassignResult = await res.json();
            if (reassignResult.success) {
              results.push(`Reassigned appointment ${apt.id} to ${reassignResult.setter_id}`);
              await supabase.from("lead_events").insert({
                lead_id: apt.lead_id,
                event_type: "setter_reassigned",
                notes: `Reassigned due to SLA breach to ${reassignResult.setter_name}`,
                metadata: { appointment_id: apt.id, old_setter: apt.setter_id, new_setter: reassignResult.setter_id },
              });
            }
          } catch (e) {
            console.error("Reassignment failed:", e);
          }
        }
      }
    }

    // ─── 2. SETTER REMINDERS: T-30min before call ───
    const { data: upcomingForSetter } = await supabase
      .from("appointments")
      .select("id, lead_id, setter_id, starts_at, call_type")
      .in("appointment_status", ["booked", "confirmed"])
      .not("setter_id", "is", null)
      .gt("starts_at", nowISO)
      .order("starts_at", { ascending: true })
      .limit(100);

    for (const apt of upcomingForSetter ?? []) {
      const startsAt = new Date(apt.starts_at);
      const minutesUntil = (startsAt.getTime() - now.getTime()) / 60000;

      // T-30min setter reminder (window: 25–35 min before)
      if (minutesUntil >= 25 && minutesUntil <= 35) {
        const reminderKey = `setter_reminder_${apt.id}_T-30min`;
        const { data: existing } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", apt.lead_id)
          .eq("event_type", "setter_30min_reminder_sent")
          .contains("metadata", { reminder_key: reminderKey })
          .limit(1);

        if (!existing || existing.length === 0) {
          const { data: lead } = await supabase
            .from("leads")
            .select("name")
            .eq("id", apt.lead_id)
            .maybeSingle();

          const { data: setterProfile } = await supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", apt.setter_id)
            .maybeSingle();

          const timeStr = startsAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
          const callLabel = apt.call_type === "priority" ? "Priority Strategiegespräch" : "Strategiegespräch";

          if (setterProfile?.email) {
            try {
              await supabase.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "setter-reminder",
                  recipientEmail: setterProfile.email,
                  idempotencyKey: `setter-rem30-${apt.id}`,
                  templateData: {
                    setterName: setterProfile.full_name,
                    leadName: lead?.name || "Lead",
                    appointmentTime: timeStr,
                    callType: callLabel,
                  },
                },
              });
              results.push(`Setter T-30min reminder sent for appointment ${apt.id}`);
            } catch (e) {
              console.error(`Setter reminder email failed for ${apt.id}:`, e);
            }
          }

          for (const ownerEmail of OWNER_OVERRIDE_EMAILS) {
            try {
              await supabase.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "setter-reminder",
                  recipientEmail: ownerEmail,
                  idempotencyKey: `setter-rem30-${apt.id}-owner-${ownerEmail.replace(/[^a-z0-9]/gi, "")}`,
                  templateData: {
                    setterName: `[KOPIE] Setter: ${setterProfile?.full_name || "Unbekannt"}`,
                    leadName: lead?.name || "Lead",
                    appointmentTime: timeStr,
                    callType: callLabel,
                  },
                },
              });
            } catch (e) {
              console.error(`Owner reminder email to ${ownerEmail} failed:`, e);
            }
          }

          await supabase.from("lead_events").insert({
            lead_id: apt.lead_id,
            event_type: "setter_30min_reminder_sent",
            notes: `T-30min Setter-Reminder für ${apt.call_type} Call`,
            metadata: {
              appointment_id: apt.id,
              reminder_key: reminderKey,
              setter_id: apt.setter_id,
            },
          });
        }
      }
    }

    // ─── 3. LEAD REMINDERS: T-60min before call ───
    const { data: upcomingForLead } = await supabase
      .from("appointments")
      .select("id, lead_id, setter_id, starts_at, call_type")
      .in("appointment_status", ["booked", "confirmed"])
      .gt("starts_at", nowISO)
      .order("starts_at", { ascending: true })
      .limit(100);

    for (const apt of upcomingForLead ?? []) {
      const startsAt = new Date(apt.starts_at);
      const minutesUntil = (startsAt.getTime() - now.getTime()) / 60000;

      // T-60min lead reminder (window: 55–65 min before)
      if (minutesUntil >= 55 && minutesUntil <= 65) {
        const reminderKey = `lead_reminder_${apt.id}_T-60min`;
        const { data: existing } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", apt.lead_id)
          .eq("event_type", "lead_60min_reminder_sent")
          .contains("metadata", { reminder_key: reminderKey })
          .limit(1);

        if (!existing || existing.length === 0) {
          const { data: leadData } = await supabase
            .from("leads")
            .select("email, name")
            .eq("id", apt.lead_id)
            .maybeSingle();

          if (leadData?.email) {
             const dateStr = startsAt.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
             const timeStr = startsAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
            const callLabel = apt.call_type === "priority" ? "Priority Strategiegespräch" : "Strategiegespräch";

            try {
              await supabase.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "lead-reminder",
                  recipientEmail: leadData.email,
                  idempotencyKey: `lead-rem60-${apt.id}`,
                  templateData: {
                    name: leadData.name || undefined,
                    date: dateStr,
                    time: timeStr,
                    callType: callLabel,
                  },
                },
              });
              results.push(`Lead T-60min reminder sent for appointment ${apt.id}`);
            } catch (e) {
              console.error(`Lead reminder email failed for ${apt.id}:`, e);
              await supabase.from("lead_events").insert({
                lead_id: apt.lead_id,
                event_type: "notification_failed",
                notes: `Lead T-60min reminder email failed`,
                metadata: { appointment_id: apt.id, error: String(e) },
              });
            }
          }

          await supabase.from("lead_events").insert({
            lead_id: apt.lead_id,
            event_type: "lead_60min_reminder_sent",
            notes: `T-60min Lead-Reminder für ${apt.call_type} Call`,
            metadata: {
              appointment_id: apt.id,
              reminder_key: reminderKey,
            },
          });

          await supabase
            .from("leads")
            .update({
              next_action_type: "reminder_60min",
              next_action_at: apt.starts_at,
              updated_at: nowISO,
            })
            .eq("id", apt.lead_id);
        }
      }
    }

    // ─── 3b. LEAD REMINDER CASCADE: T-24h (clarity), T-2h (urgency), T-10min (activation) ───
    // P0 Booking→Show fix per ETC Execution Loop Canon v2 §6 Failure/Recovery
    // Each window is idempotent via lead_events.metadata.reminder_key.
    const cascadeWindows: Array<{
      label: string;
      template: string;
      eventType: string;
      keySuffix: string;
      minMinutes: number;
      maxMinutes: number;
    }> = [
      {
        label: "T-24h",
        template: "lead-reminder-24h",
        eventType: "lead_24h_reminder_sent",
        keySuffix: "T-24h",
        minMinutes: 23 * 60,
        maxMinutes: 25 * 60,
      },
      {
        label: "T-2h",
        template: "lead-reminder",
        eventType: "lead_2h_reminder_sent",
        keySuffix: "T-2h",
        minMinutes: 115,
        maxMinutes: 125,
      },
      {
        label: "T-10min",
        template: "lead-reminder-10min",
        eventType: "lead_10min_reminder_sent",
        keySuffix: "T-10min",
        minMinutes: 7,
        maxMinutes: 13,
      },
    ];

    const horizonHours = 26;
    const horizonISO = new Date(now.getTime() + horizonHours * 3600_000).toISOString();
    const { data: cascadeApts } = await supabase
      .from("appointments")
      .select("id, lead_id, setter_id, starts_at, call_type")
      .in("appointment_status", ["booked", "confirmed"])
      .gt("starts_at", nowISO)
      .lt("starts_at", horizonISO)
      .order("starts_at", { ascending: true })
      .limit(200);

    for (const apt of cascadeApts ?? []) {
      const startsAt = new Date(apt.starts_at);
      const minutesUntil = (startsAt.getTime() - now.getTime()) / 60000;

      for (const w of cascadeWindows) {
        if (minutesUntil < w.minMinutes || minutesUntil > w.maxMinutes) continue;

        const reminderKey = `lead_reminder_${apt.id}_${w.keySuffix}`;
        const { data: existing } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", apt.lead_id)
          .eq("event_type", w.eventType)
          .contains("metadata", { reminder_key: reminderKey })
          .limit(1);

        if (existing && existing.length > 0) continue;

        const { data: leadData } = await supabase
          .from("leads")
          .select("email, name")
          .eq("id", apt.lead_id)
          .maybeSingle();

        if (leadData?.email) {
           const dateStr = startsAt.toLocaleDateString("de-DE", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Europe/Berlin",
          });
          const timeStr = startsAt.toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Berlin",
          });
          const callLabel =
            apt.call_type === "priority" ? "Priority Strategiegespräch" : "Strategiegespräch";

          try {
            await supabase.functions.invoke("send-transactional-email", {
              body: {
                templateName: w.template,
                recipientEmail: leadData.email,
                idempotencyKey: `lead-rem-${w.keySuffix}-${apt.id}`,
                templateData: {
                  name: leadData.name || undefined,
                  date: dateStr,
                  time: timeStr,
                  callType: callLabel,
                },
              },
            });
            results.push(`Lead ${w.label} reminder sent for appointment ${apt.id}`);
          } catch (e) {
            console.error(`Lead ${w.label} reminder email failed for ${apt.id}:`, e);
            await supabase.from("lead_events").insert({
              lead_id: apt.lead_id,
              event_type: "notification_failed",
              notes: `Lead ${w.label} reminder email failed`,
              metadata: { appointment_id: apt.id, error: String(e), window: w.keySuffix },
            });
          }
        }

        await supabase.from("lead_events").insert({
          lead_id: apt.lead_id,
          event_type: w.eventType,
          notes: `${w.label} Lead-Reminder für ${apt.call_type} Call`,
          metadata: { appointment_id: apt.id, reminder_key: reminderKey, window: w.keySuffix },
        });
      }
    }

    // ─── 4. NO-SHOW DETECTION & RECOVERY ───
    // Find appointments that ended (starts_at + 15min in the past) but are still "booked"/"confirmed"
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60000).toISOString();
    const { data: possibleNoShows } = await supabase
      .from("appointments")
      .select("id, lead_id, setter_id, starts_at, call_type")
      .in("appointment_status", ["booked", "confirmed"])
      .lt("starts_at", fifteenMinAgo)
      .limit(50);

    for (const apt of possibleNoShows ?? []) {
      const noShowKey = `no_show_${apt.id}`;
      const { data: existingNoShow } = await supabase
        .from("lead_events")
        .select("id")
        .eq("lead_id", apt.lead_id)
        .eq("event_type", "no_show_detected")
        .contains("metadata", { no_show_key: noShowKey })
        .limit(1);

      if (existingNoShow && existingNoShow.length > 0) continue;

      // Mark appointment as no_show
      await supabase
        .from("appointments")
        .update({ appointment_status: "no_show", updated_at: nowISO })
        .eq("id", apt.id);

      // Log no_show event
      await supabase.from("lead_events").insert({
        lead_id: apt.lead_id,
        event_type: "no_show_detected",
        notes: `Lead did not show up for ${apt.call_type} call`,
        metadata: { appointment_id: apt.id, no_show_key: noShowKey, setter_id: apt.setter_id },
      });

      // V6.1: emit canonical no_show event for the GHL dispatcher
      // (tag `no_show`, no stage move — per ETC V6.1 spec).
      await supabase.from("outbound_events").insert({
        event_name: "no_show",
        entity_type: "lead",
        entity_id: apt.lead_id,
        payload: {
          source: "process_appointment_sla.no_show",
          appointment_id: apt.id,
          call_type: apt.call_type,
          setter_id: apt.setter_id,
        },
        status: "pending",
      } as never);

      results.push(`No-show detected: appointment ${apt.id}`);

      // Check reschedule eligibility
      const { data: leadData } = await supabase
        .from("leads")
        .select("email, name, reschedule_count")
        .eq("id", apt.lead_id)
        .maybeSingle();

      if (!leadData) continue;

      const canReschedule = (leadData.reschedule_count ?? 0) < 1;

      if (canReschedule && leadData.email) {
        // Build reschedule URL with email token
        const rescheduleUrl = `https://ethical-closing.lovable.app/booking?reschedule=true&email=${encodeURIComponent(leadData.email)}`;

        try {
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "no-show-recovery",
              recipientEmail: leadData.email,
              idempotencyKey: `noshow-recovery-${apt.id}`,
              templateData: {
                name: leadData.name || undefined,
                rescheduleUrl,
              },
            },
          });
          results.push(`No-show recovery email sent for appointment ${apt.id}`);

          await supabase.from("lead_events").insert({
            lead_id: apt.lead_id,
            event_type: "reschedule_offer_sent",
            notes: `Reschedule offer sent after no-show`,
            metadata: { appointment_id: apt.id },
          });
        } catch (e) {
          console.error(`No-show recovery email failed for ${apt.id}:`, e);
          await supabase.from("lead_events").insert({
            lead_id: apt.lead_id,
            event_type: "notification_failed",
            notes: `No-show recovery email failed`,
            metadata: { appointment_id: apt.id, error: String(e) },
          });
        }
      } else if (!canReschedule) {
        // Reschedule limit reached — mark lead
        await supabase
          .from("leads")
          .update({
            stage: "recycled",
            next_action_type: "reschedule_limit_reached",
            updated_at: nowISO,
          })
          .eq("id", apt.lead_id);

        await supabase.from("lead_events").insert({
          lead_id: apt.lead_id,
          event_type: "reschedule_limit_reached",
          notes: `Lead has used all reschedule attempts — marked as recycled`,
          metadata: { appointment_id: apt.id, reschedule_count: leadData.reschedule_count },
        });

        results.push(`Reschedule limit reached for lead ${apt.lead_id}`);
      }

      // Update lead stage to no_show
      if (canReschedule) {
        await supabase
          .from("leads")
          .update({
            next_action_type: "no_show_recovery",
            updated_at: nowISO,
          })
          .eq("id", apt.lead_id);
      }

      // Notify owners about no-show
      for (const ownerEmail of OWNER_OVERRIDE_EMAILS) {
        try {
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "sla-escalation",
              recipientEmail: ownerEmail,
              idempotencyKey: `noshow-owner-${apt.id}-${ownerEmail.replace(/[^a-z0-9]/gi, "")}`,
              templateData: {
                setterName: "System",
                leadName: leadData?.name || "Lead",
                callType: apt.call_type === "priority" ? "Priority Strategiegespräch" : "Strategiegespräch",
                slaMinutes: 0,
                appointmentDate: new Date(apt.starts_at).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }),
                appointmentTime: new Date(apt.starts_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }),
              },
            },
          });
        } catch (e) {
          console.error(`No-show owner notification failed:`, e);
        }
      }
    }

    // ─── 5. CANCELLED APPOINTMENT RECOVERY ───
    // Find recently cancelled appointments (within last 30 min) and send rebooking email
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60000).toISOString();
    const { data: cancelledApts } = await supabase
      .from("appointments")
      .select("id, lead_id, updated_at")
      .eq("appointment_status", "cancelled")
      .gt("updated_at", thirtyMinAgo)
      .limit(50);

    for (const apt of cancelledApts ?? []) {
      const cancelKey = `cancel_recovery_${apt.id}`;
      const { data: existingCancel } = await supabase
        .from("lead_events")
        .select("id")
        .eq("lead_id", apt.lead_id)
        .eq("event_type", "cancel_recovery_sent")
        .contains("metadata", { cancel_key: cancelKey })
        .limit(1);

      if (existingCancel && existingCancel.length > 0) continue;

      const { data: leadData } = await supabase
        .from("leads")
        .select("email, name")
        .eq("id", apt.lead_id)
        .maybeSingle();

      if (leadData?.email) {
        try {
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "appointment-cancelled",
              recipientEmail: leadData.email,
              idempotencyKey: `cancel-recovery-${apt.id}`,
              templateData: {
                name: leadData.name || undefined,
              },
            },
          });
          results.push(`Cancel recovery email sent for appointment ${apt.id}`);
        } catch (e) {
          console.error(`Cancel recovery email failed for ${apt.id}:`, e);
        }

        await supabase.from("lead_events").insert({
          lead_id: apt.lead_id,
          event_type: "cancel_recovery_sent",
          notes: `Rebooking offer sent after cancellation`,
          metadata: { appointment_id: apt.id, cancel_key: cancelKey },
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, details: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("process-appointment-sla error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
