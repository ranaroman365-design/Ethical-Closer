/**
 * Communication Monitor — Daily Duplicate Send Report + Admin Alerts
 * Runs daily via pg_cron or on-demand. No new triggers, no copy changes.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DuplicateReport {
  duplicate_emails: Array<{
    recipient_email: string;
    template_name: string;
    appointment_id: string | null;
    count: number;
    message_ids: string[];
  }>;
  duplicate_reminders: Array<{
    appointment_id: string;
    stage: string;
    count: number;
  }>;
  duplicate_noshow_recovery: Array<{
    appointment_id: string;
    count: number;
  }>;
  failed_sends: number;
  retries: number;
  skipped_duplicates: number;
  period_start: string;
  period_end: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const periodEnd = now.toISOString();
  const periodStart = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();

  // Parse optional mode
  let body: { mode?: string } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const mode = body.mode ?? "report"; // "report" | "dry_run"

  const report: DuplicateReport = {
    duplicate_emails: [],
    duplicate_reminders: [],
    duplicate_noshow_recovery: [],
    failed_sends: 0,
    retries: 0,
    skipped_duplicates: 0,
    period_start: periodStart,
    period_end: periodEnd,
  };

  try {
    // ── 1. Duplicate emails by recipient + template + appointment_id ──
    const { data: dupEmails } = await supabase.rpc("get_duplicate_sends_24h", {
      p_start: periodStart,
      p_end: periodEnd,
    });
    if (dupEmails) {
      report.duplicate_emails = dupEmails as any[];
    }

    // ── 2. Duplicate reminders by appointment_id + stage ──
    const { data: dupReminders } = await supabase.rpc("get_duplicate_reminders_24h", {
      p_start: periodStart,
      p_end: periodEnd,
    });
    if (dupReminders) {
      report.duplicate_reminders = dupReminders as any[];
    }

    // ── 3. Duplicate no-show recovery by appointment_id ──
    const { data: dupNoshow } = await supabase.rpc("get_duplicate_noshow_recovery_24h", {
      p_start: periodStart,
      p_end: periodEnd,
    });
    if (dupNoshow) {
      report.duplicate_noshow_recovery = dupNoshow as any[];
    }

    // ── 4. Failed sends count ──
    const { count: failedCount } = await supabase
      .from("email_send_log")
      .select("*", { count: "exact", head: true })
      .in("status", ["dlq", "failed"])
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd);
    report.failed_sends = failedCount ?? 0;

    // ── 5. Retries count ──
    const { count: retryCount } = await supabase
      .from("email_send_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd);
    report.retries = retryCount ?? 0;

    // ── 6. Skipped duplicates (from communication_dedup) ──
    const { count: skipCount } = await supabase
      .from("communication_dedup" as any)
      .select("*", { count: "exact", head: true })
      .gte("created_at", periodStart)
      .lte("created_at", periodEnd);
    report.skipped_duplicates = skipCount ?? 0;

    // ── Admin Alert if duplicates found ──
    const totalDuplicates =
      report.duplicate_emails.length +
      report.duplicate_reminders.length +
      report.duplicate_noshow_recovery.length;

    if (totalDuplicates > 0) {
      const alertDetails = {
        duplicate_emails: report.duplicate_emails.slice(0, 10),
        duplicate_reminders: report.duplicate_reminders.slice(0, 10),
        duplicate_noshow_recovery: report.duplicate_noshow_recovery.slice(0, 10),
        total_duplicates: totalDuplicates,
        failed_sends: report.failed_sends,
      };

      await supabase.from("escalation_alerts").insert({
        alert_type: "communication_duplicate",
        severity: totalDuplicates > 5 ? "critical" : "warning",
        target_role: "admin",
        title: `${totalDuplicates} doppelte Sends in 24h erkannt`,
        description: `Duplicate Emails: ${report.duplicate_emails.length}, Duplicate Reminders: ${report.duplicate_reminders.length}, Duplicate No-Show Recovery: ${report.duplicate_noshow_recovery.length}, Failed: ${report.failed_sends}`,
        metadata: alertDetails,
        status: "open",
      } as never);
    }

    // ── Log report to automation_log ──
    await supabase.from("automation_log").insert({
      job_name: "communication-monitor",
      status: "success",
      metrics: {
        duplicate_emails: report.duplicate_emails.length,
        duplicate_reminders: report.duplicate_reminders.length,
        duplicate_noshow_recovery: report.duplicate_noshow_recovery.length,
        failed_sends: report.failed_sends,
        retries: report.retries,
        skipped_duplicates: report.skipped_duplicates,
        alert_created: totalDuplicates > 0 ? 1 : 0,
      },
      error: null,
    } as never);
  } catch (e) {
    await supabase.from("automation_log").insert({
      job_name: "communication-monitor",
      status: "error",
      metrics: null,
      error: (e as Error).message,
    } as never);

    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, mode, report }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
