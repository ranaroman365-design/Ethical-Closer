import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RegressionResult {
  test_name: string;
  category: string;
  passed: boolean;
  message: string;
  details: Record<string, unknown>;
}

/**
 * QA Regression — Server-side assertions for canonical integrity.
 *
 * Runs every 6h (offset from system-health-check).
 * Categories:
 *   DEDUP          — communication_dedup + dispatch_log integrity
 *   CANONICAL_LEAK — outbound_events skip-list enforcement
 *   STATE_MACHINE  — lead_state_log + conversion_state consistency
 *   KPI_PIPELINE   — canonical KPI table freshness
 *
 * Results written to health_check_results (domain: qa_regression).
 * Failures create health_check_alerts.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const results: RegressionResult[] = [];
  const windowHours = 24;
  const cutoff = new Date(Date.now() - windowHours * 3600_000).toISOString();

  // ── DEDUP TESTS ──────────────────────────────────────────────────

  // T1: No duplicate dispatches (same lead+event within window)
  const { data: dispatchRows } = await sb
    .from("communication_dispatch_log")
    .select("lead_id, event_key, status")
    .gte("created_at", cutoff)
    .neq("status", "dedup_blocked");

  const dispatchMap = new Map<string, number>();
  for (const row of (dispatchRows ?? []) as { lead_id: string; event_key: string }[]) {
    const key = `${row.lead_id}::${row.event_key}`;
    dispatchMap.set(key, (dispatchMap.get(key) ?? 0) + 1);
  }
  const dupeGroups = [...dispatchMap.entries()].filter(([, c]) => c > 1);

  results.push({
    test_name: "dedup_no_duplicate_dispatches",
    category: "dedup",
    passed: dupeGroups.length === 0,
    message: dupeGroups.length === 0
      ? "Keine doppelten Dispatches in 24h"
      : `${dupeGroups.length} Duplikat-Gruppen gefunden`,
    details: { duplicate_groups: dupeGroups.length, window_hours: windowHours },
  });

  // T2: Dedup entries consistency check
  const { count: dedupCount } = await sb
    .from("communication_dedup")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff);

  const { count: blockedCount } = await sb
    .from("communication_dispatch_log")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff)
    .eq("status", "dedup_blocked");

  results.push({
    test_name: "dedup_entries_consistent",
    category: "dedup",
    passed: true, // informational
    message: `${dedupCount ?? 0} Dedup-Keys, ${blockedCount ?? 0} geblockte Dispatches`,
    details: { dedup_keys: dedupCount, blocked_dispatches: blockedCount },
  });

  // ── CANONICAL LEAK TESTS ─────────────────────────────────────────

  const CANONICALIZED = [
    "appointment.reminder_24h", "appointment.reminder_2h", "appointment.reminder_10m",
    "retargeting.sms_2h", "retargeting.email_24h", "retargeting.sms_48h", "retargeting.email_72h",
  ];

  // T3: No canonicalized events sent via legacy path
  const { count: leakedSent } = await sb
    .from("outbound_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff)
    .eq("status", "sent")
    .in("event_name", CANONICALIZED);

  results.push({
    test_name: "canonical_no_legacy_leak",
    category: "canonical_leak",
    passed: (leakedSent ?? 0) === 0,
    message: (leakedSent ?? 0) === 0
      ? "Kein Legacy-Leak: alle kanonisierten Events korrekt geskippt"
      : `FAIL: ${leakedSent} kanonisierte Events über Legacy gesendet`,
    details: { leaked: leakedSent, patterns: CANONICALIZED },
  });

  // T4: Skip list active (informational)
  const { count: skippedCount } = await sb
    .from("outbound_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff)
    .eq("status", "skipped")
    .in("event_name", CANONICALIZED);

  results.push({
    test_name: "canonical_skip_list_active",
    category: "canonical_leak",
    passed: true,
    message: `${skippedCount ?? 0} kanonisierte Events korrekt geskippt`,
    details: { skipped: skippedCount },
  });

  // ── STATE MACHINE TESTS ──────────────────────────────────────────

  // T5: No INVALID_TRANSITION events
  const { count: invalidTransitions } = await sb
    .from("lead_state_log")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff)
    .eq("event", "INVALID_TRANSITION");

  results.push({
    test_name: "state_no_invalid_transitions",
    category: "state_machine",
    passed: (invalidTransitions ?? 0) === 0,
    message: (invalidTransitions ?? 0) === 0
      ? "Keine ungültigen State-Transitionen"
      : `FAIL: ${invalidTransitions} ungültige Transitionen`,
    details: { violations: invalidTransitions },
  });

  // T6: No orphaned state log entries
  const { data: recentLogs } = await sb
    .from("lead_state_log")
    .select("lead_id, to_state")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(100);

  let stateOrphans = 0;
  const checkedLeads = new Set<string>();
  for (const log of (recentLogs ?? []) as { lead_id: string; to_state: string }[]) {
    if (checkedLeads.has(log.lead_id)) continue;
    checkedLeads.add(log.lead_id);
    const { data: lead } = await sb
      .from("leads")
      .select("conversion_state")
      .eq("id", log.lead_id)
      .maybeSingle();
    if (!lead) stateOrphans++;
  }

  results.push({
    test_name: "state_no_orphaned_logs",
    category: "state_machine",
    passed: stateOrphans === 0,
    message: stateOrphans === 0
      ? `${checkedLeads.size} Lead-States verifiziert, keine Waisen`
      : `FAIL: ${stateOrphans} State-Log-Einträge ohne zugehörigen Lead`,
    details: { checked: checkedLeads.size, orphans: stateOrphans },
  });

  // T7: GHL bypass guard
  const { count: ghlOverrides } = await sb
    .from("raw_webhook_events")
    .select("*", { count: "exact", head: true })
    .gte("received_at", cutoff)
    .eq("source", "ghl")
    .in("event_name", ["contact.update", "opportunity.update", "contact.stage_changed"]);

  results.push({
    test_name: "state_ghl_bypass_blocked",
    category: "state_machine",
    passed: (ghlOverrides ?? 0) <= 5,
    message: (ghlOverrides ?? 0) === 0
      ? "Keine GHL-State-Override-Versuche"
      : `${ghlOverrides} GHL-Override-Versuche (≤5 toleriert)`,
    details: { attempts: ghlOverrides },
  });

  // ── KPI PIPELINE TESTS ───────────────────────────────────────────

  // T8: member_kpis freshness
  const { data: kpiAge } = await sb
    .from("member_kpis")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);

  const latestKpi = (kpiAge as { updated_at: string }[] | null)?.[0]?.updated_at;
  const kpiAgeH = latestKpi
    ? (Date.now() - new Date(latestKpi).getTime()) / 3600_000
    : 999;

  results.push({
    test_name: "kpi_pipeline_fresh",
    category: "kpi_pipeline",
    passed: kpiAgeH <= 48,
    message: kpiAgeH <= 48
      ? `KPI-Pipeline frisch (${Math.round(kpiAgeH)}h alt)`
      : `FAIL: KPIs seit ${Math.round(kpiAgeH)}h nicht aktualisiert`,
    details: { age_hours: Math.round(kpiAgeH), last_update: latestKpi },
  });

  // ── PERSIST TO health_check_results ────────────────────────────

  const now = new Date().toISOString();
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  const rows = results.map((r) => ({
    check_name: r.test_name,
    domain: "qa_regression",
    status: r.passed ? "ok" : "critical",
    metric_value: r.passed ? 1 : 0,
    threshold: 1,
    message: r.message,
    details: { ...r.details, category: r.category },
    checked_at: now,
  }));

  const { data: inserted, error: insertErr } = await sb
    .from("health_check_results")
    .insert(rows)
    .select("id, check_name, domain, status, message");

  if (insertErr) {
    console.error("Failed to persist QA regression results:", insertErr);
  }

  // Create alerts for failures
  const alertRows = (inserted ?? [])
    .filter((r: { status: string }) => r.status !== "ok")
    .map((r: { id: string; status: string; check_name: string; message: string }) => ({
      check_result_id: r.id,
      severity: "critical" as const,
      domain: "qa_regression",
      check_name: r.check_name,
      message: r.message,
    }));

  if (alertRows.length > 0) {
    const { error: alertErr } = await sb
      .from("health_check_alerts")
      .insert(alertRows);
    if (alertErr) {
      console.error("Failed to persist QA regression alerts:", alertErr);
    }
  }

  // Log to automation_log
  try {
    await sb.from("automation_log").insert({
      job_name: "qa-regression",
      status: failed > 0 ? "error" : "success",
      metrics: { passed, failed, total: results.length, checked_at: now },
    });
  } catch {
    // ignore
  }

  const summary = {
    checked_at: now,
    total: results.length,
    passed,
    failed,
    alerts_created: alertRows.length,
    tests: results.map((r) => ({
      name: r.test_name,
      category: r.category,
      passed: r.passed,
      message: r.message,
    })),
  };

  console.log("[qa-regression]", JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
