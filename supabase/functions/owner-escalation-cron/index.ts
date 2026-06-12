// GAP 1 — Owner-Eskalations-Cron (Layer 55) — P0+P1 hardened
// Stage 1: 4h, Stage 2: 12h, Stage 3: 24h ohne first_action_at
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STAGE_THRESHOLDS_MIN = { 1: 4 * 60, 2: 12 * 60, 3: 24 * 60 } as const;
const STAGE_ROLES = { 1: "backup_setter", 2: "ops_admin", 3: "admin" } as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Emergency shutdown gate
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

    // Server-side filter via canonical RPC (terminal states + paused excluded)
    const { data: leads, error } = await supabase.rpc("get_escalation_candidates", {
      _max_age_hours: 48,
    });
    if (error) throw error;

    const out: Array<{ lead: string; stage: number }> = [];

    for (const lead of leads ?? []) {
      const ageMin = lead.age_minutes ?? 0;

      for (const stage of [3, 2, 1] as const) {
        if (ageMin < STAGE_THRESHOLDS_MIN[stage]) continue;

        const { data: existing } = await supabase
          .from("lead_owner_escalations")
          .select("id")
          .eq("lead_id", lead.lead_id)
          .eq("stage", stage)
          .maybeSingle();
        if (existing) break;

        await supabase.from("lead_owner_escalations").insert({
          lead_id: lead.lead_id,
          stage,
          escalated_from_user_id: lead.owner_id ?? lead.setter_id,
          escalated_to_role: STAGE_ROLES[stage],
          trigger_reason: `No first_action after ${STAGE_THRESHOLDS_MIN[stage]}min`,
        });

        // Consent guard before any dispatch
        const { data: allowed } = await supabase.rpc("should_dispatch", {
          _lead_id: lead.lead_id,
          _channel: "internal",
        });
        if (allowed) {
          await supabase.from("communication_dispatch_log").insert({
            event_key: "owner_escalation.stage_" + stage,
            phase: "escalation",
            purpose: "owner_escalation",
            lead_id: lead.lead_id,
            status: "queued",
            dedup_key: `owner_esc:${lead.lead_id}:${stage}`,
            payload: { stage, role: STAGE_ROLES[stage] },
          });
        }

        out.push({ lead: lead.lead_id, stage });
        break;
      }
    }

    return new Response(JSON.stringify({ ok: true, escalated: out.length, results: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
