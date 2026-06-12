// GAP 4 — Objection-Recovery Cron (Layer 55) — P0+P1 hardened
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STEP_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7 };
const STEP_CHANNELS: Record<number, string> = { 1: "whatsapp", 2: "sms", 3: "email" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await supabase
      .from("ai_setter_settings")
      .select("emergency_shutdown")
      .eq("scope", "global")
      .maybeSingle();
    if (settings?.emergency_shutdown) {
      return new Response(JSON.stringify({ ok: true, skipped: "emergency_shutdown" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const out: Array<{ id: string; step: number; sent: boolean }> = [];

    const { data: queue } = await supabase
      .from("objection_recovery_queue")
      .select("*")
      .eq("status", "active")
      .lte("next_action_at", new Date().toISOString())
      .limit(200);

    for (const q of queue ?? []) {
      const step = q.sequence_step as 1 | 2 | 3;
      const channel = STEP_CHANNELS[step];

      const { data: ok } = await supabase.rpc("should_dispatch", {
        _lead_id: q.lead_id, _channel: channel,
      });

      if (ok) {
        await supabase.from("communication_dispatch_log").insert({
          event_key: `objection_recovery.step_${step}`,
          phase: "objection_recovery",
          purpose: "objection_recovery",
          lead_id: q.lead_id,
          primary_channel: channel,
          status: "queued",
          dedup_key: `objrec:${q.id}:${step}`,
          template_key: `objection_${q.objection_code}_step_${step}`,
          payload: { objection_code: q.objection_code, step },
        });
      }

      const nextStep = step + 1;
      if (nextStep > 3) {
        await supabase.from("objection_recovery_queue")
          .update({ status: "completed", last_dispatched_at: new Date().toISOString() })
          .eq("id", q.id);
      } else {
        const nextAt = new Date(Date.now() + STEP_DAYS[nextStep] * 86400_000).toISOString();
        await supabase.from("objection_recovery_queue")
          .update({ sequence_step: nextStep, next_action_at: nextAt, last_dispatched_at: new Date().toISOString() })
          .eq("id", q.id);
      }
      out.push({ id: q.id, step, sent: !!ok });
    }

    return new Response(JSON.stringify({ ok: true, processed: out.length, results: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
