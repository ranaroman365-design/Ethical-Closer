// Layer 29 — Lead Activation · sender (template resolver + validated send)
// Resolves template (operator > funnel > global), interpolates variables,
// validates Twilio env before sending, blocks activation if TWILIO_WHATSAPP_FROM missing.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const E164_RE = /^\+[1-9]\d{6,14}$/;

function validateTwilioEnv(channel: string): { ok: boolean; error?: string } {
  if (channel === 'whatsapp') {
    const from = Deno.env.get('TWILIO_WHATSAPP_FROM');
    if (!from || from.trim() === '') return { ok: false, error: 'TWILIO_WHATSAPP_FROM nicht gesetzt — Aktivierung gesperrt.' };
    if (!E164_RE.test(from.trim().replace('whatsapp:', ''))) return { ok: false, error: `TWILIO_WHATSAPP_FROM ungültig: ${from}` };
  }
  if (channel === 'sms') {
    const from = Deno.env.get('TWILIO_SMS_FROM');
    if (!from || from.trim() === '') return { ok: false, error: 'TWILIO_SMS_FROM nicht gesetzt — Aktivierung gesperrt.' };
    if (!E164_RE.test(from.trim())) return { ok: false, error: `TWILIO_SMS_FROM ungültig: ${from}` };
  }
  return { ok: true };
}

function interpolate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { job_id, test_mode = true } = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: job, error: jobErr } = await supabase
      .from('lead_activation_jobs')
      .select('id, lead_id, funnel_key, touchpoint_code, channel, status')
      .eq('id', job_id).maybeSingle();
    if (jobErr || !job) throw new Error(`job not found: ${job_id}`);
    if (job.status !== 'pending') {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'not_pending' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: lead } = await supabase
      .from('leads').select('id, name, email, phone, source_funnel, has_booking, owner_id')
      .eq('id', job.lead_id).maybeSingle();
    if (!lead) throw new Error('lead missing');
    if (lead.has_booking) {
      await supabase.from('lead_activation_jobs').update({
        status: 'cancelled', last_error: 'lead_already_booked',
      }).eq('id', job.id);
      return new Response(JSON.stringify({ ok: true, cancelled: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Template resolution: operator > funnel > global
    const lookup = async (scope: 'operator' | 'funnel' | 'global') => {
      const q = supabase.from('lead_activation_templates')
        .select('subject, body, channel, email_provider')
        .eq('touchpoint_code', job.touchpoint_code)
        .eq('language', 'de')
        .eq('scope', scope)
        .eq('enabled', true)
        .limit(1);
      if (scope === 'operator' && lead.owner_id) q.eq('operator_id', lead.owner_id);
      if (scope === 'funnel' && job.funnel_key) q.eq('funnel_key', job.funnel_key);
      if (scope === 'global') q.is('funnel_key', null);
      const { data } = await q.maybeSingle();
      return data;
    };

    const template = (await lookup('operator')) ?? (await lookup('funnel')) ?? (await lookup('global'));
    if (!template) {
      await supabase.from('lead_activation_jobs').update({
        status: 'failed', last_error: 'no_template',
      }).eq('id', job.id);
      return new Response(JSON.stringify({ ok: false, error: 'no_template' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const firstName = (lead.name ?? '').split(' ')[0] || 'there';
    const vars = {
      first_name: firstName,
      booking_link: 'https://ethicalcloser.de/booking',
      reschedule_link: 'https://ethicalcloser.de/booking',
      magic_link: '{{magic_link}}', // resolved by generate-lead-magic-link if/when activated
    };
    const renderedBody = interpolate(template.body, vars);
    const renderedSubject = template.subject ? interpolate(template.subject, vars) : null;

    // Validate Twilio env BEFORE sending — block if missing/invalid
    const channel = job.channel as 'email' | 'whatsapp' | 'sms';
    const emailProvider = (template as any).email_provider as 'lovable' | 'external' | 'auto' ?? 'lovable';

    if (channel === 'email') {
      // Route email based on template's email_provider setting
      const resolvedProvider = emailProvider === 'auto'
        ? 'lovable' // auto defaults to lovable; external requires explicit opt-in
        : emailProvider;

      if (resolvedProvider === 'lovable') {
        // Send via Lovable's built-in transactional email service
        const { error: emailErr } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'communication-os-generic',
            recipientEmail: lead.email,
            idempotencyKey: `tp-${job.id}`,
            templateData: {
              subject: renderedSubject ?? 'ETC Update',
              body: renderedBody,
              first_name: (lead.name ?? '').split(' ')[0] || '',
            },
          },
        });

        const emailStatus = emailErr ? 'failed' : 'sent';
        await supabase.from('lead_activation_jobs').update({
          status: emailStatus, attempts: 1,
          last_error: emailErr ? String(emailErr.message ?? emailErr) : null,
          payload: { rendered_body: renderedBody, rendered_subject: renderedSubject, channel, email_provider: 'lovable', test_mode },
        }).eq('id', job.id);

        await supabase.from('lead_activation_events').insert({
          lead_id: lead.id, job_id: job.id, funnel_key: job.funnel_key,
          event_type: emailErr ? 'tp_email_failed' : 'tp_email_sent',
          payload: { code: job.touchpoint_code, channel, email_provider: 'lovable', error: emailErr ? String(emailErr) : null },
        });

        return new Response(JSON.stringify({ ok: !emailErr, email_provider: 'lovable', status: emailStatus }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } else {
        // External provider — log as stub, external system (GHL/SMTP) picks up
        await supabase.from('lead_activation_jobs').update({
          status: 'pending_external', attempts: 1,
          payload: { rendered_body: renderedBody, rendered_subject: renderedSubject, channel, email_provider: 'external', test_mode },
        }).eq('id', job.id);

        await supabase.from('lead_activation_events').insert({
          lead_id: lead.id, job_id: job.id, funnel_key: job.funnel_key,
          event_type: 'tp_external_queued',
          payload: { code: job.touchpoint_code, channel, email_provider: 'external' },
        });

        return new Response(JSON.stringify({ ok: true, email_provider: 'external', status: 'pending_external' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (channel === 'sms' || channel === 'whatsapp') {
      const envCheck = validateTwilioEnv(channel);
      if (!envCheck.ok) {
        await supabase.from('lead_activation_jobs').update({
          status: 'failed', last_error: envCheck.error,
        }).eq('id', job.id);
        await supabase.from('lead_activation_events').insert({
          lead_id: lead.id, job_id: job.id, funnel_key: job.funnel_key,
          event_type: 'tp_blocked_env',
          payload: { code: job.touchpoint_code, channel, error: envCheck.error },
        });
        return new Response(JSON.stringify({ ok: false, blocked: true, error: envCheck.error }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await supabase.from('twilio_message_logs').insert({
        source: 'manual', channel, direction: 'outbound',
        status: test_mode ? 'sent_stub' : 'sent_stub',
        to_number: lead.phone, body: renderedBody, lead_id: lead.id,
        payload: { layer: 29, touchpoint: job.touchpoint_code, job_id: job.id },
      });
    }

    await supabase.from('lead_activation_jobs').update({
      status: 'sent_stub', attempts: 1,
      payload: { rendered_body: renderedBody, rendered_subject: renderedSubject, channel, test_mode },
    }).eq('id', job.id);

    await supabase.from('lead_activation_events').insert({
      lead_id: lead.id, job_id: job.id, funnel_key: job.funnel_key,
      event_type: 'tp_sent_stub',
      payload: { code: job.touchpoint_code, channel, test_mode, preview: renderedBody.slice(0, 240) },
    });

    return new Response(JSON.stringify({ ok: true, sent_stub: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
