// Edge function: playbook-download
// Issues a 60-second signed URL for a playbook ONLY if the caller is authenticated
// AND their stage meets the registry's required_level. Every attempt is audited.
//
// POST { playbook_key: string } -> { url: string, file_name: string }
// 401 unauth | 403 denied | 404 not_found | 500 server_error

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const log = async (
    user_id: string | null,
    playbook_key: string,
    result: "granted" | "denied" | "not_found" | "unauth",
    required_level: number | null,
    user_level: number | null,
  ) => {
    try {
      await admin.from("playbook_access_log").insert({
        user_id, playbook_key, result, required_level, user_level,
        ip, user_agent: ua,
      });
    } catch (_) { /* never block the response on audit failure */ }
  };

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      await log(null, "(missing)", "unauth", null, null);
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Identify caller from JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      await log(null, "(invalid-jwt)", "unauth", null, null);
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const playbookKey = String(body?.playbook_key ?? "").trim();
    const requestedVersion =
      typeof body?.version === "number" && Number.isFinite(body.version)
        ? Math.max(1, Math.floor(body.version))
        : null;
    if (!playbookKey) {
      return new Response(JSON.stringify({ error: "missing_playbook_key" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Lookup registry entry (service role bypasses RLS — safe, registry has no secrets)
    const { data: entry } = await admin
      .from("playbook_access_registry")
      .select("current_file_name, required_level")
      .eq("playbook_key", playbookKey)
      .maybeSingle();

    if (!entry) {
      await log(userId, playbookKey, "not_found", null, null);
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Authoritative permission check via DB function
    const { data: allowed, error: rpcErr } = await admin.rpc(
      "can_access_playbook_level",
      { _user_id: userId, _required_level: entry.required_level },
    );
    if (rpcErr) {
      await log(userId, playbookKey, "denied", entry.required_level, null);
      return new Response(JSON.stringify({ error: "permission_check_failed" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Get user level for audit (best-effort)
    const { data: prof } = await admin
      .from("profiles").select("business_stage").eq("id", userId).maybeSingle();
    const { data: userLevel } = await admin.rpc("stage_to_level", {
      _stage: prof?.business_stage ?? "opener",
    });

    if (!allowed) {
      await log(userId, playbookKey, "denied", entry.required_level, userLevel ?? null);
      return new Response(JSON.stringify({
        error: "forbidden",
        required_level: entry.required_level,
      }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Resolve target file: requested specific version or current
    let targetFile = entry.current_file_name;
    let resolvedVersion: number | null = null;

    if (requestedVersion !== null) {
      const { data: ver } = await admin
        .from("playbook_versions")
        .select("file_name, version")
        .eq("playbook_key", playbookKey)
        .eq("version", requestedVersion)
        .maybeSingle();
      if (!ver) {
        await log(userId, playbookKey, "not_found", entry.required_level, userLevel ?? null);
        return new Response(JSON.stringify({ error: "version_not_found" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      targetFile = ver.file_name;
      resolvedVersion = ver.version;
    } else {
      const { data: ver } = await admin
        .from("playbook_versions")
        .select("version")
        .eq("playbook_key", playbookKey)
        .eq("is_current", true)
        .maybeSingle();
      resolvedVersion = ver?.version ?? null;
    }

    // Issue short-lived signed URL (60s)
    const { data: signed, error: signErr } = await admin.storage
      .from("playbooks")
      .createSignedUrl(targetFile, 60, { download: targetFile });

    if (signErr || !signed?.signedUrl) {
      await log(userId, playbookKey, "denied", entry.required_level, userLevel ?? null);
      return new Response(JSON.stringify({ error: "sign_failed" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await log(userId, playbookKey, "granted", entry.required_level, userLevel ?? null);

    return new Response(JSON.stringify({
      url: signed.signedUrl,
      file_name: targetFile,
      version: resolvedVersion,
      expires_in: 60,
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "server_error", detail: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
