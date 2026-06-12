// Layer 27 + Layer 38 — Inbound Twilio webhook
// SMS  → log only (Layer 27 Smart Attendance)
// WhatsApp → log + route to Conversational AI Responder (Layer 38)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let payload: Record<string, unknown> = {};
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      payload = await req.json().catch(() => ({}));
    } else {
      const form = await req.formData().catch(() => null);
      if (form) form.forEach((v, k) => { payload[k] = String(v); });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const fromRaw = String(payload.From ?? '');
    const toRaw   = String(payload.To ?? '');
    const body    = String(payload.Body ?? '').trim();
    const sid     = String(payload.MessageSid ?? payload.SmsSid ?? '');

    // Detect WhatsApp by Twilio's "whatsapp:" prefix
    const isWhatsApp = fromRaw.startsWith('whatsapp:') || toRaw.startsWith('whatsapp:');
    const channel: 'whatsapp' | 'sms' = isWhatsApp ? 'whatsapp' : 'sms';
    const fromNorm = fromRaw.replace(/^whatsapp:/, '');
    const toNorm   = toRaw.replace(/^whatsapp:/, '');

    // Always log to twilio_message_logs (existing infra)
    await supabase.from('twilio_message_logs').insert({
      source: isWhatsApp ? 'conversational_ai' : 'attendance',
      channel,
      direction: 'inbound',
      status: 'received',
      from_number: fromNorm,
      to_number: toNorm,
      body,
      twilio_sid: sid || null,
      payload,
    });

    // Layer 38 — only WhatsApp triggers conversational AI
    if (isWhatsApp && body) {
      // Fire-and-forget; do NOT block TwiML response
      supabase.functions.invoke('conversational-ai-respond', {
        body: { phone_e164: fromNorm, body, twilio_sid: sid },
      }).catch(err => console.error('[L38] respond invoke failed', err));
    }

    return new Response('<Response/>', {
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' },
    });
  } catch (e) {
    console.error('[twilio-webhook]', e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
