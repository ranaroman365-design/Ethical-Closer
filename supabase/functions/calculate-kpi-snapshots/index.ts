import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Commission Rates ──
// Canonical source of truth: public.product_config.config.commission_rates (loaded at runtime).
// The hardcoded table below is a last-resort fallback only used if product_config is unavailable.
// Do NOT edit rates here — edit them in product_config or src/pages/members/WhiteLabelSettings.tsx.
const FALLBACK_COMMISSION_RATES: Record<string, number> = {
  opener: 0.01,
  setter: 0.03,
  associate_setter: 0.03,
  senior_associate: 0.05,
  senior_setter: 0.05,
  junior_manager: 0.08,
  manager: 0.10,
  senior_manager: 0.12,
  director: 0.03,
  partner: 0.02,
};

const SETTER_STAGES = new Set(['opener', 'setter', 'associate_setter', 'senior_associate', 'senior_setter']);
const CLOSER_STAGES = new Set(['junior_manager', 'manager', 'senior_manager']);
const OVERRIDE_STAGES = new Set(['director', 'partner']);

function buildRateLookup(configRates: Record<string, number> | null, overrideActive: boolean) {
  const rates: Record<string, number> = { ...FALLBACK_COMMISSION_RATES, ...(configRates ?? {}) };

  return (stage: string, role: 'setter' | 'closer' | 'opener' | 'team_override'): number => {
    const rate = rates[stage] ?? 0;
    if (!rate) return 0;
    // Phase 3: honor override_active flag — don't pay director/partner overrides yet
    if (OVERRIDE_STAGES.has(stage)) {
      if (role !== 'team_override') return 0;
      return overrideActive ? rate : 0;
    }
    if (role === 'opener' && stage === 'opener') return rate;
    if (role === 'setter' && SETTER_STAGES.has(stage) && stage !== 'opener') return rate;
    if (role === 'closer' && CLOSER_STAGES.has(stage)) return rate;
    return 0;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const today = new Date().toISOString().split('T')[0];

    // ── Load canonical commission rates from product_config (single source of truth) ──
    const { data: cfgRow } = await supabase
      .from('product_config')
      .select('config')
      .eq('product_key', 'etc')
      .single();
    const cfg = (cfgRow?.config ?? {}) as Record<string, unknown>;
    const configRates = (cfg.commission_rates ?? null) as Record<string, number> | null;
    const overrideActive = Boolean(cfg.override_active);
    const getCommissionRate = buildRateLookup(configRates, overrideActive);

    // ── Fetch all leads ──
    const { data: leads } = await supabase.from('leads').select('id, stage, lead_level, setter_id, closer_id, owner_id, deal_value, source, updated_at, created_at');
    const allLeads = (leads ?? []) as any[];

    // ── Fetch profiles ──
    const { data: profiles } = await supabase.from('profiles').select('id, business_stage');
    const allProfiles = (profiles ?? []) as any[];
    const profileMap: Record<string, string> = {};
    allProfiles.forEach(p => { profileMap[p.id] = p.business_stage; });

    // ── Fetch director team assignments for team override ──
    const { data: teamAssignments } = await supabase.from('director_team_assignments').select('director_id, closer_id, status').eq('status', 'active');
    const activeTeamAssignments = (teamAssignments ?? []) as any[];

    // Build director → closers map
    const directorClosersMap: Record<string, string[]> = {};
    for (const ta of activeTeamAssignments) {
      if (!directorClosersMap[ta.director_id]) directorClosersMap[ta.director_id] = [];
      directorClosersMap[ta.director_id].push(ta.closer_id);
    }

    const setterStages = ['setter', 'associate_setter', 'senior_associate', 'senior_setter'];
    const closerStages = ['junior_manager', 'manager', 'senior_manager'];
    const setters = allProfiles.filter(p => setterStages.includes(p.business_stage));
    const closers = allProfiles.filter(p => closerStages.includes(p.business_stage));

    // Stage groupings
    const poolStages = ['new', 'backlog', 'recycled', 'in_pool', 'returned_to_pool'];
    const setterLeadStages = ['booked', 'assigned_setter', 'setter_attempting', 'setter_contacting', 'setter_no_response', 'setter_qualified', 'setter_booked'];
    const closerLeadStages = ['ready_for_closer', 'assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up'];
    const qualifiedStages = ['setter_qualified', 'setter_booked', 'ready_for_closer', ...closerLeadStages, 'closed_won', 'closed_lost'];
    const handoverStages = ['ready_for_closer', ...closerLeadStages, 'closed_won', 'closed_lost'];

    const poolLeads = allLeads.filter(l => poolStages.includes(l.stage));
    const setterLeads = allLeads.filter(l => setterLeadStages.includes(l.stage));
    const closerLeads = allLeads.filter(l => closerLeadStages.includes(l.stage));
    const wonLeads = allLeads.filter(l => l.stage === 'closed_won');
    const lostLeads = allLeads.filter(l => l.stage === 'closed_lost');
    const total = allLeads.length;

    // ── Global KPI Snapshots ──
    const snapshots: { kpi_key: string; value: number }[] = [];

    const assignedToSetter = allLeads.filter(l => l.setter_id).length;
    snapshots.push({ kpi_key: 'lead_pool_to_setter_rate', value: total > 0 ? Math.round((assignedToSetter / total) * 100 * 10) / 10 : 0 });

    const qualified = allLeads.filter(l => qualifiedStages.includes(l.stage)).length;
    snapshots.push({ kpi_key: 'setter_to_qualified_rate', value: assignedToSetter > 0 ? Math.round((qualified / assignedToSetter) * 100 * 10) / 10 : 0 });

    const handedToCloser = allLeads.filter(l => l.closer_id).length;
    snapshots.push({ kpi_key: 'setter_to_closer_handover_rate', value: qualified > 0 ? Math.round((handedToCloser / qualified) * 100 * 10) / 10 : 0 });

    const closerTotal = allLeads.filter(l => l.closer_id).length;
    snapshots.push({ kpi_key: 'closer_close_rate', value: closerTotal > 0 ? Math.round((wonLeads.length / closerTotal) * 100 * 10) / 10 : 0 });

    // Lead aging
    const now = Date.now();
    const agingLeads = allLeads.filter(l => ![...poolStages, 'closed_won', 'closed_lost', 'cancelled', 'converted_to_L1'].includes(l.stage));
    const avgAging = agingLeads.length > 0 ? agingLeads.reduce((s: number, l: any) => s + (now - new Date(l.updated_at).getTime()) / 86400000, 0) / agingLeads.length : 0;
    snapshots.push({ kpi_key: 'lead_aging_days', value: Math.round(avgAging * 10) / 10 });

    // Team KPIs
    snapshots.push({ kpi_key: 'leads_per_setter', value: setters.length > 0 ? Math.round((setterLeads.length / setters.length) * 10) / 10 : 0 });
    snapshots.push({ kpi_key: 'leads_per_closer', value: closers.length > 0 ? Math.round((closerLeads.length / closers.length) * 10) / 10 : 0 });

    // ── Per-User KPI + Revenue Attribution + Commission ──
    const userStats: Record<string, {
      closer_revenue: number;
      setter_influenced: number;
      opener_sourced: number;
      leads_assigned: number;
      leads_qualified: number;
      leads_won: number;
      leads_total: number;
      leads_handed_over: number;
      commission: number;
    }> = {};

    const ensureUser = (uid: string) => {
      if (!userStats[uid]) userStats[uid] = {
        closer_revenue: 0, setter_influenced: 0, opener_sourced: 0,
        leads_assigned: 0, leads_qualified: 0, leads_won: 0,
        leads_total: 0, leads_handed_over: 0, commission: 0,
      };
    };

    for (const lead of allLeads) {
      const isWon = lead.stage === 'closed_won';
      const dv = lead.deal_value || 0;

      // Closer attribution
      if (lead.closer_id) {
        ensureUser(lead.closer_id);
        userStats[lead.closer_id].leads_total++;
        if (isWon) {
          userStats[lead.closer_id].closer_revenue += dv;
          userStats[lead.closer_id].leads_won++;
          const closerStage = profileMap[lead.closer_id] || 'junior_manager';
          userStats[lead.closer_id].commission += dv * getCommissionRate(closerStage, 'closer');
        }
      }

      // Setter attribution
      if (lead.setter_id) {
        ensureUser(lead.setter_id);
        userStats[lead.setter_id].leads_assigned++;
        if (qualifiedStages.includes(lead.stage)) {
          userStats[lead.setter_id].leads_qualified++;
        }
        if (handoverStages.includes(lead.stage)) {
          userStats[lead.setter_id].leads_handed_over++;
        }
        if (isWon) {
          userStats[lead.setter_id].setter_influenced += dv;
          userStats[lead.setter_id].leads_won++;
          const setterStage = profileMap[lead.setter_id] || 'setter';
          userStats[lead.setter_id].commission += dv * getCommissionRate(setterStage, 'setter');
        }
      }

      // Opener/owner attribution (if different from setter/closer)
      if (lead.owner_id && lead.owner_id !== lead.setter_id && lead.owner_id !== lead.closer_id) {
        ensureUser(lead.owner_id);
        userStats[lead.owner_id].leads_assigned++;
        userStats[lead.owner_id].leads_total++;
        if (isWon) {
          userStats[lead.owner_id].opener_sourced += dv;
          userStats[lead.owner_id].leads_won++;
          const ownerStage = profileMap[lead.owner_id] || 'opener';
          userStats[lead.owner_id].commission += dv * getCommissionRate(ownerStage, 'opener');
        }
      }
    }

    // ── Director / Partner Team Override Commission ──
    // Directors/Partners earn a % override on all revenue closed by their team members
    for (const [directorId, closerIds] of Object.entries(directorClosersMap)) {
      ensureUser(directorId);
      const directorStage = profileMap[directorId] || 'director';
      const overrideRate = getCommissionRate(directorStage, 'team_override');

      let teamRevenue = 0;
      for (const closerId of closerIds) {
        const closerStats = userStats[closerId];
        if (closerStats) {
          teamRevenue += closerStats.closer_revenue;
        }
      }

      userStats[directorId].closer_revenue = teamRevenue; // team's total revenue
      userStats[directorId].commission += teamRevenue * overrideRate;
    }

    // Also handle partners who have team assignments
    for (const profile of allProfiles) {
      if (profile.business_stage === 'partner' && !directorClosersMap[profile.id]) {
        // Partners without explicit team assignments: attribute all platform revenue
        ensureUser(profile.id);
        const totalPlatformRevenue = wonLeads.reduce((s: number, l: any) => s + (l.deal_value || 0), 0);
        const overrideRate = getCommissionRate('partner', 'team_override');
        userStats[profile.id].closer_revenue = totalPlatformRevenue;
        userStats[profile.id].commission += totalPlatformRevenue * overrideRate;
      }
    }

    // Update member_kpis with per-user attribution
    for (const [userId, stats] of Object.entries(userStats)) {
      const closingRate = stats.leads_total > 0 ? Math.round((stats.leads_won / stats.leads_total) * 100 * 10) / 10 : 0;
      const epc = stats.leads_total > 0 ? Math.round((stats.closer_revenue / stats.leads_total) * 100) / 100 : 0;
      const qualRate = stats.leads_assigned > 0 ? Math.round((stats.leads_qualified / stats.leads_assigned) * 100 * 10) / 10 : 0;
      const handoverRate = stats.leads_assigned > 0 ? Math.round((stats.leads_handed_over / stats.leads_assigned) * 100 * 10) / 10 : 0;
      const totalRevenue = stats.closer_revenue + stats.setter_influenced + stats.opener_sourced;

      await supabase.from('member_kpis').upsert({
        user_id: userId,
        revenue_closed: totalRevenue,
        closing_rate: closingRate,
        earnings_per_call: epc,
        closer_direct_revenue: stats.closer_revenue,
        setter_influenced_revenue: stats.setter_influenced,
        commission_earned: Math.round(stats.commission * 100) / 100,
        leads_assigned: stats.leads_assigned,
        leads_qualified: stats.leads_qualified,
        leads_won: stats.leads_won,
        qualification_accuracy: qualRate,
        handover_rate: handoverRate,
        calls_handled: stats.leads_total,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }

    // ── Write daily aggregates ──
    const totalRevenue = wonLeads.reduce((s: number, l: any) => s + (l.deal_value || 0), 0);
    const sourceBreakdown: Record<string, number> = {};
    allLeads.forEach((l: any) => { sourceBreakdown[l.source] = (sourceBreakdown[l.source] || 0) + 1; });

    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
    const stuckCount = agingLeads.filter((l: any) => l.updated_at < sevenDaysAgo).length;

    const revenueByCloser: Record<string, number> = {};
    wonLeads.forEach((l: any) => {
      if (l.closer_id) revenueByCloser[l.closer_id] = (revenueByCloser[l.closer_id] || 0) + (l.deal_value || 0);
    });
    const revenueBySetter: Record<string, number> = {};
    wonLeads.forEach((l: any) => {
      if (l.setter_id) revenueBySetter[l.setter_id] = (revenueBySetter[l.setter_id] || 0) + (l.deal_value || 0);
    });
    const revenueBySource: Record<string, number> = {};
    wonLeads.forEach((l: any) => {
      revenueBySource[l.source] = (revenueBySource[l.source] || 0) + (l.deal_value || 0);
    });

    await supabase.from('dashboard_daily_aggregates').upsert({
      aggregate_date: today,
      scope_type: 'global',
      scope_key: 'all',
      metrics_json: {
        total_leads: total,
        pool_leads: poolLeads.length,
        setter_leads: setterLeads.length,
        closer_leads: closerLeads.length,
        won_leads: wonLeads.length,
        lost_leads: lostLeads.length,
        total_revenue: totalRevenue,
        stuck_leads_7d: stuckCount,
        new_unprocessed: allLeads.filter((l: any) => l.stage === 'new').length,
        avg_lead_aging_days: Math.round(avgAging * 10) / 10,
        source_breakdown: sourceBreakdown,
        setter_count: setters.length,
        closer_count: closers.length,
        leads_per_setter: setters.length > 0 ? Math.round((setterLeads.length / setters.length) * 10) / 10 : 0,
        leads_per_closer: closers.length > 0 ? Math.round((closerLeads.length / closers.length) * 10) / 10 : 0,
        win_rate: total > 0 ? Math.round((wonLeads.length / total) * 100 * 10) / 10 : 0,
        revenue_by_closer: revenueByCloser,
        revenue_by_setter: revenueBySetter,
        revenue_by_source: revenueBySource,
        commission_rates: configRates ?? FALLBACK_COMMISSION_RATES,
        commission_rates_source: configRates ? 'product_config' : 'fallback',
        override_active: overrideActive,
        snapshots,
      },
    }, { onConflict: 'aggregate_date,scope_type,scope_key' });

    // ── Generate KPI alerts ──
    const alerts: { kpi_key: string; severity: string; message: string }[] = [];
    if (stuckCount > 5) alerts.push({ kpi_key: 'lead_aging_days', severity: 'warning', message: `${stuckCount} leads stuck for 7+ days` });
    if (allLeads.filter((l: any) => l.stage === 'new').length > 30) alerts.push({ kpi_key: 'lead_pool_to_setter_rate', severity: 'warning', message: 'Over 30 unprocessed new leads in pool' });
    if (wonLeads.length > 0 && total > 0 && (wonLeads.length / total) * 100 < 10) alerts.push({ kpi_key: 'closer_close_rate', severity: 'critical', message: `Win rate below 10% (${((wonLeads.length / total) * 100).toFixed(1)}%)` });

    for (const alert of alerts) {
      await supabase.from('kpi_alerts').insert(alert);
    }

    return new Response(JSON.stringify({
      success: true,
      date: today,
      snapshots_count: snapshots.length,
      alerts_count: alerts.length,
      users_updated: Object.keys(userStats).length,
      total_revenue: totalRevenue,
      commission_summary: Object.fromEntries(
        Object.entries(userStats).map(([uid, s]) => [uid, { commission: s.commission, role: profileMap[uid] }])
      ),
      metrics: { total, pool: poolLeads.length, setter: setterLeads.length, closer: closerLeads.length, won: wonLeads.length, lost: lostLeads.length },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
