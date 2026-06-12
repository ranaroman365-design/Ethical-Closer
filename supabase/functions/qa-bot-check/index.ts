import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_USERS = [
  { email: "bewerber@ethicaltopcloser.com", level: "L0", stage: "prospect" },
  { email: "opener@ethicaltopcloser.com", level: "L1", stage: "opener" },
  { email: "setter@ethicaltopcloser.com", level: "L2", stage: "setter" },
  { email: "seniorsetter@ethicaltopcloser.com", level: "L3", stage: "senior_associate" },
  { email: "juniorcloser@ethicaltopcloser.com", level: "L4", stage: "junior_manager" },
  { email: "closer@ethicaltopcloser.com", level: "L5", stage: "manager" },
  { email: "seniorcloser@ethicaltopcloser.com", level: "L6", stage: "senior_manager" },
  { email: "director@ethicaltopcloser.com", level: "L7", stage: "director" },
  { email: "partner@ethicaltopcloser.com", level: "L8", stage: "partner" },
  { email: "admin@ethicaltopcloser.com", level: "L9", stage: "admin" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const results: { user: string; level: string; checks: { name: string; passed: boolean; detail: string }[] }[] = [];

  for (const testUser of TEST_USERS) {
    const userChecks: { name: string; passed: boolean; detail: string }[] = [];

    // 1. Profile exists
    const { data: profile } = await sb
      .from("profiles")
      .select("id, full_name, email, business_stage, avatar_url")
      .eq("email", testUser.email)
      .maybeSingle();

    userChecks.push({
      name: "Profil existiert",
      passed: !!profile,
      detail: profile ? `${profile.full_name || 'Kein Name'}` : "Profil nicht gefunden",
    });

    if (!profile) {
      results.push({ user: testUser.email, level: testUser.level, checks: userChecks });
      continue;
    }

    // 2. Name set
    userChecks.push({
      name: "Name gesetzt",
      passed: !!profile.full_name && profile.full_name.trim().length > 0,
      detail: profile.full_name || "Fehlt",
    });

    // 3. Business stage correct
    const expectedStage = testUser.stage === "admin" ? undefined : testUser.stage;
    if (expectedStage) {
      userChecks.push({
        name: "Business Stage korrekt",
        passed: profile.business_stage === expectedStage,
        detail: `Ist: ${profile.business_stage}, Soll: ${expectedStage}`,
      });
    }

    // 4. User role exists
    const { data: roles } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id);

    userChecks.push({
      name: "Rolle zugewiesen",
      passed: (roles || []).length > 0,
      detail: (roles || []).map(r => r.role).join(", ") || "Keine Rolle",
    });

    // 5. KPI record exists
    const { data: kpi } = await sb
      .from("member_kpis")
      .select("user_id")
      .eq("user_id", profile.id)
      .maybeSingle();

    userChecks.push({
      name: "KPI-Eintrag vorhanden",
      passed: !!kpi,
      detail: kpi ? "Vorhanden" : "Fehlt",
    });

    // 6. Can access community (check messages exist for community type)
    const communityType = ["prospect", "opener"].includes(profile.business_stage || "")
      ? "trainee"
      : ["setter", "associate", "senior_associate"].includes(profile.business_stage || "")
      ? "closer"
      : "manager";

    const { data: msgs } = await sb
      .from("community_messages")
      .select("id")
      .eq("community_type", communityType)
      .limit(1);

    userChecks.push({
      name: "Community-Nachrichten verfügbar",
      passed: (msgs || []).length > 0,
      detail: `Typ: ${communityType}, Nachrichten: ${(msgs || []).length > 0 ? "Ja" : "Nein"}`,
    });

    // Post QA test message
    try {
      await sb.from("community_messages").insert({
        user_id: profile.id,
        community_type: communityType,
        message_type: "text",
        content: `🤖 QA Test erfolgreich – System aktiv (${testUser.level}, ${new Date().toISOString()})`,
      });
      userChecks.push({
        name: "Test-Nachricht gepostet",
        passed: true,
        detail: "Erfolgreich",
      });
    } catch (e) {
      userChecks.push({
        name: "Test-Nachricht gepostet",
        passed: false,
        detail: String(e),
      });
    }

    results.push({ user: testUser.email, level: testUser.level, checks: userChecks });
  }

  // Summary
  const totalChecks = results.reduce((s, r) => s + r.checks.length, 0);
  const passedChecks = results.reduce((s, r) => s + r.checks.filter(c => c.passed).length, 0);
  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  // Save as health check
  await sb.from("system_health_checks").insert({
    check_type: "qa_bot",
    overall_score: score,
    checks_passed: passedChecks,
    checks_failed: totalChecks - passedChecks,
    checks_total: totalChecks,
    details: results,
    status: score >= 80 ? "healthy" : score >= 50 ? "warning" : "critical",
  });

  // Log errors for failed checks
  for (const r of results) {
    for (const c of r.checks) {
      if (!c.passed) {
        await sb.from("system_error_logs").insert({
          error_level: "MEDIUM",
          category: "qa_bot",
          title: `${r.level} ${r.user}: ${c.name}`,
          details: c.detail,
        });
      }
    }
  }

  return new Response(JSON.stringify({ score, totalChecks, passedChecks, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
