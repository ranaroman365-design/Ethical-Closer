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
    const { token } = await req.json()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch payment link data
    const { data: link, error: linkErr } = await supabase
      .from('payment_links')
      .select('id, amount, currency, offer_title, email, first_name, deal_type, payment_type')
      .eq('token', token)
      .in('status', ['pending', 'opened'])
      .single()

    if (linkErr || !link) {
      return new Response(JSON.stringify({ error: 'Payment link not found or expired' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const KLARNA_MODE = Deno.env.get('KLARNA_MODE') === 'live' ? 'live' : 'playground'
    const baseUrl = KLARNA_MODE === 'live'
      ? 'https://api.klarna.com'
      : 'https://api.playground.klarna.com'

    const KLARNA_USERNAME = Deno.env.get('KLARNA_API_USERNAME')!
    const KLARNA_PASSWORD = Deno.env.get('KLARNA_API_PASSWORD')!
    const APP_URL = Deno.env.get('APP_URL') || 'https://ethical-closing.lovable.app'

    // Amount in minor units (cents)
    const totalAmount = link.amount
    const amountFormatted = (totalAmount / 100).toFixed(2)

    // Create Klarna session
    // Klarna Ratenkauf: ETC receives full amount immediately, Klarna handles installments
    const klarnaBody = {
      purchase_country: 'DE',
      purchase_currency: link.currency || 'EUR',
      locale: 'de-DE',
      order_amount: totalAmount,
      order_tax_amount: 0,
      order_lines: [
        {
          type: 'digital',
          name: link.offer_title || 'Ethical Top Closer Programm',
          quantity: 1,
          unit_price: totalAmount,
          tax_rate: 0,
          total_amount: totalAmount,
          total_tax_amount: 0,
        },
      ],
      merchant_urls: {
        terms: `${APP_URL}/terms`,
        checkout: `${APP_URL}/checkout/${token}`,
        confirmation: `${APP_URL}/checkout/success?klarna=true&token=${token}`,
        push: `${Deno.env.get('SUPABASE_URL')}/functions/v1/klarna-webhook`,
      },
      billing_address: {
        email: link.email || undefined,
        given_name: link.first_name || undefined,
      },
    }

    const sessionRes = await fetch(`${baseUrl}/checkout/v3/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${KLARNA_USERNAME}:${KLARNA_PASSWORD}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(klarnaBody),
    })

    if (!sessionRes.ok) {
      const errText = await sessionRes.text()
      console.error('[klarna-create-session] Klarna API error:', sessionRes.status, errText)
      return new Response(JSON.stringify({ error: 'Klarna session creation failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const klarnaOrder = await sessionRes.json()

    // Update payment_links with Klarna order reference
    await supabase
      .from('payment_links')
      .update({
        session_id: klarnaOrder.order_id,
        payment_url: klarnaOrder.redirect_url,
        status: 'opened',
      })
      .eq('token', token)

    return new Response(
      JSON.stringify({
        redirectUrl: klarnaOrder.redirect_url,
        htmlSnippet: klarnaOrder.html_snippet,
        orderId: klarnaOrder.order_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[klarna-create-session] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
