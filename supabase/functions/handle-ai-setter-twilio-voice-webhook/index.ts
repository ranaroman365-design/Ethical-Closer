// Layer 28 — AI Setter · Phase 1 stub
// Inbound voice webhook (TwiML, status callbacks). Phase 1: log only, return empty TwiML.
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
    await supabase.from('ai_setter_events').insert({
      event_type: 'voice_webhook_received',
      payload,
    });
    return new Response('<Response/>', { headers: { ...corsHeaders, 'Content-Type': 'application/xml' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
