// Layer 30 — Level Messaging: job processor stub.
// Phase 1: log-only. Marks pending jobs as `sent_stub` without dispatching.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: jobs } = await supabase
      .from("level_message_jobs")
      .select("id, template_key, channel, user_id, level, message_type")
      .eq("status", "pending")
      .lte("run_after", new Date().toISOString())
      .limit(50);

    const processed: string[] = [];
    for (const job of jobs ?? []) {
      await supabase
        .from("level_message_jobs")
        .update({ status: "sent_stub", attempt_count: 1 })
        .eq("id", job.id);

      await supabase.from("level_message_events").insert({
        user_id: job.user_id,
        level: job.level,
        message_type: job.message_type,
        template_key: job.template_key,
        event_type: "processed_stub",
        channel: job.channel,
        payload: { job_id: job.id, note: "Phase 1 stub — no real send" },
      });

      processed.push(job.id);
    }

    return new Response(
      JSON.stringify({ ok: true, processed: processed.length, ids: processed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
