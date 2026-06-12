// GAP 5 — Instant Combo Trigger (Layer 55) — P0+P1 hardened
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await supabase
      .from("ai_setter_settings")
      .select("instant_combo_enabled, emergency_shutdown")
      .eq("scope", "global")
      .maybeSingle();

    if (!settings?.instant_combo_enabled || settings?.emergency_shutdown) {
      return new Response(JSON.stringify({ ok: true, skipped: "feature_disabled_or_shutdown" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: leads } = await supabase
      .from("leads")
      .select("id, phone, email, conversion_state, combo_dispatched_at, created_at, recovery_paused_at")
      .gte("created_at", cutoff)
      .is("combo_dispatched_at", null)
      .is("recovery_paused_at", null)
      .not("phone", "is", null)
      .limit(50);

    const out: string[] = [];
    for (const l of leads ?? []) {
      const { data: waOk } = await supabase.rpc("should_dispatch", {
        _lead_id: l.id, _channel: "whatsapp",
      });
      const { data: callOk } = await supabase.rpc("should_dispatch", {
        _lead_id: l.id, _channel: "call",
      });

      if (!waOk && !callOk) continue;

      if (waOk) {
        await supabase.from("communication_dispatch_log").insert({
          event_key: "instant_combo.whatsapp",
          phase: "acquisition",
          purpose: "instant_combo",
          lead_id: l.id,
          primary_channel: "whatsapp",
          status: "queued",
          dedup_key: `combo_wa:${l.id}`,
          template_key: "instant_combo_whatsapp",
        });
      }
      if (callOk) {
        await supabase.from("ai_setter_call_queue").insert({
          lead_id: l.id, status: "pending", attempts: 0,
        } as any);
      }
      await supabase.from("leads")
        .update({ combo_dispatched_at: new Date().toISOString() } as any)
        .eq("id", l.id);
      out.push(l.id);
    }

    return new Response(JSON.stringify({ ok: true, dispatched: out.length, leads: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
