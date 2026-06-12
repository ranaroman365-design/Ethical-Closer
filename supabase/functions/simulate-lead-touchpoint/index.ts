// Layer 29 — Lead Activation · simulate single touchpoint
// Used by Admin/L6 UI "Test Send" buttons. Always force test_mode=true.
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
    const { lead_id, touchpoint_code } = await req.json();
    if (!lead_id || !touchpoint_code) {
      return new Response(JSON.stringify({ ok: false, error: 'lead_id and touchpoint_code required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: job } = await supabase
      .from('lead_activation_jobs')
      .select('id').eq('lead_id', lead_id).eq('touchpoint_code', touchpoint_code).maybeSingle();
    if (!job) {
      return new Response(JSON.stringify({ ok: false, error: 'no job for this lead+touchpoint' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data, error } = await supabase.functions.invoke('send-lead-touchpoint', {
      body: { job_id: job.id, test_mode: true },
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, result: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
