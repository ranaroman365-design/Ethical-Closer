import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { opportunity_id } = await req.json();
    if (!opportunity_id) {
      return new Response(JSON.stringify({ error: 'opportunity_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Load opportunity
    const { data: opp, error: oppErr } = await supabase
      .from('placement_opportunities')
      .select('*')
      .eq('id', opportunity_id)
      .single();
    if (oppErr || !opp) {
      return new Response(JSON.stringify({ error: 'Opportunity not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Load placement-ready, certified closers
    const { data: closers } = await supabase
      .from('profiles')
      .select('id, full_name, business_stage, certified, placement_ready')
      .eq('certified', true)
      .eq('placement_ready', true);

    if (!closers?.length) {
      return new Response(JSON.stringify({ matches: [], message: 'No eligible closers found' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const closerIds = closers.map(c => c.id);

    // 3. Load KPIs, cert data, and copilot session stats in parallel
    const [kpiRes, certRes, copilotRes] = await Promise.all([
      supabase.from('member_kpis').select('*').in('user_id', closerIds),
      supabase.from('certification_status').select('*').in('user_id', closerIds),
      supabase.from('copilot_sessions').select('user_id, dominant_state, final_commitment, final_risk, final_momentum, outcome, duration_seconds').in('user_id', closerIds).eq('outcome', 'won').not('dominant_state', 'is', null),
    ]);

    const kpiMap = new Map((kpiRes.data ?? []).map((k: any) => [k.user_id, k]));
    const certMap = new Map((certRes.data ?? []).map((c: any) => [c.user_id, c]));

    // Aggregate copilot stats per user
    const copilotStats = new Map<string, { depthCount: number; totalSessions: number; avgMomentum: string }>();
    for (const s of (copilotRes.data ?? [])) {
      const existing = copilotStats.get(s.user_id) || { depthCount: 0, totalSessions: 0, avgMomentum: 'medium' };
      existing.totalSessions++;
      if (s.dominant_state === 'Emotional Depth' || s.dominant_state === 'Decision') existing.depthCount++;
      copilotStats.set(s.user_id, existing);
    }

    // 4. Score each closer
    const matches: any[] = [];

    for (const closer of closers) {
      const kpi = kpiMap.get(closer.id) as any;
      const cert = certMap.get(closer.id) as any;
      const copilot = copilotStats.get(closer.id);

      let totalScore = 0;
      const reasoning: string[] = [];

      // --- KPI FIT (30 pts) ---
      const closeRate = kpi?.closing_rate ?? 0;
      const minCR = opp.min_close_rate ?? 20;
      if (closeRate >= minCR) {
        totalScore += 15;
        reasoning.push(`Close Rate ${closeRate}% exceeds minimum ${minCR}%`);
      } else {
        totalScore += Math.round((closeRate / Math.max(minCR, 1)) * 10);
      }

      const showRate = kpi?.show_rate ?? 0;
      const minSR = opp.min_show_rate ?? 60;
      if (showRate >= minSR) {
        totalScore += 10;
      } else {
        totalScore += Math.round((showRate / Math.max(minSR, 1)) * 7);
      }

      if ((kpi?.calls_per_week ?? 0) >= 15) totalScore += 5;

      // --- CONVERSATION INTELLIGENCE (30 pts) ---
      const depthScore = copilot ? Math.round((copilot.depthCount / Math.max(copilot.totalSessions, 1)) * 100) : 50;
      const objectionScore = kpi?.objection_resolution_rate ?? (cert?.simulation_avg ? cert.simulation_avg * 10 : 50);
      const commitmentScore = copilot ? (copilot.depthCount > 3 ? 80 : 60) : 50;

      if (depthScore >= 70) { totalScore += 10; reasoning.push('High conversation depth — creates emotional engagement'); }
      else totalScore += Math.round(depthScore / 10);

      if (objectionScore >= 70) { totalScore += 10; reasoning.push('Strong objection handling skills'); }
      else totalScore += Math.round(objectionScore / 10);

      if (commitmentScore >= 70) { totalScore += 10; reasoning.push('Builds strong commitment quality'); }
      else totalScore += Math.round(commitmentScore / 10);

      // --- PRODUCT FIT (20 pts) ---
      let productFit = 10; // base
      const ticketSize = opp.ticket_size?.toLowerCase() ?? '';
      const callType = opp.call_type?.toLowerCase() ?? 'warm';

      // High ticket + high close rate = great fit
      if (ticketSize.includes('high') || ticketSize.includes('premium')) {
        if (closeRate >= 30) { productFit += 10; reasoning.push('Proven high-ticket closer'); }
        else productFit += 5;
      } else {
        productFit += 5;
      }

      // Cold calls need resilience
      if (callType === 'cold') {
        if ((kpi?.follow_up_rate ?? 0) >= 80) { productFit += 5; reasoning.push('Strong follow-up discipline for cold outreach'); }
      }

      totalScore += Math.min(20, productFit);

      // --- ETHICAL ALIGNMENT (10 pts) ---
      const ethicalScore = kpi?.ethical_alignment_score ?? 0;
      if (ethicalScore >= 75) { totalScore += 10; reasoning.push('High ethical alignment score'); }
      else totalScore += Math.round((ethicalScore / 75) * 7);

      // --- CERTIFICATION BONUS (10 pts) ---
      if (cert?.final_score && cert.final_score >= 80) { totalScore += 7; reasoning.push(`Certification score: ${cert.final_score}`); }
      if (cert?.percentile_rank && cert.percentile_rank <= 20) { totalScore += 3; reasoning.push(`Top ${cert.percentile_rank}% performer`); }

      totalScore = Math.min(100, totalScore);

      // Determine conversation style
      let convStyle = 'balanced';
      if (depthScore >= 70 && objectionScore >= 70) convStyle = 'depth-driven closer';
      else if (objectionScore >= 80) convStyle = 'objection specialist';
      else if (depthScore >= 70) convStyle = 'empathic depth builder';
      else if (closeRate >= 35) convStyle = 'high-conversion closer';

      matches.push({
        opportunity_id,
        closer_user_id: closer.id,
        match_score: totalScore,
        match_reasoning: reasoning,
        depth_score: depthScore,
        objection_score: objectionScore,
        commitment_score: commitmentScore,
        close_rate: closeRate,
        conversation_style: convStyle,
        product_fit_score: Math.min(100, productFit * 5),
        status: 'suggested',
      });
    }

    // Sort by score descending, take top 5
    matches.sort((a, b) => b.match_score - a.match_score);
    const topMatches = matches.slice(0, 5);

    // 5. Upsert matches
    for (const m of topMatches) {
      await supabase.from('placement_matches').upsert(m, { onConflict: 'opportunity_id,closer_user_id' });
    }

    return new Response(JSON.stringify({ matches: topMatches, total_evaluated: closers.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
