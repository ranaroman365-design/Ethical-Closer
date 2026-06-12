/**
 * Unified secure admin action edge function.
 * Handles: approve_escalation, approve_export, revoke_session,
 *          rotate_credential, update_config, access_prompt_vault,
 *          resolve_security_event, ai_agent_request
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ActionSchema = z.object({
  action: z.enum([
    "approve_escalation", "deny_escalation", "revoke_escalation",
    "approve_export", "deny_export",
    "revoke_session", "rotate_credential",
    "update_config", "access_prompt_vault",
    "resolve_security_event",
    "ai_agent_request",
  ]),
  target_id: z.string().optional(),
  notes: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

const OWNER_ONLY_ACTIONS = [
  "update_config", "access_prompt_vault",
  "approve_escalation", "deny_escalation", "revoke_escalation",
  "approve_export", "deny_export",
];
const SECURITY_ACTIONS = [
  "revoke_session", "rotate_credential", "resolve_security_event",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const { action, target_id, notes, payload } = parsed.data;

    // Get role
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).single();
    const role = (roleData?.role as string) ?? "member";

    // Authorization
    if (OWNER_ONLY_ACTIONS.includes(action) && role !== "owner") {
      await logSecurity(supabase, "forbidden_resource_attempt", user.id, `Non-owner tried ${action}`);
      return json({ error: "Owner access required" }, 403);
    }
    if (SECURITY_ACTIONS.includes(action) && !["owner", "security_admin"].includes(role)) {
      await logSecurity(supabase, "forbidden_resource_attempt", user.id, `Unauthorized role ${role} tried ${action}`);
      return json({ error: "Security privileges required" }, 403);
    }

    let result: Record<string, unknown> = {};

    switch (action) {
      case "approve_escalation":
      case "deny_escalation": {
        if (!target_id) return json({ error: "target_id required" }, 400);
        const status = action === "approve_escalation" ? "approved" : "denied";
        const validUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1hr
        await supabase.from("role_escalation_requests").update({
          status,
          ...(status === "approved" ? { approved_by: user.id, approved_at: new Date().toISOString(), valid_from: new Date().toISOString(), valid_until: validUntil } : { denied_by: user.id, denied_at: new Date().toISOString() }),
        }).eq("id", target_id);
        result = { status, valid_until: status === "approved" ? validUntil : null };
        break;
      }

      case "revoke_escalation": {
        if (!target_id) return json({ error: "target_id required" }, 400);
        await supabase.from("role_escalation_requests").update({ status: "revoked" }).eq("id", target_id);
        result = { revoked: true };
        break;
      }

      case "approve_export":
      case "deny_export": {
        if (!target_id) return json({ error: "target_id required" }, 400);
        const expStatus = action === "approve_export" ? "queued" : "blocked";
        await supabase.from("export_requests").update({
          status: expStatus,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        }).eq("id", target_id);
        result = { export_status: expStatus };
        break;
      }

      case "revoke_session": {
        // Log session revocation
        if (!target_id) return json({ error: "target_id (session_id) required" }, 400);
        await supabase.from("session_events").insert({
          user_id: payload?.target_user_id as string ?? user.id,
          event_type: "revoked",
          session_id: target_id,
          ip_address: req.headers.get("x-forwarded-for"),
        });
        result = { revoked: true };
        break;
      }

      case "rotate_credential": {
        if (!target_id) return json({ error: "target_id required" }, 400);
        await supabase.from("integration_credentials_registry").update({
          last_rotated_at: new Date().toISOString(),
          status: "active",
        }).eq("id", target_id);
        result = { rotated: true };
        break;
      }

      case "update_config": {
        const configKey = payload?.config_key as string;
        const configValue = payload?.config_value;
        if (!configKey || configValue === undefined) return json({ error: "config_key and config_value required" }, 400);
        
        await supabase.from("system_config").upsert({
          config_key: configKey,
          config_value: configValue,
          updated_by: user.id,
          version_no: 1, // will be incremented by trigger
        }, { onConflict: "config_key" });
        result = { updated: configKey };
        break;
      }

      case "access_prompt_vault": {
        const promptKey = payload?.prompt_key as string;
        if (!promptKey) return json({ error: "prompt_key required" }, 400);

        const { data: prompt } = await supabase
          .from("prompt_registry").select("*").eq("slug", promptKey).single();
        if (!prompt) return json({ error: "Prompt not found" }, 404);

        const { data: versions } = await supabase
          .from("prompt_versions").select("*").eq("prompt_id", prompt.id).order("version", { ascending: false });

        result = { prompt, versions };
        break;
      }

      case "resolve_security_event": {
        if (!target_id) return json({ error: "target_id required" }, 400);
        const resolution = payload?.resolution as string ?? "resolved";
        await supabase.from("security_events").update({
          status: resolution,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
        }).eq("id", target_id);
        result = { resolved: true };
        break;
      }

      case "ai_agent_request": {
        const category = payload?.action_category as string;
        const scope = payload?.scope;
        if (!category) return json({ error: "action_category required" }, 400);

        const FORBIDDEN_SCOPES = ["prompt_vault", "system_config", "ip_assets", "integration_credentials"];
        const scopeStr = JSON.stringify(scope);
        if (FORBIDDEN_SCOPES.some(f => scopeStr.includes(f))) {
          await logSecurity(supabase, "ai_action_blocked", user.id, `AI tried forbidden scope: ${scopeStr}`);
          return json({ error: "AI agent scope forbidden" }, 403);
        }

        await supabase.from("ai_agent_actions").insert({
          ai_agent_key: payload?.agent_key as string ?? "default",
          requested_by_user_id: user.id,
          tenant_id: payload?.tenant_id as string,
          action_category: category,
          requested_scope: scope,
          execution_mode: "read_only",
          action_executed: false,
        });
        result = { queued: true };
        break;
      }
    }

    // Audit every action
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      action,
      action_type: action,
      resource_type: target_id ? "targeted_resource" : "system",
      resource_id: target_id,
      actor_role_key: role,
      risk_score: OWNER_ONLY_ACTIONS.includes(action) ? 80 : 50,
      after_state: { action, target_id, notes, result },
      ip_address: req.headers.get("x-forwarded-for"),
      user_agent: req.headers.get("user-agent"),
    });

    return json({ success: true, ...result });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function logSecurity(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  userId: string,
  summary: string,
) {
  await supabase.from("security_events").insert({
    severity: "high",
    event_type: eventType,
    actor_user_id: userId,
    summary,
    status: "open",
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
