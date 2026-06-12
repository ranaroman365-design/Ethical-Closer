import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CheckResult {
  check_name: string;
  domain: string;
  status: "ok" | "warning" | "critical";
  metric_value: number;
  threshold: number;
  message: string;
  details: Record<string, unknown>;
}

/**
 * System Health Check — monitors Messaging & Call Intelligence flows.
 *
 * Checks (all use 24h window):
 *   MESSAGING
 *     1. outbound_events created
 *     2. outbound_events processed (status='sent')
 *     3. outbound_events error rate
 *
 *   CALL INTELLIGENCE
 *     4. calls recorded (has transcript)
 *     5. call_analysis entries
 *     6. call_ai_scores entries
 *
 *   AUTOMATION
 *     7. automation_log entries
 *     8. automation_log error rate
 *
 * Thresholds are intentionally low — this is a "zero-activity" detector.
 * If the system is live and producing events, thresholds can be raised.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // Optional: accept custom window via body
  let windowHours = 24;
  try {
    const body = await req.json();
    if (body?.window_hours && typeof body.window_hours === "number") {
      windowHours = Math.max(1, Math.min(168, body.window_hours));
    }
  } catch {
    // default 24h
  }

  const cutoff = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const results: CheckResult[] = [];

  // ── MESSAGING CHECKS ──────────────────────────────────────────────

  // 1. Outbound events created
  const { count: outboundTotal } = await sb
    .from("outbound_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff);

  results.push({
    check_name: "outbound_events_created",
    domain: "messaging",
    status: (outboundTotal ?? 0) === 0 ? "warning" : "ok",
    metric_value: outboundTotal ?? 0,
    threshold: 1,
    message:
      (outboundTotal ?? 0) === 0
        ? `Keine neuen Outbound-Events in ${windowHours}h`
        : `${outboundTotal} Outbound-Events in ${windowHours}h`,
    details: { window_hours: windowHours },
  });

  // 2. Outbound events processed
  const { count: outboundSent } = await sb
    .from("outbound_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff)
    .eq("status", "sent");

  const outboundPending = (outboundTotal ?? 0) - (outboundSent ?? 0);
  const outboundErrorRate =
    (outboundTotal ?? 0) > 0
      ? Math.round((outboundPending / (outboundTotal ?? 1)) * 100)
      : 0;

  results.push({
    check_name: "outbound_events_processed",
    domain: "messaging",
    status:
      (outboundTotal ?? 0) > 0 && outboundErrorRate > 50
        ? "critical"
        : outboundErrorRate > 20
        ? "warning"
        : "ok",
    metric_value: outboundSent ?? 0,
    threshold: 1,
    message: `${outboundSent ?? 0}/${outboundTotal ?? 0} versendet (${100 - outboundErrorRate}% Erfolg)`,
    details: { sent: outboundSent, total: outboundTotal, pending: outboundPending },
  });

  // ── CALL INTELLIGENCE CHECKS ──────────────────────────────────────

  // 3. Calls with transcripts
  const { count: callsWithTranscript } = await sb
    .from("calls")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff)
    .eq("is_simulation", false)
    .not("transcript", "is", null);

  const { count: callsTotal } = await sb
    .from("calls")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff)
    .eq("is_simulation", false);

  results.push({
    check_name: "calls_transcribed",
    domain: "call_intelligence",
    status: (callsTotal ?? 0) > 0 && (callsWithTranscript ?? 0) === 0 ? "critical" : "ok",
    metric_value: callsWithTranscript ?? 0,
    threshold: 0,
    message:
      (callsTotal ?? 0) === 0
        ? `Keine Calls in ${windowHours}h`
        : `${callsWithTranscript}/${callsTotal} Calls transkribiert`,
    details: { transcribed: callsWithTranscript, total: callsTotal },
  });

  // 4. Call analysis entries
  const { count: analysisCount } = await sb
    .from("call_analysis")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff);

  results.push({
    check_name: "call_analysis_created",
    domain: "call_intelligence",
    status:
      (callsTotal ?? 0) > 0 && (analysisCount ?? 0) === 0 ? "warning" : "ok",
    metric_value: analysisCount ?? 0,
    threshold: 0,
    message:
      (analysisCount ?? 0) === 0
        ? `Keine Call-Analysen in ${windowHours}h`
        : `${analysisCount} Call-Analysen in ${windowHours}h`,
    details: { count: analysisCount },
  });

  // 5. Call AI scores
  const { count: scoresCount } = await sb
    .from("call_ai_scores")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff);

  results.push({
    check_name: "call_ai_scores_created",
    domain: "call_intelligence",
    status:
      (callsTotal ?? 0) > 0 && (scoresCount ?? 0) === 0 ? "warning" : "ok",
    metric_value: scoresCount ?? 0,
    threshold: 0,
    message:
      (scoresCount ?? 0) === 0
        ? `Keine AI-Scores in ${windowHours}h`
        : `${scoresCount} AI-Scores in ${windowHours}h`,
    details: { count: scoresCount },
  });

  // ── AUTOMATION CHECKS ─────────────────────────────────────────────

  // 6. Automation log entries
  const { count: automationTotal } = await sb
    .from("automation_log")
    .select("*", { count: "exact", head: true })
    .gte("ran_at", cutoff);

  const { count: automationErrors } = await sb
    .from("automation_log")
    .select("*", { count: "exact", head: true })
    .gte("ran_at", cutoff)
    .eq("status", "error");

  const automationErrRate =
    (automationTotal ?? 0) > 0
      ? Math.round(((automationErrors ?? 0) / (automationTotal ?? 1)) * 100)
      : 0;

  results.push({
    check_name: "automation_log_activity",
    domain: "automation",
    status: (automationTotal ?? 0) === 0 ? "warning" : "ok",
    metric_value: automationTotal ?? 0,
    threshold: 1,
    message:
      (automationTotal ?? 0) === 0
        ? `Keine Automation-Logs in ${windowHours}h`
        : `${automationTotal} Automation-Runs in ${windowHours}h`,
    details: { total: automationTotal, errors: automationErrors },
  });

  results.push({
    check_name: "automation_error_rate",
    domain: "automation",
    status:
      automationErrRate > 50
        ? "critical"
        : automationErrRate > 20
        ? "warning"
        : "ok",
    metric_value: automationErrRate,
    threshold: 20,
    message: `Automation Error Rate: ${automationErrRate}%`,
    details: { errors: automationErrors, total: automationTotal },
  });

  // ── CANONICAL DEDUP CHECKS ─────────────────────────────────────

  // 8. Duplicate delivery detection (same lead+event dispatched more than once)
  const { data: dedupDupeRows } = await sb
    .from("communication_dispatch_log")
    .select("lead_id, event_key")
    .gte("created_at", cutoff)
    .neq("status", "dedup_blocked");

  const dedupMap = new Map<string, number>();
  for (const row of (dedupDupeRows ?? []) as { lead_id: string; event_key: string }[]) {
    const key = `${row.lead_id}::${row.event_key}`;
    dedupMap.set(key, (dedupMap.get(key) ?? 0) + 1);
  }
  const dupeCount = [...dedupMap.values()].filter((c) => c > 1).length;

  results.push({
    check_name: "dedup_bypass_detected",
    domain: "canonical_dedup",
    status: dupeCount > 0 ? "critical" : "ok",
    metric_value: dupeCount,
    threshold: 0,
    message: dupeCount > 0
      ? `CRITICAL: ${dupeCount} doppelte Zustellungen erkannt`
      : "Keine doppelten Zustellungen",
    details: { duplicate_groups: dupeCount },
  });

  // 9. Outbound canonical leak — canonicalized events sent via old path
  const CANONICALIZED_PATTERNS = [
    "appointment.reminder_24h", "appointment.reminder_2h", "appointment.reminder_10m",
    "retargeting.sms_2h", "retargeting.email_24h", "retargeting.sms_48h", "retargeting.email_72h",
  ];

  const { count: leakedCount } = await sb
    .from("outbound_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", cutoff)
    .eq("status", "sent")
    .in("event_name", CANONICALIZED_PATTERNS);

  results.push({
    check_name: "outbound_canonical_leak",
    domain: "canonical_dedup",
    status: (leakedCount ?? 0) > 0 ? "critical" : "ok",
    metric_value: leakedCount ?? 0,
    threshold: 0,
    message: (leakedCount ?? 0) > 0
      ? `CRITICAL: ${leakedCount} kanonisierte Events über Legacy-Pfad gesendet`
      : "Kein Legacy-Leak erkannt",
    details: { leaked_events: leakedCount, patterns: CANONICALIZED_PATTERNS },
  });

  // ── STATE MACHINE CHECKS ──────────────────────────────────────

  // 10. Canonical state violations — detailed via RPC
  const { data: violationRows } = await sb.rpc("detect_state_violations" as never, {
    p_window_hours: windowHours,
  });

  const violations = Array.isArray(violationRows) ? violationRows : [];
  const explicitCount = violations.filter((v: { violation_type: string }) => v.violation_type === "explicit_invalid").length;
  const nonCanonicalCount = violations.filter((v: { violation_type: string }) => v.violation_type === "non_canonical").length;
  const totalViolations = violations.length;

  results.push({
    check_name: "state_violation_count",
    domain: "state_machine",
    status: explicitCount > 0 ? "critical" : nonCanonicalCount > 0 ? "warning" : "ok",
    metric_value: totalViolations,
    threshold: 0,
    message: totalViolations > 0
      ? `${explicitCount} ungültige Transitionen + ${nonCanonicalCount} nicht-kanonische Transitionen in ${windowHours}h`
      : "Keine State-Violationen",
    details: {
      explicit_invalid: explicitCount,
      non_canonical: nonCanonicalCount,
      samples: violations.slice(0, 10).map((v: { lead_id: string; from_state: string; to_state: string; event: string; violation_type: string }) => ({
        lead_id: v.lead_id,
        from: v.from_state,
        to: v.to_state,
        event: v.event,
        type: v.violation_type,
      })),
    },
  });

  // 11. GHL bypass attempts — webhook events with stage/status changes
  const { count: bypassAttempts } = await sb
    .from("raw_webhook_events")
    .select("*", { count: "exact", head: true })
    .gte("received_at", cutoff)
    .eq("source", "ghl")
    .in("event_name", ["contact.update", "opportunity.update", "contact.stage_changed"]);

  const bypassStatus: "ok" | "warning" | "critical" =
    (bypassAttempts ?? 0) > 5 ? "critical" : (bypassAttempts ?? 0) > 0 ? "warning" : "ok";

  results.push({
    check_name: "ghl_bypass_attempts",
    domain: "state_machine",
    status: bypassStatus,
    metric_value: bypassAttempts ?? 0,
    threshold: 5,
    message: (bypassAttempts ?? 0) > 0
      ? `${bypassAttempts} GHL State-Override-Versuche in ${windowHours}h`
      : "Keine GHL-Bypass-Versuche",
    details: { attempts: bypassAttempts },
  });

  // ── KPI TIER CHECKS ───────────────────────────────────────────

  // Canonical tier thresholds (from Closing Machine / KPI Hierarchy)
  const TIER_THRESHOLDS = {
    show_rate:      { floor: 0.40, target: 0.60, label: "Show-Rate" },
    closing_rate:   { floor: 0.10, target: 0.20, label: "Closing-Rate" },
    booking_rate:   { floor: 0.15, target: 0.30, label: "Booking-Rate" },
    storno_rate:    { ceiling: 0.15, target: 0.05, label: "Storno-Rate" },
    follow_up_rate: { floor: 0.50, target: 0.75, label: "Follow-Up-Rate" },
    revenue_per_call: { floor: 200, target: 500, label: "Revenue/Call (€)" },
  } as const;

  // 12. KPI staleness — member_kpis not updated within 48h
  const { data: kpiAge } = await sb
    .from("member_kpis")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);

  const latestKpiUpdate = (kpiAge as { updated_at: string }[] | null)?.[0]?.updated_at;
  const kpiAgeHours = latestKpiUpdate
    ? (Date.now() - new Date(latestKpiUpdate).getTime()) / 3600_000
    : 999;

  results.push({
    check_name: "kpi_staleness",
    domain: "kpi_tiers",
    status: kpiAgeHours > 48 ? "critical" : kpiAgeHours > 24 ? "warning" : "ok",
    metric_value: Math.round(kpiAgeHours),
    threshold: 48,
    message: kpiAgeHours > 48
      ? `CRITICAL: KPIs seit ${Math.round(kpiAgeHours)}h nicht aktualisiert`
      : `KPIs zuletzt vor ${Math.round(kpiAgeHours)}h aktualisiert`,
    details: { last_update: latestKpiUpdate, age_hours: Math.round(kpiAgeHours) },
  });

  // Fetch all operator KPIs for tier comparison
  const { data: allKpis } = await sb
    .from("member_kpis")
    .select("user_id, show_rate, closing_rate, storno_rate, follow_up_rate, revenue_per_call, leads_assigned, leads_qualified");

  const kpis = (allKpis ?? []) as {
    user_id: string; show_rate: number | null; closing_rate: number | null;
    storno_rate: number | null; follow_up_rate: number | null;
    revenue_per_call: number | null; leads_assigned: number | null; leads_qualified: number | null;
  }[];

  // Helper: evaluate a "floor" metric (higher = better)
  function evalFloorMetric(
    field: "show_rate" | "closing_rate" | "follow_up_rate" | "revenue_per_call",
    cfg: { floor: number; target: number; label: string },
    checkName: string,
  ) {
    const vals = kpis.filter((k) => k[field] != null);
    const belowFloor = vals.filter((k) => (k[field] as number) < cfg.floor);
    const avg = vals.length > 0
      ? vals.reduce((s, k) => s + (k[field] as number), 0) / vals.length
      : 0;
    const isRate = cfg.floor < 1; // rate vs absolute
    const fmtVal = isRate ? `${Math.round(avg * 100)}%` : `€${Math.round(avg)}`;
    const fmtFloor = isRate ? `${Math.round(cfg.floor * 100)}%` : `€${cfg.floor}`;

    results.push({
      check_name: checkName,
      domain: "kpi_tiers",
      status: avg < cfg.floor ? "critical" : belowFloor.length > 0 ? "warning" : "ok",
      metric_value: isRate ? Math.round(avg * 100) : Math.round(avg),
      threshold: isRate ? Math.round(cfg.floor * 100) : cfg.floor,
      message: belowFloor.length > 0
        ? `${belowFloor.length} Operator unter ${fmtFloor} ${cfg.label} (Ø ${fmtVal})`
        : `${cfg.label} OK (Ø ${fmtVal})`,
      details: {
        avg: isRate ? Math.round(avg * 100) : Math.round(avg),
        below_floor: belowFloor.length,
        total_operators: vals.length,
        worst_3: belowFloor
          .sort((a, b) => (a[field] as number) - (b[field] as number))
          .slice(0, 3)
          .map((k) => ({ user_id: k.user_id, value: k[field] })),
      },
    });
  }

  // 13-16. Floor metrics
  evalFloorMetric("show_rate", TIER_THRESHOLDS.show_rate, "show_rate_deviation");
  evalFloorMetric("closing_rate", TIER_THRESHOLDS.closing_rate, "closing_rate_deviation");
  evalFloorMetric("follow_up_rate", TIER_THRESHOLDS.follow_up_rate, "follow_up_rate_deviation");
  evalFloorMetric("revenue_per_call", TIER_THRESHOLDS.revenue_per_call, "revenue_per_call_deviation");

  // 17. Storno rate ceiling (lower = better)
  const stornoVals = kpis.filter((k) => k.storno_rate != null);
  const aboveCeiling = stornoVals.filter((k) => (k.storno_rate as number) > TIER_THRESHOLDS.storno_rate.ceiling);
  const avgStorno = stornoVals.length > 0
    ? stornoVals.reduce((s, k) => s + (k.storno_rate as number), 0) / stornoVals.length
    : 0;

  results.push({
    check_name: "storno_rate_deviation",
    domain: "kpi_tiers",
    status: avgStorno > TIER_THRESHOLDS.storno_rate.ceiling ? "critical" : aboveCeiling.length > 0 ? "warning" : "ok",
    metric_value: Math.round(avgStorno * 100),
    threshold: Math.round(TIER_THRESHOLDS.storno_rate.ceiling * 100),
    message: aboveCeiling.length > 0
      ? `${aboveCeiling.length} Operator über ${Math.round(TIER_THRESHOLDS.storno_rate.ceiling * 100)}% Storno-Rate (Ø ${Math.round(avgStorno * 100)}%)`
      : `Storno-Rate OK (Ø ${Math.round(avgStorno * 100)}%)`,
    details: {
      avg_percent: Math.round(avgStorno * 100),
      above_ceiling: aboveCeiling.length,
      worst_3: aboveCeiling
        .sort((a, b) => (b.storno_rate as number) - (a.storno_rate as number))
        .slice(0, 3)
        .map((k) => ({ user_id: k.user_id, value: k.storno_rate })),
    },
  });

  // 18. Booking rate (derived: leads_qualified / leads_assigned)
  const bookingVals = kpis
    .filter((k) => (k.leads_assigned ?? 0) > 0)
    .map((k) => ({ user_id: k.user_id, booking_rate: (k.leads_qualified ?? 0) / (k.leads_assigned as number) }));
  const lowBooking = bookingVals.filter((k) => k.booking_rate < TIER_THRESHOLDS.booking_rate.floor);
  const avgBooking = bookingVals.length > 0
    ? bookingVals.reduce((s, k) => s + k.booking_rate, 0) / bookingVals.length
    : 0;

  results.push({
    check_name: "booking_rate_deviation",
    domain: "kpi_tiers",
    status: avgBooking < TIER_THRESHOLDS.booking_rate.floor ? "critical" : lowBooking.length > 0 ? "warning" : "ok",
    metric_value: Math.round(avgBooking * 100),
    threshold: Math.round(TIER_THRESHOLDS.booking_rate.floor * 100),
    message: lowBooking.length > 0
      ? `${lowBooking.length} Operator unter ${Math.round(TIER_THRESHOLDS.booking_rate.floor * 100)}% Booking-Rate (Ø ${Math.round(avgBooking * 100)}%)`
      : `Booking-Rate OK (Ø ${Math.round(avgBooking * 100)}%)`,
    details: {
      avg_percent: Math.round(avgBooking * 100),
      below_floor: lowBooking.length,
      total_operators: bookingVals.length,
    },
  });

  // 19. System-level funnel snapshot from real_kpi_snapshot
  const { data: funnelSnap } = await sb
    .from("real_kpi_snapshot")
    .select("total_leads, booked, shows, no_shows, closed, revenue, show_rate, close_rate, booking_rate")
    .limit(1);

  const funnel = (funnelSnap as { total_leads: number; booked: number; shows: number; no_shows: number; closed: number; revenue: number; show_rate: number; close_rate: number; booking_rate: number }[] | null)?.[0];

  if (funnel) {
    const noShowRate = funnel.shows + funnel.no_shows > 0
      ? funnel.no_shows / (funnel.shows + funnel.no_shows)
      : 0;

    results.push({
      check_name: "system_funnel_health",
      domain: "kpi_tiers",
      status: (funnel.show_rate ?? 0) < 0.35 || (funnel.close_rate ?? 0) < 0.08 ? "critical"
        : noShowRate > 0.40 ? "warning" : "ok",
      metric_value: Math.round((funnel.close_rate ?? 0) * 100),
      threshold: 8,
      message: `Funnel: ${funnel.total_leads} Leads → ${funnel.booked} Booked → ${funnel.shows} Shows → ${funnel.closed} Closed (${Math.round((funnel.close_rate ?? 0) * 100)}% Close, ${Math.round(noShowRate * 100)}% No-Show)`,
      details: {
        total_leads: funnel.total_leads,
        booked: funnel.booked,
        shows: funnel.shows,
        no_shows: funnel.no_shows,
        closed: funnel.closed,
        revenue: funnel.revenue,
        show_rate_pct: Math.round((funnel.show_rate ?? 0) * 100),
        close_rate_pct: Math.round((funnel.close_rate ?? 0) * 100),
        no_show_rate_pct: Math.round(noShowRate * 100),
      },
    });
  }

  // 20. Dispatch delivery rate from communication_dispatch_log
  const { count: totalDispatched } = await sb
    .from("communication_dispatch_log")
    .select("*", { count: "exact", head: true })
    .gte("dispatched_at", cutoff);

  const { count: failedDispatched } = await sb
    .from("communication_dispatch_log")
    .select("*", { count: "exact", head: true })
    .gte("dispatched_at", cutoff)
    .eq("status", "error");

  const dispTotal = totalDispatched ?? 0;
  const dispFailed = failedDispatched ?? 0;
  const dispFailRate = dispTotal > 0 ? dispFailed / dispTotal : 0;

  results.push({
    check_name: "dispatch_delivery_rate",
    domain: "kpi_tiers",
    status: dispFailRate > 0.10 ? "critical" : dispFailRate > 0.05 ? "warning" : "ok",
    metric_value: Math.round((1 - dispFailRate) * 100),
    threshold: 90,
    message: dispTotal > 0
      ? `Dispatch: ${dispTotal - dispFailed}/${dispTotal} zugestellt (${Math.round((1 - dispFailRate) * 100)}%), ${dispFailed} Fehler`
      : "Keine Dispatches im Zeitfenster",
    details: {
      total: dispTotal,
      failed: dispFailed,
      success_rate_pct: Math.round((1 - dispFailRate) * 100),
    },
  });

  // ── OWNERSHIP INTEGRITY CHECKS ─────────────────────────────────

  // 15. Appointments without owner
  const { count: apptNoOwner } = await sb
    .from("appointments")
    .select("*", { count: "exact", head: true })
    .is("current_owner_id", null)
    .neq("appointment_status", "cancelled");

  results.push({
    check_name: "appointment_without_owner",
    domain: "ownership_integrity",
    status: (apptNoOwner ?? 0) > 0 ? "critical" : "ok",
    metric_value: apptNoOwner ?? 0,
    threshold: 0,
    message: (apptNoOwner ?? 0) > 0
      ? `CRITICAL: ${apptNoOwner} Termine ohne Owner`
      : "Alle aktiven Termine haben einen Owner",
    details: { orphaned_appointments: apptNoOwner },
  });

  // 16. Leads without owner (after initial assignment)
  const { count: leadNoOwner } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true })
    .is("owner_id", null)
    .not("conversion_state", "eq", "new_lead");

  results.push({
    check_name: "lead_without_owner",
    domain: "ownership_integrity",
    status: (leadNoOwner ?? 0) > 5 ? "critical" : (leadNoOwner ?? 0) > 0 ? "warning" : "ok",
    metric_value: leadNoOwner ?? 0,
    threshold: 0,
    message: (leadNoOwner ?? 0) > 0
      ? `${leadNoOwner} Leads ohne Owner (nach Zuweisung)`
      : "Alle zugewiesenen Leads haben einen Owner",
    details: { ownerless_leads: leadNoOwner },
  });

  // 17. Revenue without attribution
  const { count: revenueNoAttr } = await sb
    .from("calls")
    .select("*", { count: "exact", head: true })
    .gt("revenue", 0)
    .is("revenue_owner_user_id", null);

  results.push({
    check_name: "revenue_without_attribution",
    domain: "revenue_integrity",
    status: (revenueNoAttr ?? 0) > 0 ? "critical" : "ok",
    metric_value: revenueNoAttr ?? 0,
    threshold: 0,
    message: (revenueNoAttr ?? 0) > 0
      ? `CRITICAL: ${revenueNoAttr} Revenue-Calls ohne Attribution`
      : "Alle Revenue-Calls haben Attribution",
    details: { unattributed: revenueNoAttr },
  });

  // 18. Orphan appointments (no matching lead)
  const { data: orphanApptData } = await sb
    .from("appointments")
    .select("id, lead_id")
    .is("lead_id", null)
    .neq("appointment_status", "cancelled")
    .limit(100);

  const orphanAppts = (orphanApptData ?? []).length;

  results.push({
    check_name: "orphan_appointments",
    domain: "calendar_integrity",
    status: orphanAppts > 5 ? "critical" : orphanAppts > 0 ? "warning" : "ok",
    metric_value: orphanAppts,
    threshold: 0,
    message: orphanAppts > 0
      ? `${orphanAppts} Termine ohne zugehörigen Lead`
      : "Keine verwaisten Termine",
    details: { orphan_count: orphanAppts },
  });

  // 19. Commission payout mismatch
  const { count: commMismatch } = await sb
    .from("commissions")
    .select("*", { count: "exact", head: true })
    .eq("payout_status", "paid")
    .is("payout_batch_id", null);

  results.push({
    check_name: "commission_payout_mismatch",
    domain: "revenue_integrity",
    status: (commMismatch ?? 0) > 0 ? "critical" : "ok",
    metric_value: commMismatch ?? 0,
    threshold: 0,
    message: (commMismatch ?? 0) > 0
      ? `CRITICAL: ${commMismatch} Provisionen als bezahlt markiert ohne Batch`
      : "Alle bezahlten Provisionen haben einen Payout-Batch",
    details: { mismatched: commMismatch },
  });

  // ── DUPLICATE DELIVERY DETECTION ──────────────────────────────────
  // Detect same event_key sent to same user_id more than once within windowHours
  const { data: dupRows } = await sb.rpc("detect_duplicate_dispatches" as never, {
    p_window_hours: windowHours,
  });

  const dupCount = Array.isArray(dupRows) ? dupRows.length : 0;
  const dupDetails = Array.isArray(dupRows) ? dupRows.slice(0, 10) : [];

  results.push({
    check_name: "duplicate_dispatches",
    domain: "messaging_integrity",
    status: dupCount > 5 ? "critical" : dupCount > 0 ? "warning" : "ok",
    metric_value: dupCount,
    threshold: 0,
    message: dupCount > 0
      ? `${dupCount} duplicate deliveries detected (user+event_key within ${windowHours}h)`
      : "No duplicate deliveries detected",
    details: { duplicates: dupDetails },
  });


  const now = new Date().toISOString();
  const rows = results.map((r) => ({ ...r, checked_at: now }));

  const { data: inserted, error: insertErr } = await sb
    .from("health_check_results")
    .insert(rows)
    .select("id, check_name, domain, status, message");

  if (insertErr) {
    console.error("Failed to persist health check results:", insertErr);
  }

  // ── CREATE ALERTS FOR WARNING/CRITICAL ────────────────────────────

  const alertRows = (inserted ?? [])
    .filter((r: { status: string }) => r.status !== "ok")
    .map((r: { id: string; status: string; domain: string; check_name: string; message: string }) => ({
      check_result_id: r.id,
      severity: r.status as "warning" | "critical",
      domain: r.domain,
      check_name: r.check_name,
      message: r.message,
    }));

  if (alertRows.length > 0) {
    const { error: alertErr } = await sb
      .from("health_check_alerts")
      .insert(alertRows);
    if (alertErr) {
      console.error("Failed to persist alerts:", alertErr);
    }
  }

  // ── CLEANUP OLD DATA ──────────────────────────────────────────────
  await sb.rpc("cleanup_old_health_checks" as never);

  // ── LOG SUMMARY ───────────────────────────────────────────────────
  const summary = {
    checked_at: now,
    window_hours: windowHours,
    total_checks: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    warnings: results.filter((r) => r.status === "warning").length,
    critical: results.filter((r) => r.status === "critical").length,
    alerts_created: alertRows.length,
    checks: results.map((r) => ({
      name: r.check_name,
      domain: r.domain,
      status: r.status,
      value: r.metric_value,
      message: r.message,
    })),
  };

  console.log("[system-health-check]", JSON.stringify(summary));

  // Log to automation_log
  try {
    await sb.from("automation_log").insert({
      job_name: "system-health-check",
      status: summary.critical > 0 ? "error" : summary.warnings > 0 ? "partial" : "success",
      metrics: summary,
    });
  } catch {
    // ignore
  }

  return new Response(JSON.stringify(summary), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
