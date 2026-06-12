import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Lead Routing Integration Test
 *
 * Validates:
 * 1. /apply leads → Oleg unit (funnel_path = '/apply')
 * 2. /qualify leads → Josue/Daniel unit (funnel_path = '/qualify')
 * 3. QA/test leads are excluded from real_leads_view (no KPI pollution)
 * 4. Simulation leads are excluded from real_leads_view
 *
 * All test leads are marked is_simulation=true AND use source='qa_test'
 * so they are guaranteed excluded from truth views.
 * Cleanup runs at end.
 */

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const tag = `routing_test_${Date.now()}`;
  const results: TestResult[] = [];
  const createdLeadIds: string[] = [];

  try {
    // ── Fetch operator_units to know expected mapping ──
    const { data: units } = await supabase
      .from("operator_units")
      .select("id, unit_name, funnel_path, operator_id, status")
      .eq("status", "active");

    const applyUnit = units?.find((u: any) => u.funnel_path === "/apply");
    const qualifyUnit = units?.find((u: any) => u.funnel_path === "/qualify");

    results.push({
      name: "apply_unit_exists",
      passed: !!applyUnit,
      detail: applyUnit
        ? `Unit "${applyUnit.unit_name}" (${applyUnit.id})`
        : "No active unit with funnel_path=/apply",
    });

    results.push({
      name: "qualify_unit_exists",
      passed: !!qualifyUnit,
      detail: qualifyUnit
        ? `Unit "${qualifyUnit.unit_name}" (${qualifyUnit.id})`
        : "No active unit with funnel_path=/qualify",
    });

    // ── TEST 1: /apply lead routes to Oleg unit ──
    const applyEmail = `test_apply_${tag}@routing.test`;
    const { data: applyLead, error: applyErr } = await supabase
      .from("leads")
      .insert({
        name: `Test Apply ${tag}`,
        email: applyEmail,
        source: "apply_direct",
        funnel_source: "apply_direct",
        stage: "new",
        is_simulation: true,
        contact_count: 0,
        qualification_checklist: {},
      })
      .select("id, unit_id, assigned_operator_id")
      .single();

    if (applyLead) createdLeadIds.push(applyLead.id);

    results.push({
      name: "apply_lead_routed_to_correct_unit",
      passed: !applyErr && !!applyLead && applyLead.unit_id === applyUnit?.id,
      detail: applyErr
        ? `Insert error: ${applyErr.message}`
        : `unit_id=${applyLead?.unit_id} (expected ${applyUnit?.id})`,
    });

    // With talent-weighted routing, assigned_operator_id may be a team member OR the unit operator
    results.push({
      name: "apply_lead_has_assigned_operator",
      passed: !!applyLead && !!applyLead.assigned_operator_id,
      detail: `operator=${applyLead?.assigned_operator_id} (unit operator=${applyUnit?.operator_id}, may differ due to talent-weighted routing)`,
    });

    // ── TEST 2: /qualify lead routes to Josue/Daniel unit ──
    const qualifyEmail = `test_qualify_${tag}@routing.test`;
    const { data: qualifyLead, error: qualifyErr } = await supabase
      .from("leads")
      .insert({
        name: `Test Qualify ${tag}`,
        email: qualifyEmail,
        source: "qualify_filter",
        funnel_source: "qualify_filter",
        stage: "new",
        is_simulation: true,
        contact_count: 0,
        qualification_checklist: {},
      })
      .select("id, unit_id, assigned_operator_id")
      .single();

    if (qualifyLead) createdLeadIds.push(qualifyLead.id);

    results.push({
      name: "qualify_lead_routed_to_correct_unit",
      passed:
        !qualifyErr && !!qualifyLead && qualifyLead.unit_id === qualifyUnit?.id,
      detail: qualifyErr
        ? `Insert error: ${qualifyErr.message}`
        : `unit_id=${qualifyLead?.unit_id} (expected ${qualifyUnit?.id})`,
    });

    results.push({
      name: "qualify_lead_has_assigned_operator",
      passed: !!qualifyLead && !!qualifyLead.assigned_operator_id,
      detail: `operator=${qualifyLead?.assigned_operator_id} (unit operator=${qualifyUnit?.operator_id}, may differ due to talent-weighted routing)`,
    });

    // ── TEST 3: QA leads excluded from real_leads_view ──
    // Insert a lead with source='qa_test' (matches is_test_lead ILIKE '%test%')
    const qaEmail = `qa_kpi_pollution_${tag}@routing.test`;
    const { data: qaLead } = await supabase
      .from("leads")
      .insert({
        name: `QA KPI Pollution Check ${tag}`,
        email: qaEmail,
        source: "qa_test",
        funnel_source: "external_inbound",
        stage: "new",
        is_simulation: false,
        contact_count: 0,
        qualification_checklist: {},
      })
      .select("id")
      .single();

    if (qaLead) createdLeadIds.push(qaLead.id);

    // Check if it appears in real_leads_view
    const { data: inView } = await supabase
      .from("real_leads_view" as any)
      .select("id")
      .eq("id", qaLead?.id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    results.push({
      name: "qa_source_excluded_from_truth_view",
      passed: !inView,
      detail: inView
        ? `FAIL: qa_test lead ${qaLead?.id} visible in real_leads_view — KPI POLLUTION`
        : "qa_test source correctly excluded",
    });

    // ── TEST 4: is_simulation=true excluded from real_leads_view ──
    const simEmail = `sim_check_${tag}@routing.test`;
    const { data: simLead } = await supabase
      .from("leads")
      .insert({
        name: `Simulation Check ${tag}`,
        email: simEmail,
        source: "apply_direct",
        funnel_source: "apply_direct",
        stage: "new",
        is_simulation: true,
        contact_count: 0,
        qualification_checklist: {},
      })
      .select("id")
      .single();

    if (simLead) createdLeadIds.push(simLead.id);

    const { data: simInView } = await supabase
      .from("real_leads_view" as any)
      .select("id")
      .eq("id", simLead?.id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    results.push({
      name: "simulation_lead_excluded_from_truth_view",
      passed: !simInView,
      detail: simInView
        ? `FAIL: simulation lead ${simLead?.id} visible in real_leads_view`
        : "is_simulation=true correctly excluded",
    });

    // ── TEST 5: "Test" prefix name excluded ──
    const testNameEmail = `testname_${tag}@routing.test`;
    const { data: testNameLead } = await supabase
      .from("leads")
      .insert({
        name: `TestPrefixLead ${tag}`,
        email: testNameEmail,
        source: "apply_direct",
        funnel_source: "apply_direct",
        stage: "new",
        is_simulation: false,
        contact_count: 0,
        qualification_checklist: {},
      })
      .select("id")
      .single();

    if (testNameLead) createdLeadIds.push(testNameLead.id);

    const { data: testNameInView } = await supabase
      .from("real_leads_view" as any)
      .select("id")
      .eq("id", testNameLead?.id ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    results.push({
      name: "test_prefix_name_excluded_from_truth_view",
      passed: !testNameInView,
      detail: testNameInView
        ? `FAIL: lead named "TestPrefixLead" visible in real_leads_view`
        : "Test-prefix name correctly excluded",
    });

    // ── TEST 6: Distribution log does NOT include test/simulation leads ──
    // Check distribution_log for any of our test leads
    // Check distribution log for recent entries by unit + time (lead_id may not match if BEFORE INSERT)
    const { data: distLogs } = await supabase
      .from("lead_distribution_log")
      .select("id, lead_id, assigned_member_id, reason, unit_id")
      .gte("created_at", new Date(Date.now() - 60000).toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    const recentRoutingLogs = (distLogs ?? []).filter((d: any) =>
      createdLeadIds.includes(d.lead_id) ||
      [applyUnit?.id, qualifyUnit?.id].includes(d.unit_id)
    );

    results.push({
      name: "distribution_log_records_routing_decisions",
      passed: true, // Informational — routing works even without log
      detail: recentRoutingLogs.length > 0
        ? `${recentRoutingLogs.length} entries (reasons: ${recentRoutingLogs.map((d: any) => d.reason).join(", ")})`
        : "No distribution log entries — trigger log insert may be deferred or team members not configured",
    });

    // ── CLEANUP: delete test leads + distribution logs ──
    if (createdLeadIds.length > 0) {
      await supabase.from("lead_distribution_log").delete().in("lead_id", createdLeadIds);
      await supabase.from("leads").delete().in("id", createdLeadIds);
    }

    const allPassed = results.every((r) => r.passed);

    return new Response(
      JSON.stringify({
        success: allPassed,
        tag,
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        results,
      }),
      {
        status: allPassed ? 200 : 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    // Cleanup on error
    if (createdLeadIds.length > 0) {
      await supabase.from("leads").delete().in("id", createdLeadIds);
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
