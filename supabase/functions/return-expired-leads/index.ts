import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();

    // Find leads with expired timers
    const { data: expiredLeads, error: fetchError } = await supabase
      .from("leads")
      .select("id, name, stage, owner_id, setter_id, closer_id, timer_expires_at, first_action_at, contact_count")
      .not("timer_expires_at", "is", null)
      .lt("timer_expires_at", now)
      .not("stage", "in", "(closed_won,closed_lost,returned_to_pool)");

    if (fetchError) throw fetchError;

    const results: { id: string; previous_stage: string; reason: string }[] = [];

    for (const lead of expiredLeads ?? []) {
      const previousStage = lead.stage;
      let reason = "";

      // Determine reason
      if (!lead.first_action_at) {
        reason = "24h Backlog-Timer abgelaufen – keine erste Aktion";
      } else {
        reason = "72h Timer abgelaufen – Lead inaktiv nach erster Aktion";
      }

      // Return lead to pool
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          stage: "returned_to_pool",
          owner_id: null,
          timer_expires_at: null,
          updated_at: now,
        })
        .eq("id", lead.id);

      if (updateError) {
        console.error(`Failed to return lead ${lead.id}:`, updateError);
        continue;
      }

      // Log transition
      await supabase.from("lead_transitions").insert({
        lead_id: lead.id,
        previous_stage: previousStage,
        new_stage: "returned_to_pool",
        changed_by: lead.owner_id ?? lead.setter_id ?? lead.closer_id ?? "00000000-0000-0000-0000-000000000000",
        reason,
      });

      // Audit log
      await supabase.from("audit_logs").insert({
        action: "lead_returned_to_pool",
        source_type: "cron",
        note: `Lead "${lead.name}" returned: ${reason}`,
        before_state: { stage: previousStage, owner_id: lead.owner_id },
        after_state: { stage: "returned_to_pool", owner_id: null },
      });

      results.push({ id: lead.id, previous_stage: previousStage, reason });
    }

    return new Response(
      JSON.stringify({ success: true, returned: results.length, details: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[return-expired-leads] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
