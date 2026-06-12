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
    const proposalMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // ── Gather data ──
    const [leadsRes, reportsRes, alertsRes, versionsRes, kpiDefsRes] = await Promise.all([
      supabase.from('leads').select('id, stage, source, deal_value, setter_id, closer_id, updated_at'),
      supabase.from('system_audit_reports').select('*').eq('report_type', 'weekly').order('created_at', { ascending: false }).limit(4),
      supabase.from('kpi_alerts').select('*').eq('status', 'open'),
      supabase.from('release_versions').select('*').order('proposed_at', { ascending: false }).limit(1),
      supabase.from('kpi_definitions').select('*').eq('is_active', true),
    ]);

    const leads = (leadsRes.data ?? []) as any[];
    const recentReports = (reportsRes.data ?? []) as any[];
    const openAlerts = (alertsRes.data ?? []) as any[];
    const latestVersion = (versionsRes.data?.[0]) as any;
    const kpiDefs = (kpiDefsRes.data ?? []) as any[];

    const currentVersion = latestVersion?.version_label ?? 'v1.1';
    const nextMinor = currentVersion.replace(/(\d+\.\d+)/, (m: string) => {
      const [major, minor] = m.split('.').map(Number);
      return `${major}.${minor + 1}`;
    });

    // ── Analyze patterns ──
    const total = leads.length;
    const wonLeads = leads.filter(l => l.stage === 'closed_won');
    const winRate = total > 0 ? (wonLeads.length / total) * 100 : 0;
    const stuckLeads = leads.filter(l => {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
      return !['closed_won', 'closed_lost', 'cancelled', 'new', 'recycled'].includes(l.stage) && l.updated_at < sevenDaysAgo;
    });

    // Average weekly scores
    const avgScores = recentReports.length > 0 ? {
      stability: recentReports.reduce((s, r) => s + (r.stability_score || 0), 0) / recentReports.length,
      funnel: recentReports.reduce((s, r) => s + (r.funnel_score || 0), 0) / recentReports.length,
      ux: recentReports.reduce((s, r) => s + (r.ux_score || 0), 0) / recentReports.length,
      data: recentReports.reduce((s, r) => s + (r.data_score || 0), 0) / recentReports.length,
    } : { stability: 5, funnel: 5, ux: 5, data: 5 };

    // ── Generate proposals ──
    const proposals: any[] = [];

    // Funnel proposals
    if (winRate < 15) {
      proposals.push({
        title: 'Improve Closer Conversion Pipeline',
        category: 'Funnel',
        problem: `Win rate at ${winRate.toFixed(1)}% — below 15% target`,
        why_it_matters: 'Direct revenue impact. Every 1% improvement translates to significant revenue uplift.',
        target_segment: 'Performance / High Achievers',
        expected_impact: 'high',
        complexity: 'medium',
        linked_kpi_key: 'closer_close_rate',
        risk: 'low',
        recommended_version: nextMinor,
      });
    }

    if (stuckLeads.length > 10) {
      proposals.push({
        title: 'Automated Lead Re-Routing for Stuck Leads',
        category: 'Automation / Workflow',
        problem: `${stuckLeads.length} leads stuck in pipeline for 7+ days`,
        why_it_matters: 'Stale leads reduce setter/closer efficiency and waste pipeline capacity.',
        target_segment: 'B2B / Director / Team Builder',
        expected_impact: 'high',
        complexity: 'low',
        linked_kpi_key: 'lead_aging_days',
        risk: 'low',
        recommended_version: nextMinor,
      });
    }

    if (avgScores.data < 6) {
      proposals.push({
        title: 'Expand Event Tracking Coverage',
        category: 'KPI / Analytics',
        problem: 'Data consistency score averaging below 6/10 — tracking gaps detected',
        why_it_matters: 'Without reliable data, all KPI-based decisions are unreliable.',
        target_segment: 'B2B / Director / Team Builder',
        expected_impact: 'high',
        complexity: 'medium',
        linked_kpi_key: 'dashboard_return_rate',
        risk: 'low',
        recommended_version: nextMinor,
      });
    }

    if (avgScores.ux < 7) {
      proposals.push({
        title: 'UX Consistency Audit & Refinement',
        category: 'UX/UI',
        problem: 'UX clarity score below target — onboarding and navigation gaps',
        why_it_matters: 'UX friction directly impacts module completion and user retention.',
        target_segment: 'Career Seekers / 9-to-5 Escape',
        expected_impact: 'medium',
        complexity: 'medium',
        linked_kpi_key: 'module_completion_rate',
        risk: 'low',
        recommended_version: nextMinor,
      });
    }

    // Always suggest B2B and AI opportunities
    proposals.push({
      title: 'AI-Powered Call Analysis Insights for Directors',
      category: 'AI Opportunities',
      problem: 'Directors lack aggregated insights from call analysis data',
      why_it_matters: 'AI insights enable data-driven coaching and team improvement.',
      target_segment: 'B2B / Director / Team Builder',
      expected_impact: 'high',
      complexity: 'high',
      linked_kpi_key: 'conversion_by_closer',
      risk: 'medium',
      recommended_version: `v${parseInt(currentVersion.replace('v', '')) + 1}.0`,
    });

    proposals.push({
      title: 'White-Label Dashboard for Partner Organizations',
      category: 'B2B Scale',
      problem: 'Partners need branded visibility into their team performance',
      why_it_matters: 'Enables B2B scaling without custom development per partner.',
      target_segment: 'B2B / Director / Team Builder',
      expected_impact: 'high',
      complexity: 'high',
      linked_kpi_key: 'leads_per_closer',
      risk: 'medium',
      recommended_version: `v${parseInt(currentVersion.replace('v', '')) + 1}.0`,
    });

    // Top opportunities
    const topOpportunities = proposals.slice(0, 3).map(p => ({ title: p.title, category: p.category, impact: p.expected_impact }));
    const topB2C = proposals.find(p => !p.target_segment.includes('B2B')) ?? null;
    const topB2B = proposals.find(p => p.target_segment.includes('B2B')) ?? null;
    const topAI = proposals.find(p => p.category.includes('AI')) ?? null;

    const executiveSummary = `Month ${proposalMonth}: ${proposals.length} improvement proposals generated. Current version: ${currentVersion}. ` +
      `Win rate: ${winRate.toFixed(1)}%. ${stuckLeads.length} stuck leads. ${openAlerts.length} open KPI alerts. ` +
      `Top priority: ${topOpportunities[0]?.title ?? 'System stabilization'}.`;

    // ── Write monthly proposal ──
    const { data: monthlyProposal, error: mpError } = await supabase.from('monthly_version_proposals').upsert({
      proposal_month: proposalMonth,
      current_version: currentVersion,
      proposed_version: nextMinor,
      executive_summary: executiveSummary,
      top_opportunities_json: {
        top_3: topOpportunities,
        top_b2c: topB2C ? { title: topB2C.title, segment: topB2C.target_segment } : null,
        top_b2b: topB2B ? { title: topB2B.title, segment: topB2B.target_segment } : null,
        top_ai: topAI ? { title: topAI.title, segment: topAI.target_segment } : null,
      },
      approval_status: 'pending_admin_review',
    }, { onConflict: 'proposal_month' }).select().single();

    if (mpError) throw mpError;

    // ── Write proposal items ──
    for (const p of proposals) {
      await supabase.from('upgrade_proposals').insert({
        monthly_proposal_id: monthlyProposal.id,
        title: p.title,
        category: p.category,
        problem: p.problem,
        proposed_solution: '',
        target_segment: p.target_segment,
        affected_kpi: p.linked_kpi_key,
        expected_impact: p.expected_impact,
        complexity: p.complexity,
        risk: p.risk,
        status: 'proposed',
        why_it_matters: p.why_it_matters,
        linked_kpi_key: p.linked_kpi_key,
        recommended_version: p.recommended_version,
      });
    }

    // ── Create approval request ──
    await supabase.from('approval_requests').insert({
      request_type: 'version_proposal',
      reference_table: 'monthly_version_proposals',
      reference_id: monthlyProposal.id,
      status: 'pending',
    });

    // ── Notify admins ──
    const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    for (const admin of (admins ?? [])) {
      await supabase.from('notifications').insert({
        recipient_id: admin.user_id,
        type: 'approval_needed',
        title: `Monthly Proposal — ${proposalMonth}`,
        message: `${proposals.length} proposals. Proposed version: ${nextMinor}. Review required.`,
        link_path: '/members/admin/governance',
      });
    }

    return new Response(JSON.stringify({
      success: true,
      proposal_id: monthlyProposal.id,
      proposals_count: proposals.length,
      proposed_version: nextMinor,
      executive_summary: executiveSummary,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error("[generate-monthly-proposal] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
