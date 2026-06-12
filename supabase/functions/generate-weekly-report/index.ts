import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    const reportWeek = weekStart.toISOString().split('T')[0];

    // ── Gather data ──
    const [leadsRes, transitionsRes, eventsRes, profilesRes, kpiAlertsRes, aggregatesRes] = await Promise.all([
      supabase.from('leads').select('id, stage, setter_id, closer_id, deal_value, updated_at, created_at, source'),
      supabase.from('lead_transitions').select('id, previous_stage, new_stage, created_at').gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString()),
      supabase.from('event_logs').select('id, event_name, status').gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString()),
      supabase.from('profiles').select('id, business_stage, email_confirmed, onboarding_completed'),
      supabase.from('kpi_alerts').select('id, kpi_key, severity, status').eq('status', 'open'),
      supabase.from('dashboard_daily_aggregates').select('metrics_json').order('aggregate_date', { ascending: false }).limit(1),
    ]);

    const leads = (leadsRes.data ?? []) as any[];
    const transitions = (transitionsRes.data ?? []) as any[];
    const events = (eventsRes.data ?? []) as any[];
    const profiles = (profilesRes.data ?? []) as any[];
    const openAlerts = (kpiAlertsRes.data ?? []) as any[];
    const latestAggregate = (aggregatesRes.data?.[0]?.metrics_json ?? {}) as any;

    const total = leads.length;
    const poolStages = ['new', 'backlog', 'recycled', 'in_pool', 'returned_to_pool'];
    const setterStages = ['booked', 'assigned_setter', 'setter_attempting', 'setter_contacting', 'setter_no_response', 'setter_qualified', 'setter_booked'];
    const closerStages = ['ready_for_closer', 'assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up'];

    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
    const stuckLeads = leads.filter(l => [...setterStages, ...closerStages].includes(l.stage) && l.updated_at < sevenDaysAgo);
    const newUnprocessed = leads.filter(l => l.stage === 'new');
    const wonLeads = leads.filter(l => l.stage === 'closed_won');

    // ── Score Calculations ──
    // Stability: based on stuck leads, unprocessed leads, open alerts
    const stabilityPenalties = Math.min(stuckLeads.length * 0.3 + newUnprocessed.length * 0.1 + openAlerts.length * 0.5, 7);
    const stabilityScore = Math.max(10 - stabilityPenalties, 2);

    // Logic integrity: based on transition volume and errors
    const failedEvents = events.filter(e => e.status === 'error').length;
    const logicPenalty = Math.min(failedEvents * 1.0, 5);
    const logicScore = Math.max(10 - logicPenalty, 3);

    // UX clarity: estimated from profile completeness
    const confirmedProfiles = profiles.filter(p => p.email_confirmed).length;
    const onboardedProfiles = profiles.filter(p => p.onboarding_completed).length;
    const uxScore = profiles.length > 0 ? Math.round((((confirmedProfiles + onboardedProfiles) / (profiles.length * 2)) * 10) * 10) / 10 : 5;

    // Funnel health: based on win rate and pipeline flow
    const winRate = total > 0 ? (wonLeads.length / total) * 100 : 0;
    const funnelScore = Math.min(Math.max(winRate * 0.5 + (transitions.length > 0 ? 3 : 0) + (newUnprocessed.length < 20 ? 2 : 0), 2), 10);

    // Data consistency: based on tracking coverage
    const dataScore = Math.min(events.length > 10 ? 7 : events.length > 0 ? 5 : 3, 10);

    const overallScore = Math.round(((stabilityScore + logicScore + uxScore + funnelScore + dataScore) / 5) * 10) / 10;

    // ── Findings ──
    const findings: { category: string; severity: string; detail: string }[] = [];
    if (stuckLeads.length > 0) findings.push({ category: 'lead_flow', severity: 'warning', detail: `${stuckLeads.length} leads stuck 7+ days without movement` });
    if (newUnprocessed.length > 20) findings.push({ category: 'routing', severity: 'warning', detail: `${newUnprocessed.length} unprocessed new leads in pool` });
    if (failedEvents > 0) findings.push({ category: 'tracking', severity: 'error', detail: `${failedEvents} failed event logs this week` });
    if (winRate < 10 && total > 20) findings.push({ category: 'funnel', severity: 'critical', detail: `Win rate at ${winRate.toFixed(1)}% — below 10% threshold` });
    if (openAlerts.length > 0) findings.push({ category: 'kpi', severity: 'warning', detail: `${openAlerts.length} unresolved KPI alerts` });
    const noSetterLeads = leads.filter(l => setterStages.includes(l.stage) && !l.setter_id);
    if (noSetterLeads.length > 0) findings.push({ category: 'routing', severity: 'warning', detail: `${noSetterLeads.length} setter-stage leads without assigned setter` });

    // ── Safe fixes ──
    const safeFixes: string[] = [];
    if (stuckLeads.length > 0) safeFixes.push('Recycle or reassign leads stuck for 7+ days');
    if (newUnprocessed.length > 10) safeFixes.push('Trigger batch setter assignment for unprocessed pool leads');

    // ── Open risks ──
    const openRisks: string[] = [];
    if (winRate < 10 && total > 20) openRisks.push('Critically low win rate may indicate closer skill gap or lead quality issue');
    if (openAlerts.filter(a => a.severity === 'critical').length > 0) openRisks.push('Critical KPI alerts unresolved');

    // ── Recommendations ──
    const recommendations = {
      immediate: findings.filter(f => f.severity === 'critical').map(f => f.detail),
      next: findings.filter(f => f.severity === 'warning').map(f => f.detail),
      monitor: findings.filter(f => f.severity === 'error').map(f => f.detail),
    };

    const summary = `Week of ${reportWeek}: Overall score ${overallScore}/10. ${findings.length} findings, ${openRisks.length} open risks. ${transitions.length} lead transitions this week. Win rate: ${winRate.toFixed(1)}%.`;

    // ── Revenue Forecasts ──
    const forecastWindows = ['7d', '30d', 'current_month', 'next_month'];
    const forecastResults: Record<string, string> = {};
    for (const w of forecastWindows) {
      try {
        const { data: fid } = await supabase.rpc('generate_revenue_forecast', {
          p_pipeline_id: null, p_user_id: null, p_window: w,
        });
        forecastResults[w] = fid || 'generated';
      } catch { forecastResults[w] = 'error'; }
    }

    // ── Recalc Performance & Evaluate Promotions ──
    const activeProfiles = profiles.filter(p => p.onboarding_completed);
    let promoCount = 0;
    for (const p of activeProfiles.slice(0, 200)) {
      try {
        await supabase.rpc('recalc_enhanced_performance', { p_user_id: p.id });
        await supabase.rpc('evaluate_user_for_promotion', { p_user_id: p.id });
        promoCount++;
      } catch { /* skip individual errors */ }
    }

    // ── Write report ──
    const { data: report, error } = await supabase.from('system_audit_reports').insert({
      report_type: 'weekly',
      overall_score: overallScore,
      stability_score: Math.round(stabilityScore * 10) / 10,
      logic_score: Math.round(logicScore * 10) / 10,
      ux_score: Math.round(uxScore * 10) / 10,
      funnel_score: Math.round(funnelScore * 10) / 10,
      data_score: Math.round(dataScore * 10) / 10,
      findings: findings,
      recommendations: recommendations,
      auto_fixes: safeFixes,
      open_risks: openRisks,
    }).select().single();

    if (error) throw error;

    // ── Create notification for admins ──
    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    for (const admin of (admins ?? [])) {
      await supabase.from('notifications').insert({
        recipient_id: admin.user_id,
        type: 'report',
        title: `Weekly Report — ${reportWeek}`,
        message: `System score: ${overallScore}/10. ${findings.length} findings.`,
        link_path: '/members/admin/governance',
      });
    }

    return new Response(JSON.stringify({
      success: true,
      report_id: report.id,
      overall_score: overallScore,
      findings_count: findings.length,
      summary,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
