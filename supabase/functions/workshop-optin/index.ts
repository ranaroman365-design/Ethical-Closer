// Isolated workshop landing optin — does NOT touch existing funnels.
// Inserts a lead with source='workshop_landing' + funnel='workshop'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const first_name = String(body.first_name || "").trim().slice(0, 80);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    const variant = String(body.variant || "").slice(0, 40);
    const utm = body.utm || {};
    const session_id = String(body.session_id || "").slice(0, 120);

    if (!first_name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Dedupe on email + funnel
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("email", email)
      .eq("funnel", "workshop")
      .maybeSingle();

    let leadId = existing?.id ?? null;

    if (!leadId) {
      const { data, error } = await supabase
        .from("leads")
        .insert({
          first_name,
          email,
          funnel: "workshop",
          source: "workshop_landing",
          status: "new",
          lead_quality: "mid",
          metadata: {
            workshop_optin: true,
            variant,
            utm,
            session_id,
            captured_at: new Date().toISOString(),
          },
        })
        .select("id")
        .single();

      if (error) {
        console.error("workshop-optin insert error", error);
        return new Response(JSON.stringify({ error: "Could not save" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      leadId = data.id;
    }

    // Log event (isolated event name, doesn't collide with existing pixels)
    await supabase.from("event_logs").insert({
      event_name: "WorkshopOptin",
      email,
      payload: {
        category: "funnel",
        funnel: "workshop",
        variant,
        utm,
        session_id,
        lead_id: leadId,
      },
    });

    return new Response(JSON.stringify({ ok: true, lead_id: leadId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("workshop-optin fatal", e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
