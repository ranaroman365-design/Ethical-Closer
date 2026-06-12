// Layer 30 — Level Messaging: enqueue stub.
// Phase 1: log-only. Does NOT send messages.
// Triggered by other systems when a user enters a new level / hits a milestone.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EnqueueBody {
  user_id?: string;
  lead_id?: string;
  level: string;
  trigger_event: string;
  message_type: string;
  scope_operator_id?: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as EnqueueBody;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up matching template
    const { data: tpl } = await supabase
      .from("level_message_templates")
      .select("template_key, channel, timing, delay_minutes, active")
      .eq("level", body.level)
      .eq("message_type", body.message_type)
      .eq("trigger_event", body.trigger_event)
      .eq("active", true)
      .maybeSingle();

    if (!tpl) {
      await supabase.from("level_message_events").insert({
        user_id: body.user_id ?? null,
        lead_id: body.lead_id ?? null,
        level: body.level,
        message_type: body.message_type,
        event_type: "no_template",
        scope_operator_id: body.scope_operator_id ?? null,
        payload: { trigger_event: body.trigger_event, ...(body.metadata ?? {}) },
      });
      return new Response(JSON.stringify({ ok: true, enqueued: false, reason: "no_template" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Phase 1: silent. Check global enabled flag.
    const { data: globalSettings } = await supabase
      .from("level_messaging_settings")
      .select("enabled, test_mode")
      .eq("scope", "global")
      .maybeSingle();

    if (!globalSettings?.enabled) {
      await supabase.from("level_message_events").insert({
        user_id: body.user_id ?? null,
        lead_id: body.lead_id ?? null,
        level: body.level,
        message_type: body.message_type,
        template_key: tpl.template_key,
        event_type: "skipped_disabled",
        channel: tpl.channel,
        scope_operator_id: body.scope_operator_id ?? null,
        payload: { trigger_event: body.trigger_event },
      });
      return new Response(
        JSON.stringify({ ok: true, enqueued: false, reason: "system_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const runAfter = new Date(
      Date.now() + (tpl.timing === "delayed" ? (tpl.delay_minutes ?? 0) * 60_000 : 0),
    ).toISOString();

    const { data: job, error } = await supabase
      .from("level_message_jobs")
      .insert({
        user_id: body.user_id ?? null,
        lead_id: body.lead_id ?? null,
        level: body.level,
        message_type: body.message_type,
        template_key: tpl.template_key,
        trigger_event: body.trigger_event,
        channel: tpl.channel,
        run_after: runAfter,
        status: "pending",
        scope_operator_id: body.scope_operator_id ?? null,
        metadata: body.metadata ?? {},
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from("level_message_events").insert({
      user_id: body.user_id ?? null,
      lead_id: body.lead_id ?? null,
      level: body.level,
      message_type: body.message_type,
      template_key: tpl.template_key,
      event_type: "enqueued_stub",
      channel: tpl.channel,
      scope_operator_id: body.scope_operator_id ?? null,
      payload: { job_id: job.id, trigger_event: body.trigger_event },
    });

    return new Response(JSON.stringify({ ok: true, enqueued: true, job_id: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
