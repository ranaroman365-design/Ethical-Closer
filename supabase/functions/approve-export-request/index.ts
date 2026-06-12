import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_APPROVER_ROLES = ["owner", "security_admin", "finance_admin"];
const FINANCE_SAFE_TYPES = ["finance_report", "finance_summary_export"];

const Schema = z.object({
  export_request_id: z.string().uuid(),
  decision: z.enum(["approved", "denied"]),
  notes: z.string().nullable().optional(),
  step_up_token: z.string().nullable().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authErr } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const { export_request_id, decision, notes, step_up_token } = parsed.data;

    // Resolve role
    const { data: roleData } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
    const role = roleData?.role ?? "member";

    if (!ALLOWED_APPROVER_ROLES.includes(role)) {
      await logSecurityEvent(svc, "high", "forbidden_export_approval", user.id, null, {
        export_request_id, role, attempted_action: decision,
      });
      return json({ error: "Insufficient permissions" }, 403);
    }

    // Fetch export request
    const { data: exportReq, error: fetchErr } = await svc
      .from("export_requests")
      .select("*")
      .eq("id", export_request_id)
      .single();

    if (fetchErr || !exportReq) return json({ error: "Export request not found" }, 404);

    // Validate status
    if (exportReq.status !== "requested") {
      return json({ error: `Cannot approve request in status '${exportReq.status}'` }, 400);
    }

    // Finance admin can only approve finance-safe types
    if (role === "finance_admin" && !FINANCE_SAFE_TYPES.includes(exportReq.export_type)) {
      await logSecurityEvent(svc, "high", "unauthorized_export_approval", user.id, exportReq.tenant_id, {
        export_type: exportReq.export_type, role,
      });
      return json({ error: "Finance admin cannot approve this export type" }, 403);
    }

    // Critical exports: owner only
    if (exportReq.risk_level === "critical" && role !== "owner") {
      await logSecurityEvent(svc, "critical", "critical_export_non_owner", user.id, exportReq.tenant_id, {
        export_request_id, role,
      });
      return json({ error: "Critical exports require owner approval" }, 403);
    }

    // High/critical: require step-up proof
    if ((exportReq.risk_level === "high" || exportReq.risk_level === "critical") && decision === "approved") {
      if (!step_up_token) {
        return json({ error: "Step-up authentication required for high/critical approvals" }, 403);
      }
      // Verify step-up: re-authenticate user
      const { error: stepUpErr } = await anon.auth.getUser(step_up_token);
      if (stepUpErr) {
        await writeAudit(svc, user.id, role, "step_up_failed", "export_requests", export_request_id,
          exportReq.tenant_id, { risk_level: exportReq.risk_level });
        await logSecurityEvent(svc, "medium", "step_up_auth_failed", user.id, exportReq.tenant_id, {
          export_request_id, action: "export_approval",
        });
        return json({ error: "Step-up authentication failed" }, 403);
      }
    }

    const now = new Date().toISOString();
    const newStatus = decision === "approved" ? "queued" : "blocked";

    // Update export request
    const { data: updated, error: updateErr } = await svc
      .from("export_requests")
      .update({
        status: newStatus,
        approved_by: user.id,
        approved_at: now,
        updated_at: now,
      })
      .eq("id", export_request_id)
      .select()
      .single();

    if (updateErr) return json({ error: updateErr.message }, 500);

    // Audit log
    const auditId = await writeAudit(
      svc, user.id, role,
      decision === "approved" ? "export_approved" : "export_denied",
      "export_requests", export_request_id, exportReq.tenant_id,
      {
        export_type: exportReq.export_type,
        risk_level: exportReq.risk_level,
        decision,
        notes,
        forensic_marker: exportReq.forensic_marker,
      },
    );

    // Security event for high/critical
    let securityEventId: string | null = null;
    if (exportReq.risk_level === "high" || exportReq.risk_level === "critical") {
      securityEventId = await logSecurityEvent(
        svc,
        exportReq.risk_level === "critical" ? "high" : "medium",
        `export_${decision}`,
        user.id,
        exportReq.tenant_id,
        { export_request_id, export_type: exportReq.export_type, risk_level: exportReq.risk_level },
      );
    }

    return json({
      success: true,
      updated_request: updated,
      audit_log_id: auditId,
      security_event_id: securityEventId,
      user_message: decision === "approved"
        ? "Export genehmigt. Generierung kann gestartet werden."
        : "Export abgelehnt.",
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function writeAudit(
  svc: ReturnType<typeof createClient>,
  actorId: string, role: string, actionType: string,
  resourceType: string, resourceId: string, tenantId: string | null,
  meta: Record<string, unknown>,
): Promise<string | null> {
  const riskScore = actionType.includes("denied") ? 50 :
    meta.risk_level === "critical" ? 90 : meta.risk_level === "high" ? 70 : 30;
  const { data } = await svc.from("audit_logs").insert({
    actor_id: actorId,
    action: actionType,
    action_type: actionType,
    actor_role_key: role,
    resource_type: resourceType,
    resource_id: resourceId,
    acting_tenant_id: tenantId,
    action_result: actionType.includes("denied") ? "denied" : "success",
    risk_score: riskScore,
    after_state: meta,
  }).select("id").single();
  return data?.id ?? null;
}

async function logSecurityEvent(
  svc: ReturnType<typeof createClient>,
  severity: string, eventType: string, actorId: string,
  tenantId: string | null, details: Record<string, unknown>,
): Promise<string | null> {
  const { data } = await svc.from("security_events").insert({
    severity, event_type: eventType, actor_user_id: actorId,
    tenant_id: tenantId, status: "open",
    summary: `${eventType}: ${JSON.stringify(details).slice(0, 200)}`,
    details,
  }).select("id").single();
  return data?.id ?? null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
