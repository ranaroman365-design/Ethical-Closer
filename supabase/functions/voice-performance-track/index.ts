// Layer 33 — Track Call Funnel Event
// POST { call_id, event_type, lead_id?, operator_id?, funnel_id?, source?, script_key?, script_variant?, duration_seconds?, revenue?, metadata? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      call_id,
      event_type,
      lead_id = null,
      operator_id = null,
      funnel_id = null,
      source = "ai_setter",
      script_key = null,
      script_variant = "A",
      duration_seconds = null,
      revenue = 0,
      metadata = {},
    } = body || {};

    if (!call_id || !event_type) {
      return new Response(
        JSON.stringify({ error: "call_id and event_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("record_call_event", {
      p_call_id: call_id,
      p_event_type: event_type,
      p_lead_id: lead_id,
      p_operator_id: operator_id,
      p_funnel_id: funnel_id,
      p_source: source,
      p_script_key: script_key,
      p_script_variant: script_variant,
      p_duration_seconds: duration_seconds,
      p_revenue: revenue,
      p_metadata: metadata,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        ok: true,
        event_id: data,
        recorded: data !== null,
        note: data === null ? "voice tracking is disabled" : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
