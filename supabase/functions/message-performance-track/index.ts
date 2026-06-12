// Layer 32 — Track Message Event
// POST { template_key, variant_key, event_type, lead_id?, funnel_id?, operator_id?, channel?, message_send_id?, revenue?, metadata? }

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
      template_key,
      variant_key = "A",
      event_type,
      lead_id = null,
      funnel_id = null,
      operator_id = null,
      channel = null,
      message_send_id = null,
      revenue = 0,
      metadata = {},
    } = body || {};

    if (!template_key || !event_type) {
      return new Response(
        JSON.stringify({ error: "template_key and event_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase.rpc("record_message_event", {
      p_template_key: template_key,
      p_variant_key: variant_key,
      p_event_type: event_type,
      p_message_send_id: message_send_id,
      p_lead_id: lead_id,
      p_funnel_id: funnel_id,
      p_operator_id: operator_id,
      p_channel: channel,
      p_revenue: revenue,
      p_metadata: metadata,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        ok: true,
        event_id: data,
        recorded: data !== null,
        note: data === null ? "performance tracking is disabled" : undefined,
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
