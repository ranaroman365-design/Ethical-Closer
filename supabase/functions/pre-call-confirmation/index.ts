import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * SOP Layer 2 — Pre-Call Preparation (Conversion Amplifier)
 *
 * Runs every 5 min. For every booked appointment 1h before the call,
 * dispatches a WhatsApp warm-up via dispatch-communication.
 * Idempotent: skips when `whatsapp_confirmed = true` or a
 * `precall_warmup_T-60min` dispatch already exists for the lead.
 *
 * P3 (SOP scope): warm-up is UNIVERSAL (no longer HIGH-risk only).
 * - whatsapp_confirmed = true → DB trigger transitions pre_call_pending → pre_call_completed.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const now = new Date();
    const t55 = new Date(now.getTime() + 55 * 60 * 1000).toISOString();
    const t90 = new Date(now.getTime() + 90 * 60 * 1000).toISOString();

    // Universal pre-call: every booked appointment ~1h out.
    const { data: appts, error } = await supabase
      .from('appointments')
      .select('id, lead_id, starts_at, call_type, appointment_status')
      .in('appointment_status', ['booked', 'rescheduled'])
      .gte('starts_at', t55)
      .lte('starts_at', t90);

    if (error) throw error;

    const results: Array<{ appointment_id: string; lead_id: string; dispatched: boolean; reason?: string }> = [];

    for (const apt of appts ?? []) {
      // Idempotency: skip if confirmation already received OR warmup already sent.
      const { data: lead } = await supabase
        .from('leads')
        .select('id, name, phone, whatsapp_confirmed')
        .eq('id', apt.lead_id)
        .maybeSingle();

      if (!lead) {
        results.push({ appointment_id: apt.id, lead_id: apt.lead_id, dispatched: false, reason: 'lead_not_found' });
        continue;
      }
      if (lead.whatsapp_confirmed === true) {
        results.push({ appointment_id: apt.id, lead_id: apt.lead_id, dispatched: false, reason: 'already_confirmed' });
        continue;
      }
      if (!lead.phone) {
        results.push({ appointment_id: apt.id, lead_id: apt.lead_id, dispatched: false, reason: 'no_phone' });
        continue;
      }

      const dedupKey = `precall_warmup_${apt.id}_T-60min`;
      const { data: existing } = await supabase
        .from('communication_dispatch_log')
        .select('id')
        .eq('dedup_key', dedupKey)
        .limit(1);
      if (existing && existing.length > 0) {
        results.push({ appointment_id: apt.id, lead_id: apt.lead_id, dispatched: false, reason: 'duplicate' });
        continue;
      }

      const firstName = (lead.name ?? '').split(' ')[0] || 'du';
      const startsAt = new Date(apt.starts_at);
      const timeStr = startsAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
      const body = `Hey ${firstName}, in ca. 1 Stunde sprechen wir (${timeStr}). Bestätige bitte kurz mit "Ja", dass du dabei bist.`;

      const { error: dispatchErr } = await supabase.functions.invoke('dispatch-communication', {
        body: {
          event_key: 'precall_warmup_60min',
          lead_id: apt.lead_id,
          recipient_phone: lead.phone,
          dedup_key: dedupKey,
          payload: {
            body,
            text: body,
            channel: 'whatsapp',
            appointment_id: apt.id,
            appointment_time: apt.starts_at,
          },
        },
      });

      if (dispatchErr) {
        console.error(`[pre-call-confirmation] dispatch failed for ${apt.id}`, dispatchErr);
        results.push({ appointment_id: apt.id, lead_id: apt.lead_id, dispatched: false, reason: 'dispatch_error' });
        continue;
      }

      // Stamp the lead so downstream KPIs can compute pre_call_link_sent_at.
      await supabase
        .from('leads')
        .update({ pre_call_link_sent_at: new Date().toISOString() })
        .eq('id', apt.lead_id);

      results.push({ appointment_id: apt.id, lead_id: apt.lead_id, dispatched: true });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
