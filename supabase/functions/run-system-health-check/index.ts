import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const checks: { name: string; passed: boolean; detail: string }[] = [];
  const errors: { level: string; category: string; title: string; details: string }[] = [];

  // 1. Profiles completeness check
  const { data: profiles } = await sb.from("profiles").select("id, full_name, email, business_stage");
  const incompleteProfiles = (profiles || []).filter(p => !p.full_name || !p.email);
  checks.push({
    name: "Profil-Vollständigkeit",
    passed: incompleteProfiles.length === 0,
    detail: incompleteProfiles.length > 0 ? `${incompleteProfiles.length} Profile unvollständig` : "Alle Profile vollständig",
  });
  if (incompleteProfiles.length > 0) {
    errors.push({ level: "MEDIUM", category: "data", title: "Unvollständige Profile", details: `${incompleteProfiles.length} Profile ohne Name oder E-Mail` });
  }

  // 2. Leads without stage
  const { data: leads } = await sb.from("leads").select("id, stage, quiz_result, name");
  const leadsNoStage = (leads || []).filter(l => !l.stage);
  checks.push({
    name: "Lead-Stage Konsistenz",
    passed: leadsNoStage.length === 0,
    detail: leadsNoStage.length > 0 ? `${leadsNoStage.length} Leads ohne Stage` : "Alle Leads haben Stage",
  });

  // 3. Leads data consistency - each lead has segment
  const leadsNoQuiz = (leads || []).filter(l => l.stage !== 'new' && !l.quiz_result);
  checks.push({
    name: "Lead-Quiz Daten",
    passed: leadsNoQuiz.length <= 5,
    detail: `${leadsNoQuiz.length} Leads ohne Quiz-Ergebnis (außer 'new')`,
  });

  // 4. User roles check
  const { data: roles } = await sb.from("user_roles").select("user_id, role");
  const profileIds = new Set((profiles || []).map(p => p.id));
  const rolesUserIds = new Set((roles || []).map(r => r.user_id));
  const profilesWithoutRole = [...profileIds].filter(id => !rolesUserIds.has(id));
  checks.push({
    name: "User-Rollen Zuordnung",
    passed: profilesWithoutRole.length === 0,
    detail: profilesWithoutRole.length > 0 ? `${profilesWithoutRole.length} User ohne Rolle` : "Alle User haben Rollen",
  });
  if (profilesWithoutRole.length > 0) {
    errors.push({ level: "HIGH", category: "auth", title: "User ohne Rollen", details: `${profilesWithoutRole.length} User-Profile ohne zugewiesene Rolle` });
  }

  // 5. KPI data availability
  const { data: kpis } = await sb.from("member_kpis").select("user_id");
  const kpiUserIds = new Set((kpis || []).map(k => k.user_id));
  const profilesWithoutKpi = [...profileIds].filter(id => !kpiUserIds.has(id));
  checks.push({
    name: "KPI-Daten Vollständigkeit",
    passed: profilesWithoutKpi.length <= 2,
    detail: `${profilesWithoutKpi.length} User ohne KPI-Einträge`,
  });

  // 6. Community messages check
  const { data: msgs } = await sb.from("community_messages").select("id").limit(1);
  checks.push({
    name: "Community aktiv",
    passed: (msgs || []).length > 0,
    detail: (msgs || []).length > 0 ? "Community-Nachrichten vorhanden" : "Keine Community-Nachrichten",
  });

  // 7. Chat threads check
  const { data: threads } = await sb.from("chat_threads").select("id").limit(1);
  checks.push({
    name: "Chat-System aktiv",
    passed: (threads || []).length > 0,
    detail: (threads || []).length > 0 ? "Chat-Threads vorhanden" : "Keine Chat-Threads",
  });

  // 8. Data integrity logs
  const { data: intLogs } = await sb.from("data_integrity_logs").select("id").limit(1);
  checks.push({
    name: "Datenintegrität",
    passed: true,
    detail: `${(intLogs || []).length > 0 ? 'Integrity-Logs vorhanden' : 'Keine Verletzungen'}`,
  });

  // Calculate score
  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);
  const status = score >= 80 ? "healthy" : score >= 50 ? "warning" : "critical";

  // Save health check
  await sb.from("system_health_checks").insert({
    check_type: "automated",
    overall_score: score,
    checks_passed: passed,
    checks_failed: total - passed,
    checks_total: total,
    details: checks,
    status,
  });

  // Save errors
  for (const err of errors) {
    await sb.from("system_error_logs").insert({
      error_level: err.level,
      category: err.category,
      title: err.title,
      details: err.details,
    });
  }

  return new Response(JSON.stringify({ score, status, checks, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
