import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Owner override — always receive a copy of every setter assignment
const OWNER_OVERRIDE_EMAILS = [
  "jq.diaz@iCloud.com",
  "mmagnet888@web.de",
];

/**
 * assign-booked-lead
 * Called after a booking is created. Assigns a setter to the lead
 * using weighted capacity-based routing from setter_capacity table.
 * Then sends immediate email notifications to setter + owner overrides.
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

    const { lead_id, appointment_id, call_type } = await req.json();

    if (!lead_id || !appointment_id) {
      return new Response(JSON.stringify({ error: "lead_id and appointment_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // ─── 1. Get eligible setters from setter_capacity ───
    const { data: capacities } = await supabase
      .from("setter_capacity")
      .select("setter_id, max_daily_leads, priority_enabled, is_active")
      .eq("is_active", true);

    if (!capacities || capacities.length === 0) {
      // Fallback: use profiles-based setters (existing logic)
      const { data: profileSetters } = await supabase
        .from("profiles")
        .select("id, full_name, business_stage")
        .in("business_stage", ["setter", "associate_setter", "senior_associate", "senior_setter"]);

      if (!profileSetters || profileSetters.length === 0) {
        return new Response(JSON.stringify({ success: false, reason: "No setters available" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Simple round-robin fallback
      const setter = profileSetters[Math.floor(Math.random() * profileSetters.length)];
      await assignSetterToLead(supabase, lead_id, appointment_id, setter.id, setter.full_name, now, call_type);
      return new Response(JSON.stringify({ success: true, setter_id: setter.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter for priority-enabled if priority call
    let eligible = call_type === "priority"
      ? capacities.filter(c => c.priority_enabled)
      : capacities;

    if (eligible.length === 0) eligible = capacities; // fallback to all

    const setterIds = eligible.map(c => c.setter_id);

    // ─── 2. Get today's assignment counts per setter ───
    const { data: todayAppointments } = await supabase
      .from("appointments")
      .select("setter_id")
      .in("setter_id", setterIds)
      .gte("created_at", `${today}T00:00:00Z`)
      .not("appointment_status", "in", "(cancelled,superseded)");

    const todayCounts: Record<string, number> = {};
    for (const s of setterIds) todayCounts[s] = 0;
    for (const a of todayAppointments ?? []) {
      if (a.setter_id) todayCounts[a.setter_id] = (todayCounts[a.setter_id] || 0) + 1;
    }

    // ─── 3. Get setter KPIs for performance weighting ───
    const { data: kpis } = await supabase
      .from("member_kpis")
      .select("user_id, show_rate, handover_rate, qualification_accuracy, calls_handled, crm_hygiene_score")
      .in("user_id", setterIds);

    const kpiMap: Record<string, number> = {};
    for (const sid of setterIds) {
      const k = (kpis ?? []).find(x => x.user_id === sid);
      kpiMap[sid] = k
        ? Math.round(
            (k.show_rate ?? 0) * 0.30 +
            (k.handover_rate ?? 0) * 0.25 +
            (k.qualification_accuracy ?? 0) * 0.20 +
            Math.min((k.calls_handled ?? 0) / 20 * 100, 100) * 0.15 +
            (k.crm_hygiene_score ?? 0) * 0.10
          )
        : 50;
    }

    // ─── 4. Get active lead counts ───
    const { data: activeLeads } = await supabase
      .from("leads")
      .select("setter_id")
      .in("setter_id", setterIds)
      .not("stage", "in", "(closed_won,closed_lost,cancelled,recycled,returned_to_pool)");

    const activeCounts: Record<string, number> = {};
    for (const s of setterIds) activeCounts[s] = 0;
    for (const l of activeLeads ?? []) {
      if (l.setter_id) activeCounts[l.setter_id] = (activeCounts[l.setter_id] || 0) + 1;
    }

    // ─── 5. Weighted scoring ───
    const capMap: Record<string, number> = {};
    for (const c of eligible) capMap[c.setter_id] = c.max_daily_leads;

    type ScoredSetter = { id: string; score: number; available: boolean };
    const scored: ScoredSetter[] = setterIds.map(sid => {
      const maxDaily = capMap[sid] || 2;
      const todayCount = todayCounts[sid] || 0;
      const remaining = Math.max(0, maxDaily - todayCount);
      const available = remaining > 0;

      // Weighted score: capacity (40%) + performance (40%) + fairness (20%)
      const capacityScore = (remaining / maxDaily) * 100;
      const perfScore = kpiMap[sid] || 50;
      const fairnessScore = Math.max(0, 100 - (activeCounts[sid] || 0) * 10);

      const score = capacityScore * 0.40 + perfScore * 0.40 + fairnessScore * 0.20;
      return { id: sid, score, available };
    }).filter(s => s.available);

    if (scored.length === 0) {
      // All at capacity — log warning
      await supabase.from("lead_events").insert({
        lead_id,
        event_type: "setter_assignment_failed",
        notes: "All setters at daily capacity",
        metadata: { call_type, todayCounts },
      });
      return new Response(JSON.stringify({ success: false, reason: "All setters at capacity" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sort by score DESC, pick best
    scored.sort((a, b) => b.score - a.score);
    const bestSetter = scored[0];

    // Get setter name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", bestSetter.id)
      .maybeSingle();

    await assignSetterToLead(supabase, lead_id, appointment_id, bestSetter.id, profile?.full_name || bestSetter.id, now, call_type);

    return new Response(
      JSON.stringify({ success: true, setter_id: bestSetter.id, setter_name: profile?.full_name, score: bestSetter.score }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("assign-booked-lead error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function assignSetterToLead(
  supabase: any,
  leadId: string,
  appointmentId: string,
  setterId: string,
  setterName: string,
  now: string,
  callType?: string
) {
  // Update lead
  await supabase
    .from("leads")
    .update({
      setter_id: setterId,
      owner_id: setterId,
      owner_role: "setter",
      stage: "assigned_setter",
      has_booking: true,
      booking_status: "booking_verified",
      lead_status: "bewerber",
      updated_at: now,
    })
    .eq("id", leadId);

  // Update appointment
  await supabase
    .from("appointments")
    .update({
      setter_id: setterId,
      assigned_operator_id: setterId,
      current_owner_id: setterId,
      current_owner_role: "setter",
      original_owner_id: setterId,
      original_owner_role: "setter",
      updated_at: now,
    })
    .eq("id", appointmentId);

  // Canonical assignment record for ownership/audit consumers.
  const { data: existingLeadAssignment } = await supabase
    .from("lead_assignments")
    .select("id")
    .eq("lead_id", leadId)
    .eq("user_id", setterId)
    .eq("status", "assigned")
    .limit(1)
    .maybeSingle();
  if (!existingLeadAssignment) {
    const { error: leadAssignmentError } = await supabase.from("lead_assignments").insert({
      user_id: setterId,
      lead_id: leadId,
      status: "assigned",
      lead_type: callType || "booking",
      assignment_score: 0,
    });
    if (leadAssignmentError) console.warn("lead_assignments insert failed (non-blocking):", leadAssignmentError);
  }

  // Calendar synchronization audit: platform/team calendars read appointments;
  // calendar_events records the ownership mutation that made it visible.
  const { data: existingCalendarEvent } = await supabase
    .from("calendar_events")
    .select("id")
    .eq("appointment_id", appointmentId)
    .eq("event_type", "appointment_assigned")
    .eq("new_owner_id", setterId)
    .limit(1)
    .maybeSingle();
  if (!existingCalendarEvent) {
    const { error: calendarEventError } = await supabase.from("calendar_events").insert({
      event_type: "appointment_assigned",
      appointment_id: appointmentId,
      lead_id: leadId,
      previous_owner_id: null,
      new_owner_id: setterId,
      actor_user_id: setterId,
      reason: "post-booking capacity routing",
      action_source: "automation",
      metadata: { call_type: callType || null, setter_id: setterId, setter_name: setterName },
    });
    if (calendarEventError) console.warn("calendar_events insert failed (non-blocking):", calendarEventError);
  }

  // Log transition
  await supabase.from("lead_transitions").insert({
    lead_id: leadId,
    previous_stage: "booked",
    new_stage: "assigned_setter",
    changed_by: setterId,
    reason: `Auto-assigned to ${setterName} (post-booking capacity routing)`,
  });

  // Log event
  await supabase.from("lead_events").insert({
    lead_id: leadId,
    event_type: "setter_assigned",
    actor_user_id: setterId,
    notes: `Setter ${setterName} assigned after booking`,
    metadata: { appointment_id: appointmentId, setter_id: setterId },
  });

  // Audit log
  await supabase.from("audit_logs").insert({
    action: "booking_setter_assign",
    source_type: "automation",
    note: `Lead auto-assigned to setter ${setterName} after booking`,
    before_state: { stage: "booked", setter_id: null },
    after_state: { stage: "assigned_setter", setter_id: setterId },
  });

  // ─── NOTIFICATION: Send emails to setter + owner overrides ───
  await sendSetterNotifications(supabase, leadId, appointmentId, setterId, setterName, callType);
}

async function sendSetterNotifications(
  supabase: any,
  leadId: string,
  appointmentId: string,
  setterId: string,
  setterName: string,
  callType?: string
) {
  // Get lead data
  const { data: lead } = await supabase
    .from("leads")
    .select("name, email, source, funnel_source")
    .eq("id", leadId)
    .maybeSingle();

  // Get appointment data
  const { data: appointment } = await supabase
    .from("appointments")
    .select("starts_at, call_type")
    .eq("id", appointmentId)
    .maybeSingle();

  // Get setter email
  const { data: setterProfile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", setterId)
    .maybeSingle();

  const effectiveCallType = callType || appointment?.call_type || "standard";
  const callLabel = effectiveCallType === "priority" ? "Priority Strategiegespräch" : "Strategiegespräch";

  let appointmentDate = "";
  let appointmentTime = "";
  if (appointment?.starts_at) {
    const d = new Date(appointment.starts_at);
    appointmentDate = d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
    appointmentTime = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  }

  const templateData = {
    setterName,
    leadName: lead?.name || "Neuer Lead",
    appointmentDate,
    appointmentTime,
    callType: callLabel,
    funnelSource: lead?.funnel_source || lead?.source || undefined,
    leadWorkspaceUrl: "https://ethical-closing.lovable.app/members/setter",
  };

  const idempotencyBase = `setter-assigned-${appointmentId}`;

  // 1. Send to setter
  if (setterProfile?.email) {
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "setter-assigned",
          recipientEmail: setterProfile.email,
          idempotencyKey: `${idempotencyBase}-setter`,
          templateData,
        },
      });
      await supabase.from("lead_events").insert({
        lead_id: leadId,
        event_type: "setter_notification_sent",
        notes: `E-Mail an Setter ${setterName} (${setterProfile.email}) gesendet`,
        metadata: { appointment_id: appointmentId, channel: "email", recipient: "setter" },
      });
    } catch (e) {
      console.error("Setter notification email failed:", e);
      await supabase.from("lead_events").insert({
        lead_id: leadId,
        event_type: "setter_notification_failed",
        notes: `E-Mail an Setter fehlgeschlagen: ${e.message}`,
        metadata: { appointment_id: appointmentId, channel: "email", recipient: "setter", error: e.message },
      });
    }
  } else {
    // No setter email — log failure
    await supabase.from("lead_events").insert({
      lead_id: leadId,
      event_type: "setter_notification_failed",
      notes: `Setter ${setterName} hat keine E-Mail-Adresse`,
      metadata: { appointment_id: appointmentId, channel: "email", recipient: "setter" },
    });
  }

  // 2. Owner override — always send copies (with isOwnerCopy flag for differentiated subject + layout)
  for (const ownerEmail of OWNER_OVERRIDE_EMAILS) {
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "setter-assigned",
          recipientEmail: ownerEmail,
          idempotencyKey: `${idempotencyBase}-owner-${ownerEmail.replace(/[^a-z0-9]/gi, "")}`,
          templateData: {
            ...templateData,
            isOwnerCopy: true,
          },
        },
      });
    } catch (e) {
      console.error(`Owner override email to ${ownerEmail} failed:`, e);
    }
  }
}
