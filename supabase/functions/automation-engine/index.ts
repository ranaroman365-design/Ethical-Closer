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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { action } = await req.json();

    // ─── 1. FOLLOW-UP AUTOMATION ───
    if (action === "process_followups") {
      const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Find no-shows without follow-up in last 24h
      const { data: noShows } = await supabase
        .from("appointments")
        .select("id, lead_id, setter_id, starts_at")
        .eq("outcome", "no_show")
        .is("acknowledged_at", null)
        .lt("starts_at", cutoff24h)
        .limit(50);

      const followupResults: any[] = [];

      for (const apt of noShows || []) {
        // Check if follow-up event already exists
        const { data: existing } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", apt.lead_id)
          .eq("event_type", "followup_triggered")
          .gte("created_at", cutoff48h)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from("lead_events").insert({
            lead_id: apt.lead_id,
            event_type: "followup_triggered",
            actor_user_id: apt.setter_id,
            notes: `Auto Follow-Up: No-Show am ${new Date(apt.starts_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`,
            metadata: { trigger: "no_show", appointment_id: apt.id, type: "reminder" },
          });

          // Create daily task for setter
          if (apt.setter_id) {
            await supabase.from("daily_tasks").insert({
              user_id: apt.setter_id,
              role: "setter",
              task_type: "follow_up",
              task_title: "No-Show Follow-Up",
              task_description: `Lead hat Termin verpasst. Bitte kontaktieren und Re-Booking anbieten.`,
              task_status: "pending",
              priority: 1,
              due_date: new Date().toISOString().split("T")[0],
              related_id: apt.lead_id,
              related_table: "leads",
            });
          }

          followupResults.push({ lead_id: apt.lead_id, action: "followup_created" });
        }
      }

      // Find lost deals without follow-up
      const { data: lostOutcomes } = await supabase
        .from("call_outcomes")
        .select("id, user_id, call_id, lost_reason, created_at")
        .eq("outcome", "lost")
        .gte("created_at", cutoff48h)
        .limit(50);

      for (const outcome of lostOutcomes || []) {
        if (outcome.lost_reason === "bad_timing" || outcome.lost_reason === "no_show") {
          const { data: existing } = await supabase
            .from("lead_events")
            .select("id")
            .eq("event_type", "followup_triggered")
            .gte("created_at", cutoff48h)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from("lead_events").insert({
              event_type: "followup_triggered",
              actor_user_id: outcome.user_id,
              notes: `Auto Follow-Up: Lost Deal (${outcome.lost_reason})`,
              metadata: { trigger: "lost_deal", reason: outcome.lost_reason, outcome_id: outcome.id },
            });
            followupResults.push({ outcome_id: outcome.id, action: "lost_followup_created" });
          }
        }
      }

      return new Response(JSON.stringify({ followups: followupResults.length, details: followupResults }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 2. PERFORMANCE FLAGS ───
    if (action === "check_performance") {
      const { data: kpis } = await supabase.from("member_kpis").select("*");
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, business_stage");

      const flags: any[] = [];

      for (const kpi of kpis || []) {
        const profile = profiles?.find((p: any) => p.id === kpi.user_id);
        if (!profile) continue;

        const isCloser = ["junior_manager", "manager", "senior_manager", "director"].includes(profile.business_stage);
        const isSetter = ["setter", "associate_setter", "senior_associate", "senior_setter"].includes(profile.business_stage);

        // Closer: low close rate
        if (isCloser && (kpi.closing_rate ?? 0) < 15 && (kpi.calls_handled ?? 0) >= 10) {
          flags.push({
            user_id: kpi.user_id,
            name: profile.full_name,
            role: "closer",
            issue: "low_close_rate",
            value: kpi.closing_rate,
            recommendation: "training",
            message_de: `Close Rate nur ${kpi.closing_rate}% — Training empfohlen`,
            message_en: `Close rate only ${kpi.closing_rate}% — training recommended`,
          });
        }

        // Closer: high storno
        if (isCloser && (kpi.storno_rate ?? 0) > 15) {
          flags.push({
            user_id: kpi.user_id,
            name: profile.full_name,
            role: "closer",
            issue: "high_storno",
            value: kpi.storno_rate,
            recommendation: "review",
            message_de: `Storno Rate ${kpi.storno_rate}% — Qualitätscheck nötig`,
            message_en: `Storno rate ${kpi.storno_rate}% — quality check needed`,
          });
        }

        // Setter: low show rate
        if (isSetter && (kpi.show_rate ?? 0) < 60 && (kpi.calls_handled ?? 0) >= 5) {
          flags.push({
            user_id: kpi.user_id,
            name: profile.full_name,
            role: "setter",
            issue: "low_show_rate",
            value: kpi.show_rate,
            recommendation: "fewer_leads",
            message_de: `Show Rate nur ${kpi.show_rate}% — weniger Leads zuweisen`,
            message_en: `Show rate only ${kpi.show_rate}% — assign fewer leads`,
          });
        }

        // Setter: low qualification
        if (isSetter && (kpi.qualification_accuracy ?? 0) < 40 && (kpi.calls_handled ?? 0) >= 5) {
          flags.push({
            user_id: kpi.user_id,
            name: profile.full_name,
            role: "setter",
            issue: "low_qualification",
            value: kpi.qualification_accuracy,
            recommendation: "training",
            message_de: `Qualifikationsrate ${kpi.qualification_accuracy}% — Training empfohlen`,
            message_en: `Qualification rate ${kpi.qualification_accuracy}% — training recommended`,
          });
        }
      }

      // Log flags as events
      for (const flag of flags) {
        await supabase.from("lead_events").insert({
          event_type: "performance_flagged",
          actor_user_id: flag.user_id,
          notes: flag.message_de,
          metadata: { issue: flag.issue, value: flag.value, recommendation: flag.recommendation },
        });
      }

      return new Response(JSON.stringify({ flags }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 3. ROUTING SUGGESTIONS ───
    if (action === "suggest_routing") {
      const { lead_id } = await req.json().catch(() => ({}));

      const { data: kpis } = await supabase.from("member_kpis").select("*");
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, business_stage");

      const closerProfiles = profiles?.filter((p: any) =>
        ["junior_manager", "manager", "senior_manager", "director"].includes(p.business_stage)
      ) || [];

      const ranked = closerProfiles.map((p: any) => {
        const kpi = kpis?.find((k: any) => k.user_id === p.id);
        const closeRate = kpi?.closing_rate ?? 0;
        const activeDeals = kpi?.calls_handled ?? 0;
        const score = closeRate * 0.5 + Math.max(0, 100 - activeDeals * 5) * 0.3 + (kpi?.show_rate ?? 0) * 0.2;
        return { user_id: p.id, name: p.full_name, score: Math.round(score), close_rate: closeRate };
      }).sort((a: any, b: any) => b.score - a.score).slice(0, 3);

      // Log suggestion event
      await supabase.from("lead_events").insert({
        lead_id: lead_id || null,
        event_type: "auto_routing_suggested",
        notes: `Top 3: ${ranked.map((r: any) => r.name).join(", ")}`,
        metadata: { suggestions: ranked },
      });

      return new Response(JSON.stringify({ suggestions: ranked }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Automation engine error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
