import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Provision an L0 applicant account after successful booking.
 * 
 * Strategy: Try to create auth user. If email already registered, find existing.
 * Then ensure profile has business_stage='prospect' (L0) and send access email.
 * 
 * Body: { lead_id: string, email: string, name?: string }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // For internal edge function calls, we need a valid JWT for the gateway.
  // The anon key is a valid JWT; service_role_key may not pass JWT validation.
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdWZoeHpqZ2RuaHZ1dXZsdGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzIwODIsImV4cCI6MjA4ODc0ODA4Mn0.IlDXMgGrv3VsauOmp4oMSBlDJKjSCJH3ROIhkA027qA";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let leadId: string, email: string, name: string | undefined;
  try {
    const body = await req.json();
    leadId = body.lead_id;
    email = body.email?.trim().toLowerCase();
    name = body.name;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!leadId || !email) {
    return new Response(JSON.stringify({ error: "lead_id and email are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const logEvent = async (eventName: string, payload: Record<string, any> = {}) => {
    await supabase.from("event_logs").insert({
      event_name: eventName,
      email,
      payload: { lead_id: leadId, ...payload },
      status: "ok",
    });
  };

  await logEvent("applicant_account_link_started", { name });

  // ─── 1. Find or create auth user ───
  let userId: string;
  let isNewUser = false;
  let temporaryPassword: string | null = null;
  

  // First check profiles table (reliable, no pagination issues)
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, business_stage, full_name")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    // CASE A: User already exists — still generate a temp password so the
    // access email always has a manual-login fallback.
    userId = existingProfile.id;
    temporaryPassword = crypto.randomUUID().slice(0, 12) + "!Aa1";
    const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, { password: temporaryPassword });
    if (pwErr) {
      console.error("Failed to reset temp password for existing user:", pwErr.message);
      temporaryPassword = null; // non-fatal, email will still have magic link
    }
    await logEvent("applicant_account_found_existing", { user_id: userId, temp_password_set: !pwErr });
  } else {
    // CASE B: Try to create new user
    temporaryPassword = crypto.randomUUID() + "!Aa1";
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: name || email.split("@")[0] },
    });

    if (createError) {
      // If "already registered", find via profiles again (might have been created between checks)
      if (createError.message?.includes("already been registered")) {
        // User exists in auth but no profile row yet — find by listing
        const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 500 });
        const found = listData?.users?.find(u => u.email?.toLowerCase() === email);
        if (found) {
          userId = found.id;
          isNewUser = false;
          await logEvent("applicant_account_found_existing", { user_id: userId });
        } else {
          await logEvent("applicant_account_creation_failed", { error: "User exists but cannot be found" });
          return json({ error: "User exists but lookup failed" }, 500);
        }
      } else {
        await logEvent("applicant_account_creation_failed", { error: createError.message });
        return json({ error: createError.message }, 400);
      }
    } else {
      userId = newUser.user!.id;
      isNewUser = true;
      
      await logEvent("applicant_account_created", { user_id: userId });
    }
  }

  // ─── 2. Role check: verify no elevated roles exist ───
  const ELEVATED_ROLES = new Set([
    "admin", "owner", "administrator", "security_admin", "ops_admin",
    "content_admin", "finance_admin", "support_admin", "partner_admin",
  ]);

  const { data: existingRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId!);

  const userRoles = (existingRoles || []).map((r: any) => r.role as string);
  const hasElevatedRole = userRoles.some((r) => ELEVATED_ROLES.has(r));

  if (hasElevatedRole) {
    // Safety: never downgrade an admin/owner to L0 prospect
    await logEvent("applicant_role_check_elevated_skip", {
      user_id: userId,
      existing_roles: userRoles,
      action: "skipped_l0_assignment",
    });
    console.warn(`[provision] User ${userId} has elevated roles [${userRoles.join(",")}], skipping L0 assignment`);
  }

  // ─── 3. Set profile to prospect (L0) if not elevated ───
  const STAGE_ORDER = [
    "prospect", "opener", "setter", "senior_associate",
    "junior_manager", "manager", "senior_manager",
    "director", "partner",
  ];

  // Re-fetch profile (might have been created by trigger after auth user creation)
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_stage, full_name, community_access, current_phase")
    .eq("id", userId)
    .maybeSingle();

  let finalStage = profile?.business_stage || "prospect";

  if (profile && !hasElevatedRole) {
    const currentIdx = STAGE_ORDER.indexOf(profile.business_stage || "");
    const isAlreadyL1Plus = (profile.community_access === true) || ((profile.current_phase ?? 0) >= 1);
    // Stage-based guard: any stage above "prospect" (idx 0) is considered progressed
    const hasProgressedStage = currentIdx > 0;

    if (isAlreadyL1Plus || hasProgressedStage) {
      // User already has L1+ access or a progressed stage — NEVER downgrade
      await logEvent("applicant_role_check_l1plus_skip", {
        user_id: userId,
        business_stage: profile.business_stage,
        community_access: profile.community_access,
        current_phase: profile.current_phase,
        has_progressed_stage: hasProgressedStage,
        action: "skipping L0 assignment — existing L1+ user",
      });
    } else if (isNewUser || currentIdx <= 0) {
      // Safe to set to prospect (L0) — only for genuinely new or already-prospect users
      await supabase
        .from("profiles")
        .update({
          business_stage: "prospect",
          ...(name && !profile.full_name ? { full_name: name } : {}),
        })
        .eq("id", userId);
      finalStage = "prospect";
    }
    await logEvent("applicant_level_assigned_l0", {
      user_id: userId,
      previous_stage: profile.business_stage,
      final_stage: finalStage,
      had_elevated_role: hasElevatedRole,
      roles: userRoles,
    });
  } else if (!profile) {
    // Profile doesn't exist yet — will be created by trigger, log and continue
    await logEvent("applicant_profile_pending", { user_id: userId });
  }

  // ─── 4. Link lead to user via owner_id ───
  await supabase
    .from("leads")
    .update({ owner_id: userId })
    .eq("id", leadId)
    .is("owner_id", null);

  // ─── 5. Generate magic link ───
  const siteUrl = "https://ethicalcloser.de";
  let magicLink: string | null = null;
  try {
    const { data: magicData, error: magicError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${siteUrl}/members/dashboard` },
    });

    if (magicData?.properties?.action_link) {
      magicLink = magicData.properties.action_link;
    }
    if (magicError) {
      console.error("Failed to generate magic link:", magicError.message);
    }
    await logEvent("applicant_magic_link_generated", {
      user_id: userId,
      success: !!magicLink,
      redirect_url: `${siteUrl}/members/dashboard`,
      error: magicError?.message ?? null,
    });
  } catch (err: any) {
    console.error("Magic link generation error:", err?.message);
    await logEvent("applicant_magic_link_error", { user_id: userId!, error: err?.message });
  }

  // ─── 5. Send access email ───
  const loginUrl = `${siteUrl}/members/login`;
  try {
    const templateData = {
      name: name || profile?.full_name || email.split("@")[0],
      email,
      magicLink: magicLink || loginUrl,
      temporaryPassword,
      loginUrl,
    };

    // ─── Template data validation ───
    // Every access email MUST contain these fields. Fail loudly if missing.
    const validationErrors: string[] = [];

    if (!templateData.magicLink || typeof templateData.magicLink !== "string" || !templateData.magicLink.startsWith("http")) {
      validationErrors.push("magicLink missing or invalid (CTA button would be broken)");
    }
    if (!templateData.email || typeof templateData.email !== "string" || !templateData.email.includes("@")) {
      validationErrors.push("email missing or invalid (login email address would be empty)");
    }
    if (!templateData.loginUrl || typeof templateData.loginUrl !== "string" || !templateData.loginUrl.startsWith("http")) {
      validationErrors.push("loginUrl missing or invalid (fallback login link would be broken)");
    }
    // temporaryPassword: if it was supposed to be generated but is null/empty, warn
    if (temporaryPassword !== null && (!templateData.temporaryPassword || typeof templateData.temporaryPassword !== "string" || templateData.temporaryPassword.length < 8)) {
      validationErrors.push("temporaryPassword was generated but is invalid (password field would show garbage)");
    }

    if (validationErrors.length > 0) {
      const msg = `Access email template validation failed: ${validationErrors.join("; ")}`;
      console.error(`[provision] ${msg}`);
      await logEvent("applicant_access_email_validation_failed", {
        user_id: userId,
        validation_errors: validationErrors,
        templateData: { ...templateData, temporaryPassword: templateData.temporaryPassword ? "[REDACTED]" : null },
      });
      // Do NOT send a broken email — return error
      return json({ error: msg, validation_errors: validationErrors }, 422);
    }

    const emailPayload = {
      templateName: "applicant-access",
      recipientEmail: email,
      idempotencyKey: `applicant-access-${leadId}`,
      templateData,
    };
    console.log("[provision] sending access email — validation passed", {
      to: email,
      hasMagicLink: !!magicLink,
      hasTempPassword: !!temporaryPassword,
      templateName: emailPayload.templateName,
    });
    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON_KEY}`,
        "apikey": ANON_KEY,
      },
      body: JSON.stringify(emailPayload),
    });
    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      throw new Error(`Email send failed (${emailRes.status}): ${errBody}`);
    }
    await emailRes.text(); // consume body
    await logEvent("applicant_access_email_triggered", {
      user_id: userId,
      magic_link_included: !!magicLink,
      temp_password_included: !!temporaryPassword,
      redirect_url: `${siteUrl}/members/dashboard`,
    });
  } catch (emailError: any) {
    console.error("Access email error:", emailError?.message);
    await supabase.from("event_logs").insert({
      event_name: "applicant_access_email_failed",
      email,
      payload: { lead_id: leadId, user_id: userId, error: emailError?.message },
      status: "error",
      error_message: emailError?.message,
    });
  }

  return json({
    success: true,
    user_id: userId,
    is_new_user: isNewUser,
    magic_link: magicLink || null,
    temporary_password_generated: !!temporaryPassword,
  });
});
