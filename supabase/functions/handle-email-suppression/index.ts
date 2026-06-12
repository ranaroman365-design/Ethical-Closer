import { createClient } from 'npm:@supabase/supabase-js@2'
import { WebhookError, verifyWebhookRequest } from 'npm:@lovable.dev/webhooks-js'

// Suppression event payload sent by the Go API when Mailgun reports
// a bounce, complaint, or unsubscribe.
interface SuppressionPayload {
  email: string
  reason: 'bounce' | 'complaint' | 'unsubscribe'
  message_id?: string
  metadata?: Record<string, unknown>
  is_retry: boolean
  retry_count: number
}

function parseSuppressionPayload(body: string): SuppressionPayload {
  const parsed = JSON.parse(body)
  if (!parsed.data) {
    throw new Error('Missing data field in payload')
  }
  const data = parsed.data as SuppressionPayload
  if (!data.email || !data.reason) {
    throw new Error('Missing required fields: email, reason')
  }
  return data
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!apiKey || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  // Verify HMAC signature using the Lovable API Key (same as auth-email-hook)
  let payload: SuppressionPayload
  try {
    const verified = await verifyWebhookRequest({
      req,
      secret: apiKey,
      parser: parseSuppressionPayload,
    })
    payload = verified.payload
  } catch (error) {
    if (error instanceof WebhookError) {
      switch (error.code) {
        case 'invalid_signature':
          console.error('Invalid webhook signature')
          return jsonResponse({ error: 'Invalid signature' }, 401)
        case 'stale_timestamp':
          console.error('Stale webhook timestamp')
          return jsonResponse({ error: 'Stale timestamp' }, 401)
        case 'invalid_payload':
        case 'invalid_json':
          console.error('Invalid payload', { code: error.code })
          return jsonResponse({ error: 'Invalid payload' }, 400)
        default:
          console.error('Webhook verification failed', {
            code: error.code,
            message: error.message,
          })
          return jsonResponse({ error: 'Verification failed' }, 401)
      }
    }
    console.error('Unexpected error during verification', { error })
    return jsonResponse({ error: 'Internal error' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const normalizedEmail = payload.email.toLowerCase()

  // 0. Idempotency guard — dedupe duplicate webhook deliveries.
  //    Key strategy: prefer message_id+reason (most precise, one event per send+outcome).
  //    Fallback: email+reason (suppression itself is reason-unique per address).
  //    Inserting into processed_events is atomic; ON CONFLICT short-circuits retries.
  const idempotencyKey = payload.message_id
    ? `mailgun:${payload.message_id}:${payload.reason}`
    : `mailgun:${normalizedEmail}:${payload.reason}`

  const { data: alreadyProcessed, error: idempError } = await supabase
    .from('processed_events')
    .select('id')
    .eq('event_key', idempotencyKey)
    .eq('event_type', 'email_suppression')
    .maybeSingle()

  if (idempError) {
    console.error('Failed to check idempotency', { error: idempError })
    return jsonResponse({ error: 'Idempotency check failed' }, 500)
  }

  if (alreadyProcessed) {
    console.log('Duplicate suppression event ignored', {
      idempotency_key: idempotencyKey,
      is_retry: payload.is_retry,
      retry_count: payload.retry_count,
    })
    return jsonResponse({ success: true, deduplicated: true })
  }

  // 1. Upsert to suppressed_emails (idempotent — safe for retries)
  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert(
      {
        email: normalizedEmail,
        reason: payload.reason,
        metadata: payload.metadata ?? null,
      },
      { onConflict: 'email' },
    )

  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      error: suppressError,
      email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    })
    return jsonResponse({ error: 'Failed to write suppression' }, 500)
  }

  // 2. Resolve the original send's delivery outcome.
  //    Strategy: when the webhook carries a message_id, downgrade the
  //    optimistic 'delivered' on the matching send row(s) to the real outcome.
  //    Always also append a fresh log entry so the event itself is auditable.
  const sendLogStatus = mapReasonToStatus(payload.reason)        // bounced | complained | suppressed
  const finalDeliveryStatus = mapReasonToFinalStatus(payload.reason) // bounced | complained | unsubscribed
  const sendLogMessage = mapReasonToMessage(payload.reason)
  const resolvedAt = new Date().toISOString()

  // 2a. Back-link to the original send (if message_id is known)
  if (payload.message_id) {
    const { error: updateError } = await supabase
      .from('email_send_log')
      .update({
        final_delivery_status: finalDeliveryStatus,
        delivery_resolved_at: resolvedAt,
      })
      .eq('message_id', payload.message_id)

    if (updateError) {
      console.warn('Failed to back-link delivery outcome to original send', {
        error: updateError,
        message_id: payload.message_id,
      })
    }
  }

  // 2b. Append a new log entry for the suppression event itself
  const { error: insertError } = await supabase
    .from('email_send_log')
    .insert({
      message_id: payload.message_id ?? null,
      template_name: 'system',
      recipient_email: normalizedEmail,
      status: sendLogStatus,
      error_message: sendLogMessage,
      metadata: payload.metadata ?? null,
      final_delivery_status: finalDeliveryStatus,
      delivery_resolved_at: resolvedAt,
    })

  if (insertError) {
    // Non-fatal — log and continue. The suppression was already recorded.
    console.warn('Failed to insert email_send_log', {
      error: insertError,
    })
  }

  // 3. Mark event as processed (idempotency commit). Done last so partial
  //    failures above remain retryable. ON CONFLICT is a no-op for races
  //    where two concurrent webhook deliveries pass the dedupe check.
  const { error: markError } = await supabase
    .from('processed_events')
    .insert({
      event_key: idempotencyKey,
      event_type: 'email_suppression',
      source_table: 'suppressed_emails',
      source_ref: normalizedEmail,
      result: 'success',
    })

  if (markError && markError.code !== '23505') {
    // 23505 = unique_violation (race condition — another worker won, that's fine)
    console.warn('Failed to mark event as processed', { error: markError })
  }

  console.log('Suppression processed', {
    email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    reason: payload.reason,
    is_retry: payload.is_retry,
    retry_count: payload.retry_count,
    has_message_id: !!payload.message_id,
  })

  return jsonResponse({ success: true })
})

function mapReasonToStatus(
  reason: string,
): 'bounced' | 'complained' | 'suppressed' {
  switch (reason) {
    case 'bounce':
      return 'bounced'
    case 'complaint':
      return 'complained'
    default:
      return 'suppressed'
  }
}

function mapReasonToFinalStatus(
  reason: string,
): 'bounced' | 'complained' | 'unsubscribed' {
  switch (reason) {
    case 'bounce':
      return 'bounced'
    case 'complaint':
      return 'complained'
    default:
      return 'unsubscribed'
  }
}

function mapReasonToMessage(reason: string): string {
  switch (reason) {
    case 'bounce':
      return 'Permanent bounce — email address is invalid or rejected'
    case 'complaint':
      return 'Spam complaint — recipient marked email as spam'
    case 'unsubscribe':
      return 'Recipient unsubscribed'
    default:
      return 'Email suppressed'
  }
}
