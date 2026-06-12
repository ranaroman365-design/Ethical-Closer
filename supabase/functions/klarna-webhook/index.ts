import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const orderId = body.order_id

    if (!orderId) {
      return new Response('Missing order_id', { status: 400 })
    }

    // Idempotency check
    const { data: existing } = await supabase
      .from('processed_events')
      .select('event_id')
      .eq('event_id', `klarna_${orderId}`)
      .single()
    if (existing) return new Response('Already processed', { status: 200 })

    // Verify order with Klarna
    const KLARNA_MODE = Deno.env.get('KLARNA_MODE') === 'live' ? 'live' : 'playground'
    const baseUrl = KLARNA_MODE === 'live'
      ? 'https://api.klarna.com'
      : 'https://api.playground.klarna.com'

    const KLARNA_USERNAME = Deno.env.get('KLARNA_API_USERNAME')!
    const KLARNA_PASSWORD = Deno.env.get('KLARNA_API_PASSWORD')!

    const orderRes = await fetch(`${baseUrl}/ordermanagement/v1/orders/${orderId}`, {
      headers: {
        'Authorization': `Basic ${btoa(`${KLARNA_USERNAME}:${KLARNA_PASSWORD}`)}`,
      },
    })

    if (!orderRes.ok) {
      console.error('[klarna-webhook] Could not verify order:', orderRes.status)
      return new Response('Could not verify', { status: 400 })
    }

    const order = await orderRes.json()

    if (order.status === 'AUTHORIZED' || order.status === 'CAPTURED') {
      // Update payment link
      const { data: link } = await supabase
        .from('payment_links')
        .update({ status: 'paid' })
        .eq('session_id', orderId)
        .select('lead_id')
        .single()

      if (link?.lead_id) {
        await supabase
          .from('leads')
          .update({ status: 'closed_won', closed_at: new Date().toISOString() })
          .eq('id', link.lead_id)
      }

      // Acknowledge the order (capture)
      if (order.status === 'AUTHORIZED') {
        await fetch(`${baseUrl}/ordermanagement/v1/orders/${orderId}/captures`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${KLARNA_USERNAME}:${KLARNA_PASSWORD}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            captured_amount: order.order_amount,
          }),
        })
      }
    }

    // Mark as processed
    await supabase.from('processed_events').insert({ event_id: `klarna_${orderId}` })

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('[klarna-webhook] Error:', err)
    return new Response('Error', { status: 500 })
  }
})
