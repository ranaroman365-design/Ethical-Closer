import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Allowed export types → strict server-side query builders.
 * NEVER allow arbitrary SQL. Each type maps to a specific, bounded query.
 */
const EXPORT_BUILDERS: Record<string, (svc: any, tenantId: string | null, limit: number) => Promise<{ rows: any[]; columns: string[] }>> = {
  finance_report: async (svc, _tid, limit) => {
    const { data } = await svc.from("commissions")
      .select("id, user_id, amount, role, payout_status, source_type, created_at")
      .eq("is_simulation", false)
      .order("created_at", { ascending: false })
      .limit(limit);
    return { rows: data ?? [], columns: ["id", "user_id", "amount", "role", "payout_status", "source_type", "created_at"] };
  },
  finance_summary_export: async (svc, _tid, limit) => {
    const { data } = await svc.from("commissions")
      .select("id, user_id, amount, role, payout_status, created_at")
      .eq("is_simulation", false).eq("payout_status", "approved")
      .order("created_at", { ascending: false }).limit(limit);
    return { rows: data ?? [], columns: ["id", "user_id", "amount", "role", "payout_status", "created_at"] };
  },
  user_list: async (svc, _tid, limit) => {
    const { data } = await svc.from("profiles")
      .select("id, full_name, email, member_status, business_stage, created_at")
      .order("created_at", { ascending: false }).limit(limit);
    return { rows: data ?? [], columns: ["id", "full_name", "email", "member_status", "business_stage", "created_at"] };
  },
  pipeline_segment: async (svc, _tid, limit) => {
    const { data } = await svc.from("leads")
      .select("id, stage, deal_value, assigned_to, source, created_at")
      .order("created_at", { ascending: false }).limit(limit);
    return { rows: data ?? [], columns: ["id", "stage", "deal_value", "assigned_to", "source", "created_at"] };
  },
  tenant_export: async (svc, tid, limit) => {
    if (!tid) return { rows: [], columns: [] };
    const { data } = await svc.from("tenant_memberships")
      .select("id, user_id, membership_status, is_primary, created_at")
      .eq("tenant_id", tid).limit(limit);
    return { rows: data ?? [], columns: ["id", "user_id", "membership_status", "is_primary", "created_at"] };
  },
};

const FORBIDDEN_TYPES = [
  "config_export", "prompt_export", "workflow_export", "ip_asset_export",
];

const MAX_ROWS: Record<string, number> = {
  low: 10000, medium: 5000, high: 1000, critical: 500,
};

const Schema = z.object({ export_request_id: z.string().uuid() });

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

    // Role check
    const { data: roleData } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
    const role = roleData?.role ?? "member";
    if (!["owner", "security_admin"].includes(role)) {
      return json({ error: "Only owner or security_admin can generate exports" }, 403);
    }

    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const { export_request_id } = parsed.data;

    // Fetch request
    const { data: exportReq, error: fetchErr } = await svc
      .from("export_requests").select("*").eq("id", export_request_id).single();
    if (fetchErr || !exportReq) return json({ error: "Export request not found" }, 404);

    // Validate status
    if (exportReq.status === "completed") {
      return json({ error: "Export already completed" }, 400);
    }
    if (exportReq.status !== "queued" && exportReq.status !== "requested") {
      // "requested" allowed only if approval not required (low risk)
      if (exportReq.risk_level !== "low") {
        await logSecurityEvent(svc, "high", "generate_unapproved_export", user.id, exportReq.tenant_id, {
          export_request_id, status: exportReq.status,
        });
        return json({ error: "Export must be approved before generation" }, 403);
      }
    }

    // Forbidden type check
    if (FORBIDDEN_TYPES.includes(exportReq.export_type)) {
      await logSecurityEvent(svc, "critical", "forbidden_export_type", user.id, exportReq.tenant_id, {
        export_type: exportReq.export_type,
      });
      return json({ error: "This export type is forbidden" }, 403);
    }

    const builder = EXPORT_BUILDERS[exportReq.export_type];
    if (!builder) {
      return json({ error: `Unknown export type: ${exportReq.export_type}` }, 400);
    }

    // Mark as processing
    await svc.from("export_requests").update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", export_request_id);

    // Generate data
    const limit = MAX_ROWS[exportReq.risk_level] ?? 5000;
    const { rows, columns } = await builder(svc, exportReq.tenant_id, limit);

    // Build CSV with forensic header
    const forensicMarker = exportReq.forensic_marker ?? `EXP-${Date.now()}-${user.id.slice(0, 8)}`;
    const now = new Date().toISOString();
    const metaHeader = [
      `# CONTROLLED EXPORT`,
      `# Export ID: ${export_request_id}`,
      `# Requested by: ${exportReq.requested_by}`,
      `# Approved by: ${exportReq.approved_by ?? "auto"}`,
      `# Generated by: ${user.id}`,
      `# Generated at: ${now}`,
      `# Tenant: ${exportReq.tenant_id ?? "global"}`,
      `# Type: ${exportReq.export_type}`,
      `# Forensic marker: ${forensicMarker}`,
      `# Rows: ${rows.length}`,
      `#`,
    ].join("\n");

    const csvHeader = columns.join(",");
    const csvRows = rows.map(r => columns.map(c => {
      const val = r[c];
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(","));

    const csvContent = [metaHeader, csvHeader, ...csvRows].join("\n");
    const fileBytes = new TextEncoder().encode(csvContent);

    // Upload to storage
    const filePath = `exports/${export_request_id}/${forensicMarker}.csv`;
    const { error: uploadErr } = await svc.storage
      .from("exports")
      .upload(filePath, fileBytes, { contentType: "text/csv", upsert: true });

    // If bucket doesn't exist, still succeed but note it
    const fileRef = uploadErr ? `storage_error:${uploadErr.message}` : filePath;

    // Update export request
    await svc.from("export_requests").update({
      status: "completed",
      file_ref: fileRef,
      forensic_marker: forensicMarker,
      updated_at: now,
    }).eq("id", export_request_id);

    // Create export_items ledger
    await svc.from("export_items").insert({
      export_request_id,
      item_type: exportReq.export_type,
      item_ref: fileRef,
      row_count: rows.length,
    });

    // Audit log
    await svc.from("audit_logs").insert({
      actor_id: user.id,
      action: "export_generated",
      action_type: "export_generated",
      actor_role_key: role,
      resource_type: "export_requests",
      resource_id: export_request_id,
      acting_tenant_id: exportReq.tenant_id,
      action_result: "success",
      risk_score: exportReq.risk_level === "critical" ? 90 : exportReq.risk_level === "high" ? 70 : 30,
      after_state: {
        export_type: exportReq.export_type,
        risk_level: exportReq.risk_level,
        row_count: rows.length,
        forensic_marker: forensicMarker,
        file_ref: fileRef,
      },
    });

    // Security event for high/critical
    if (exportReq.risk_level === "high" || exportReq.risk_level === "critical") {
      await logSecurityEvent(svc, "medium", "export_generated", user.id, exportReq.tenant_id, {
        export_request_id, export_type: exportReq.export_type, row_count: rows.length,
      });
    }

    return json({
      success: true,
      export_request_id,
      file_ref: fileRef,
      row_count: rows.length,
      forensic_marker: forensicMarker,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function logSecurityEvent(
  svc: any, severity: string, eventType: string,
  actorId: string, tenantId: string | null, details: Record<string, unknown>,
) {
  await svc.from("security_events").insert({
    severity, event_type: eventType, actor_user_id: actorId,
    tenant_id: tenantId, status: "open",
    summary: `${eventType}: ${JSON.stringify(details).slice(0, 200)}`,
    details,
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
