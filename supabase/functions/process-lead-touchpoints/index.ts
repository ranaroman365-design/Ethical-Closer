// Layer 29 — Lead Activation · processor (cron + manual run)
// Picks due 'pending' jobs, resolves template, calls send-lead-touchpoint.
// Phase 1: respects test_mode; never sends real outbound.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Global gate first — if globally disabled, skip cycle.
    const { data: globalSettings } = await supabase
      .from('lead_activation_settings')
      .select('lead_activation_enabled, test_mode')
      .eq('scope', 'global').is('funnel_key', null).maybeSingle();

    const globallyEnabled = !!globalSettings?.lead_activation_enabled;

    // Pull a small batch of due, pending jobs.
    const { data: jobs, error } = await supabase
      .from('lead_activation_jobs')
      .select('id, lead_id, funnel_key, touchpoint_code, channel, scheduled_for')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50);

    if (error) throw error;

    let processed = 0;
    for (const job of jobs ?? []) {
      // Per-funnel gate (overrides global if a funnel row exists).
      let enabled = globallyEnabled;
      let testMode = globalSettings?.test_mode ?? true;
      if (job.funnel_key) {
        const { data: f } = await supabase
          .from('lead_activation_settings')
          .select('lead_activation_enabled, test_mode')
          .eq('scope', 'funnel').eq('funnel_key', job.funnel_key).maybeSingle();
        if (f) {
          enabled = f.lead_activation_enabled;
          testMode = f.test_mode;
        }
      }

      if (!enabled) {
        // Silent: leave as pending, log skip event so it's visible in UI.
        await supabase.from('lead_activation_events').insert({
          lead_id: job.lead_id, job_id: job.id, funnel_key: job.funnel_key,
          event_type: 'tp_skipped_disabled', payload: { code: job.touchpoint_code },
        });
        continue;
      }

      // SOP funnel-separation guard: never run standard touchpoint cadence
      // for leads in recovery/closed/exit/unresponsive states.
      const { data: leadRow } = await supabase
        .from('leads')
        .select('conversion_state')
        .eq('id', job.lead_id)
        .maybeSingle();
      const blockedStates = new Set([
        'recovery_active','rebooked','second_no_show','unresponsive','exit','closed_won','closed_lost',
      ]);
      if (leadRow?.conversion_state && blockedStates.has(leadRow.conversion_state as string)) {
        await supabase.from('lead_activation_events').insert({
          lead_id: job.lead_id, job_id: job.id, funnel_key: job.funnel_key,
          event_type: 'tp_skipped_funnel_separation',
          payload: { code: job.touchpoint_code, conversion_state: leadRow.conversion_state },
        });
        continue;
      }

      // Delegate to sender (which handles test_mode logging).
      await supabase.functions.invoke('send-lead-touchpoint', {
        body: { job_id: job.id, test_mode: testMode },
      });
      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed, simulated: !globallyEnabled }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
