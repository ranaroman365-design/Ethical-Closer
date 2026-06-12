import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface KpiThreshold {
  kpi_key: string;
  kpi_name: string;
  warning: number;
  critical: number;
  direction: "above" | "below"; // "below" = lower is worse, "above" = higher is worse
}

const THRESHOLDS: KpiThreshold[] = [
  { kpi_key: "closer_close_rate", kpi_name: "Closer Close Rate", warning: 20, critical: 10, direction: "below" },
  { kpi_key: "show_up_rate", kpi_name: "Show-Up Rate", warning: 60, critical: 40, direction: "below" },
  { kpi_key: "booking_rate", kpi_name: "Booking Rate", warning: 15, critical: 5, direction: "below" },
  { kpi_key: "setter_to_qualified_rate", kpi_name: "Setter Qualification Rate", warning: 30, critical: 15, direction: "below" },
  { kpi_key: "lead_aging_days", kpi_name: "Lead Aging (Days)", warning: 5, critical: 10, direction: "above" },
  { kpi_key: "module_completion_rate", kpi_name: "Module Completion Rate", warning: 40, critical: 20, direction: "below" },
  { kpi_key: "storno_rate", kpi_name: "Storno / Chargeback Rate", warning: 10, critical: 15, direction: "above" },
];

const ROOT_CAUSES: Record<string, { hypothesis: string; actions: string[] }> = {
  closer_close_rate: {
    hypothesis: "Closer skill gap, lead quality mismatch, or offer-market fit issue",
    actions: ["Training enhancement", "Lead quality audit", "New experiment: CTA wording", "Routing rule review"],
  },
  show_up_rate: {
    hypothesis: "Weak booking confirmation flow, insufficient reminder sequence, or low lead commitment",
    actions: ["Copy change: booking confirmation", "UI change: reminder flow", "New experiment: urgency framing"],
  },
  booking_rate: {
    hypothesis: "Funnel friction, unclear CTA, or messaging mismatch for target segment",
    actions: ["UI change: booking page", "Copy change: CTA", "New experiment: headline variant", "Dashboard improvement"],
  },
  setter_to_qualified_rate: {
    hypothesis: "Setter skill gap, unclear qualification criteria, or low-quality leads entering pipeline",
    actions: ["Training improvement", "Routing adjustment", "Dashboard: setter performance view"],
  },
  lead_aging_days: {
    hypothesis: "Operational bottleneck: insufficient setter/closer capacity or routing delays",
    actions: ["Routing adjustment", "Capacity alert", "Dashboard improvement: bottleneck view"],
  },
  module_completion_rate: {
    hypothesis: "Content friction, unclear learning path, or module too long/complex",
    actions: ["UI change: progress indicators", "Content restructure", "New experiment: module length"],
  },
  storno_rate: {
    hypothesis: "Misaligned expectations during close, pressure-based closing, or poor offer fit",
    actions: ["Training: ethical closing reinforcement", "AI support: call analysis focus", "Dashboard: storno tracking"],
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Get latest lead stats
    const { data: leads } = await supabase.from("leads").select("stage, created_at, setter_id, closer_id, deal_value");
    const allLeads = leads ?? [];

    const now = new Date();
    const recentLeads = allLeads.filter(l => {
      const d = new Date(l.created_at);
      return (now.getTime() - d.getTime()) < 30 * 86400000;
    });

    // Calculate current KPI values
    const total = recentLeads.length || 1;
    const closedWon = recentLeads.filter(l => l.stage === "closed_won").length;
    const closedLost = recentLeads.filter(l => l.stage === "closed_lost").length;
    const closerTotal = closedWon + closedLost;
    const qualified = recentLeads.filter(l => ["setter_qualified", "setter_booked", "ready_for_closer", "assigned_closer", "closer_in_progress", "offer_made", "follow_up", "closed_won", "closed_lost"].includes(l.stage)).length;
    const booked = recentLeads.filter(l => !["new", "quiz_completed"].includes(l.stage)).length;

    // Lead aging
    const poolLeads = allLeads.filter(l => ["new", "in_pool", "assigned_setter", "backlog"].includes(l.stage));
    const avgAgeDays = poolLeads.length > 0
      ? poolLeads.reduce((sum, l) => sum + (now.getTime() - new Date(l.created_at).getTime()) / 86400000, 0) / poolLeads.length
      : 0;

    // Module completion
    const { count: totalProgress } = await supabase.from("member_progress").select("*", { count: "exact", head: true }).eq("completed", true);
    const { count: totalModuleRows } = await supabase.from("member_progress").select("*", { count: "exact", head: true });

    const kpiValues: Record<string, number> = {
      closer_close_rate: closerTotal > 0 ? (closedWon / closerTotal) * 100 : 0,
      show_up_rate: total > 0 ? (booked / total) * 100 : 0,
      booking_rate: total > 0 ? (booked / total) * 100 : 0,
      setter_to_qualified_rate: total > 0 ? (qualified / total) * 100 : 0,
      lead_aging_days: Math.round(avgAgeDays * 10) / 10,
      module_completion_rate: (totalModuleRows ?? 1) > 0 ? ((totalProgress ?? 0) / (totalModuleRows ?? 1)) * 100 : 0,
      storno_rate: 0, // needs payment data
    };

    const recommendations: any[] = [];

    for (const threshold of THRESHOLDS) {
      const value = kpiValues[threshold.kpi_key] ?? 0;
      let severity: string | null = null;

      if (threshold.direction === "below") {
        if (value < threshold.critical) severity = "critical";
        else if (value < threshold.warning) severity = "warning";
      } else {
        if (value > threshold.critical) severity = "critical";
        else if (value > threshold.warning) severity = "warning";
      }

      if (severity) {
        const rootCause = ROOT_CAUSES[threshold.kpi_key];
        const rec = {
          aggregate_date: now.toISOString().split("T")[0],
          scope_key: "global",
          trigger_kpi_key: threshold.kpi_key,
          severity,
          recommendation_type: "kpi_alert",
          recommendation_text: `${threshold.kpi_name} at ${Math.round(value * 10) / 10}% (threshold: ${severity === "critical" ? threshold.critical : threshold.warning}%). Root cause: ${rootCause?.hypothesis || "Unknown"}. Suggested actions: ${rootCause?.actions.join(", ") || "Review manually"}.`,
          status: "open",
        };
        recommendations.push(rec);
      }
    }

    // Upsert recommendations (clear old open ones first)
    await supabase.from("director_recommendations").delete().eq("status", "open").eq("recommendation_type", "kpi_alert");

    if (recommendations.length > 0) {
      await supabase.from("director_recommendations").insert(recommendations);
    }

    return new Response(JSON.stringify({
      success: true,
      kpi_values: kpiValues,
      recommendations_generated: recommendations.length,
      recommendations,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
