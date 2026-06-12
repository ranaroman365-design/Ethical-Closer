/**
 * ═══════════════════════════════════════════════════════════════════════
 * WhatsApp Webhook Handler — Phase 3
 * Layer 51 — Canonical Decision Engine Integration
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Receives inbound WhatsApp replies. If the message matches a
 * confirmation pattern (ja/yes/ok/passt/bin da), sets:
 *   whatsapp_confirmed = true
 *   whatsapp_confirmed_at = now()
 *   whatsapp_last_inbound_at = now()
 *   whatsapp_unresponsive = false (clear)
 *
 * Does NOT compute priority/risk — that stays in the Decision Engine.
 * Only updates raw fields that computeCanonicalDecision() reads.
 * ═══════════════════════════════════════════════════════════════════════
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Confirmation patterns — case-insensitive, trimmed
const CONFIRM_PATTERNS = /^(ja|yes|ok|okay|passt|bin da|klar|sicher|jap|jo|yep|yup|y|j)$/i;

interface WebhookPayload {
  from: string;
  body: string;
  lead_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload: WebhookPayload = await req.json();
    const { from, body, lead_id } = payload;

    if (!from || !body) {
      return new Response(
        JSON.stringify({ error: "from and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date().toISOString();

    // Find lead by phone or direct ID
    let leadQuery = supabase
      .from("leads")
      .select("id, name, whatsapp_confirmed, whatsapp_ping_sent");

    if (lead_id) {
      leadQuery = leadQuery.eq("id", lead_id);
    } else {
      const normalizedPhone = from.replace(/[\s\-()]/g, "");
      leadQuery = leadQuery.or(
        `phone.eq.${normalizedPhone},phone_normalized.eq.${normalizedPhone}`
      );
    }

    const { data: leads, error: findError } = await leadQuery.limit(1);

    if (findError || !leads?.length) {
      console.warn(`[WhatsApp Webhook] No lead found for phone: ${from}`);
      return new Response(
        JSON.stringify({ status: "no_lead_found", phone: from }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lead = leads[0];
    const messageClean = body.trim();
    const isConfirmation = CONFIRM_PATTERNS.test(messageClean);

    // Always update last inbound timestamp
    const updates: Record<string, unknown> = {
      whatsapp_last_inbound_at: now,
      whatsapp_engaged: true,
    };

    if (isConfirmation && !lead.whatsapp_confirmed) {
      updates.whatsapp_confirmed = true;
      updates.whatsapp_confirmed_at = now;
      updates.whatsapp_unresponsive = false;

      // Log confirmation event
      await supabase.from("event_logs").insert({
        lead_id: lead.id,
        event_type: "WHATSAPP_CONFIRMED",
        metadata: { message: messageClean, phone: from },
      });

      // Emit canonical QualifiedReachableLead event
      await supabase.from("event_logs").insert({
        lead_id: lead.id,
        event_type: "QualifiedReachableLead",
        metadata: { trigger: "whatsapp_confirmed", phone: from },
      });

      console.log(`[WhatsApp Webhook] Lead ${lead.id} CONFIRMED via "${messageClean}"`);
    } else {
      await supabase.from("event_logs").insert({
        lead_id: lead.id,
        event_type: "whatsapp_reply",
        metadata: { message: messageClean, is_confirmation: false, phone: from },
      });

      console.log(`[WhatsApp Webhook] Lead ${lead.id} replied: "${messageClean}" (not confirmation)`);
    }

    await supabase.from("leads").update(updates).eq("id", lead.id);

    return new Response(
      JSON.stringify({
        status: "processed",
        lead_id: lead.id,
        confirmed: isConfirmation && !lead.whatsapp_confirmed,
        engaged: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[WhatsApp Webhook Error]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
