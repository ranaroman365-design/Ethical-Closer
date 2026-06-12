import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// All roles allowed to create users via the admin Mitglieder UI.
// Mirrors src/types/members.ts -> PRIVILEGED_ROLES.
const PRIVILEGED_ROLES = new Set([
  "owner",
  "admin",
  "administrator",
  "security_admin",
  "ops_admin",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── ENV ──────────────────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error("[create-test-user] missing env vars", {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceRoleKey,
      hasAnonKey: !!anonKey,
    });
    return json({ error: "Server-Konfiguration fehlt (ENV)." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ── PAYLOAD ──────────────────────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ungültiger JSON-Body." }, 400);
  }

  const {
    action = "create",
    email,
    password,
    full_name,
    role,
    user_id,
    business_stage,
    invite_token,
  } = body ?? {};

  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : undefined;

  // ── INVITE-TOKEN PATH (public self-signup) ──────────────────────────────
  const isInviteSignup =
    action === "create" &&
    typeof invite_token === "string" &&
    invite_token.length > 0;

  let isPrivileged = false;
  let inviteOk = false;

  if (isInviteSignup) {
    const { data: inv } = await supabase
      .from("invite_tokens")
      .select("token, email, used, expires_at")
      .eq("token", invite_token)
      .maybeSingle();
    const notExpired = inv?.expires_at
      ? new Date(inv.expires_at) > new Date()
      : true;
    if (
      inv &&
      !inv.used &&
      notExpired &&
      normalizedEmail &&
      inv.email?.toLowerCase() === normalizedEmail &&
      (!role || role === "member")
    ) {
      inviteOk = true;
    } else {
      return json({ error: "Einladungs-Token ungültig oder abgelaufen." }, 403);
    }
  }

  // ── AUTH GATE (privileged caller) ───────────────────────────────────────
  if (!inviteOk) {
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Nicht angemeldet." }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const anon = createClient(supabaseUrl, anonKey);
    const { data: claimsData, error: claimsErr } = await anon.auth.getClaims(
      token,
    );
    if (claimsErr || !claimsData?.claims?.sub) {
      console.warn("[create-test-user] auth claims failed", claimsErr?.message);
      return json({ error: "Sitzung ungültig." }, 401);
    }
    const callerId = claimsData.claims.sub as string;

    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    if (roleErr) {
      console.error("[create-test-user] role lookup failed", roleErr);
      return json({ error: "Berechtigungsprüfung fehlgeschlagen." }, 500);
    }
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    isPrivileged = roles.some((r) => PRIVILEGED_ROLES.has(r));
    if (!isPrivileged) {
      console.warn("[create-test-user] non-privileged caller", {
        callerId,
        roles,
      });
      return json(
        { error: "Du hast keine Berechtigung, User anzulegen." },
        403,
      );
    }
  }

  // ── DESTRUCTIVE ACTIONS (privileged only) ───────────────────────────────
  if ((action === "update_password" || action === "delete") && !isPrivileged) {
    return json({ error: "Aktion erfordert Admin-Rechte." }, 403);
  }

  if (action === "update_password") {
    if (!user_id || !password) {
      return json({ error: "user_id und password erforderlich." }, 400);
    }
    const { error } = await supabase.auth.admin.updateUserById(user_id, {
      password,
    });
    if (error) return json({ error: error.message }, 400);
    return json({ success: true, updated: user_id });
  }

  if (action === "delete") {
    if (!user_id) return json({ error: "user_id erforderlich." }, 400);
    const { error } = await supabase.auth.admin.deleteUser(user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ success: true, deleted: user_id });
  }

  // ── CREATE USER ─────────────────────────────────────────────────────────
  // Validate required fields
  const missing: string[] = [];
  if (!normalizedEmail) missing.push("email");
  if (!password) missing.push("password");
  if (!full_name) missing.push("full_name");
  if (missing.length) {
    return json(
      { error: `Pflichtfelder fehlen: ${missing.join(", ")}` },
      400,
    );
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail!)) {
    return json({ error: "Ungültiges E-Mail-Format." }, 400);
  }

  // Password length (Supabase default is 6, we surface a clear message)
  if (typeof password !== "string" || password.length < 8) {
    return json(
      { error: "Passwort muss mindestens 8 Zeichen lang sein." },
      400,
    );
  }

  // Duplicate-email check (best-effort via listUsers filter)
  try {
    const { data: existing, error: existErr } =
      await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    // listUsers doesn't accept a filter param; fall back to a profiles lookup
    if (existErr) {
      console.warn(
        "[create-test-user] listUsers warn",
        existErr.message,
      );
    }
  } catch (_) {
    // non-fatal
  }
  const { data: dupProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail!)
    .maybeSingle();
  if (dupProfile?.id) {
    return json({ error: "Diese E-Mail existiert bereits." }, 409);
  }

  // Create the auth user
  const { data: userData, error: createError } =
    await supabase.auth.admin.createUser({
      email: normalizedEmail!,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

  if (createError) {
    console.error("[create-test-user] createUser failed", createError);
    const msg = createError.message || "";
    if (/already.*registered|exists/i.test(msg)) {
      return json({ error: "Diese E-Mail existiert bereits." }, 409);
    }
    if (/password/i.test(msg)) {
      return json({ error: `Passwort abgelehnt: ${msg}` }, 400);
    }
    return json({ error: `User-Erstellung fehlgeschlagen: ${msg}` }, 400);
  }

  const userId = userData.user?.id;
  if (!userId) {
    return json({ error: "User-Erstellung lieferte keine ID." }, 500);
  }

  // Update business_stage on the profile created by handle_new_user trigger
  if (business_stage) {
    const { error: stageErr } = await supabase
      .from("profiles")
      .update({ business_stage, full_name })
      .eq("id", userId);
    if (stageErr) {
      console.error("[create-test-user] stage update failed", stageErr);
      // non-fatal — user exists; surface as warning
    }
  }

  // Role assignment
  try {
    if (role === "community_member") {
      const { error: rpcErr } = await supabase.rpc("unlock_community_access", {
        p_user_id: userId,
      });
      if (rpcErr) console.error("[create-test-user] unlock_community_access", rpcErr);
    } else if (role && role !== "member") {
      // Upsert role row (trigger may already have inserted 'member')
      const { error: upErr } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role }, { onConflict: "user_id" });
      if (upErr) {
        // fall back to update-then-insert
        const { error: updErr } = await supabase
          .from("user_roles")
          .update({ role })
          .eq("user_id", userId);
        if (updErr) {
          console.error("[create-test-user] role assignment failed", updErr);
        }
      }
    }
  } catch (e) {
    console.error("[create-test-user] role/community step threw", e);
  }

  return json({
    success: true,
    user_id: userId,
    email: normalizedEmail,
    business_stage: business_stage ?? null,
    role: role ?? "member",
  }, 201);
});
