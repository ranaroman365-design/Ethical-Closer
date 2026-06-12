import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Learning modules required per stage before promotion is allowed
const LEARNING_REQUIREMENTS: Record<string, number[]> = {
  prospect: [],
  opener: [1],
  setter: [1, 2],
  associate_setter: [1, 2],
  associate: [1, 2],
  senior_associate: [1, 2, 3],
  senior_setter: [1, 2, 3],
  junior_manager: [1, 2, 3, 4],
  manager: [1, 2, 3, 4, 5],
  senior_manager: [1, 2, 3, 4, 5, 6],
  director: [1, 2, 3, 4, 5, 6],
  partner: [1, 2, 3, 4, 5, 6],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { user_id } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user_id).single();
    if (!profile) return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (profile.manual_stage_lock) {
      return new Response(JSON.stringify({ message: "Stage locked manually", stage: profile.business_stage }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Learning Lock Check ──
    const requiredPhases = LEARNING_REQUIREMENTS[profile.business_stage] || [];
    if (requiredPhases.length > 0) {
      // Get all modules in required phases
      const { data: requiredModules } = await supabase
        .from("modules")
        .select("id, phase_id")
        .in("phase_id", requiredPhases);

      const requiredModuleIds = (requiredModules ?? []).map((m: any) => m.id);

      // Get completed modules for this user
      const { data: completedProgress } = await supabase
        .from("member_progress")
        .select("module_id")
        .eq("user_id", user_id)
        .eq("completed", true)
        .in("module_id", requiredModuleIds);

      const completedIds = new Set((completedProgress ?? []).map((p: any) => p.module_id));
      const allLearningComplete = requiredModuleIds.every((id: string) => completedIds.has(id));

      if (!allLearningComplete) {
        return new Response(JSON.stringify({
          message: "Learning requirements not met",
          stage: profile.business_stage,
          learning_progress: {
            completed: completedIds.size,
            required: requiredModuleIds.length,
            missing: requiredModuleIds.filter((id: string) => !completedIds.has(id)).length,
          },
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── Threshold Evaluation ──
    const { data: thresholds } = await supabase
      .from("thresholds")
      .select("*")
      .eq("stage_scope", profile.business_stage)
      .eq("active", true);

    if (!thresholds?.length) {
      return new Response(JSON.stringify({ message: "No thresholds for stage", stage: profile.business_stage }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [progressRes, kpisRes, quizRes, callsRes] = await Promise.all([
      supabase.from("member_progress").select("module_id, completed").eq("user_id", user_id).eq("completed", true),
      supabase.from("member_kpis").select("*").eq("user_id", user_id).single(),
      supabase.from("quiz_attempts").select("module_id, passed").eq("user_id", user_id).eq("passed", true),
      supabase.from("practice_calls").select("id, total_score, status").eq("user_id", user_id),
    ]);

    const completedModules = (progressRes.data ?? []).map((p: any) => p.module_id);
    const kpis = kpisRes.data;
    const passedQuizzes = (quizRes.data ?? []).map((q: any) => q.module_id);
    const scoredCalls = (callsRes.data ?? []).filter((c: any) => c.status === "scored");

    const results: any[] = [];

    for (const threshold of thresholds) {
      const conditions = threshold.conditions as any[];
      const conditionType = threshold.condition_type || "all";
      const progress: Record<string, boolean> = {};

      for (const cond of conditions) {
        let met = false;
        switch (cond.type) {
          case "modules_completed":
            met = completedModules.length >= (cond.count || 0);
            break;
          case "phase_completed": {
            const { data: phaseModules } = await supabase
              .from("modules").select("id").eq("phase_id", cond.phase_id);
            const phaseModuleIds = (phaseModules ?? []).map((m: any) => m.id);
            met = phaseModuleIds.length > 0 && phaseModuleIds.every((id: string) => completedModules.includes(id));
            break;
          }
          case "quiz_passed":
            met = passedQuizzes.includes(cond.module_id);
            break;
          case "kpi_min":
            met = kpis ? (kpis[cond.field] ?? 0) >= cond.value : false;
            break;
          case "kpi_max":
            met = kpis ? (kpis[cond.field] ?? 100) <= cond.value : false;
            break;
          case "practice_calls_min":
            met = scoredCalls.length >= (cond.count || 0);
            break;
          case "practice_score_min":
            met = scoredCalls.some((c: any) => (c.total_score ?? 0) >= (cond.score || 0));
            break;
          case "certified":
            met = profile.certified === true;
            break;
          case "storno_rate_max":
            met = kpis ? (kpis.storno_rate ?? 0) <= (cond.value || 10) : true;
            break;
          default:
            met = false;
        }
        progress[cond.type + (cond.field || cond.phase_id || "")] = met;
      }

      const allMet = conditionType === "all"
        ? Object.values(progress).every(Boolean)
        : Object.values(progress).some(Boolean);

      await supabase.from("user_threshold_states").upsert({
        user_id,
        threshold_id: threshold.id,
        status: allMet ? "met" : "pending",
        progress,
        evaluated_at: new Date().toISOString(),
        result: { all_met: allMet, conditions_met: Object.entries(progress).filter(([, v]) => v).length, total: Object.keys(progress).length },
      }, { onConflict: "user_id,threshold_id" });

      if (allMet && !threshold.requires_manual_approval) {
        await supabase.from("profiles").update({
          business_stage: threshold.target_stage,
          updated_at: new Date().toISOString(),
        }).eq("id", user_id);

        await supabase.from("audit_logs").insert({
          action: "stage_promotion",
          actor_id: user_id,
          target_user_id: user_id,
          source_type: "threshold_engine",
          before_state: { stage: profile.business_stage },
          after_state: { stage: threshold.target_stage },
          note: `Auto-promoted via threshold: ${threshold.name} (learning: ✓, KPIs: ✓)`,
        });

        results.push({ threshold: threshold.name, promoted_to: threshold.target_stage });
      } else {
        results.push({ threshold: threshold.name, status: allMet ? "met_awaiting_approval" : "pending", progress });
      }
    }

    // ── Timebox & Radiant trigger check ──
    try {
      const { data: timeboxResult } = await supabase.rpc("check_timebox_and_triggers", { p_user_id: user_id });
      results.push({ timebox: timeboxResult });
    } catch (_) {
      // Non-critical — don't block threshold evaluation
    }

    // ── Escalation detection (run once per evaluation cycle) ──
    try {
      const { data: escalationResult } = await supabase.rpc("detect_escalations");
      results.push({ escalations: escalationResult });
    } catch (_) {
      // Non-critical
    }

    return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
