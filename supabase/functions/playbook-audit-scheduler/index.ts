// Playbook Governance — Cron Scheduler
// Triggered by pg_cron. Determines if weekly or monthly audit is due and invokes playbook-audit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check last audit runs
    const { data: lastWeekly } = await supabase
      .from("playbook_audit_runs")
      .select("created_at")
      .eq("audit_type", "weekly")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastMonthly } = await supabase
      .from("playbook_audit_runs")
      .select("created_at")
      .eq("audit_type", "monthly")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    const weeklyDue = !lastWeekly || (now - new Date(lastWeekly.created_at).getTime()) > weekMs;
    const monthlyDue = !lastMonthly || (now - new Date(lastMonthly.created_at).getTime()) > monthMs;

    // Monthly takes priority (it's a superset of weekly)
    const auditType = monthlyDue ? "monthly" : weeklyDue ? "weekly" : null;

    if (!auditType) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "no audit due" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Invoke the audit function
    const { data, error } = await supabase.functions.invoke("playbook-audit", {
      body: { audit_type: auditType },
    });

    if (error) {
      console.error("Failed to invoke playbook-audit:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, audit_type: auditType, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("playbook-audit-scheduler error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
