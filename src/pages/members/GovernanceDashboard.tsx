import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Link } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText, Shield, Tag, Bell, CheckCircle2, XCircle,
  Clock, AlertTriangle, TrendingUp, BarChart3, ChevronDown,
  FlaskConical, Rocket, Lightbulb, Plus, Play, Pause, Archive,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ──
interface WeeklyReport {
  id: string; report_type: string; overall_score: number;
  stability_score: number; logic_score: number; ux_score: number;
  funnel_score: number; data_score: number;
  findings: any[]; recommendations: any; auto_fixes: any[]; open_risks: any[];
  created_at: string;
}
interface MonthlyProposal {
  id: string; proposal_month: string; current_version: string;
  proposed_version: string; executive_summary: string;
  top_opportunities_json: any; approval_status: string;
  created_at: string;
}
interface ProposalItem {
  id: string; title: string; category: string; problem: string;
  target_segment: string; expected_impact: string; complexity: string;
  affected_kpi: string; risk: string; status: string;
  why_it_matters: string; recommended_version: string;
  monthly_proposal_id: string;
}
interface ApprovalRequest {
  id: string; request_type: string; reference_table: string;
  reference_id: string; status: string; decision_notes: string | null;
  decided_by: string | null; decided_at: string | null; created_at: string;
}
interface Version {
  id: string; version_label: string; summary: string; status: string;
  proposed_at: string; deployed_at: string | null; changes: any;
  related_experiment_ids: any; target_kpis_json: any;
  regression_checklist_json: any; post_release_review_json: any;
}
interface Notification {
  id: string; type: string; title: string; message: string;
  link_path: string | null; is_read: boolean; created_at: string;
}
interface Experiment {
  id: string; name: string; status: string; target_segment: string;
  hypothesis: string; primary_kpi: string; secondary_kpi: string | null;
  variant_a: string; variant_b: string; surface_type: string;
  traffic_allocation: any; created_at: string; ended_at: string | null;
  winner: string | null; success_criterion: string | null;
}
interface ExperimentVariant {
  id: string; experiment_id: string; variant_key: string;
  label: string; is_control: boolean;
}
interface ExperimentResult {
  id: string; experiment_id: string; variant_id: string;
  snapshot_date: string; primary_value: number; secondary_value: number | null;
  sample_size: number; notes: string | null;
}
interface Recommendation {
  id: string; trigger_kpi_key: string; severity: string;
  recommendation_type: string; recommendation_text: string;
  status: string; aggregate_date: string; created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending: 'bg-warning/20 text-warning',
  pending_admin_review: 'bg-warning/20 text-warning',
  pending_approval: 'bg-warning/20 text-warning',
  approved: 'bg-success/20 text-success',
  approved_with_modifications: 'bg-success/20 text-success',
  rejected: 'bg-destructive/20 text-destructive',
  deferred: 'bg-muted text-muted-foreground',
  proposed: 'bg-primary/20 text-primary',
  deployed: 'bg-success/20 text-success',
  running: 'bg-primary/20 text-primary',
  paused: 'bg-warning/20 text-warning',
  completed: 'bg-success/20 text-success',
  archived: 'bg-muted text-muted-foreground',
  idea: 'bg-muted text-muted-foreground',
  scoped: 'bg-primary/20 text-primary',
  staged: 'bg-warning/20 text-warning',
  tested: 'bg-primary/20 text-primary',
  ready_for_live: 'bg-success/20 text-success',
  live: 'bg-success/20 text-success',
  monitored: 'bg-primary/20 text-primary',
  rolled_back: 'bg-destructive/20 text-destructive',
  open: 'bg-warning/20 text-warning',
  acknowledged: 'bg-primary/20 text-primary',
  actioned: 'bg-success/20 text-success',
  dismissed: 'bg-muted text-muted-foreground',
};

const SEGMENTS = [
  'Career Seekers / 9-5 Escape',
  'Freedom-Oriented Women / Mothers',
  'Spiritual / Radiant Audience',
  'Performance / High Achievers',
  'B2B / Director / Team Builder',
];

const RELEASE_STATES = ['idea', 'scoped', 'approved', 'staged', 'tested', 'ready_for_live', 'live', 'monitored', 'rolled_back'];

export default function GovernanceDashboard() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [proposals, setProposals] = useState<MonthlyProposal[]>([]);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [variants, setVariants] = useState<ExperimentVariant[]>([]);
  const [results, setResults] = useState<ExperimentResult[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [showNewExperiment, setShowNewExperiment] = useState(false);
  const [newExp, setNewExp] = useState({ name: '', hypothesis: '', target_segment: SEGMENTS[0], primary_kpi: '', variant_a: 'Control', variant_b: '', surface_type: 'landing_page' });

  const load = async () => {
    if (!user) return;
    const [r, p, i, a, v, n, exp, vars, res, recs] = await Promise.all([
      supabase.from('system_audit_reports').select('*').order('created_at', { ascending: false }).limit(12),
      supabase.from('monthly_version_proposals').select('*').order('created_at', { ascending: false }).limit(12),
      supabase.from('upgrade_proposals').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('approval_requests').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('release_versions').select('*').order('proposed_at', { ascending: false }),
      supabase.from('notifications').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('experiments').select('*').order('created_at', { ascending: false }),
      supabase.from('experiment_variants').select('*'),
      supabase.from('experiment_results').select('*').order('snapshot_date', { ascending: false }),
      supabase.from('director_recommendations').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    setReports((r.data ?? []) as WeeklyReport[]);
    setProposals((p.data ?? []) as MonthlyProposal[]);
    setItems((i.data ?? []) as ProposalItem[]);
    setApprovals((a.data ?? []) as ApprovalRequest[]);
    setVersions((v.data ?? []) as Version[]);
    setNotifications((n.data ?? []) as Notification[]);
    setExperiments((exp.data ?? []) as Experiment[]);
    setVariants((vars.data ?? []) as ExperimentVariant[]);
    setResults((res.data ?? []) as ExperimentResult[]);
    setRecommendations((recs.data ?? []) as Recommendation[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const triggerFunction = async (fn: string) => {
    setGenerating(fn);
    try {
      const res = await supabase.functions.invoke(fn);
      if (res.error) throw res.error;
      toast.success(t(`${fn} erfolgreich`, `${fn} completed`));
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Error');
    } finally { setGenerating(null); }
  };

  const handleApprovalDecision = async (requestId: string, status: string) => {
    const notes = decisionNotes[requestId] || '';
    await supabase.from('approval_requests').update({
      status, decision_notes: notes, decided_by: user?.id, decided_at: new Date().toISOString(),
    }).eq('id', requestId);
    const req = approvals.find(a => a.id === requestId);
    if (req?.reference_table === 'monthly_version_proposals' && req.reference_id) {
      await supabase.from('monthly_version_proposals').update({
        approval_status: status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : status,
        ...(status === 'approved' ? { approved_at: new Date().toISOString(), approved_by: user?.id } : {}),
      }).eq('id', req.reference_id);
    }
    if (req?.reference_table === 'experiments' && req.reference_id) {
      await supabase.from('experiments').update({
        status: status === 'approved' ? 'approved' : status === 'rejected' ? 'archived' : 'draft',
      }).eq('id', req.reference_id);
    }
    toast.success(t('Entscheidung gespeichert', 'Decision saved'));
    await load();
  };

  const handleItemDecision = async (itemId: string, status: string) => {
    await supabase.from('upgrade_proposals').update({ status, approved_by: user?.id, approved_at: new Date().toISOString() }).eq('id', itemId);
    toast.success(t('Status aktualisiert', 'Status updated'));
    await load();
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  // ── Experiment actions ──
  const createExperiment = async () => {
    if (!newExp.name || !newExp.hypothesis) return;
    const { data: exp, error } = await supabase.from('experiments').insert({
      name: newExp.name, hypothesis: newExp.hypothesis, target_segment: newExp.target_segment,
      primary_kpi: newExp.primary_kpi, variant_a: newExp.variant_a, variant_b: newExp.variant_b,
      surface_type: newExp.surface_type, status: 'draft', created_by: user?.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    // Create variants
    await supabase.from('experiment_variants').insert([
      { experiment_id: exp.id, variant_key: 'control', label: newExp.variant_a, is_control: true },
      { experiment_id: exp.id, variant_key: 'variant_a', label: newExp.variant_b, is_control: false },
    ]);
    setShowNewExperiment(false);
    setNewExp({ name: '', hypothesis: '', target_segment: SEGMENTS[0], primary_kpi: '', variant_a: 'Control', variant_b: '', surface_type: 'landing_page' });
    toast.success(t('Experiment erstellt', 'Experiment created'));
    await load();
  };

  const updateExperimentStatus = async (expId: string, newStatus: string) => {
    if (newStatus === 'pending_approval') {
      await supabase.from('approval_requests').insert({
        request_type: 'experiment_launch', reference_table: 'experiments',
        reference_id: expId, requested_by: user?.id, status: 'pending',
      });
      await supabase.from('experiments').update({ status: 'pending_approval' }).eq('id', expId);
    } else {
      await supabase.from('experiments').update({
        status: newStatus,
        ...(newStatus === 'completed' ? { ended_at: new Date().toISOString() } : {}),
      }).eq('id', expId);
    }
    toast.success(t('Status aktualisiert', 'Status updated'));
    await load();
  };

  const updateReleaseStatus = async (relId: string, newStatus: string) => {
    if (newStatus === 'live') {
      // Require explicit confirmation
      if (!confirm(t('Diese Version wirklich live deployen?', 'Deploy this version live?'))) return;
    }
    await supabase.from('release_versions').update({
      status: newStatus,
      ...(newStatus === 'live' ? { deployed_at: new Date().toISOString() } : {}),
    }).eq('id', relId);
    // Audit log
    await supabase.from('audit_logs').insert({
      action: `release_${newStatus}`, actor_id: user?.id, source_type: 'governance',
      note: `Release moved to ${newStatus}`,
    });
    toast.success(t('Release-Status aktualisiert', 'Release status updated'));
    await load();
  };

  const updateRecommendationStatus = async (recId: string, status: string) => {
    await supabase.from('director_recommendations').update({ status }).eq('id', recId);
    toast.success(t('Status aktualisiert', 'Status updated'));
    await load();
  };

  if (loading) return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
    </div>
  );

  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const unreadNotifications = notifications.filter(n => !n.is_read);
  const openRecs = recommendations.filter(r => r.status === 'open');

  const scoreBar = (label: string, value: number) => (
    <div className="flex items-center gap-3">
      <span className="text-[10px] w-20 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{
          width: `${value * 10}%`,
          backgroundColor: value >= 7 ? 'hsl(var(--success))' : value >= 5 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))',
        }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right">{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12 lg:px-10">
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {t('Governance Center', 'Governance Center')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('Reports, Experimente, Releases & Freigaben', 'Reports, experiments, releases & approvals')}
        </p>
      </div>

      {/* Security & Governance Quick Links */}
      <div className="mb-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
        <Link to="/members/admin/security" className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors text-xs font-medium text-foreground">
          <Shield className="h-3.5 w-3.5 text-primary" /> Security Console
        </Link>
        <Link to="/members/admin/audit-log" className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors text-xs font-medium text-foreground">
          <FileText className="h-3.5 w-3.5 text-primary" /> Audit Log
        </Link>
        <Link to="/members/admin/exports" className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors text-xs font-medium text-foreground">
          <Tag className="h-3.5 w-3.5 text-primary" /> Export Center
        </Link>
        <Link to="/members/admin/cleanup-report" className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors text-xs font-medium text-foreground">
          <FileText className="h-3.5 w-3.5 text-primary" /> Cleanup Report
        </Link>
        <Link to="/members/admin/escalation" className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors text-xs font-medium text-foreground">
          <Bell className="h-3.5 w-3.5 text-primary" /> Role Escalation
        </Link>
        <Link to="/members/admin/sessions" className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors text-xs font-medium text-foreground">
          <TrendingUp className="h-3.5 w-3.5 text-primary" /> Sessions
        </Link>
        <Link to="/members/admin/prompt-vault" className="flex items-center gap-1.5 p-2.5 rounded-lg border border-border/50 bg-card/50 hover:bg-muted/50 transition-colors text-xs font-medium text-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Prompt Vault
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 flex flex-wrap gap-3">
        <Button size="sm" variant="outline" disabled={!!generating} onClick={() => triggerFunction('generate-weekly-report')}>
          <FileText className="h-3.5 w-3.5 mr-1.5" />
          {generating === 'generate-weekly-report' ? '...' : t('Weekly Report', 'Weekly Report')}
        </Button>
        <Button size="sm" variant="outline" disabled={!!generating} onClick={() => triggerFunction('generate-monthly-proposal')}>
          <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
          {generating === 'generate-monthly-proposal' ? '...' : t('Monthly Proposal', 'Monthly Proposal')}
        </Button>
        <Button size="sm" variant="outline" disabled={!!generating} onClick={() => triggerFunction('calculate-kpi-snapshots')}>
          <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
          {generating === 'calculate-kpi-snapshots' ? '...' : 'KPI Snapshot'}
        </Button>
        <Button size="sm" variant="outline" disabled={!!generating} onClick={() => triggerFunction('generate-recommendations')}>
          <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
          {generating === 'generate-recommendations' ? '...' : t('Empfehlungen', 'Recommendations')}
        </Button>
        {pendingApprovals.length > 0 && <Badge variant="destructive" className="self-center">{pendingApprovals.length} {t('offen', 'pending')}</Badge>}
        {openRecs.length > 0 && <Badge className="self-center bg-warning/20 text-warning">{openRecs.length} {t('Empfehlungen', 'recs')}</Badge>}
      </div>

      <Tabs defaultValue="approvals" className="space-y-6">
        <TabsList className="bg-muted/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="approvals" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" /> {t('Freigaben', 'Approvals')}
            {pendingApprovals.length > 0 && <Badge variant="destructive" className="h-4 px-1 text-[9px]">{pendingApprovals.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="experiments"><FlaskConical className="h-3.5 w-3.5 mr-1" /> Experiments</TabsTrigger>
          <TabsTrigger value="releases"><Rocket className="h-3.5 w-3.5 mr-1" /> Releases</TabsTrigger>
          <TabsTrigger value="recommendations"><Lightbulb className="h-3.5 w-3.5 mr-1" /> {t('Empfehlungen', 'Recs')}</TabsTrigger>
          <TabsTrigger value="reports"><FileText className="h-3.5 w-3.5 mr-1" /> Reports</TabsTrigger>
          <TabsTrigger value="proposals"><TrendingUp className="h-3.5 w-3.5 mr-1" /> Proposals</TabsTrigger>
          <TabsTrigger value="versions"><Tag className="h-3.5 w-3.5 mr-1" /> Versions</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            {unreadNotifications.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[9px]">{unreadNotifications.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Approvals Tab ── */}
        <TabsContent value="approvals">
          <div className="space-y-4">
            {pendingApprovals.length === 0 && (
              <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-3 opacity-40" />
                <p className="text-sm text-muted-foreground">{t('Keine offenen Freigaben.', 'No pending approvals.')}</p>
              </div>
            )}
            {pendingApprovals.map(req => {
              const proposal = proposals.find(p => p.id === req.reference_id);
              const exp = experiments.find(e => e.id === req.reference_id);
              return (
                <div key={req.id} className="rounded-xl border border-warning/20 bg-card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Badge className={STATUS_COLORS[req.status]}>{req.status}</Badge>
                      <p className="mt-2 text-sm font-medium text-foreground">{req.request_type.replace(/_/g, ' ')}</p>
                      {proposal && <p className="text-xs text-muted-foreground mt-1">{proposal.executive_summary.slice(0, 120)}…</p>}
                      {exp && <p className="text-xs text-muted-foreground mt-1">{exp.name}: {exp.hypothesis.slice(0, 100)}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground">{new Date(req.created_at).toLocaleDateString('de-DE')}</span>
                  </div>
                  {proposal && (
                    <div className="mb-4 space-y-2">
                      <p className="text-xs text-muted-foreground">{proposal.current_version} → <span className="font-semibold text-foreground">{proposal.proposed_version}</span></p>
                      {items.filter(i => i.monthly_proposal_id === proposal.id).map(item => (
                        <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-background px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                            <p className="text-[10px] text-muted-foreground">{item.category} · {item.target_segment}</p>
                          </div>
                          <div className="flex items-center gap-1.5 ml-2">
                            <Badge variant="outline" className="text-[9px] h-5">{item.expected_impact}</Badge>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-success" onClick={() => handleItemDecision(item.id, 'approved')}>✓</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive" onClick={() => handleItemDecision(item.id, 'rejected')}>✗</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Textarea placeholder={t('Entscheidungsnotiz...', 'Decision notes...')} className="mb-3 text-xs h-16"
                    value={decisionNotes[req.id] || ''} onChange={e => setDecisionNotes(prev => ({ ...prev, [req.id]: e.target.value }))} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="default" onClick={() => handleApprovalDecision(req.id, 'approved')}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t('Genehmigen', 'Approve')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleApprovalDecision(req.id, 'approved_with_modifications')}>{t('Mit Änderungen', 'Modify')}</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleApprovalDecision(req.id, 'rejected')}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> {t('Ablehnen', 'Reject')}
                    </Button>
                  </div>
                </div>
              );
            })}
            {approvals.filter(a => a.status !== 'pending').length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('Vergangene Entscheidungen', 'Past Decisions')}</p>
                <div className="space-y-2">
                  {approvals.filter(a => a.status !== 'pending').slice(0, 10).map(a => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-background px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge className={`${STATUS_COLORS[a.status]} text-[9px] h-5`}>{a.status}</Badge>
                        <span className="text-xs text-muted-foreground">{a.request_type.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{a.decided_at ? new Date(a.decided_at).toLocaleDateString('de-DE') : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Experiments Tab ── */}
        <TabsContent value="experiments">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('Experiment Center', 'Experiment Center')}</p>
              <Button size="sm" variant="outline" onClick={() => setShowNewExperiment(!showNewExperiment)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> {t('Neues Experiment', 'New Experiment')}
              </Button>
            </div>

            {showNewExperiment && (
              <div className="rounded-xl border border-primary/20 bg-card p-5 space-y-3">
                <p className="text-sm font-semibold text-foreground">{t('Experiment anlegen', 'Create Experiment')}</p>
                <Input placeholder="Name" value={newExp.name} onChange={e => setNewExp(p => ({ ...p, name: e.target.value }))} className="text-xs" />
                <Textarea placeholder={t('Hypothese...', 'Hypothesis...')} value={newExp.hypothesis} onChange={e => setNewExp(p => ({ ...p, hypothesis: e.target.value }))} className="text-xs h-16" />
                <div className="grid grid-cols-2 gap-3">
                  <Select value={newExp.target_segment} onValueChange={v => setNewExp(p => ({ ...p, target_segment: v }))}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{SEGMENTS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="Primary KPI" value={newExp.primary_kpi} onChange={e => setNewExp(p => ({ ...p, primary_kpi: e.target.value }))} className="text-xs" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Control (Variant A)" value={newExp.variant_a} onChange={e => setNewExp(p => ({ ...p, variant_a: e.target.value }))} className="text-xs" />
                  <Input placeholder="Variant B" value={newExp.variant_b} onChange={e => setNewExp(p => ({ ...p, variant_b: e.target.value }))} className="text-xs" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={createExperiment}>{t('Erstellen', 'Create')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewExperiment(false)}>{t('Abbrechen', 'Cancel')}</Button>
                </div>
              </div>
            )}

            {experiments.length === 0 && !showNewExperiment && (
              <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
                <FlaskConical className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('Keine Experimente. Erstelle dein erstes.', 'No experiments. Create your first.')}</p>
              </div>
            )}

            {experiments.map(exp => {
              const expVariants = variants.filter(v => v.experiment_id === exp.id);
              const expResults = results.filter(r => r.experiment_id === exp.id);
              return (
                <div key={exp.id} className="rounded-xl border border-border/60 bg-card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={STATUS_COLORS[exp.status] || 'bg-muted'}>{exp.status}</Badge>
                        <span className="text-sm font-medium text-foreground">{exp.name}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{exp.target_segment} · KPI: {exp.primary_kpi}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {exp.status === 'draft' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateExperimentStatus(exp.id, 'pending_approval')}>
                          {t('Freigabe anfordern', 'Request Approval')}
                        </Button>
                      )}
                      {exp.status === 'approved' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateExperimentStatus(exp.id, 'running')}>
                          <Play className="h-3 w-3 mr-1" /> Start
                        </Button>
                      )}
                      {exp.status === 'running' && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateExperimentStatus(exp.id, 'paused')}>
                            <Pause className="h-3 w-3 mr-1" /> Pause
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateExperimentStatus(exp.id, 'completed')}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                          </Button>
                        </>
                      )}
                      {exp.status === 'paused' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateExperimentStatus(exp.id, 'running')}>
                          <Play className="h-3 w-3 mr-1" /> Resume
                        </Button>
                      )}
                      {exp.status === 'completed' && (
                        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => updateExperimentStatus(exp.id, 'archived')}>
                          <Archive className="h-3 w-3 mr-1" /> Archive
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{exp.hypothesis}</p>
                  {/* Variants */}
                  {expVariants.length > 0 && (
                    <div className="flex gap-2 mb-3">
                      {expVariants.map(v => (
                        <Badge key={v.id} variant={v.is_control ? 'secondary' : 'outline'} className="text-[10px]">
                          {v.is_control ? '🎯 ' : '🧪 '}{v.label || v.variant_key}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {/* Results */}
                  {expResults.length > 0 && (
                    <div className="rounded-lg border border-border/20 bg-background p-3">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground mb-2">Results</p>
                      {expResults.map(r => {
                        const variant = variants.find(v => v.id === r.variant_id);
                        return (
                          <div key={r.id} className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">{variant?.label || 'Variant'}</span>
                            <span className="font-medium text-foreground">{r.primary_value} (n={r.sample_size})</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {exp.winner && (
                    <div className="mt-2 rounded-lg bg-success/10 px-3 py-2">
                      <p className="text-xs font-medium text-success">Winner: {exp.winner}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Releases Tab ── */}
        <TabsContent value="releases">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('Release Center', 'Release Center')}</p>
            {versions.map(v => {
              const currentIdx = RELEASE_STATES.indexOf(v.status);
              const nextState = currentIdx >= 0 && currentIdx < RELEASE_STATES.length - 2 ? RELEASE_STATES[currentIdx + 1] : null;
              return (
                <div key={v.id} className="rounded-xl border border-border/60 bg-card p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{v.version_label}</span>
                      <Badge className={STATUS_COLORS[v.status] || 'bg-muted'}>{v.status}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {nextState && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateReleaseStatus(v.id, nextState)}>
                          → {nextState.replace(/_/g, ' ')}
                        </Button>
                      )}
                      {v.status === 'live' && (
                        <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => updateReleaseStatus(v.id, 'rolled_back')}>
                          Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{v.summary}</p>

                  {/* Release pipeline visualization */}
                  <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
                    {RELEASE_STATES.filter(s => s !== 'rolled_back').map((state, i) => (
                      <div key={state} className="flex items-center">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${
                          RELEASE_STATES.indexOf(v.status) >= i ? 'bg-primary' : 'bg-muted'
                        }`} />
                        <span className={`text-[8px] ml-0.5 mr-2 whitespace-nowrap ${
                          v.status === state ? 'text-foreground font-semibold' : 'text-muted-foreground'
                        }`}>{state.replace(/_/g, ' ')}</span>
                      </div>
                    ))}
                  </div>

                  {Array.isArray(v.changes) && v.changes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {v.changes.map((c: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-[9px]">{c}</Badge>
                      ))}
                    </div>
                  )}

                  {v.post_release_review_json && (
                    <div className="mt-3 rounded-lg border border-success/20 bg-success/5 p-3">
                      <p className="text-[10px] font-semibold text-success mb-1">Post-Release Review</p>
                      <p className="text-xs text-muted-foreground">{JSON.stringify(v.post_release_review_json)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Recommendations Tab ── */}
        <TabsContent value="recommendations">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('KPI-basierte Empfehlungen', 'KPI-based Recommendations')}</p>
            {recommendations.length === 0 && (
              <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
                <Lightbulb className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('Keine Empfehlungen. Generiere Empfehlungen über den Button oben.', 'No recommendations. Generate via button above.')}</p>
              </div>
            )}
            {recommendations.map(rec => (
              <div key={rec.id} className={`rounded-xl border bg-card p-5 ${
                rec.severity === 'critical' ? 'border-destructive/30' : 'border-warning/30'
              }`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-4 w-4 ${rec.severity === 'critical' ? 'text-destructive' : 'text-warning'}`} />
                    <Badge className={STATUS_COLORS[rec.severity] || 'bg-muted'}>{rec.severity}</Badge>
                    <span className="text-xs font-medium text-foreground">{rec.trigger_kpi_key.replace(/_/g, ' ')}</span>
                  </div>
                  <Badge className={STATUS_COLORS[rec.status] || 'bg-muted'} variant="outline">{rec.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">{rec.recommendation_text}</p>
                {rec.status === 'open' && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateRecommendationStatus(rec.id, 'acknowledged')}>
                      {t('Kenntnisnahme', 'Acknowledge')}
                    </Button>
                    <Button size="sm" variant="default" className="h-7 text-[10px]" onClick={() => updateRecommendationStatus(rec.id, 'actioned')}>
                      {t('Umsetzen', 'Action')}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => updateRecommendationStatus(rec.id, 'dismissed')}>
                      {t('Verwerfen', 'Dismiss')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Reports Tab ── */}
        <TabsContent value="reports">
          <div className="space-y-4">
            {reports.length === 0 && (
              <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('Noch keine Reports.', 'No reports yet.')}</p>
              </div>
            )}
            {reports.map(r => (
              <div key={r.id} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                <button className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedReport(expandedReport === r.id ? null : r.id)}>
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                      r.overall_score >= 7 ? 'bg-success/10 text-success' : r.overall_score >= 5 ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'
                    }`}>{r.overall_score}</div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{r.report_type === 'weekly' ? 'Weekly' : 'Monthly'} Report</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedReport === r.id ? 'rotate-180' : ''}`} />
                </button>
                {expandedReport === r.id && (
                  <div className="px-5 pb-5 border-t border-border/30 pt-4 space-y-4">
                    <div className="space-y-2">
                      {scoreBar('Stability', r.stability_score)}
                      {scoreBar('Logic', r.logic_score)}
                      {scoreBar('UX', r.ux_score)}
                      {scoreBar('Funnel', r.funnel_score)}
                      {scoreBar('Data', r.data_score)}
                    </div>
                    {Array.isArray(r.findings) && r.findings.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Findings</p>
                        {r.findings.map((f: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-foreground mb-1">
                            <AlertTriangle className={`h-3 w-3 mt-0.5 shrink-0 ${f.severity === 'critical' ? 'text-destructive' : 'text-warning'}`} />
                            <span>{f.detail || f}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {Array.isArray(r.open_risks) && r.open_risks.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive mb-2">Open Risks</p>
                        {r.open_risks.map((risk: any, i: number) => (
                          <p key={i} className="text-xs text-foreground mb-1">• {typeof risk === 'string' ? risk : risk.detail}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Proposals Tab ── */}
        <TabsContent value="proposals">
          <div className="space-y-4">
            {proposals.length === 0 && (
              <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
                <TrendingUp className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('Noch keine Vorschläge.', 'No proposals yet.')}</p>
              </div>
            )}
            {proposals.map(p => (
              <div key={p.id} className="rounded-xl border border-border/60 bg-card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={STATUS_COLORS[p.approval_status] || 'bg-muted'}>{p.approval_status}</Badge>
                      <span className="text-xs font-medium text-foreground">{p.current_version} → {p.proposed_version}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{p.proposal_month}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{p.executive_summary}</p>
                <div className="space-y-1.5">
                  {items.filter(i => i.monthly_proposal_id === p.id).map(item => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border border-border/20 bg-background px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground">{item.category} · KPI: {item.affected_kpi} · {item.target_segment}</p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-2">
                        <Badge variant="outline" className="text-[9px] h-5">{item.expected_impact}</Badge>
                        <Badge className={`${STATUS_COLORS[item.status] || 'bg-muted'} text-[9px] h-5`}>{item.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Versions Tab ── */}
        <TabsContent value="versions">
          <div className="space-y-3">
            {versions.map(v => (
              <div key={v.id} className="rounded-xl border border-border/60 bg-card p-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{v.version_label}</span>
                    <Badge className={STATUS_COLORS[v.status] || 'bg-muted'}>{v.status}</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Date(v.proposed_at).toLocaleDateString('de-DE')}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{v.summary}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Notifications Tab ── */}
        <TabsContent value="notifications">
          <div className="space-y-2">
            {notifications.length === 0 && (
              <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('Keine Benachrichtigungen.', 'No notifications.')}</p>
              </div>
            )}
            {notifications.map(n => (
              <div key={n.id} className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors cursor-pointer ${
                n.is_read ? 'border-border/20 bg-background' : 'border-primary/20 bg-primary/5'
              }`} onClick={() => !n.is_read && markRead(n.id)}>
                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-primary'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{n.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{n.message}</p>
                </div>
                <span className="text-[10px] text-muted-foreground/50 shrink-0">{new Date(n.created_at).toLocaleDateString('de-DE')}</span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
