// GAP 2 — No-Show Recovery +5min / +2h (Layer 55) — P0+P1 hardened
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
      .select("emergency_shutdown")
      .eq("scope", "global")
      .maybeSingle();
    if (settings?.emergency_shutdown) {
      return new Response(JSON.stringify({ ok: true, skipped: "emergency_shutdown" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = Date.now();
    const out: Array<{ appt: string; wave: string }> = [];

    const { data: appts } = await supabase
      .from("appointments")
      .select("id, lead_id, no_show_detected_at, recovery_5min_sent_at, recovery_2h_sent_at, scheduled_at")
      .eq("outcome", "no_show")
      .not("no_show_detected_at", "is", null)
      .limit(200);

    for (const a of appts ?? []) {
      if (!a.no_show_detected_at || !a.lead_id) continue;

      // Rebook guard — skip if a newer appointment exists for this lead
      const { data: newer } = await supabase
        .from("appointments")
        .select("id")
        .eq("lead_id", a.lead_id)
        .gt("scheduled_at", a.scheduled_at ?? a.no_show_detected_at)
        .not("outcome", "eq", "no_show")
        .limit(1)
        .maybeSingle();
      if (newer) continue;

      const ageMin = (now - new Date(a.no_show_detected_at).getTime()) / 60_000;

      // +5min
      if (!a.recovery_5min_sent_at && ageMin >= 5) {
        const { data: ok } = await supabase.rpc("should_dispatch", {
          _lead_id: a.lead_id, _channel: "whatsapp",
        });
        if (ok) {
          await supabase.from("communication_dispatch_log").insert({
            event_key: "no_show_recovery.5min",
            phase: "recovery",
            purpose: "no_show_recovery_5min",
            lead_id: a.lead_id,
            status: "queued",
            dedup_key: `nsr5:${a.id}`,
            template_key: "no_show_recovery_5min",
            payload: { appointment_id: a.id, wave: "5min" },
          });
          await supabase.from("appointments")
            .update({ recovery_5min_sent_at: new Date().toISOString() })
            .eq("id", a.id);
          out.push({ appt: a.id, wave: "5min" });
        }
      }

      // +2h
      if (!a.recovery_2h_sent_at && ageMin >= 120) {
        const { data: ok } = await supabase.rpc("should_dispatch", {
          _lead_id: a.lead_id, _channel: "whatsapp",
        });
        if (ok) {
          await supabase.from("communication_dispatch_log").insert({
            event_key: "no_show_recovery.2h",
            phase: "recovery",
            purpose: "no_show_recovery_2h",
            lead_id: a.lead_id,
            status: "queued",
            dedup_key: `nsr2h:${a.id}`,
            template_key: "no_show_recovery_2h",
            payload: { appointment_id: a.id, wave: "2h" },
          });
          await supabase.from("appointments")
            .update({ recovery_2h_sent_at: new Date().toISOString() })
            .eq("id", a.id);
          out.push({ appt: a.id, wave: "2h" });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, dispatched: out.length, results: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
