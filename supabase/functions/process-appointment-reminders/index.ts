// ═══════════════════════════════════════════════════════════════════════
// process-appointment-reminders — DISABLED (Communication Trigger Guard)
// ═══════════════════════════════════════════════════════════════════════
// This function previously sent email reminders (T-24h, T-3h, T-30min)
// via send-transactional-email. It has been DISABLED because
// process-appointment-sla already sends the canonical email reminder
// cascade (T-24h, T-2h, T-60min, T-10min) with proper dedup via
// lead_events.metadata.reminder_key.
//
// Keeping both active caused DUPLICATE email reminders for the same
// appointment at overlapping windows.
//
// SMS/WhatsApp reminders continue via dispatch-appointment-reminders
// (routed through dispatch-communication dedup layer).
//
// REMINDER_MODE: direct_only (Supabase-native, no GHL)
// ═══════════════════════════════════════════════════════════════════════

import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  console.info('[process-appointment-reminders] DISABLED — canonical reminders handled by process-appointment-sla cascade')

  return new Response(
    JSON.stringify({
      sent: 0,
      disabled: true,
      reason: 'Canonical email reminders now handled by process-appointment-sla. This function is a no-op to prevent duplicate sends.',
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
