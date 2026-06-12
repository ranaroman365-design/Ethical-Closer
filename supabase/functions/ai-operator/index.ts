// AI Operator System — Full Automation Layer
// Event-driven decision engine + messaging agent + human handoff
// Processes: lead_created, no_response, booking_created, call_completed, no_show, deal_lost

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface OperatorEvent {
  event_type: string;
  lead_id: string;
  payload?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Load config
    const { data: configs } = await sb.from("ai_operator_config").select("*").limit(1);
    const config = configs?.[0];
    if (!config?.is_active) {
      return jsonRes({ message: "AI Operator is disabled", processed: 0 });
    }

    const body = await req.json();
    
    // Single event mode or batch scan mode
    if (body.event_type && body.lead_id) {
      const result = await processEvent(sb, config, body as OperatorEvent);
      return jsonRes(result);
    }

    // Batch scan: find leads needing action
    const results = await batchScan(sb, config);
    return jsonRes(results);
  } catch (err) {
    console.error("AI Operator error:", err);
    return jsonRes({ error: String(err) }, 500);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── CORE EVENT PROCESSOR ───

async function processEvent(sb: any, config: any, event: OperatorEvent) {
  const { event_type, lead_id, payload } = event;

  // Get lead context
  const { data: lead } = await sb.from("leads").select("*").eq("id", lead_id).maybeSingle();
  if (!lead) return { error: "Lead not found", lead_id };

  // Check if there's an active handoff — AI pauses
  const { count: activeHandoffs } = await sb
    .from("ai_operator_handoffs")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", lead_id)
    .in("status", ["pending", "accepted"]);

  if ((activeHandoffs ?? 0) > 0) {
    return logAction(sb, lead_id, event_type, "status_change", "none", null, lead.status, lead.status, "Paused: active human handoff exists", true);
  }

  // Check daily message limit
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { count: todayMessages } = await sb
    .from("ai_operator_actions")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", lead_id)
    .eq("action_type", "message_sent")
    .gte("created_at", todayStart.toISOString());

  const maxPerDay = config.safety_rules?.max_messages_per_lead_per_day ?? 5;
  if ((todayMessages ?? 0) >= maxPerDay) {
    return logAction(sb, lead_id, event_type, "status_change", "none", null, lead.status, lead.status, `Daily message limit (${maxPerDay}) reached`, true);
  }

  // Route by event type
  switch (event_type) {
    case "lead_created":
      return handleLeadCreated(sb, config, lead);
    case "no_response":
      return handleNoResponse(sb, config, lead);
    case "booking_created":
      return handleBookingCreated(sb, config, lead);
    case "no_show":
      return handleNoShow(sb, config, lead, payload);
    case "call_completed":
      return handleCallCompleted(sb, config, lead, payload);
    case "deal_lost":
      return handleDealLost(sb, config, lead, payload);
    default:
      return { error: `Unknown event: ${event_type}` };
  }
}

// ─── EVENT HANDLERS ───

async function handleLeadCreated(sb: any, config: any, lead: any) {
  const channel = selectChannel(config, lead);
  const message = await generateMessage(sb, "first_contact", lead, channel);

  // Dispatch via Layer 48
  const dispatched = await dispatchMessage(sb, lead, channel, message, "lead_created");

  return logAction(sb, lead.id, "lead_created", "message_sent", channel, message,
    lead.status, "contacted", `Auto first-contact via ${channel} within ${config.auto_contact_delay_seconds}s`, dispatched);
}

async function handleNoResponse(sb: any, config: any, lead: any) {
  // Determine how many follow-ups already sent
  const { count: followups } = await sb
    .from("ai_operator_actions")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", lead.id)
    .eq("event_type", "no_response");

  const followupCount = followups ?? 0;

  if (followupCount >= 3) {
    // After 3 attempts → handoff or mark unresponsive
    await createHandoff(sb, lead, "unresponsive_escalation", `Lead nicht erreichbar nach ${followupCount + 1} Versuchen`);
    return logAction(sb, lead.id, "no_response", "handoff", "none", null,
      lead.status, "unresponsive", `Handoff after ${followupCount + 1} failed contact attempts`, true);
  }

  // Switch channel on subsequent attempts
  const channels: string[] = config.channels_priority ?? ["whatsapp", "sms", "email"];
  const channel = channels[Math.min(followupCount, channels.length - 1)];
  const message = await generateMessage(sb, "follow_up", lead, channel, { attempt: followupCount + 1 });

  const dispatched = await dispatchMessage(sb, lead, channel, message, "no_response");
  return logAction(sb, lead.id, "no_response", followupCount > 0 ? "channel_switch" : "message_sent",
    channel, message, lead.status, lead.status, `Follow-up #${followupCount + 1} via ${channel}`, dispatched);
}

async function handleBookingCreated(sb: any, _config: any, lead: any) {
  const message = await generateMessage(sb, "booking_confirmation", lead, "whatsapp");
  await dispatchMessage(sb, lead, "whatsapp", message, "booking_created");

  return logAction(sb, lead.id, "booking_created", "message_sent", "whatsapp", message,
    lead.status, "booked", "Booking confirmation sent", true);
}

async function handleNoShow(sb: any, config: any, lead: any, payload: any) {
  const sequence = config.noshow_sequence as Array<{ delay_minutes: number; action: string; channel: string }>;
  const step = payload?.step ?? 0;

  if (step >= sequence.length) {
    await createHandoff(sb, lead, "unresponsive_escalation", "No-show: alle Recovery-Steps durchlaufen");
    return logAction(sb, lead.id, "no_show", "escalation", "none", null,
      lead.status, lead.status, "No-show recovery exhausted → escalation", true);
  }

  const current = sequence[step];
  const channel = current.channel ?? "whatsapp";

  if (current.action === "escalation") {
    await createHandoff(sb, lead, "unresponsive_escalation", `No-show Eskalation nach ${current.delay_minutes}min`);
    return logAction(sb, lead.id, "no_show", "escalation", channel, null,
      lead.status, lead.status, `No-show escalation step ${step + 1}`, true);
  }

  const contentType = current.action === "rebooking_offer" ? "rebooking" : "noshow_recovery";
  const message = await generateMessage(sb, contentType, lead, channel, { step });
  await dispatchMessage(sb, lead, channel, message, "no_show");

  const actionType = current.action === "rebooking_offer" ? "rebooking_offer" : "message_sent";
  return logAction(sb, lead.id, "no_show", actionType, channel, message,
    lead.status, "no_show", `No-show recovery step ${step + 1}: ${current.action}`, true);
}

async function handleCallCompleted(sb: any, config: any, lead: any, payload: any) {
  const outcome = payload?.outcome;

  if (outcome === "closed_won") {
    return logAction(sb, lead.id, "call_completed", "status_change", "none", null,
      lead.status, "closed", "Deal closed — AI steps back", true);
  }

  // No-close → start follow-up sequence
  if (outcome === "no_close") {
    const objectionType = payload?.objection_type ?? "general";
    const message = await generateMessage(sb, "noclose_followup", lead, "whatsapp", { objection_type: objectionType });
    await dispatchMessage(sb, lead, "whatsapp", message, "call_completed");

    // Create follow-up tasks for D2/D4/D7
    await createFollowUpTasks(sb, lead, config);

    return logAction(sb, lead.id, "call_completed", "message_sent", "whatsapp", message,
      lead.status, "no_close", `No-close follow-up initiated (objection: ${objectionType})`, true);
  }

  // Complex outcome → handoff
  await createHandoff(sb, lead, "complex_reply", `Call outcome: ${outcome}`);
  return logAction(sb, lead.id, "call_completed", "handoff", "none", null,
    lead.status, lead.status, `Complex call outcome → human handoff`, true);
}

async function handleDealLost(sb: any, _config: any, lead: any, payload: any) {
  const reason = payload?.reason ?? "unknown";
  const message = await generateMessage(sb, "deal_lost_followup", lead, "email", { reason });
  await dispatchMessage(sb, lead, "email", message, "deal_lost");

  return logAction(sb, lead.id, "deal_lost", "message_sent", "email", message,
    lead.status, "reactivation_pool", `Deal lost (${reason}) → reactivation pool + email follow-up`, true);
}

// ─── BATCH SCAN ───

async function batchScan(sb: any, config: any) {
  const results: Record<string, number> = { no_response: 0, overdue_tasks: 0 };

  // 1. Find leads without contact after delay
  const delayCutoff = new Date(Date.now() - (config.auto_contact_delay_seconds ?? 300) * 1000);
  const { data: newLeads } = await sb
    .from("leads")
    .select("id")
    .eq("status", "new")
    .lt("created_at", delayCutoff.toISOString())
    .limit(50);

  if (newLeads?.length) {
    for (const lead of newLeads) {
      // Check if already contacted by AI
      const { count } = await sb
        .from("ai_operator_actions")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id)
        .eq("event_type", "lead_created");

      if ((count ?? 0) === 0) {
        await processEvent(sb, config, { event_type: "lead_created", lead_id: lead.id });
        results.no_response++;
      }
    }
  }

  // 2. Find leads contacted but no response after 24h
  const responseCutoff = new Date(Date.now() - 24 * 3600000);
  const { data: contactedLeads } = await sb
    .from("leads")
    .select("id")
    .eq("status", "contacted")
    .lt("updated_at", responseCutoff.toISOString())
    .limit(50);

  if (contactedLeads?.length) {
    for (const lead of contactedLeads) {
      await processEvent(sb, config, { event_type: "no_response", lead_id: lead.id });
      results.no_response++;
    }
  }

  return { message: "Batch scan complete", results, timestamp: new Date().toISOString() };
}

// ─── HELPERS ───

function selectChannel(config: any, lead: any): string {
  const channels: string[] = config.channels_priority ?? ["whatsapp", "sms", "email"];
  // If lead has phone → WhatsApp/SMS, else email
  if (lead.phone && channels.includes("whatsapp")) return "whatsapp";
  if (lead.phone && channels.includes("sms")) return "sms";
  return "email";
}

async function generateMessage(sb: any, messageType: string, lead: any, channel: string, context?: any): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    // Fallback to template-based messages
    return getTemplateMessage(messageType, lead, context);
  }

  const systemPrompt = `Du bist ein professioneller Sales-Assistent der Ethical Top Closer Plattform.
Regeln:
- Keine falschen Versprechen
- Kein Druck
- Natürlicher, persönlicher Ton (nicht bot-like)
- Immer mit Vornamen ansprechen
- Kurz und prägnant (max 3 Sätze für WhatsApp/SMS, max 5 für Email)
- Kanal: ${channel}
- Sprache: Deutsch`;

  const userPrompt = `Erstelle eine ${messageType} Nachricht für:
Name: ${lead.first_name || lead.name || ""}
Status: ${lead.status || "new"}
Kanal: ${channel}
${context ? `Kontext: ${JSON.stringify(context)}` : ""}`;

  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      console.error("AI Gateway error:", resp.status);
      return getTemplateMessage(messageType, lead, context);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? getTemplateMessage(messageType, lead, context);
  } catch (err) {
    console.error("AI message generation failed:", err);
    return getTemplateMessage(messageType, lead, context);
  }
}

function getTemplateMessage(type: string, lead: any, context?: any): string {
  const name = lead.first_name || lead.name || "dort";
  const templates: Record<string, string> = {
    first_contact: `Hallo ${name}, vielen Dank für dein Interesse an der Ethical Top Closer Plattform! Wann passt es dir am besten für ein kurzes Gespräch?`,
    follow_up: `Hey ${name}, ich wollte nochmal kurz nachhaken — hast du schon einen passenden Termin gefunden? Wir freuen uns auf dich!`,
    booking_confirmation: `Super, ${name}! Dein Termin ist bestätigt. Wir freuen uns darauf, mit dir zu sprechen. Bis dann!`,
    noshow_recovery: `Hey ${name}, wir haben dich leider verpasst. Kein Problem — sollen wir einen neuen Termin finden?`,
    rebooking: `${name}, manchmal kommt etwas dazwischen. Hier kannst du dir ganz einfach einen neuen Termin sichern.`,
    noclose_followup: `Hallo ${name}, danke für das Gespräch! Ich habe dir noch eine Info zusammengestellt, die deine Fragen beantworten könnte.`,
    deal_lost_followup: `Hallo ${name}, schade, dass es aktuell nicht gepasst hat. Falls sich etwas ändert — wir sind jederzeit für dich da.`,
  };
  return templates[type] ?? templates.first_contact;
}

async function dispatchMessage(sb: any, lead: any, channel: string, message: string, eventKey: string): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const resp = await fetch(`${supabaseUrl}/functions/v1/dispatch-communication`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_key: `ai_operator.${eventKey}`,
        lead_id: lead.id,
        recipient_phone: lead.phone,
        recipient_email: lead.email,
        channel_override: channel,
        body_override: message,
      }),
    });

    return resp.ok;
  } catch (err) {
    console.error("Dispatch failed:", err);
    return false;
  }
}

async function createHandoff(sb: any, lead: any, reason: string, summary: string) {
  await sb.from("ai_operator_handoffs").insert({
    lead_id: lead.id,
    operator_id: lead.user_id,
    reason,
    ai_summary: summary,
  });
}

async function createFollowUpTasks(sb: any, lead: any, config: any) {
  const sequence = config.noclose_sequence as Array<{ delay_hours: number; action: string }>;
  for (const step of sequence) {
    const dueAt = new Date(Date.now() + step.delay_hours * 3600000);
    await sb.from("call_tasks").insert({
      lead_id: lead.id,
      assigned_to: lead.user_id,
      stage: `ai_noclose_${step.action}`,
      status: "pending",
      due_at: dueAt.toISOString(),
      notes: `AI Operator: ${step.action} follow-up`,
    }).onConflict("id");
  }
}

async function logAction(
  sb: any, leadId: string, eventType: string, actionType: string,
  channel: string, message: string | null, statusBefore: string,
  statusAfter: string, reasoning: string, success: boolean
) {
  const { error } = await sb.from("ai_operator_actions").insert({
    lead_id: leadId,
    event_type: eventType,
    action_type: actionType,
    channel,
    message_content: message,
    lead_status_before: statusBefore,
    lead_status_after: statusAfter,
    decision_reasoning: reasoning,
    success,
  });

  if (error) console.error("Failed to log action:", error);
  return { lead_id: leadId, event_type: eventType, action_type: actionType, success, reasoning };
}
