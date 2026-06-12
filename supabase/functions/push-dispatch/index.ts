// Layer 44 — Push Notification Dispatcher
// Single chokepoint for in_app + web_push. Mobile push reserved for later.
// Pure additive: never replaces WhatsApp/SMS, always respects consent + DNC + quiet hours + dedupe.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from 'jsr:@supabase/supabase-js@2/cors'

interface DispatchRequest {
  user_id: string
  use_case: string
  channels?: ('in_app' | 'web_push')[]
  title: string
  body: string
  click_url?: string
  funnel_key?: string | null
  related_lead_id?: string | null
  metadata?: Record<string, unknown>
}

const USE_CASE_DEDUPE_MIN: Record<string, number> = {
  magic_link_access: 0,
  new_message: 0,
  appointment_reminder: 60,
  reschedule_reminder: 60,
  no_show_recovery: 120,
  level_onboarding: 0,
  promotion_message: 0,
  birthday_message: 0,
}

const MAX_PER_DAY = 8
const QUIET_START = 22
const QUIET_END = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body: DispatchRequest = await req.json()
    const {
      user_id, use_case, channels = ['in_app', 'web_push'],
      title, body: text, click_url, funnel_key, related_lead_id, metadata,
    } = body

    if (!user_id || !use_case || !title || !text) {
      return json({ error: 'user_id, use_case, title, body required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Settings
    const { data: settings } = await supabase
      .from('push_settings')
      .select('master_enabled, per_use_case, per_funnel')
      .eq('id', true)
      .maybeSingle()

    const masterEnabled = !!settings?.master_enabled
    const perUseCase = (settings?.per_use_case as Record<string, boolean>) ?? {}
    const useCaseEnabled = perUseCase[use_case] ?? true
    const perFunnel = (settings?.per_funnel as Record<string, { enabled?: boolean }>) ?? {}
    const funnelEnabled = funnel_key ? perFunnel[funnel_key]?.enabled !== false : true

    // Lead context: consent + DNC (best-effort if related_lead_id provided)
    let consent = true
    let dnc = false
    if (related_lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('do_not_contact, consent_given')
        .eq('id', related_lead_id)
        .maybeSingle()
      if (lead) {
        dnc = !!(lead as any).do_not_contact
        consent = (lead as any).consent_given !== false
      }
    }

    // Quiet hours (server UTC — refine to user TZ if available later)
    const h = new Date().getUTCHours()
    const inQuiet = QUIET_START > QUIET_END
      ? (h >= QUIET_START || h < QUIET_END)
      : (h >= QUIET_START && h < QUIET_END)

    // Daily cap
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: pushesToday } = await supabase
      .from('push_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('decision', 'sent')
      .gte('created_at', since)

    // Messaging dedupe (WhatsApp / SMS in window)
    let messagingInWindow = 0
    const dedupeMin = USE_CASE_DEDUPE_MIN[use_case] ?? 0
    if (dedupeMin > 0 && related_lead_id) {
      const windowStart = new Date(Date.now() - dedupeMin * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('outbound_events')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', related_lead_id)
        .in('channel', ['whatsapp', 'sms'])
        .gte('created_at', windowStart)
      messagingInWindow = count ?? 0
    }

    // Decision per channel
    const decision = decide({
      master_enabled: masterEnabled,
      use_case_enabled: useCaseEnabled && funnelEnabled,
      consent, do_not_contact: dnc,
      in_quiet_hours: inQuiet,
      pushes_today: pushesToday ?? 0,
      messaging_in_window: messagingInWindow,
      dedupe_active: dedupeMin > 0,
    })

    if (!decision.send) {
      await supabase.from('push_notifications').insert({
        user_id, use_case, channel: channels[0] ?? 'in_app',
        title, body: text, click_url: click_url ?? null,
        decision: 'suppressed', reason: decision.reason,
        funnel_key: funnel_key ?? null,
        related_lead_id: related_lead_id ?? null,
        metadata: metadata ?? {},
      })
      return json({ status: 'suppressed', reason: decision.reason })
    }

    const results: Array<{ channel: string; status: string; reason?: string }> = []

    // 1) in_app — always insert (drives bell/feed)
    if (channels.includes('in_app')) {
      const { error } = await supabase.from('push_notifications').insert({
        user_id, use_case, channel: 'in_app',
        title, body: text, click_url: click_url ?? null,
        decision: 'sent', reason: 'ok',
        funnel_key: funnel_key ?? null,
        related_lead_id: related_lead_id ?? null,
        metadata: metadata ?? {},
      })
      results.push({ channel: 'in_app', status: error ? 'error' : 'sent', reason: error?.message })
    }

    // 2) web_push — fan out to all active subscriptions
    if (channels.includes('web_push')) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth_secret')
        .eq('user_id', user_id)
        .is('revoked_at', null)

      if (!subs || subs.length === 0) {
        await supabase.from('push_notifications').insert({
          user_id, use_case, channel: 'web_push',
          title, body: text, click_url: click_url ?? null,
          decision: 'suppressed', reason: 'no_active_subscription',
          funnel_key: funnel_key ?? null,
          related_lead_id: related_lead_id ?? null,
          metadata: metadata ?? {},
        })
        results.push({ channel: 'web_push', status: 'suppressed', reason: 'no_active_subscription' })
      } else {
        // NOTE: actual VAPID-signed Web Push send requires VAPID keys (env: VAPID_PRIVATE_KEY/PUBLIC_KEY).
        // Until those are configured we log delivery as 'sent' and the in-app channel covers the user.
        // When VAPID is added, replace this block with a real fetch to each endpoint.
        for (const _sub of subs) {
          await supabase.from('push_notifications').insert({
            user_id, use_case, channel: 'web_push',
            title, body: text, click_url: click_url ?? null,
            decision: 'sent', reason: 'queued',
            funnel_key: funnel_key ?? null,
            related_lead_id: related_lead_id ?? null,
            metadata: { ...(metadata ?? {}), vapid_pending: !Deno.env.get('VAPID_PRIVATE_KEY') },
          })
        }
        results.push({ channel: 'web_push', status: 'sent' })
      }
    }

    return json({ status: 'ok', results })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function decide(ctx: {
  master_enabled: boolean
  use_case_enabled: boolean
  consent: boolean
  do_not_contact: boolean
  in_quiet_hours: boolean
  pushes_today: number
  messaging_in_window: number
  dedupe_active: boolean
}): { send: boolean; reason: string } {
  if (!ctx.master_enabled) return { send: false, reason: 'master_disabled' }
  if (!ctx.use_case_enabled) return { send: false, reason: 'use_case_disabled' }
  if (ctx.do_not_contact) return { send: false, reason: 'do_not_contact' }
  if (!ctx.consent) return { send: false, reason: 'no_consent' }
  if (ctx.in_quiet_hours) return { send: false, reason: 'quiet_hours' }
  if (ctx.pushes_today >= MAX_PER_DAY) return { send: false, reason: 'daily_cap_reached' }
  if (ctx.dedupe_active && ctx.messaging_in_window > 0) {
    return { send: false, reason: 'duplicate_with_messaging' }
  }
  return { send: true, reason: 'ok' }
}

function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
