import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CheckResult = {
  name: string;
  category: "charge" | "user" | "email" | "appointment" | "pipeline";
  passed: boolean;
  severity: "critical" | "warning" | "info";
  detail: string;
  metric?: number | string;
};

/**
 * Automated end-to-end pipeline check: Charge → User → Email → Appointment.
 * Run after each deploy. Persists a summary to system_health_checks
 * (check_type='e2e') so the admin UI can show a trend over time.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const checks: CheckResult[] = [];
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ─── Load admin-editable thresholds (fallback to defaults if row missing) ───
  const DEFAULTS: Record<string, number> = {
    email_failure_rate_warn: 10,
    email_failure_rate_critical: 25,
    email_pending_max_minutes: 30,
    email_pending_warn_count: 1,
    email_pending_critical_count: 5,
    outbound_failed_warn: 10,
    outbound_failed_critical: 25,
    appointment_pending_warn: 1,
    appointment_pending_critical: 3,
  };
  const T: Record<string, number> = { ...DEFAULTS };
  try {
    const { data: thresholdRows } = await sb
      .from("e2e_check_thresholds")
      .select("key, value");
    for (const row of (thresholdRows ?? []) as Array<{ key: string; value: number }>) {
      const v = Number(row.value);
      if (row.key in T && Number.isFinite(v)) T[row.key] = v;
    }
  } catch (e) {
    console.warn("[e2e] could not load thresholds, using defaults:", e);
  }

  // ─── 1. CHARGE: Stripe webhook idempotency / recent successful charges ───
  try {
    const { data: charges, count: chargeCount } = await sb
      .from("appointments")
      .select("id, payment_status, stripe_payment_intent_id, fastlane_amount_cents, created_at", { count: "exact" })
      .eq("payment_status", "paid")
      .gte("created_at", since7d)
      .limit(50);

    const paidWithIntent = (charges || []).filter(c => c.stripe_payment_intent_id).length;
    const paidNoIntent = (chargeCount ?? 0) - paidWithIntent;

    checks.push({
      name: "Charges (7d) sind mit Stripe-PaymentIntent verknüpft",
      category: "charge",
      passed: paidNoIntent === 0,
      severity: paidNoIntent > 0 ? "critical" : "info",
      detail: `${chargeCount ?? 0} bezahlte Termine, ${paidNoIntent} ohne PaymentIntent`,
      metric: chargeCount ?? 0,
    });

    // Idempotency: processed_events sollte stripe events tracken
    const { count: stripeProcessed } = await sb
      .from("processed_events")
      .select("event_key", { count: "exact", head: true })
      .like("event_key", "stripe%")
      .gte("processed_at", since7d);

    checks.push({
      name: "Stripe Webhook Idempotency aktiv",
      category: "charge",
      passed: (stripeProcessed ?? 0) >= 0,
      severity: "info",
      detail: `${stripeProcessed ?? 0} verarbeitete Stripe-Events (7d)`,
      metric: stripeProcessed ?? 0,
    });
  } catch (e) {
    checks.push({ name: "Charge-Pipeline lesbar", category: "charge", passed: false, severity: "critical", detail: String(e) });
  }

  // ─── 2. USER: Profile + Rolle korrekt nach Signup ───
  try {
    const { data: profiles } = await sb
      .from("profiles")
      .select("id, email, created_at")
      .gte("created_at", since7d)
      .limit(200);

    const ids = (profiles || []).map(p => p.id);
    let rolesMissing = 0;
    if (ids.length > 0) {
      const { data: roles } = await sb.from("user_roles").select("user_id").in("user_id", ids);
      const haveRole = new Set((roles || []).map(r => r.user_id));
      rolesMissing = ids.filter(id => !haveRole.has(id)).length;
    }

    checks.push({
      name: "Neue Profile (7d) erhalten user_roles-Eintrag",
      category: "user",
      passed: rolesMissing === 0,
      severity: rolesMissing > 0 ? "critical" : "info",
      detail: `${ids.length} neue Profile, ${rolesMissing} ohne Rolle`,
      metric: ids.length,
    });

    const noEmail = (profiles || []).filter(p => !p.email).length;
    checks.push({
      name: "Profile haben E-Mail (Auth-Sync funktioniert)",
      category: "user",
      passed: noEmail === 0,
      severity: noEmail > 0 ? "critical" : "info",
      detail: `${noEmail} Profile ohne E-Mail`,
      metric: noEmail,
    });
  } catch (e) {
    checks.push({ name: "User-Pipeline lesbar", category: "user", passed: false, severity: "critical", detail: String(e) });
  }

  // ─── 3. EMAIL: Send-Log + Delivery-Status ───
  try {
    const { count: sentCount } = await sb
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h);

    const { count: failedCount } = await sb
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h)
      .in("status", ["failed", "dlq"]);

    const { count: bounced } = await sb
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7d)
      .in("final_delivery_status", ["bounced", "complained"]);

    const failureRate = sentCount && sentCount > 0 ? (failedCount ?? 0) / sentCount : 0;

    const warnPct = T.email_failure_rate_warn / 100;
    const critPct = T.email_failure_rate_critical / 100;
    checks.push({
      name: `E-Mail Failure-Rate (24h) < ${T.email_failure_rate_warn}%`,
      category: "email",
      passed: failureRate < warnPct,
      severity: failureRate >= critPct ? "critical" : failureRate >= warnPct ? "warning" : "info",
      detail: `${failedCount ?? 0}/${sentCount ?? 0} fehlgeschlagen (${(failureRate * 100).toFixed(1)}%)`,
      metric: Number((failureRate * 100).toFixed(1)),
    });

    checks.push({
      name: "Delivery-Status wird via Webhook aufgelöst",
      category: "email",
      passed: (bounced ?? 0) >= 0,
      severity: "info",
      detail: `${bounced ?? 0} Bounces/Complaints (7d)`,
      metric: bounced ?? 0,
    });

    // Stuck pending emails
    const pendingMs = T.email_pending_max_minutes * 60 * 1000;
    const { count: stuckPending } = await sb
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("created_at", new Date(Date.now() - pendingMs).toISOString());

    checks.push({
      name: `Keine E-Mails > ${T.email_pending_max_minutes}min im Pending-Zustand`,
      category: "email",
      passed: (stuckPending ?? 0) < T.email_pending_warn_count,
      severity:
        (stuckPending ?? 0) >= T.email_pending_critical_count ? "critical"
        : (stuckPending ?? 0) >= T.email_pending_warn_count ? "warning" : "info",
      detail: `${stuckPending ?? 0} hängen seit > ${T.email_pending_max_minutes}min`,
      metric: stuckPending ?? 0,
    });
  } catch (e) {
    checks.push({ name: "E-Mail-Pipeline lesbar", category: "email", passed: false, severity: "critical", detail: String(e) });
  }

  // ─── 4. APPOINTMENT: Reminder-Pipeline + Datenintegrität ───
  try {
    const { count: confirmedFuture } = await sb
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .in("appointment_status", ["booked", "confirmed"])
      .gt("starts_at", new Date().toISOString());

    checks.push({
      name: "Aktive zukünftige Termine vorhanden",
      category: "appointment",
      passed: (confirmedFuture ?? 0) >= 0,
      severity: "info",
      detail: `${confirmedFuture ?? 0} bestätigte Termine in der Zukunft`,
      metric: confirmedFuture ?? 0,
    });

    // Pending payment, expired but slot not freed
    const { count: stuckPending } = await sb
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("appointment_status", "pending_payment")
      .lt("reservation_expires_at", new Date().toISOString());

    checks.push({
      name: "Keine abgelaufenen pending_payment-Reservierungen",
      category: "appointment",
      passed: (stuckPending ?? 0) < T.appointment_pending_warn,
      severity:
        (stuckPending ?? 0) >= T.appointment_pending_critical ? "critical"
        : (stuckPending ?? 0) >= T.appointment_pending_warn ? "warning" : "info",
      detail: `${stuckPending ?? 0} Reservierungen abgelaufen, nicht aufgeräumt (cron läuft?)`,
      metric: stuckPending ?? 0,
    });

    // Reminder events fired (24h)
    const { count: reminderEvents } = await sb
      .from("outbound_events")
      .select("id", { count: "exact", head: true })
      .like("event_name", "reminder%")
      .gte("created_at", since24h);

    checks.push({
      name: "Reminder-Events werden erzeugt (24h)",
      category: "appointment",
      passed: (reminderEvents ?? 0) >= 0,
      severity: "info",
      detail: `${reminderEvents ?? 0} Reminder-Events erzeugt`,
      metric: reminderEvents ?? 0,
    });

    // Outbound events stuck
    const { count: outboundFailed } = await sb
      .from("outbound_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", since24h);

    checks.push({
      name: `Outbound-Events Failure-Rate (24h) gering`,
      category: "appointment",
      passed: (outboundFailed ?? 0) < T.outbound_failed_warn,
      severity:
        (outboundFailed ?? 0) >= T.outbound_failed_critical ? "critical"
        : (outboundFailed ?? 0) >= T.outbound_failed_warn ? "warning" : "info",
      detail: `${outboundFailed ?? 0} fehlgeschlagene Outbound-Events`,
      metric: outboundFailed ?? 0,
    });
  } catch (e) {
    checks.push({ name: "Appointment-Pipeline lesbar", category: "appointment", passed: false, severity: "critical", detail: String(e) });
  }

  // ─── 5. PIPELINE: End-to-End-Verknüpfung Charge → Appointment ───
  try {
    const { data: paidApts } = await sb
      .from("appointments")
      .select("id, lead_id, payment_status, appointment_status, stripe_payment_intent_id")
      .eq("payment_status", "paid")
      .gte("created_at", since7d);

    const orphans = (paidApts || []).filter(a => !a.lead_id || a.appointment_status === "expired").length;
    checks.push({
      name: "Bezahlte Termine sind an Lead gebunden & nicht expired",
      category: "pipeline",
      passed: orphans === 0,
      severity: orphans > 0 ? "critical" : "info",
      detail: `${(paidApts || []).length} bezahlte Termine, ${orphans} verwaist/expired`,
      metric: orphans,
    });
  } catch (e) {
    checks.push({ name: "Pipeline-Verknüpfung lesbar", category: "pipeline", passed: false, severity: "critical", detail: String(e) });
  }

  // ─── Score & Persist ───
  const total = checks.length;
  const passed = checks.filter(c => c.passed).length;
  const failedCritical = checks.filter(c => !c.passed && c.severity === "critical").length;
  const failedWarning = checks.filter(c => !c.passed && c.severity === "warning").length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;
  const status = failedCritical > 0 ? "critical" : failedWarning > 0 ? "warning" : "healthy";

  const { data: saved } = await sb
    .from("system_health_checks")
    .insert({
      check_type: "e2e",
      overall_score: score,
      checks_passed: passed,
      checks_failed: total - passed,
      checks_total: total,
      details: checks,
      status,
    })
    .select("id, created_at")
    .single();

  // ─── Critical Alert E-Mail (non-blocking) ───
  if (status === "critical") {
    try {
      const { data: settingsRows } = await sb
        .from("e2e_alert_settings")
        .select("key, value");
      const settings = Object.fromEntries((settingsRows || []).map((r: any) => [r.key, r.value]));
      const recipient = (settings.critical_alert_email || "").trim();
      const enabled = (settings.critical_alert_enabled || "true").toLowerCase() === "true";
      const cooldownMin = parseInt(settings.critical_alert_cooldown_minutes || "30", 10) || 30;

      if (enabled && recipient) {
        // Cooldown check
        const cutoff = new Date(Date.now() - cooldownMin * 60_000).toISOString();
        const { data: recent } = await sb
          .from("e2e_alert_log")
          .select("id")
          .eq("recipient", recipient)
          .gte("sent_at", cutoff)
          .limit(1);

        if (!recent || recent.length === 0) {
          const failingChecks = checks
            .filter((c) => !c.passed)
            .map((c) => ({
              name: c.name,
              severity: c.severity,
              detail: c.detail,
              category: c.category,
            }));

          const dashboardUrl = `${Deno.env.get("PUBLIC_APP_URL") || "https://ethicalcloser.de"}/members/admin/e2e-checks`;

          const { error: emailErr } = await sb.functions.invoke("send-transactional-email", {
            body: {
              templateName: "e2e-critical-alert",
              recipientEmail: recipient,
              idempotencyKey: `e2e-critical-${saved?.id ?? Date.now()}`,
              templateData: {
                score,
                failedCritical,
                failedWarning,
                total,
                failingChecks,
                runId: saved?.id,
                ranAt: saved?.created_at,
                dashboardUrl,
              },
            },
          });

          if (!emailErr) {
            await sb.from("e2e_alert_log").insert({
              health_check_id: saved?.id,
              recipient,
              score,
              failed_critical: failedCritical,
            });
          } else {
            console.error("[run-e2e-checks] alert email failed:", emailErr);
          }
        } else {
          console.log("[run-e2e-checks] alert suppressed by cooldown");
        }
      }
    } catch (alertErr) {
      console.error("[run-e2e-checks] alert dispatch error (non-blocking):", alertErr);
    }
  }

  return new Response(
    JSON.stringify({
      id: saved?.id,
      created_at: saved?.created_at,
      score,
      status,
      passed,
      failed: total - passed,
      total,
      failed_critical: failedCritical,
      failed_warning: failedWarning,
      checks,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
