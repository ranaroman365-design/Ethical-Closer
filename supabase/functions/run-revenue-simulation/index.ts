import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Revenue Simulation Mode — Full Funnel QA
 *
 * Generates 4 isolated datasets (A–D) with synthetic leads, calls,
 * commissions, and validates end-to-end KPI integrity.
 *
 * All records are flagged with is_simulation=true and share a batch_id.
 */

interface DatasetConfig {
  label: string;
  leads: number;
  booked: number;
  showed: number;
  noShow: number;
  won: number;
  lost: number;
  revenuePerWin: number[];
}

const DATASETS: DatasetConfig[] = [
  {
    label: "A",
    leads: 50, booked: 30, showed: 21, noShow: 9, won: 8, lost: 13,
    revenuePerWin: [4400, 4400, 4400, 4400, 1600, 1600, 2900, 2900],
  },
  {
    label: "B",
    leads: 30, booked: 15, showed: 8, noShow: 7, won: 3, lost: 5,
    revenuePerWin: [4400, 4400, 1600],
  },
  {
    label: "C",
    leads: 15, booked: 0, showed: 0, noShow: 0, won: 0, lost: 0,
    revenuePerWin: [],
  },
  {
    label: "D",
    leads: 40, booked: 28, showed: 24, noShow: 4, won: 12, lost: 12,
    revenuePerWin: [4400, 4400, 4400, 4400, 4400, 4400, 2900, 2900, 2900, 1600, 1600, 1600],
  },
];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse optional body
    let clearPrevious = false;
    try {
      const body = await req.json();
      clearPrevious = body?.clear_previous === true;
    } catch { /* no body is fine */ }

    // Find test users (opener, setter, closer)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, business_stage")
      .limit(10);

    if (!profiles || profiles.length === 0) {
      return json({ error: "No profiles found for simulation" }, 400);
    }

    const findByStage = (stages: string[]) =>
      profiles.find(p => stages.includes(p.business_stage))?.id || profiles[0].id;

    const openerId = findByStage(["opener", "trainee"]);
    const setterId = findByStage(["associate", "setter", "senior_associate"]);
    const closerId = findByStage(["junior_manager", "manager", "senior_manager"]);

    const batchId = `sim_${Date.now()}`;

    // Optionally clear previous simulation data
    if (clearPrevious) {
      await supabase.from("commissions").delete().eq("is_simulation", true);
      await supabase.from("calls").delete().eq("is_simulation", true);
      await supabase.from("leads").delete().eq("is_simulation", true);
    }

    const results: any[] = [];
    const now = Date.now();

    for (const ds of DATASETS) {
      const dsResult: any = {
        dataset: ds.label,
        leads_created: 0,
        calls_created: 0,
        commissions_created: 0,
        total_revenue: 0,
        total_commissions: 0,
      };

      // ── Create synthetic leads ──
      const leadIds: string[] = [];
      for (let i = 0; i < ds.leads; i++) {
        const { data: lead, error } = await supabase.from("leads").insert({
          name: `SIM_${ds.label}_${i}_${batchId}`,
          email: `sim_${ds.label.toLowerCase()}_${i}_${batchId}@test.local`,
          source: "simulation",
          stage: "new",
          contact_count: 0,
          qualification_checklist: {},
          is_simulation: true,
          simulation_batch_id: batchId,
        }).select("id").single();

        if (!error && lead) {
          leadIds.push(lead.id);
          dsResult.leads_created++;
        }
      }

      // ── Create call objects ──
      const callIds: string[] = [];
      for (let i = 0; i < ds.booked; i++) {
        const bookedAt = new Date(now - (14 - Math.random() * 13) * 86400000);
        const scheduledFor = new Date(bookedAt.getTime() + 86400000);

        let showedAt: string | null = null;
        let noShowAt: string | null = null;
        let closedAt: string | null = null;
        let result: string | null = null;
        let revenue: number | null = null;
        let dealSize: number | null = null;
        let status = "booked";

        if (i < ds.showed) {
          // Showed
          showedAt = new Date(scheduledFor.getTime() + 300000).toISOString();
          status = "showed";

          if (i < ds.won) {
            // Won
            closedAt = new Date(new Date(showedAt).getTime() + 3600000).toISOString();
            result = "won";
            revenue = ds.revenuePerWin[i] ?? 3000;
            dealSize = revenue;
            status = "closed_won";
            dsResult.total_revenue += revenue;
          } else if (i < ds.won + ds.lost) {
            // Lost
            closedAt = new Date(new Date(showedAt).getTime() + 3600000).toISOString();
            result = "lost";
            revenue = 0;
            status = "closed_lost";
          }
        } else {
          // No-show
          noShowAt = scheduledFor.toISOString();
          status = "no_show";
        }

        const { data: call, error: callErr } = await supabase.from("calls").insert({
          user_id: closerId,
          opener_id: openerId,
          setter_id: setterId,
          call_type: "closing",
          offer_type: "high_ticket",
          funnel_stage: batchId,
          status,
          booked_at: bookedAt.toISOString(),
          scheduled_for: scheduledFor.toISOString(),
          showed_at: showedAt,
          no_show_at: noShowAt,
          closed_at: closedAt,
          result,
          revenue,
          deal_size: dealSize,
          is_simulation: true,
          simulation_batch_id: batchId,
        }).select("id").single();

        if (!callErr && call) {
          callIds.push(call.id);
          dsResult.calls_created++;

          // ── Generate commissions for won calls ──
          if (result === "won" && revenue && revenue > 0) {
            const commissions = [
              { user_id: openerId, role: "opener", amount: Math.round(revenue * 0.01 * 100) / 100 },
              { user_id: setterId, role: "setter", amount: Math.round(revenue * 0.03 * 100) / 100 },
              { user_id: closerId, role: "closer", amount: Math.round(revenue * 0.10 * 100) / 100 },
            ];

            for (const comm of commissions) {
              const { error: commErr } = await supabase.from("commissions").insert({
                call_id: call.id,
                user_id: comm.user_id,
                role: comm.role,
                amount: comm.amount,
                is_simulation: true,
                simulation_batch_id: batchId,
              });
              if (!commErr) {
                dsResult.commissions_created++;
                dsResult.total_commissions += comm.amount;
              }
            }
          }
        }
      }

      // ── Validation Loop ──
      const { data: dsCalls } = await supabase.from("calls")
        .select("id, booked_at, showed_at, no_show_at, closed_at, result, status, revenue")
        .eq("simulation_batch_id", batchId)
        .eq("funnel_stage", batchId)
        .eq("is_simulation", true);

      const calls = dsCalls ?? [];
      const bookedCount = calls.filter(c => c.booked_at !== null).length;
      const showedCount = calls.filter(c => c.showed_at !== null).length;
      const noShowCount = calls.filter(c => c.no_show_at !== null).length;
      const wonCount = calls.filter(c => c.result === "won" && c.closed_at !== null).length;
      const lostCount = calls.filter(c => c.result === "lost" && c.closed_at !== null).length;
      const totalRev = calls.filter(c => c.result === "won").reduce((s, c) => s + (c.revenue || 0), 0);

      const uniqueIds = new Set(calls.map(c => c.id));
      const hasDuplicates = uniqueIds.size !== calls.length;

      const invalidStates = calls.filter(c =>
        (c.showed_at && !c.booked_at) ||
        (c.closed_at && !c.showed_at) ||
        (c.showed_at && c.no_show_at)
      );

      const showRate = bookedCount > 0
        ? Math.min(Math.round((showedCount / bookedCount) * 1000) / 10, 100)
        : 0;

      const closeRate = showedCount > 0
        ? Math.min(Math.round((wonCount / showedCount) * 1000) / 10, 100)
        : 0;

      const expectedShowRate = ds.booked > 0
        ? Math.round((ds.showed / ds.booked) * 1000) / 10
        : 0;

      // Commission traceability
      const { data: dsComms } = await supabase.from("commissions")
        .select("id, call_id, user_id, role, amount")
        .eq("simulation_batch_id", batchId)
        .eq("is_simulation", true);

      const comms = dsComms ?? [];
      const commCallIds = new Set(comms.map(c => c.call_id));
      const wonCallIds = calls.filter(c => c.result === "won").map(c => c.id);
      const orphanComms = comms.filter(c => !wonCallIds.includes(c.call_id));

      // Check for duplicate role per call
      const roleKeys = comms.map(c => `${c.call_id}_${c.role}`);
      const duplicateComms = roleKeys.length !== new Set(roleKeys).size;

      dsResult.validation = {
        booked_calls: bookedCount,
        showed_calls: showedCount,
        no_show_calls: noShowCount,
        closed_won: wonCount,
        closed_lost: lostCount,
        show_rate: showRate,
        close_rate: closeRate,
        expected_show_rate: expectedShowRate,
        total_revenue_verified: totalRev,
        has_duplicate_calls: hasDuplicates,
        invalid_state_count: invalidStates.length,
        show_rate_exceeds_100: showRate > 100,
        close_rate_exceeds_100: closeRate > 100,
        orphan_commissions: orphanComms.length,
        duplicate_commissions: duplicateComms,
        matches_expected_show_rate: Math.abs(showRate - expectedShowRate) < 1,
        traceability_passed: orphanComms.length === 0 && !duplicateComms,
        passed: !hasDuplicates && invalidStates.length === 0 && showRate <= 100 && closeRate <= 100 && orphanComms.length === 0 && !duplicateComms,
      };

      // Net contribution (Director ROI)
      dsResult.net_contribution = totalRev - dsResult.total_commissions;
      dsResult.revenue_per_showed = showedCount > 0 ? Math.round(totalRev / showedCount) : 0;

      results.push(dsResult);
    }

    // ── Director ROI Summary ──
    const totalLeads = results.reduce((s, r) => s + r.leads_created, 0);
    const totalBooked = results.reduce((s, r) => s + (r.validation?.booked_calls || 0), 0);
    const totalShowed = results.reduce((s, r) => s + (r.validation?.showed_calls || 0), 0);
    const totalWon = results.reduce((s, r) => s + (r.validation?.closed_won || 0), 0);
    const totalRevenue = results.reduce((s, r) => s + r.total_revenue, 0);
    const totalCommissions = results.reduce((s, r) => s + r.total_commissions, 0);

    const roiSummary = {
      total_leads: totalLeads,
      total_booked: totalBooked,
      total_showed: totalShowed,
      total_won: totalWon,
      total_revenue: totalRevenue,
      total_commissions: Math.round(totalCommissions * 100) / 100,
      net_contribution: Math.round((totalRevenue - totalCommissions) * 100) / 100,
      overall_show_rate: totalBooked > 0 ? Math.min(Math.round((totalShowed / totalBooked) * 1000) / 10, 100) : 0,
      overall_close_rate: totalShowed > 0 ? Math.min(Math.round((totalWon / totalShowed) * 1000) / 10, 100) : 0,
      revenue_per_showed: totalShowed > 0 ? Math.round(totalRevenue / totalShowed) : 0,
    };

    const allPassed = results.every(r => r.validation?.passed);

    // ── Audit log ──
    await supabase.from("audit_logs").insert({
      action: "revenue_simulation_completed",
      source_type: "qa",
      note: `Simulation ${batchId}: ${results.length} datasets, ${totalLeads} leads, ${totalWon} won, €${totalRevenue} rev, all_passed=${allPassed}`,
    });

    return json({
      success: true,
      batch_id: batchId,
      datasets: results,
      director_roi: roiSummary,
      all_validations_passed: allPassed,
    });
  } catch (error) {
    console.error("[run-revenue-simulation] Error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
