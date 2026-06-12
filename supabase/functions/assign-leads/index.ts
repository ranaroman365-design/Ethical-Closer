import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date().toISOString();
    const results: { lead_id: string; assigned_to: string; role: string; new_stage: string; quality: string }[] = [];

    // ─── 1. Score unscored pool leads first ───
    const { data: unscoredLeads } = await supabase
      .from("leads")
      .select("id, quiz_score, quiz_result, source, contact_count, first_action_at, created_at, appointment_date")
      .eq("stage", "in_pool")
      .is("scored_at", null)
      .limit(50);

    if (unscoredLeads && unscoredLeads.length > 0) {
      for (const lead of unscoredLeads) {
        const score = calculateLeadScore(lead);
        const quality = score >= 80 ? 'A' : score >= 60 ? 'B' : 'C';
        await supabase
          .from("leads")
          .update({ lead_score: score, lead_quality: quality, scored_at: now })
          .eq("id", lead.id);
      }
    }

    // ─── 2. Get available setters sorted by performance ───
    const { data: setters } = await supabase
      .from("profiles")
      .select("id, full_name, business_stage")
      .in("business_stage", ["setter", "associate_setter", "senior_associate", "senior_setter"]);

    if (!setters || setters.length === 0) {
      return new Response(
        JSON.stringify({ success: true, assigned: 0, message: "No setters available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get setter performance scores from member_kpis
    const setterIds = setters.map(s => s.id);
    const { data: setterKpis } = await supabase
      .from("member_kpis")
      .select("user_id, show_rate, handover_rate, qualification_accuracy, calls_handled, crm_hygiene_score")
      .in("user_id", setterIds);

    const setterScoreMap: Record<string, number> = {};
    for (const s of setters) {
      const kpi = (setterKpis ?? []).find(k => k.user_id === s.id);
      setterScoreMap[s.id] = kpi
        ? Math.round(
            (kpi.show_rate ?? 0) * 0.30 +
            (kpi.handover_rate ?? 0) * 0.25 +
            (kpi.qualification_accuracy ?? 0) * 0.20 +
            Math.min((kpi.calls_handled ?? 0) / 20 * 100, 100) * 0.15 +
            (kpi.crm_hygiene_score ?? 0) * 0.10
          )
        : 50; // default for new setters
    }

    // Count active leads per setter
    const { data: activeCounts } = await supabase
      .from("leads")
      .select("setter_id")
      .not("setter_id", "is", null)
      .not("stage", "in", "(closed_won,closed_lost,cancelled,recycled,returned_to_pool,converted_to_L1)");

    const countMap: Record<string, number> = {};
    for (const s of setters) countMap[s.id] = 0;
    for (const l of activeCounts ?? []) {
      if (l.setter_id && countMap[l.setter_id] !== undefined) countMap[l.setter_id]++;
    }

    // ─── 3. Assign leads by quality tier ───

    // A-Leads → top performers (sorted by setter score DESC)
    const { data: aLeads } = await supabase
      .from("leads")
      .select("id, name, stage, lead_score, lead_quality")
      .eq("stage", "in_pool")
      .is("setter_id", null)
      .eq("lead_quality", "A")
      .order("lead_score", { ascending: false })
      .limit(10);

    const topSetters = [...setters].sort((a, b) => (setterScoreMap[b.id] || 0) - (setterScoreMap[a.id] || 0));

    if (aLeads && aLeads.length > 0) {
      let idx = 0;
      for (const lead of aLeads) {
        const setter = topSetters[idx % Math.min(topSetters.length, 3)]; // A-leads only to top 3
        const assigned = await assignLead(supabase, lead, setter, "setter", now, countMap);
        if (assigned) results.push({ ...assigned, quality: "A" });
        idx++;
      }
    }

    // B-Leads → normal round-robin (sorted by least active leads)
    const { data: bLeads } = await supabase
      .from("leads")
      .select("id, name, stage, lead_score, lead_quality")
      .eq("stage", "in_pool")
      .is("setter_id", null)
      .eq("lead_quality", "B")
      .order("lead_score", { ascending: false })
      .limit(15);

    if (bLeads && bLeads.length > 0) {
      const roundRobinSetters = [...setters].sort((a, b) => (countMap[a.id] || 0) - (countMap[b.id] || 0));
      let idx = 0;
      for (const lead of bLeads) {
        const setter = roundRobinSetters[idx % roundRobinSetters.length];
        const assigned = await assignLead(supabase, lead, setter, "setter", now, countMap);
        if (assigned) results.push({ ...assigned, quality: "B" });
        roundRobinSetters.sort((a, b) => (countMap[a.id] || 0) - (countMap[b.id] || 0));
        idx++;
      }
    }

    // C-Leads → only if setters have capacity (< 8 active leads)
    const { data: cLeads } = await supabase
      .from("leads")
      .select("id, name, stage, lead_score, lead_quality")
      .eq("stage", "in_pool")
      .is("setter_id", null)
      .eq("lead_quality", "C")
      .order("created_at", { ascending: true })
      .limit(5);

    if (cLeads && cLeads.length > 0) {
      const availableSetters = setters.filter(s => (countMap[s.id] || 0) < 8);
      if (availableSetters.length > 0) {
        let idx = 0;
        for (const lead of cLeads) {
          const setter = availableSetters[idx % availableSetters.length];
          const assigned = await assignLead(supabase, lead, setter, "setter", now, countMap);
          if (assigned) results.push({ ...assigned, quality: "C" });
          idx++;
        }
      }
    }

    // ─── 4. Auto-assign qualified leads to Closers (performance-based) ───
    const { data: closerLeads } = await supabase
      .from("leads")
      .select("id, name, stage, setter_id, lead_score, lead_quality")
      .eq("stage", "ready_for_closer")
      .is("closer_id", null)
      .order("lead_score", { ascending: false })
      .limit(10);

    if (closerLeads && closerLeads.length > 0) {
      const { data: closers } = await supabase
        .from("profiles")
        .select("id, full_name, business_stage")
        .in("business_stage", ["junior_manager", "manager", "senior_manager", "director"]);

      if (closers && closers.length > 0) {
        // Get closer performance scores
        const closerIds = closers.map(c => c.id);
        const { data: closerKpis } = await supabase
          .from("member_kpis")
          .select("user_id, closing_rate, show_rate, earnings_per_call, revenue_closed, storno_rate")
          .in("user_id", closerIds);

        const closerScoreMap: Record<string, number> = {};
        for (const c of closers) {
          const kpi = (closerKpis ?? []).find(k => k.user_id === c.id);
          closerScoreMap[c.id] = kpi
            ? Math.round(
                (kpi.closing_rate ?? 0) * 0.35 +
                (kpi.show_rate ?? 0) * 0.20 +
                Math.min((kpi.earnings_per_call ?? 0) / 500 * 100, 100) * 0.25 +
                Math.min((kpi.revenue_closed ?? 0) / 50000 * 100, 100) * 0.10 +
                (100 - (kpi.storno_rate ?? 0)) * 0.10
              )
            : 50;
        }

        // A-quality leads → best closers
        const sortedClosers = [...closers].sort((a, b) => (closerScoreMap[b.id] || 0) - (closerScoreMap[a.id] || 0));

        const closerCountMap: Record<string, number> = {};
        for (const c of closers) closerCountMap[c.id] = 0;

        const { data: activeCloserCounts } = await supabase
          .from("leads")
          .select("closer_id")
          .not("closer_id", "is", null)
          .not("stage", "in", "(closed_won,closed_lost,cancelled,recycled,returned_to_pool,converted_to_L1)");

        for (const l of activeCloserCounts ?? []) {
          if (l.closer_id && closerCountMap[l.closer_id] !== undefined) closerCountMap[l.closer_id]++;
        }

        let cIdx = 0;
        for (const lead of closerLeads) {
          const isALead = (lead.lead_quality === 'A');
          const pool = isALead
            ? sortedClosers.slice(0, Math.min(3, sortedClosers.length))
            : [...closers].sort((a, b) => (closerCountMap[a.id] || 0) - (closerCountMap[b.id] || 0));

          const closer = pool[cIdx % pool.length];

          const { error } = await supabase
            .from("leads")
            .update({
              stage: "assigned_closer",
              closer_id: closer.id,
              owner_id: closer.id,
              owner_role: "closer",
              timer_expires_at: new Date(Date.now() + 72 * 3600000).toISOString(),
              updated_at: now,
            })
            .eq("id", lead.id);

          if (!error) {
            await supabase.from("lead_transitions").insert({
              lead_id: lead.id,
              previous_stage: "ready_for_closer",
              new_stage: "assigned_closer",
              changed_by: closer.id,
              reason: `Quality-Based Routing (${lead.lead_quality || 'B'}-Lead, Score: ${lead.lead_score || 0}) → ${closer.full_name || closer.id}`,
            });

            results.push({
              lead_id: lead.id,
              assigned_to: closer.full_name || closer.id,
              role: "closer",
              new_stage: "assigned_closer",
              quality: lead.lead_quality || "B",
            });

            closerCountMap[closer.id] = (closerCountMap[closer.id] || 0) + 1;
          }
          cIdx++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        assigned: results.length,
        details: results,
        distribution: {
          A: results.filter(r => r.quality === 'A').length,
          B: results.filter(r => r.quality === 'B').length,
          C: results.filter(r => r.quality === 'C').length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[assign-leads] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Helper: Calculate lead score inline ───
function calculateLeadScore(lead: any): number {
  let score = 0;
  const quizScore = lead.quiz_score ?? 0;
  const hasAppointment = !!lead.appointment_date;

  // Commitment (30%)
  score += Math.min(quizScore * 0.6 + (hasAppointment ? 40 : 0), 100) * 0.30;

  // Segment (20%)
  const segScores: Record<string, number> = { identity: 95, income: 85, lifestyle: 60, freedom: 50, skill: 40 };
  score += (segScores[(lead.quiz_result || '').toLowerCase()] ?? 30) * 0.20;

  // Quiz clarity (15%)
  score += Math.min(quizScore, 100) * 0.15;

  // Behavior (15%)
  score += Math.min((lead.contact_count ?? 0) * 15 + (lead.first_action_at ? 30 : 0), 100) * 0.15;

  // Response speed (10%)
  if (lead.first_action_at && lead.created_at) {
    const h = (new Date(lead.first_action_at).getTime() - new Date(lead.created_at).getTime()) / 3600000;
    score += (h <= 1 ? 100 : h <= 6 ? 80 : h <= 24 ? 60 : h <= 72 ? 30 : 10) * 0.10;
  } else {
    score += 20 * 0.10;
  }

  // Funnel source (10%)
  const srcScores: Record<string, number> = { bewerbung: 90, referral: 85, quiz: 70, webinar: 65, organic: 50, paid: 45, manual: 40 };
  score += (srcScores[lead.source] ?? 30) * 0.10;

  return Math.round(score);
}

// ─── Helper: Assign a lead to a setter/closer ───
async function assignLead(
  supabase: any,
  lead: any,
  assignee: any,
  role: string,
  now: string,
  countMap: Record<string, number>
) {
  const timerExpires = new Date(Date.now() + 72 * 3600000).toISOString();

  const { error } = await supabase
    .from("leads")
    .update({
      stage: "assigned_setter",
      setter_id: assignee.id,
      owner_id: assignee.id,
      owner_role: "setter",
      timer_expires_at: timerExpires,
      updated_at: now,
    })
    .eq("id", lead.id);

  if (error) return null;

  await supabase.from("lead_transitions").insert({
    lead_id: lead.id,
    previous_stage: "in_pool",
    new_stage: "assigned_setter",
    changed_by: assignee.id,
    reason: `Quality-Based Routing (${lead.lead_quality || 'B'}-Lead, Score: ${lead.lead_score || 0}) → ${assignee.full_name || assignee.id}`,
  });

  await supabase.from("audit_logs").insert({
    action: "quality_based_assign",
    source_type: "cron",
    note: `Lead "${lead.name}" (${lead.lead_quality}-Lead) assigned to ${assignee.full_name}`,
    before_state: { stage: "in_pool", setter_id: null, lead_quality: lead.lead_quality },
    after_state: { stage: "assigned_setter", setter_id: assignee.id },
  });

  countMap[assignee.id] = (countMap[assignee.id] || 0) + 1;

  return {
    lead_id: lead.id,
    assigned_to: assignee.full_name || assignee.id,
    role,
    new_stage: "assigned_setter",
  };
}
