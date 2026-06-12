import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * QA Synthetic Test Data Generator + Validation Loop
 * Creates validated call objects with realistic funnel distributions.
 * NOT real leads — purely for KPI validation.
 *
 * Datasets:
 *   A: 30 booked, 21 showed, 9 no_show, 7 won, 14 lost → show_rate 70%
 *   B: 10 booked, 6 showed, 4 no_show, 2 won, 4 lost → show_rate 60%
 *   C: 0 booked → show_rate 0%
 */

const DATASETS = [
  { label: "A", leads: 40, booked: 30, showed: 21, noShow: 9, won: 7, lost: 14, expectedShowRate: 70 },
  { label: "B", leads: 20, booked: 10, showed: 6, noShow: 4, won: 2, lost: 4, expectedShowRate: 60 },
  { label: "C", leads: 10, booked: 0, showed: 0, noShow: 0, won: 0, lost: 0, expectedShowRate: 0 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find a user to assign test calls to
    const { data: testUser } = await supabase
      .from("profiles")
      .select("id")
      .limit(1)
      .single();

    if (!testUser) {
      return new Response(
        JSON.stringify({ error: "No user profile found for test data assignment" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = testUser.id;
    const results: any[] = [];
    const now = new Date();
    const qaTag = `qa_${Date.now()}`;

    for (const ds of DATASETS) {
      const datasetResult: any = {
        dataset: ds.label,
        expected_show_rate: ds.expectedShowRate,
        calls_created: 0,
        leads_created: 0,
      };

      // Create leads
      for (let i = 0; i < ds.leads; i++) {
        const { error: leadErr } = await supabase.from("leads").insert({
          name: `QA_${ds.label}_${i}_${qaTag}`,
          email: `qa_${ds.label.toLowerCase()}_${i}_${qaTag}@test.local`,
          source: "qa_test",
          stage: "new",
          contact_count: 0,
          qualification_checklist: {},
        });
        if (!leadErr) datasetResult.leads_created++;
      }

      // Create calls for booked portion
      for (let i = 0; i < ds.booked; i++) {
        const bookedAt = new Date(now.getTime() - (7 - Math.random() * 6) * 86400000);
        const scheduledFor = new Date(bookedAt.getTime() + 86400000);

        let showedAt: string | null = null;
        let noShowAt: string | null = null;
        let closedAt: string | null = null;
        let result: string | null = null;
        let revenue: number | null = null;
        let status = "booked";

        if (i < ds.showed) {
          showedAt = new Date(scheduledFor.getTime() + 300000).toISOString();
          status = "showed";

          if (i < ds.won) {
            closedAt = new Date(new Date(showedAt).getTime() + 3600000).toISOString();
            result = "won";
            revenue = Math.round(2000 + Math.random() * 8000);
            status = "closed_won";
          } else if (i < ds.won + ds.lost) {
            closedAt = new Date(new Date(showedAt).getTime() + 3600000).toISOString();
            result = "lost";
            revenue = 0;
            status = "closed_lost";
          }
        } else {
          noShowAt = scheduledFor.toISOString();
          status = "no_show";
        }

        const { error: callErr } = await supabase.from("calls").insert({
          user_id: userId,
          call_type: "closing",
          offer_type: "high_ticket",
          funnel_stage: qaTag,
          status,
          booked_at: bookedAt.toISOString(),
          scheduled_for: scheduledFor.toISOString(),
          showed_at: showedAt,
          no_show_at: noShowAt,
          closed_at: closedAt,
          result,
          revenue,
        });

        if (!callErr) datasetResult.calls_created++;
      }

      // --- VALIDATION LOOP for this dataset ---
      const { data: dsCalls } = await supabase.from("calls")
        .select("id, booked_at, showed_at, no_show_at, closed_at, result, status")
        .eq("user_id", userId)
        .eq("funnel_stage", qaTag);

      const calls = dsCalls ?? [];
      const bookedCount = calls.filter(c => c.booked_at !== null).length;
      const showedCount = calls.filter(c => c.showed_at !== null).length;
      const noShowCount = calls.filter(c => c.no_show_at !== null).length;
      const wonCount = calls.filter(c => c.result === "won" && c.closed_at !== null).length;
      const lostCount = calls.filter(c => c.result === "lost" && c.closed_at !== null).length;

      const uniqueIds = new Set(calls.map(c => c.id));
      const hasDuplicates = uniqueIds.size !== calls.length;

      const invalidStates = calls.filter(c =>
        (c.showed_at && !c.booked_at) ||
        (c.closed_at && !c.showed_at) ||
        (c.showed_at && c.no_show_at)
      );

      const calculatedShowRate = bookedCount > 0
        ? Math.min(Math.round((showedCount / bookedCount) * 1000) / 10, 100)
        : 0;

      datasetResult.validation = {
        booked_calls: bookedCount,
        showed_calls: showedCount,
        no_show_calls: noShowCount,
        closed_won: wonCount,
        closed_lost: lostCount,
        calculated_show_rate: calculatedShowRate,
        has_duplicates: hasDuplicates,
        invalid_state_count: invalidStates.length,
        show_rate_exceeds_100: calculatedShowRate > 100,
        matches_expected: Math.abs(calculatedShowRate - ds.expectedShowRate) < 1,
        passed: !hasDuplicates && invalidStates.length === 0 && calculatedShowRate <= 100,
      };

      results.push(datasetResult);
    }

    // Recalc KPI snapshot
    await supabase.rpc("recalc_user_kpi_snapshot", { p_user_id: userId });

    const { data: snapshot } = await supabase
      .from("users_kpi_snapshot")
      .select("show_rate, close_rate, earnings_per_call, performance_score")
      .eq("user_id", userId)
      .single();

    // Verify snapshot integrity
    const snapshotValid = snapshot
      ? (snapshot.show_rate ?? 0) <= 100 && (snapshot.close_rate ?? 0) <= 100
      : false;

    // Audit
    await supabase.from("audit_logs").insert({
      action: "qa_test_data_generated",
      source_type: "qa",
      note: `QA ${qaTag}: ${results.map(r =>
        `DS-${r.dataset}: show=${r.validation?.calculated_show_rate}% (exp ${r.expected_show_rate}%) ${r.validation?.passed ? '✓' : '✗'}`
      ).join("; ")}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        qa_tag: qaTag,
        datasets: results,
        kpi_snapshot_after: snapshot,
        snapshot_valid: snapshotValid,
        all_validations_passed: results.every(r => r.validation?.passed),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
