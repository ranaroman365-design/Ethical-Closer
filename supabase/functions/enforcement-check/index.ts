// Operator Enforcement System — Scheduled Checker
// Scans for SLA breaches, missing follow-ups, unrecovered no-shows, etc.
// Creates enforcement_violations and operator_blocks automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Load active rules
    const { data: rules } = await sb
      .from("enforcement_rules")
      .select("*")
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      return jsonRes({ message: "No active enforcement rules", violations: 0 });
    }

    const results: Record<string, number> = {};

    for (const rule of rules) {
      let newViolations = 0;

      switch (rule.check_type) {
        case "sla_breach":
          newViolations = await checkLeadContactSla(sb, rule);
          break;
        case "missing_followup":
          newViolations = await checkMissingFollowup(sb, rule);
          break;
        case "missing_call":
          newViolations = await checkMissingCalls(sb, rule);
          break;
        case "no_show_unrecovered":
          newViolations = await checkNoShowUnrecovered(sb, rule);
          break;
        case "no_close_no_followup":
          newViolations = await checkNoCloseFollowup(sb, rule);
          break;
        case "no_owner":
          newViolations = await checkNoOwner(sb, rule);
          break;
      }

      results[rule.rule_key] = newViolations;
    }

    // Escalate existing open violations
    const escalated = await escalateViolations(sb, rules);

    return jsonRes({ results, escalated, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("Enforcement check error:", err);
    return jsonRes({ error: String(err) }, 500);
  }
});

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── CHECK FUNCTIONS ───

async function checkLeadContactSla(sb: any, rule: any): Promise<number> {
  // Find leads created > threshold_hours ago with no contact event
  const cutoff = hoursAgo(rule.threshold_hours);
  const { data: leads } = await sb
    .from("leads")
    .select("id, user_id")
    .lt("created_at", cutoff.toISOString())
    .not("user_id", "is", null);

  if (!leads?.length) return 0;

  let count = 0;
  for (const lead of leads) {
    // Check if any contact event exists
    const { count: eventCount } = await sb
      .from("lead_activation_events")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id)
      .in("event_type", ["tp_sent", "call_completed", "sms_sent", "whatsapp_sent"]);

    if ((eventCount ?? 0) === 0) {
      const created = await createViolation(sb, rule, lead.id, lead.user_id, {
        reason: `Lead not contacted within ${rule.threshold_hours}h`,
      });
      if (created) count++;
    }
  }
  return count;
}

async function checkMissingFollowup(sb: any, rule: any): Promise<number> {
  // Leads with a completed call but no follow-up scheduled within threshold
  const cutoff = hoursAgo(rule.threshold_hours);
  const { data: calls } = await sb
    .from("calls")
    .select("id, lead_id, user_id, created_at")
    .eq("outcome", "no_close")
    .lt("created_at", cutoff.toISOString());

  if (!calls?.length) return 0;

  let count = 0;
  for (const call of calls) {
    const { count: followupCount } = await sb
      .from("call_tasks")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", call.lead_id)
      .gt("created_at", call.created_at);

    if ((followupCount ?? 0) === 0) {
      const created = await createViolation(sb, rule, call.lead_id, call.user_id, {
        reason: "No follow-up after no-close call",
        call_id: call.id,
      });
      if (created) count++;
    }
  }
  return count;
}

async function checkMissingCalls(sb: any, rule: any): Promise<number> {
  // Check if scheduled call_tasks are overdue
  const cutoff = hoursAgo(rule.threshold_hours);
  const { data: tasks } = await sb
    .from("call_tasks")
    .select("id, lead_id, assigned_to, due_at, stage")
    .eq("status", "pending")
    .lt("due_at", cutoff.toISOString());

  if (!tasks?.length) return 0;

  let count = 0;
  for (const task of tasks) {
    const created = await createViolation(sb, rule, task.lead_id, task.assigned_to, {
      reason: `Overdue ${task.stage} call task`,
      task_id: task.id,
    });
    if (created) count++;
  }
  return count;
}

async function checkNoShowUnrecovered(sb: any, rule: any): Promise<number> {
  const cutoff = hoursAgo(rule.threshold_hours);
  const { data: appointments } = await sb
    .from("appointments")
    .select("id, lead_id, setter_id, status, starts_at")
    .eq("status", "no_show")
    .lt("starts_at", cutoff.toISOString());

  if (!appointments?.length) return 0;

  let count = 0;
  for (const appt of appointments) {
    // Check if recovery action exists
    const { count: recoveryCount } = await sb
      .from("call_tasks")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", appt.lead_id)
      .ilike("stage", "%no_show%");

    if ((recoveryCount ?? 0) === 0) {
      const created = await createViolation(sb, rule, appt.lead_id, appt.setter_id, {
        reason: "No-show without recovery action",
        appointment_id: appt.id,
      });
      if (created) count++;

      // Apply reassignment consequence
      if (rule.consequence === "reassign") {
        await applyBlock(sb, appt.setter_id, "review_required", "Unrecovered no-show", null);
      }
    }
  }
  return count;
}

async function checkNoCloseFollowup(sb: any, rule: any): Promise<number> {
  const cutoff = hoursAgo(rule.threshold_hours);
  const { data: calls } = await sb
    .from("calls")
    .select("id, lead_id, user_id, created_at")
    .eq("outcome", "no_close")
    .lt("created_at", cutoff.toISOString());

  if (!calls?.length) return 0;

  let count = 0;
  for (const call of calls) {
    const { count: taskCount } = await sb
      .from("call_tasks")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", call.lead_id)
      .gt("created_at", call.created_at);

    if ((taskCount ?? 0) === 0) {
      const created = await createViolation(sb, rule, call.lead_id, call.user_id, {
        reason: "No-close without follow-up task",
        call_id: call.id,
      });
      if (created) count++;
    }
  }
  return count;
}

async function checkNoOwner(sb: any, rule: any): Promise<number> {
  const { data: leads } = await sb
    .from("leads")
    .select("id")
    .is("user_id", null)
    .not("status", "eq", "closed_won");

  if (!leads?.length) return 0;

  let count = 0;
  for (const lead of leads) {
    const created = await createViolation(sb, rule, lead.id, null, {
      reason: "Lead has no owner assigned",
    });
    if (created) count++;
  }
  return count;
}

// ─── VIOLATION & ESCALATION ───

async function createViolation(
  sb: any,
  rule: any,
  leadId: string | null,
  operatorId: string | null,
  context: Record<string, unknown>
): Promise<boolean> {
  if (!operatorId && !leadId) return false;

  // Deduplicate: don't create if open violation for same rule+lead exists
  const query = sb
    .from("enforcement_violations")
    .select("id", { count: "exact", head: true })
    .eq("rule_id", rule.id)
    .in("status", ["open", "escalated"]);

  if (leadId) query.eq("lead_id", leadId);
  if (operatorId) query.eq("operator_id", operatorId);

  const { count } = await query;
  if ((count ?? 0) > 0) return false;

  const { error } = await sb.from("enforcement_violations").insert({
    rule_id: rule.id,
    lead_id: leadId,
    operator_id: operatorId || "00000000-0000-0000-0000-000000000000",
    context,
  });

  if (error) {
    console.error("Failed to create violation:", error);
    return false;
  }
  return true;
}

async function escalateViolations(sb: any, rules: any[]): Promise<number> {
  const ruleMap = new Map(rules.map((r: any) => [r.id, r]));

  const { data: openViolations } = await sb
    .from("enforcement_violations")
    .select("*")
    .in("status", ["open", "escalated"])
    .lt("escalation_level", 3);

  if (!openViolations?.length) return 0;

  let escalated = 0;
  const now = Date.now();

  for (const v of openViolations) {
    const rule = ruleMap.get(v.rule_id);
    if (!rule) continue;

    const stages = rule.escalation_stages as Array<{
      level: number;
      action: string;
      delay_hours: number;
    }>;

    const nextStage = stages.find((s) => s.level === v.escalation_level + 1);
    if (!nextStage) continue;

    const detectedAt = new Date(v.detected_at).getTime();
    const delayMs = nextStage.delay_hours * 3600000;

    if (now - detectedAt > delayMs) {
      await sb
        .from("enforcement_violations")
        .update({
          escalation_level: nextStage.level,
          status: "escalated",
          escalated_at: new Date().toISOString(),
        })
        .eq("id", v.id);

      // Apply block if consequence demands it
      if (nextStage.action === "reassign" || rule.consequence === "block") {
        await applyBlock(
          sb,
          v.operator_id,
          rule.consequence === "block" ? "no_new_leads" : "review_required",
          `Escalation level ${nextStage.level}: ${rule.title}`,
          v.id
        );
      }

      escalated++;
    }
  }
  return escalated;
}

async function applyBlock(
  sb: any,
  operatorId: string,
  blockType: string,
  reason: string,
  violationId: string | null
) {
  // Check if active block already exists
  const { count } = await sb
    .from("operator_blocks")
    .select("id", { count: "exact", head: true })
    .eq("operator_id", operatorId)
    .eq("block_type", blockType)
    .eq("is_active", true);

  if ((count ?? 0) > 0) return;

  await sb.from("operator_blocks").insert({
    operator_id: operatorId,
    block_type: blockType,
    reason,
    enforcement_violation_id: violationId,
  });
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600000);
}
