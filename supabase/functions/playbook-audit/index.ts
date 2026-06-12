// Playbook Governance — AI-powered audit engine
// Extracts processes/events/KPIs from playbooks, compares with live system, generates gaps + suggestions.
// Supports weekly (light) and monthly (deep) audit modes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface AuditRequest {
  audit_type: "weekly" | "monthly";
  playbook_keys?: string[]; // optional filter
}

// Gather current system state for comparison
async function getSystemState(supabase: ReturnType<typeof createClient>) {
  const [
    { data: events },
    { data: touchpoints },
    { data: statuses },
    { data: kpis },
  ] = await Promise.all([
    supabase.from("lead_activation_events").select("event_type").limit(500),
    supabase.from("lead_activation_templates").select("touchpoint_code, channel, enabled").limit(200),
    supabase.rpc("get_enum_values", { enum_name: "lead_status" }).then((r: any) => r).catch(() => ({ data: null })),
    supabase.from("kpi_snapshots").select("metric_key").limit(100),
  ]);

  // Deduplicate
  const uniqueEvents = [...new Set((events ?? []).map((e: any) => e.event_type))];
  const uniqueKpis = [...new Set((kpis ?? []).map((k: any) => k.metric_key))];
  const activeTouchpoints = (touchpoints ?? []).filter((t: any) => t.enabled);

  return {
    events: uniqueEvents,
    touchpoints: activeTouchpoints.map((t: any) => `${t.touchpoint_code} (${t.channel})`),
    statuses: statuses ?? ["NEW_LEAD", "CONTACTED", "ENGAGED", "BOOKED", "NO_SHOW", "NO_CLOSE", "CLOSED", "UNRESPONSIVE", "REACTIVATION_POOL"],
    kpis: uniqueKpis,
    feature_count: activeTouchpoints.length,
  };
}

// Get all registered playbooks
async function getPlaybooks(supabase: ReturnType<typeof createClient>, keys?: string[]) {
  let q = supabase.from("playbook_access_registry").select("playbook_key, file_name, current_version, tier");
  if (keys?.length) q = q.in("playbook_key", keys);
  const { data } = await q;
  return data ?? [];
}

// AI-powered playbook analysis
async function analyzePlaybook(
  playbookKey: string,
  fileName: string,
  systemState: any,
  auditType: "weekly" | "monthly",
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const systemContext = JSON.stringify(systemState, null, 2);

  const prompt = auditType === "weekly"
    ? `You are auditing the playbook "${playbookKey}" (file: ${fileName}) against the current system state.
This is a WEEKLY light check. Focus on:
- New events or flows that might affect this playbook
- Any obvious mismatches

Current system state:
${systemContext}

Based on the playbook name and the system state, assess:
1. Is this playbook likely still current?
2. Any gaps you can infer?

Return JSON:
{
  "health_status": "current" | "partially_outdated" | "outdated" | "critically_wrong",
  "risk_level": "low" | "medium" | "high" | "critical",
  "extracted_processes": ["process1", ...],
  "extracted_events": ["event1", ...],
  "extracted_kpis": ["kpi1", ...],
  "gaps": [{"type": "undocumented_flow|missing_flow|kpi_mismatch|status_mismatch|event_mismatch|process_mismatch|missing_documentation", "severity": "low|medium|high|critical", "description": "...", "impact_area": "revenue|conversion|stability|compliance|other"}],
  "update_suggestions": [{"section": "...", "old_text": "...", "new_text": "...", "rationale": "...", "priority": "low|medium|high|critical"}],
  "analysis": "Brief summary"
}`
    : `You are performing a MONTHLY DEEP AUDIT of the playbook "${playbookKey}" (file: ${fileName}).
Compare exhaustively against the live system state.

Current system state:
${systemContext}

Perform:
1. Extract ALL processes, events, KPIs, and statuses the playbook likely covers
2. Compare each against the system state
3. Identify ALL gaps (missing docs, wrong KPIs, outdated flows, etc.)
4. Generate specific update suggestions with old/new text
5. Prioritize by revenue/conversion impact

Return JSON:
{
  "health_status": "current" | "partially_outdated" | "outdated" | "critically_wrong",
  "risk_level": "low" | "medium" | "high" | "critical",
  "extracted_processes": ["process1", ...],
  "extracted_events": ["event1", ...],
  "extracted_kpis": ["kpi1", ...],
  "extracted_statuses": ["status1", ...],
  "system_comparison": {"matches": [...], "mismatches": [...], "missing_in_playbook": [...], "missing_in_system": [...]},
  "gaps": [{"type": "...", "severity": "...", "description": "...", "system_reference": "...", "playbook_reference": "...", "impact_area": "..."}],
  "update_suggestions": [{"section": "...", "old_text": "...", "new_text": "...", "rationale": "...", "priority": "..."}],
  "analysis": "Detailed summary"
}`;

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are an expert system auditor for a sales platform. Return ONLY valid JSON, no markdown." },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "playbook_audit_result",
          description: "Return structured audit results",
          parameters: {
            type: "object",
            properties: {
              health_status: { type: "string", enum: ["current", "partially_outdated", "outdated", "critically_wrong"] },
              risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
              extracted_processes: { type: "array", items: { type: "string" } },
              extracted_events: { type: "array", items: { type: "string" } },
              extracted_kpis: { type: "array", items: { type: "string" } },
              extracted_statuses: { type: "array", items: { type: "string" } },
              system_comparison: { type: "object" },
              gaps: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    severity: { type: "string" },
                    description: { type: "string" },
                    system_reference: { type: "string" },
                    playbook_reference: { type: "string" },
                    impact_area: { type: "string" },
                  },
                  required: ["type", "severity", "description"],
                },
              },
              update_suggestions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    section: { type: "string" },
                    old_text: { type: "string" },
                    new_text: { type: "string" },
                    rationale: { type: "string" },
                    priority: { type: "string" },
                  },
                  required: ["section", "old_text", "new_text", "rationale", "priority"],
                },
              },
              analysis: { type: "string" },
            },
            required: ["health_status", "risk_level", "analysis"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "playbook_audit_result" } },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limit exceeded");
    if (res.status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI error: ${res.status}`);
  }

  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call in AI response");

  return JSON.parse(toolCall.function.arguments);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { audit_type, playbook_keys } = (await req.json()) as AuditRequest;
    if (!audit_type || !["weekly", "monthly"].includes(audit_type)) {
      return new Response(JSON.stringify({ error: "audit_type must be 'weekly' or 'monthly'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1. Create audit run
    const { data: run, error: runErr } = await supabase
      .from("playbook_audit_runs")
      .insert({ audit_type, status: "running" })
      .select("id")
      .single();
    if (runErr || !run) throw new Error(`Failed to create audit run: ${runErr?.message}`);

    // 2. Get system state + playbooks
    const [systemState, playbooks] = await Promise.all([
      getSystemState(supabase),
      getPlaybooks(supabase, playbook_keys),
    ]);

    if (!playbooks.length) {
      await supabase.from("playbook_audit_runs").update({
        status: "completed", completed_at: new Date().toISOString(),
        total_playbooks: 0, summary: { message: "No playbooks found" },
      }).eq("id", run.id);
      return new Response(JSON.stringify({ ok: true, run_id: run.id, playbooks_audited: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Audit each playbook
    const counts = { current: 0, partially_outdated: 0, outdated: 0, critically_wrong: 0, gaps: 0 };

    for (const pb of playbooks) {
      try {
        const result = await analyzePlaybook(pb.playbook_key, pb.file_name, systemState, audit_type);

        // Insert audit result
        const { data: auditResult } = await supabase.from("playbook_audit_results").insert({
          audit_run_id: run.id,
          playbook_key: pb.playbook_key,
          health_status: result.health_status,
          risk_level: result.risk_level,
          extracted_processes: result.extracted_processes ?? [],
          extracted_events: result.extracted_events ?? [],
          extracted_kpis: result.extracted_kpis ?? [],
          extracted_statuses: result.extracted_statuses ?? [],
          system_comparison: result.system_comparison ?? {},
          ai_analysis: result.analysis,
        }).select("id").single();

        // Insert gaps
        const gaps = result.gaps ?? [];
        if (gaps.length > 0 && auditResult) {
          const gapRows = gaps.map((g: any) => ({
            audit_run_id: run.id,
            audit_result_id: auditResult.id,
            playbook_key: pb.playbook_key,
            gap_type: g.type || "process_mismatch",
            severity: g.severity || "medium",
            description: g.description,
            system_reference: g.system_reference ?? null,
            playbook_reference: g.playbook_reference ?? null,
            impact_area: g.impact_area ?? "other",
          }));
          await supabase.from("playbook_gaps").insert(gapRows);
          counts.gaps += gaps.length;
        }

        // Insert suggestions
        const suggestions = result.update_suggestions ?? [];
        if (suggestions.length > 0) {
          const suggRows = suggestions.map((s: any) => ({
            audit_run_id: run.id,
            playbook_key: pb.playbook_key,
            section_title: s.section ?? null,
            old_text: s.old_text,
            new_text: s.new_text,
            rationale: s.rationale,
            priority: s.priority || "medium",
          }));
          await supabase.from("playbook_update_suggestions").insert(suggRows);
        }

        // Count
        if (result.health_status === "current") counts.current++;
        else if (result.health_status === "partially_outdated") counts.partially_outdated++;
        else if (result.health_status === "outdated") counts.outdated++;
        else counts.critically_wrong++;

      } catch (pbErr) {
        console.error(`Audit failed for ${pb.playbook_key}:`, pbErr);
        await supabase.from("playbook_audit_results").insert({
          audit_run_id: run.id,
          playbook_key: pb.playbook_key,
          health_status: "critically_wrong",
          risk_level: "critical",
          ai_analysis: `Audit failed: ${pbErr instanceof Error ? pbErr.message : String(pbErr)}`,
        });
        counts.critically_wrong++;
      }
    }

    // 4. Finalize run
    await supabase.from("playbook_audit_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      total_playbooks: playbooks.length,
      current_count: counts.current,
      partially_outdated_count: counts.partially_outdated,
      outdated_count: counts.outdated,
      critically_wrong_count: counts.critically_wrong,
      gaps_found: counts.gaps,
      summary: { counts, system_state_snapshot: { events: systemState.events.length, touchpoints: systemState.touchpoints.length, kpis: systemState.kpis.length } },
    }).eq("id", run.id);

    return new Response(JSON.stringify({
      ok: true,
      run_id: run.id,
      audit_type,
      playbooks_audited: playbooks.length,
      ...counts,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("playbook-audit error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "internal" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
