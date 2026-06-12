// Layer 43 — Email Documentation Dispatcher
// Single chokepoint: maps lifecycle event → template → send-transactional-email
// Applies channel-separation guardrails BEFORE sending.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors'

interface DispatchRequest {
  event_name: string
  recipient_email: string
  related_lead_id?: string | null
  related_user_id?: string | null
  template_data?: Record<string, unknown>
  idempotency_key?: string
}

// Mirror of canonical-email-documentation.ts (kept in sync manually)
const TRIGGERS: Record<string, {
  template_name: string
  mandatory: boolean
  dedupe_with_messaging: boolean
  dedupe_window_minutes: number
}> = {
  account_created:             { template_name: 'applicant-access',         mandatory: true,  dedupe_with_messaging: false, dedupe_window_minutes: 0 },
  magic_link_access:           { template_name: 'applicant-access',         mandatory: true,  dedupe_with_messaging: false, dedupe_window_minutes: 0 },
  appointment_booked:          { template_name: 'booking-confirmation',     mandatory: true,  dedupe_with_messaging: false, dedupe_window_minutes: 0 },
  appointment_rescheduled:     { template_name: 'reschedule-confirmation',  mandatory: true,  dedupe_with_messaging: false, dedupe_window_minutes: 0 },
  appointment_cancelled:       { template_name: 'appointment-cancelled',    mandatory: true,  dedupe_with_messaging: false, dedupe_window_minutes: 0 },
  appointment_confirmed:       { template_name: 'appointment-reminder',     mandatory: false, dedupe_with_messaging: true,  dedupe_window_minutes: 30 },
  no_show_notification:        { template_name: 'no-show-recovery',         mandatory: false, dedupe_with_messaging: true,  dedupe_window_minutes: 60 },
  application_progress_update: { template_name: 'status-change',            mandatory: false, dedupe_with_messaging: true,  dedupe_window_minutes: 60 },
  onboarding_started:          { template_name: 'community-access-ready',   mandatory: true,  dedupe_with_messaging: false, dedupe_window_minutes: 0 },
  onboarding_completed:        { template_name: 'status-change',            mandatory: false, dedupe_with_messaging: false, dedupe_window_minutes: 0 },
  level_upgraded:              { template_name: 'status-change',            mandatory: false, dedupe_with_messaging: false, dedupe_window_minutes: 0 },
  successful_close:            { template_name: 'status-change',            mandatory: true,  dedupe_with_messaging: false, dedupe_window_minutes: 0 },
}

const MAX_PER_DAY = 6

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body: DispatchRequest = await req.json()
    const { event_name, recipient_email, related_lead_id, related_user_id, template_data, idempotency_key } = body

    if (!event_name || !recipient_email) {
      return json({ error: 'event_name and recipient_email required' }, 400)
    }

    const trigger = TRIGGERS[event_name]
    if (!trigger) return json({ error: `Unknown event: ${event_name}` }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Load settings
    const { data: settings } = await supabase
      .from('email_documentation_settings')
      .select('master_enabled, per_event')
      .eq('id', true)
      .maybeSingle()

    const masterEnabled = settings?.master_enabled ?? true
    const eventEnabled = (settings?.per_event as Record<string, boolean> | undefined)?.[event_name] ?? true

    // Daily cap check
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: emailsToday } = await supabase
      .from('email_documentation_log')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_email', recipient_email)
      .eq('decision', 'sent')
      .gte('created_at', since)

    // Messaging-channel dedupe (WhatsApp/SMS in window)
    let messagingInWindow = 0
    if (trigger.dedupe_with_messaging && related_lead_id) {
      const windowStart = new Date(Date.now() - trigger.dedupe_window_minutes * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('outbound_events')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', related_lead_id)
        .in('channel', ['whatsapp', 'sms'])
        .gte('created_at', windowStart)
      messagingInWindow = count ?? 0
    }

    // Decision
    const decision = decide({
      mandatory: trigger.mandatory,
      master_enabled: masterEnabled,
      event_enabled: eventEnabled,
      emails_today: emailsToday ?? 0,
      messaging_in_window: messagingInWindow,
      dedupe_with_messaging: trigger.dedupe_with_messaging,
    })

    if (!decision.send) {
      await supabase.from('email_documentation_log').insert({
        event_name,
        recipient_email,
        template_name: trigger.template_name,
        decision: 'suppressed',
        reason: decision.reason,
        related_lead_id: related_lead_id ?? null,
        related_user_id: related_user_id ?? null,
        metadata: { trigger },
      })
      return json({ status: 'suppressed', reason: decision.reason })
    }

    // Send via existing transactional pipeline
    const idem = idempotency_key ?? `email-doc-${event_name}-${related_lead_id ?? related_user_id ?? recipient_email}`

    const { data: sendData, error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: trigger.template_name,
        recipientEmail: recipient_email,
        idempotencyKey: idem,
        templateData: template_data ?? {},
      },
    })

    if (sendErr) {
      await supabase.from('email_documentation_log').insert({
        event_name,
        recipient_email,
        template_name: trigger.template_name,
        decision: 'error',
        reason: sendErr.message ?? 'invoke_failed',
        related_lead_id: related_lead_id ?? null,
        related_user_id: related_user_id ?? null,
        metadata: { error: sendErr },
      })
      return json({ status: 'error', error: sendErr.message }, 500)
    }

    await supabase.from('email_documentation_log').insert({
      event_name,
      recipient_email,
      template_name: trigger.template_name,
      decision: 'sent',
      reason: 'ok',
      message_id: idem,
      related_lead_id: related_lead_id ?? null,
      related_user_id: related_user_id ?? null,
      metadata: { send_response: sendData ?? null },
    })

    return json({ status: 'sent', template: trigger.template_name, idempotency_key: idem })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function decide(ctx: {
  mandatory: boolean
  master_enabled: boolean
  event_enabled: boolean
  emails_today: number
  messaging_in_window: number
  dedupe_with_messaging: boolean
}): { send: boolean; reason: string } {
  if (!ctx.master_enabled && !ctx.mandatory) return { send: false, reason: 'master_disabled' }
  if (!ctx.event_enabled && !ctx.mandatory) return { send: false, reason: 'event_disabled' }
  if (ctx.emails_today >= MAX_PER_DAY && !ctx.mandatory) return { send: false, reason: 'daily_cap_reached' }
  if (ctx.dedupe_with_messaging && ctx.messaging_in_window > 0 && !ctx.mandatory) {
    return { send: false, reason: 'duplicate_with_messaging' }
  }
  return { send: true, reason: 'ok' }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
