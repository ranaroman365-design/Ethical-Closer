// AI Setter Voice — place call (STUB until provider chosen).
// Always writes ai_setter_call_logs. Never dials in v1.
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
    const { queue_id } = await req.json();
    if (!queue_id) {
      return new Response(JSON.stringify({ error: "queue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settings } = await supabase
      .from("ai_setter_settings").select("*").eq("scope", "global").maybeSingle();

    const { data: q } = await supabase
      .from("ai_setter_call_queue").select("*").eq("id", queue_id).maybeSingle();
    if (!q) throw new Error("queue row not found");

    // Always log — even when stubbed.
    await supabase.from("ai_setter_call_logs").insert({
      queue_id: q.id,
      lead_id: q.lead_id,
      operator_id: q.operator_id,
      outcome: "sent_stub",
      notes: settings?.ai_setter_enabled ? "voice provider not configured" : "ai_setter disabled",
      payload: { settings, queue: q },
    });

    await supabase.from("ai_setter_call_queue").update({
      status: settings?.ai_setter_enabled ? "skipped" : "skipped",
      attempts: (q.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", q.id);

    return new Response(JSON.stringify({ ok: true, mode: "stub" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ai-setter-place-call error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
