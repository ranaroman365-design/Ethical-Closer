/**
 * WhatsApp Reminder Scheduler — Phase 3
 * Layer 51 — Canonical Decision Engine Integration
 *
 * Called by pg_cron or external scheduler.
 * Finds leads needing reminders and dispatches to whatsapp-ping.
 *
 * Reminder cascade:
 *   attempt 1 = initial (already sent on lead creation)
 *   attempt 2 = +5 min → reminder 1
 *   attempt 3 = +30 min → reminder 2
 *   attempt 4 = +2h → final reminder
 *   after 2h from last → mark_unresponsive
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Delay thresholds in minutes from whatsapp_ping_sent_at
const REMINDER_SCHEDULE = [
  { attempt: 2, delayMinutes: 5, stage: "5min" as const },
  { attempt: 3, delayMinutes: 30, stage: "30min" as const },
  { attempt: 4, delayMinutes: 120, stage: "2h" as const },
];

const UNRESPONSIVE_DELAY_MINUTES = 240; // 4h from initial ping

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();
    const results: Array<{ lead_id: string; action: string }> = [];

    // Find all leads with pending WhatsApp pings
    const { data: pendingLeads, error } = await supabase
      .from("leads")
      .select("id, name, phone, whatsapp_ping_sent_at, whatsapp_attempt_count")
      .eq("whatsapp_ping_sent", true)
      .eq("whatsapp_confirmed", false)
      .eq("whatsapp_unresponsive", false)
      .eq("phone_valid", true)
      .not("whatsapp_ping_sent_at", "is", null);

    if (error) throw error;
    if (!pendingLeads?.length) {
      return new Response(
        JSON.stringify({ status: "no_pending_leads", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    for (const lead of pendingLeads) {
      const sentAt = new Date(lead.whatsapp_ping_sent_at);
      const elapsedMinutes = (now.getTime() - sentAt.getTime()) / 60000;
      const attempts = lead.whatsapp_attempt_count ?? 1;

      // Check if should mark unresponsive
      if (attempts >= 4 && elapsedMinutes >= UNRESPONSIVE_DELAY_MINUTES) {
        await invokeWhatsAppPing(supabase, {
          lead_id: lead.id,
          lead_name: lead.name ?? "",
          lead_phone: lead.phone ?? "",
          reminder_stage: "mark_unresponsive",
        });
        results.push({ lead_id: lead.id, action: "marked_unresponsive" });
        continue;
      }

      // Find next reminder to send
      for (const reminder of REMINDER_SCHEDULE) {
        if (attempts < reminder.attempt && elapsedMinutes >= reminder.delayMinutes) {
          await invokeWhatsAppPing(supabase, {
            lead_id: lead.id,
            lead_name: lead.name ?? "",
            lead_phone: lead.phone ?? "",
            reminder_stage: reminder.stage,
          });
          results.push({ lead_id: lead.id, action: `reminder_${reminder.stage}` });
          break;
        }
      }
    }

    return new Response(
      JSON.stringify({ status: "completed", processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[WhatsApp Scheduler Error]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function invokeWhatsAppPing(
  supabase: ReturnType<typeof createClient>,
  payload: { lead_id: string; lead_name: string; lead_phone: string; reminder_stage: string },
) {
  const { error } = await supabase.functions.invoke("whatsapp-ping", {
    body: payload,
  });
  if (error) {
    console.error(`[Scheduler] Failed to invoke whatsapp-ping for ${payload.lead_id}:`, error);
  }
}
