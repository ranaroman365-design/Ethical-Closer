/**
 * ═══════════════════════════════════════════════════════════════════════
 * WhatsApp Ping Edge Function — Phase 3
 * Layer 51 — Canonical Decision Engine Integration
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Sends initial WhatsApp ping + reminder cascade.
 * Tracks whatsapp_attempt_count. Marks unresponsive after ≥3 attempts + 2h.
 *
 * Does NOT block booking. Does NOT create parallel scoring.
 * Only updates raw fields that computeCanonicalDecision() reads.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ReminderStage = "initial" | "5min" | "30min" | "2h" | "mark_unresponsive";

interface PingRequest {
  lead_id: string;
  lead_name: string;
  lead_phone: string;
  reminder_stage?: ReminderStage;
}

const MESSAGES: Record<Exclude<ReminderStage, "mark_unresponsive">, string> = {
  initial:
    "Hey {name}, du hast dich gerade beworben. Antworte kurz mit JA, damit wir wissen, dass wir dich zuverlässig erreichen können. 🙌",
  "5min":
    "Kurze Bestätigung fehlt noch – bist du erreichbar? Antworte mit JA ✅",
  "30min":
    "Hey {name}, wir wollen sicherstellen, dass wir dich erreichen können. Ein kurzes JA reicht! 📱",
  "2h":
    "Ohne kurze Bestätigung können wir deinen Termin ggf. nicht halten. Antworte mit JA ⏳",
};

const EVENT_TYPES: Record<ReminderStage, string> = {
  initial: "WHATSAPP_PING_SENT",
  "5min": "WHATSAPP_REMINDER_SENT",
  "30min": "WHATSAPP_REMINDER_SENT",
  "2h": "WHATSAPP_REMINDER_SENT",
  mark_unresponsive: "WHATSAPP_UNRESPONSIVE",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: PingRequest = await req.json();
    const { lead_id, lead_name, lead_phone, reminder_stage = "initial" } = body;

    if (!lead_id || !lead_phone) {
      return new Response(
        JSON.stringify({ error: "lead_id and lead_phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch current lead state
    const { data: lead } = await supabase
      .from("leads")
      .select("whatsapp_confirmed, whatsapp_unresponsive, whatsapp_attempt_count, phone_valid")
      .eq("id", lead_id)
      .single();

    // Skip if already confirmed
    if (lead?.whatsapp_confirmed) {
      return new Response(
        JSON.stringify({ status: "already_confirmed", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gate: only send if phone_valid (initial only)
    if (reminder_stage === "initial" && lead?.phone_valid === false) {
      return new Response(
        JSON.stringify({ status: "phone_invalid", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentAttempts = lead?.whatsapp_attempt_count ?? 0;

    // FLOW 4: Mark unresponsive (attempt_count ≥ 3 + last attempt > 2h ago)
    if (reminder_stage === "mark_unresponsive") {
      if (!lead?.whatsapp_confirmed && currentAttempts >= 3) {
        await supabase
          .from("leads")
          .update({ whatsapp_unresponsive: true })
          .eq("id", lead_id);

        await supabase.from("event_logs").insert({
          lead_id,
          event_type: EVENT_TYPES.mark_unresponsive,
          metadata: { attempt_count: currentAttempts },
        });
      }

      return new Response(
        JSON.stringify({ status: "marked_unresponsive", attempt_count: currentAttempts }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build message
    const messageTemplate = MESSAGES[reminder_stage] ?? MESSAGES.initial;
    const message = messageTemplate.replace("{name}", lead_name || "");

    // TODO: Integrate with actual WhatsApp provider (Twilio/GHL)
    console.log(`[WhatsApp Ping] ${reminder_stage} → ${lead_phone}: ${message}`);

    // Update lead fields
    const newAttempts = currentAttempts + 1;
    const updates: Record<string, unknown> = {
      whatsapp_attempt_count: newAttempts,
    };

    if (reminder_stage === "initial") {
      updates.whatsapp_ping_sent = true;
      updates.whatsapp_ping_sent_at = new Date().toISOString();
    }

    await supabase.from("leads").update(updates).eq("id", lead_id);

    // Log event
    await supabase.from("event_logs").insert({
      lead_id,
      event_type: EVENT_TYPES[reminder_stage],
      metadata: {
        stage: reminder_stage,
        phone: lead_phone,
        attempt: newAttempts,
        delay: reminder_stage,
      },
    });

    return new Response(
      JSON.stringify({
        status: "sent",
        stage: reminder_stage,
        attempt_count: newAttempts,
        message_preview: message.substring(0, 50) + "...",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[WhatsApp Ping Error]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
