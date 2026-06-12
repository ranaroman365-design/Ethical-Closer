// Layer 29 — Lead Activation · magic link generator (Supabase Auth admin)
// Phase 1: returns a signed magic-link URL for a lead's email. Used by sender
// when actually activated. Safe to call now (no message is sent).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://ethicalcloser.de';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { email, redirect_to } = await req.json();
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'email required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: redirect_to ?? `${SITE_URL}/members/dashboard` },
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, action_link: data.properties?.action_link }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
