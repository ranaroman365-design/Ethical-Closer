import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ReadSchema = z.object({
  action: z.literal("read"),
  prompt_key: z.string().min(1),
  purpose: z.string().min(3),
});

const WriteSchema = z.object({
  action: z.literal("write"),
  prompt_id: z.string().uuid(),
  new_content: z.string().min(1),
  change_note: z.string().nullable().optional(),
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

    // Owner check
    const { data: roleData } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
    const role = roleData?.role ?? "member";

    if (role !== "owner") {
      // Log security event for non-owner access attempt
      await svc.from("security_events").insert({
        severity: "critical",
        event_type: "prompt_vault_non_owner_access",
        actor_user_id: user.id,
        status: "open",
        summary: `Non-owner (${role}) attempted prompt vault access`,
        details: { role, user_id: user.id },
      });
      return json({ error: "Owner access required" }, 403);
    }

    const body = await req.json();

    // Route: READ
    if (body.action === "read") {
      const parsed = ReadSchema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

      const { prompt_key, purpose } = parsed.data;

      // Fetch prompt + current version
      const { data: prompt, error: pErr } = await svc
        .from("prompt_registry")
        .select("*")
        .eq("slug", prompt_key)
        .single();

      if (pErr || !prompt) return json({ error: "Prompt not found" }, 404);

      const { data: version } = await svc
        .from("prompt_versions")
        .select("*")
        .eq("prompt_id", prompt.id)
        .eq("version", prompt.current_version)
        .single();

      // AUDIT: every single read
      await svc.from("audit_logs").insert({
        actor_id: user.id,
        action: "prompt_viewed",
        action_type: "prompt_viewed",
        actor_role_key: "owner",
        resource_type: "prompt_registry",
        resource_id: prompt_key,
        action_result: "success",
        risk_score: prompt.sensitivity_level === "critical" ? 80 : 50,
        after_state: { purpose, prompt_version: prompt.current_version, sensitivity_level: prompt.sensitivity_level },
      });

      return json({
        success: true,
        prompt: {
          id: prompt.id, prompt_key: prompt.slug, prompt_name: prompt.title,
          purpose: prompt.description, sensitivity_level: prompt.sensitivity_level,
          current_version: prompt.current_version,
        },
        version: version ? {
          id: version.id, version_no: version.version, prompt_text: version.content,
          variables_schema: null, notes: version.change_note, created_at: version.created_at,
        } : null,
      });
    }

    // Route: WRITE
    if (body.action === "write") {
      const parsed = WriteSchema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

      const { prompt_id, new_content, change_note } = parsed.data;

      // Fetch prompt
      const { data: prompt, error: pErr } = await svc
        .from("prompt_registry")
        .select("*")
        .eq("id", prompt_id)
        .single();

      if (pErr || !prompt) return json({ error: "Prompt not found" }, 404);

      const newVersion = prompt.current_version + 1;

      // Insert new version
      const { error: vErr } = await svc.from("prompt_versions").insert({
        prompt_id, version: newVersion, content: new_content,
        change_note: change_note || null, created_by: user.id,
      });

      if (vErr) return json({ error: vErr.message }, 500);

      // Update registry
      await svc.from("prompt_registry").update({
        current_version: newVersion,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }).eq("id", prompt_id);

      // Audit
      await svc.from("audit_logs").insert({
        actor_id: user.id,
        action: "prompt_updated",
        action_type: "prompt_updated",
        actor_role_key: "owner",
        resource_type: "prompt_registry",
        resource_id: prompt.prompt_key,
        action_result: "success",
        risk_score: 70,
        after_state: {
          new_version: newVersion,
          change_note,
          sensitivity_level: prompt.sensitivity_level,
        },
      });

      return json({
        success: true,
        prompt_id,
        new_version: newVersion,
      });
    }

    return json({ error: "Invalid action. Use 'read' or 'write'." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
