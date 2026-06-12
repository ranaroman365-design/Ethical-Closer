import { useEffect, useState, useMemo } from 'react';
import { WhatsAppButton } from '@/components/leads/WhatsAppButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import WorkspaceAnalytics from '@/components/members/WorkspaceAnalytics';
import { Link } from 'react-router-dom';
import {
  Lock, Flame, AlertTriangle, CheckCircle2, XCircle, ArrowRight,
  Phone, Globe, TrendingUp, DollarSign, Target, BarChart3, Clock,
  Shield, Brain, Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CloserAICopilot from '@/components/members/CloserAICopilot';
import { markCallAttendedByLead } from '@/lib/attendance';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type LeadRecord = Record<string, any>;

const CLOSER_STAGES = ['assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up', 'closed_won', 'closed_lost'];

function timeSince(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Gerade eben';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatK(n: number, suffix = '') {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k${suffix}` : `${n}${suffix}`;
}

const STAGE_LABELS: Record<string, string> = {
  assigned_closer: 'Neuer qualifizierter Lead',
  closer_in_progress: 'In Bearbeitung',
  offer_made: 'Angebot gemacht',
  follow_up: 'Follow-Up',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

const TRANSITIONS: Record<string, string[]> = {
  assigned_closer: ['closer_in_progress'],
  closer_in_progress: ['offer_made', 'follow_up', 'closed_lost'],
  offer_made: ['closed_won', 'closed_lost', 'follow_up'],
  follow_up: ['closer_in_progress', 'closed_lost'],
};

const CLOSE_REASONS = [
  'Kein Budget',
  'Kein Interesse',
  'Timing passt nicht',
  'Konkurrenz gewählt',
  'Nicht qualifiziert',
  'Keine Rückmeldung',
  'Sonstiges',
];

const READINESS_LABELS: Record<string, { label: string; color: string }> = {
  ready: { label: 'Bereit', color: 'text-primary' },
  unsure: { label: 'Unsicher', color: 'text-yellow-600' },
  not_ready: { label: 'Nicht bereit', color: 'text-destructive' },
  can_decide: { label: 'Kann entscheiden', color: 'text-primary' },
  needs_time: { label: 'Braucht Zeit', color: 'text-yellow-600' },
  not_decision_maker: { label: 'Kein Entscheider', color: 'text-destructive' },
  clear: { label: 'Klar', color: 'text-primary' },
  somewhat_clear: { label: 'Teilweise klar', color: 'text-yellow-600' },
  unclear: { label: 'Unklar', color: 'text-destructive' },
};

const BUCKET_STYLES: Record<string, { label: string; cls: string }> = {
  high: { label: 'HIGH', cls: 'bg-primary/10 text-primary border-primary/20' },
  mid: { label: 'MID', cls: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20' },
  low: { label: 'LOW', cls: 'bg-destructive/10 text-destructive border-destructive/20' },
};

export default function CloserWorkspace() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const isCertified = profile?.certified ?? false;
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LeadRecord | null>(null);
  const [notes, setNotes] = useState('');

  // Close-Won modal state
  const [closeWonModal, setCloseWonModal] = useState<{ open: boolean; lead: LeadRecord | null }>({ open: false, lead: null });
  const [wonDealValue, setWonDealValue] = useState('');
  const [wonNotes, setWonNotes] = useState('');

  // Close-lost modal state
  const [closeLostModal, setCloseLostModal] = useState<{ open: boolean; lead: LeadRecord | null }>({ open: false, lead: null });
  const [closeReason, setCloseReason] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  // Follow-up modal state
  const [followUpModal, setFollowUpModal] = useState<{ open: boolean; lead: LeadRecord | null }>({ open: false, lead: null });
  const [followUpDays, setFollowUpDays] = useState('2');
  const [followUpNote, setFollowUpNote] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('leads').select('*').eq('closer_id', user.id)
      .in('stage', CLOSER_STAGES)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setLeads((data as LeadRecord[]) ?? []); setLoading(false); });
  }, [user]);

  /* ── Revenue KPIs ── */
  const kpis = useMemo(() => {
    const won = leads.filter(l => l.stage === 'closed_won');
    const lost = leads.filter(l => l.stage === 'closed_lost');
    const closed = won.length + lost.length;
    const revenue = won.reduce((s, l) => s + (Number(l.deal_value) || 0), 0);
    const avgDeal = won.length > 0 ? Math.round(revenue / won.length) : 0;
    const closeRate = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

    // Follow-up conversion
    const followUpLeads = leads.filter(l => l.stage === 'closed_won' && l.outcome === 'closed_won');
    const activeLeads = leads.filter(l => ['assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up'].includes(l.stage)).length;
    const overdueFollowUps = leads.filter(l => {
      if (l.stage !== 'follow_up') return false;
      const d = l.follow_up_date || l.next_action_at || l.updated_at;
      return d && Date.now() - new Date(d).getTime() > 48 * 3600000;
    }).length;

    return {
      won: won.length,
      lost: lost.length,
      activeLeads,
      revenue,
      avgDeal,
      closeRate,
      overdueFollowUps,
      offered: leads.filter(l => l.stage === 'offer_made').length,
      hotLeads: leads.filter(l => l.stage === 'assigned_closer').length,
    };
  }, [leads]);

  const transition = async (lead: LeadRecord, newStage: string) => {
    if (newStage === 'closed_won') {
      setCloseWonModal({ open: true, lead });
      setWonDealValue(String(lead.deal_value || ''));
      setWonNotes('');
      return;
    }
    if (newStage === 'closed_lost') {
      setCloseLostModal({ open: true, lead });
      setCloseReason('');
      setCloseNotes('');
      return;
    }
    if (newStage === 'follow_up') {
      setFollowUpModal({ open: true, lead });
      setFollowUpDays('2');
      setFollowUpNote('');
      return;
    }
    await executeTransition(lead, newStage, {});
  };

  const executeTransition = async (lead: LeadRecord, newStage: string, extra: Record<string, any>) => {
    const now = new Date().toISOString();
    const updates: Record<string, any> = { stage: newStage, updated_at: now, ...extra };

    if (newStage === 'closer_in_progress' && lead.stage === 'assigned_closer') {
      await supabase.from('lead_events').insert({
        lead_id: lead.id, event_type: 'closer_call_started',
        notes: 'Closer hat Bearbeitung begonnen', metadata: { closer_id: user!.id },
      });
    }

    const { error } = await supabase.from('leads').update(updates as any).eq('id', lead.id);
    if (!error) {
      await supabase.from('lead_transitions').insert({
        lead_id: lead.id, previous_stage: lead.stage, new_stage: newStage, changed_by: user!.id,
      });

      if (newStage === 'offer_made') {
        await supabase.from('lead_events').insert({
          lead_id: lead.id, event_type: 'offer_made',
          notes: 'Angebot wurde gemacht', metadata: { closer_id: user!.id },
        });
      }

      const updated = { ...lead, ...updates } as LeadRecord;
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l));
      if (selected?.id === lead.id) setSelected(updated);

      if (newStage === 'closed_won') {
        toast({ title: 'Deal gewonnen!', description: `${formatK(updates.deal_value || 0, '€')} — Lead zu L1 aktiviert.` });
      } else if (newStage === 'closed_lost') {
        toast({ title: 'Closed Lost', description: `Grund: ${extra.close_reason || '—'}` });
      } else {
        toast({ title: `→ ${STAGE_LABELS[newStage] || newStage}` });
      }
    }
  };

  /* ── Closed Won ── */
  const confirmCloseWon = async () => {
    if (!closeWonModal.lead) return;
    const val = Number(wonDealValue);
    if (!val || val <= 0) {
      toast({ title: 'Deal Value fehlt', description: 'Bitte gib den Dealwert in € ein.', variant: 'destructive' });
      return;
    }
    const now = new Date().toISOString();

    await executeTransition(closeWonModal.lead, 'closed_won', {
      deal_value: val,
      lead_level: 'L1',
      outcome: 'closed_won',
      closed_at: now,
      closer_notes: wonNotes
        ? `${closeWonModal.lead.closer_notes || ''}\n[Won] ${wonNotes}`.trim()
        : closeWonModal.lead.closer_notes,
    });

    await supabase.from('lead_events').insert({
      lead_id: closeWonModal.lead.id, event_type: 'deal_won',
      notes: `Deal gewonnen: ${formatK(val, '€')}`,
      metadata: { closer_id: user!.id, deal_value: val },
    });

    // Canonical attendance — closing a deal proves the call happened.
    // DB trigger emits `showed` event exactly once. Non-blocking.
    markCallAttendedByLead(closeWonModal.lead.id, now).catch(() => {});

    setCloseWonModal({ open: false, lead: null });
  };

  /* ── Closed Lost ── */
  const confirmCloseLost = async () => {
    if (!closeLostModal.lead || !closeReason) return;
    const now = new Date().toISOString();

    await executeTransition(closeLostModal.lead, 'closed_lost', {
      outcome: 'closed_lost', close_reason: closeReason, closed_at: now,
      closer_notes: closeNotes
        ? `${closeLostModal.lead.closer_notes || ''}\n[Lost] ${closeNotes}`.trim()
        : closeLostModal.lead.closer_notes,
    });

    await supabase.from('lead_events').insert({
      lead_id: closeLostModal.lead.id, event_type: 'deal_lost',
      notes: `Deal verloren: ${closeReason}${closeNotes ? ` — ${closeNotes}` : ''}`,
      metadata: { closer_id: user!.id, close_reason: closeReason },
    });

    // Canonical attendance — losing a deal still proves the call happened.
    markCallAttendedByLead(closeLostModal.lead.id, now).catch(() => {});

    setCloseLostModal({ open: false, lead: null });
  };

  /* ── Follow-Up ── */
  const confirmFollowUp = async () => {
    if (!followUpModal.lead) return;
    const days = parseInt(followUpDays) || 2;
    const followUpDate = new Date(Date.now() + days * 86400000).toISOString();

    await executeTransition(followUpModal.lead, 'follow_up', {
      outcome: 'follow_up', follow_up_date: followUpDate,
      next_action_type: 'follow_up', next_action_at: followUpDate,
      closer_notes: followUpNote
        ? `${followUpModal.lead.closer_notes || ''}\n[Follow-up] ${followUpNote}`.trim()
        : followUpModal.lead.closer_notes,
    });

    await supabase.from('lead_events').insert({
      lead_id: followUpModal.lead.id, event_type: 'follow_up_created',
      notes: `Follow-up in ${days} Tagen geplant${followUpNote ? `: ${followUpNote}` : ''}`,
      metadata: { closer_id: user!.id, follow_up_days: days, follow_up_date: followUpDate },
    });

    setFollowUpModal({ open: false, lead: null });
    toast({ title: 'Follow-up geplant', description: `In ${days} Tagen` });
  };

  const saveNotes = async (lead: LeadRecord) => {
    await supabase.from('leads').update({ closer_notes: notes }).eq('id', lead.id);
    toast({ title: 'Notizen gespeichert' });
  };

  /* ── Guards ── */
  if (!isCertified) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-16 text-center">
          <Lock className="mb-4 h-8 w-8 text-muted-foreground/30" />
          <h1 className="font-serif text-xl font-semibold text-foreground mb-2">Closer Workspace</h1>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Der Closer Workspace wird nach Abschluss der Zertifizierung freigeschaltet.
          </p>
          <Link to="/members/certification">
            <Button variant="outline" size="sm">Zur Zertifizierung</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Closer Workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">Qualifizierte Leads abschließen · Revenue dokumentieren · Performance tracken.</p>
      </div>

      {/* ── Revenue KPI Bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {[
          { icon: Target, label: 'Aktiv', value: kpis.activeLeads, accent: false },
          { icon: Flame, label: 'Neue Leads', value: kpis.hotLeads, accent: kpis.hotLeads > 0 },
          { icon: BarChart3, label: 'Angebote', value: kpis.offered, accent: false },
          { icon: CheckCircle2, label: 'Won', value: kpis.won, accent: true },
          { icon: XCircle, label: 'Lost', value: kpis.lost, accent: false },
          { icon: TrendingUp, label: 'Close Rate', value: `${kpis.closeRate}%`, accent: kpis.closeRate >= 30 },
          { icon: DollarSign, label: 'Revenue', value: formatK(kpis.revenue, '€'), accent: true },
          { icon: DollarSign, label: 'Ø Deal', value: formatK(kpis.avgDeal, '€'), accent: false },
        ].map(s => (
          <div key={s.label} className={cn(
            'rounded-lg border px-3 py-2.5',
            s.accent ? 'border-primary/20 bg-primary/[0.03]' : 'border-border bg-card'
          )}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <s.icon className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            </div>
            <p className="text-lg font-semibold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(kpis.hotLeads > 0 || kpis.overdueFollowUps > 0) && (
        <div className="flex gap-3 mb-6">
          {kpis.hotLeads > 0 && (
            <div className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2.5 flex items-center gap-2 text-sm">
              <Flame className="h-4 w-4 text-accent" />
              <span className="font-medium text-foreground">{kpis.hotLeads} neue Leads</span>
              <span className="text-muted-foreground text-xs">warten auf Bearbeitung</span>
            </div>
          )}
          {kpis.overdueFollowUps > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="font-medium text-foreground">{kpis.overdueFollowUps} Follow-ups überfällig</span>
            </div>
          )}
        </div>
      )}

      {/* ── Lead Table ── */}
      {leads.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">Keine Leads zugewiesen.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Qual.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Deal €</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Aktivität</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {leads.map(lead => {
                const bucket = BUCKET_STYLES[lead.qualification_bucket] || null;
                return (
                  <tr
                    key={lead.id}
                    className={cn(
                      'transition-colors hover:bg-muted/20 cursor-pointer',
                      lead.stage === 'closed_won' && 'bg-primary/[0.02]'
                    )}
                    onClick={() => { setSelected(lead); setNotes(lead.closer_notes || ''); }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{lead.name}</p>
                      {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {bucket && (
                          <Badge variant="outline" className={cn('text-[9px] font-bold', bucket.cls)}>
                            {bucket.label}
                          </Badge>
                        )}
                        {lead.qualification_score != null && (
                          <span className="text-xs text-muted-foreground">{lead.qualification_score}p</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[lead.stage] || lead.stage}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(lead.deal_value ?? 0) > 0 ? formatK(Number(lead.deal_value), '€') : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-[13px]">
                      {timeSince(lead.updated_at || lead.created_at)}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5 flex-wrap">
                        {(TRANSITIONS[lead.stage] || []).map(next => (
                          <Button
                            key={next}
                            variant={next === 'closed_won' ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-[11px]"
                            onClick={() => transition(lead, next)}
                          >
                            {next === 'closed_won' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                            {next === 'closed_lost' && <XCircle className="mr-1 h-3 w-3" />}
                            {STAGE_LABELS[next] || next}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Detail Panel ── */}
      {selected && (
        <div className="rounded-lg border border-border bg-card p-6 mb-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-serif text-lg font-semibold text-foreground">{selected.name}</h3>
                <Badge variant="outline" className={cn(
                  'text-[10px] font-medium',
                  selected.lead_level === 'L1' ? 'bg-primary/10 text-primary border-primary/20' : ''
                )}>
                  {selected.lead_level || 'L0'}
                </Badge>
                {BUCKET_STYLES[selected.qualification_bucket] && (
                  <Badge variant="outline" className={cn('text-[9px] font-bold', BUCKET_STYLES[selected.qualification_bucket].cls)}>
                    {BUCKET_STYLES[selected.qualification_bucket].label}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                {selected.email && <span>{selected.email}</span>}
                {selected.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {selected.phone}
                  </span>
                )}
                <WhatsAppButton phone={selected.phone} leadName={selected.name} leadId={selected.id} withTemplate compact sourceComponent="CloserWorkspace" />
              </div>
            </div>
            {selected.stage === 'closed_won' && (
              <div className="flex items-center gap-2 rounded-md border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" /> Kunde aktiviert · L1
              </div>
            )}
          </div>

          {/* ── Lead Context Grid ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {selected.source_funnel && (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Funnel</p>
                <p className="text-sm text-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> {selected.source_funnel}</p>
              </div>
            )}
            {selected.qualification_score != null && (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Qual. Score</p>
                <p className="text-sm text-foreground font-medium">{selected.qualification_score}/30</p>
              </div>
            )}
            {selected.setter_qualification_score != null && (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Setter Score</p>
                <p className="text-sm text-foreground font-medium">{selected.setter_qualification_score}/9</p>
              </div>
            )}
            {selected.deal_value > 0 && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Deal Value</p>
                <p className="text-sm text-foreground font-semibold">{formatK(Number(selected.deal_value), '€')}</p>
              </div>
            )}
          </div>

          {/* ── Setter Qualification Context (Deal Context Block) ── */}
          {(selected.setter_budget_readiness || selected.setter_decision_readiness || selected.setter_problem_clarity) && (
            <div className="mb-6 rounded-md border border-border bg-muted/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" /> Setter Qualification Context
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {selected.setter_budget_readiness && (
                  <div className="flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Budget</p>
                      <p className={cn('text-sm font-medium', READINESS_LABELS[selected.setter_budget_readiness]?.color || '')}>
                        {READINESS_LABELS[selected.setter_budget_readiness]?.label || selected.setter_budget_readiness}
                      </p>
                    </div>
                  </div>
                )}
                {selected.setter_decision_readiness && (
                  <div className="flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Entscheidung</p>
                      <p className={cn('text-sm font-medium', READINESS_LABELS[selected.setter_decision_readiness]?.color || '')}>
                        {READINESS_LABELS[selected.setter_decision_readiness]?.label || selected.setter_decision_readiness}
                      </p>
                    </div>
                  </div>
                )}
                {selected.setter_problem_clarity && (
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Problem-Klarheit</p>
                      <p className={cn('text-sm font-medium', READINESS_LABELS[selected.setter_problem_clarity]?.color || '')}>
                        {READINESS_LABELS[selected.setter_problem_clarity]?.label || selected.setter_problem_clarity}
                      </p>
                    </div>
                  </div>
                )}
                {selected.setter_recommendation && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Empfehlung</p>
                      <p className="text-sm font-medium text-foreground capitalize">
                        {selected.setter_recommendation === 'send_to_closer' ? '→ Closer' :
                         selected.setter_recommendation === 'follow_up' ? 'Follow-up' : selected.setter_recommendation}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Setter Notes */}
          {selected.setter_notes && (
            <div className="mb-6 rounded-md border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Setter Notizen</p>
              <p className="text-sm text-foreground/80 whitespace-pre-line">{selected.setter_notes}</p>
            </div>
          )}

          {/* Close reason / Follow-up info */}
          {(selected.close_reason || selected.follow_up_date) && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {selected.close_reason && (
                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Verlustgrund</p>
                  <p className="text-sm text-foreground">{selected.close_reason}</p>
                </div>
              )}
              {selected.follow_up_date && (
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Follow-up</p>
                  <p className="text-sm text-foreground">{new Date(selected.follow_up_date).toLocaleDateString('de-DE')}</p>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Closer Notizen</p>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="min-h-[80px] text-sm"
              placeholder="Deal-Notizen…"
            />
            <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => saveNotes(selected)}>
              Speichern
            </Button>
          </div>

          {/* AI Copilot V2 */}
          <CloserAICopilot lead={{
            id: selected.id,
            name: selected.name,
            source_funnel: selected.source_funnel,
            qualification_score: selected.qualification_score,
            qualification_bucket: selected.qualification_bucket,
            stage: selected.stage,
            deal_value: selected.deal_value,
            setter_notes: selected.setter_notes,
            closer_notes: selected.closer_notes,
            setter_budget_readiness: selected.setter_budget_readiness,
            setter_decision_readiness: selected.setter_decision_readiness,
            setter_problem_clarity: selected.setter_problem_clarity,
          }} />

          {/* Actions */}
          <div className="flex gap-2 border-t border-border pt-4">
            {(TRANSITIONS[selected.stage] || []).map(next => (
              <Button
                key={next}
                variant={next === 'closed_won' ? 'default' : 'outline'}
                size="sm"
                onClick={() => transition(selected, next)}
              >
                {next === 'closed_won' && <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                {next === 'closed_lost' && <XCircle className="mr-1.5 h-3.5 w-3.5" />}
                {STAGE_LABELS[next] || next}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Performance Analytics */}
      <div className="rounded-xl border border-border/60 bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Performance Analytics</h2>
        <WorkspaceAnalytics roleOverride="closer" />
      </div>

      {/* ══════ CLOSED WON MODAL ══════ */}
      <Dialog open={closeWonModal.open} onOpenChange={open => !open && setCloseWonModal({ open: false, lead: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Deal abschließen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Deal Value in € (Pflichtfeld)
              </label>
              <Input
                type="number"
                value={wonDealValue}
                onChange={e => setWonDealValue(e.target.value)}
                placeholder="z.B. 3000"
                className="mt-1"
                min={1}
              />
              {wonDealValue && Number(wonDealValue) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  = {formatK(Number(wonDealValue), '€')}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Closing-Notiz (optional)
              </label>
              <Textarea
                value={wonNotes}
                onChange={e => setWonNotes(e.target.value)}
                placeholder="Was hat den Deal entschieden…"
                className="mt-1 min-h-[60px]"
              />
            </div>
            <div className="rounded-md border border-primary/10 bg-primary/[0.03] p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Was passiert nach dem Closing:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>Lead wird zu L1 (Trainee) aktiviert</li>
                <li>Deal Value wird zum Revenue gezählt</li>
                <li>Event wird geloggt</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseWonModal({ open: false, lead: null })}>Abbrechen</Button>
            <Button onClick={confirmCloseWon} disabled={!wonDealValue || Number(wonDealValue) <= 0}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Deal bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ CLOSE LOST MODAL ══════ */}
      <Dialog open={closeLostModal.open} onOpenChange={open => !open && setCloseLostModal({ open: false, lead: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deal als verloren markieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grund (Pflichtfeld)</label>
              <Select value={closeReason} onValueChange={setCloseReason}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Bitte Grund wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {CLOSE_REASONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notizen (optional)</label>
              <Textarea
                value={closeNotes}
                onChange={e => setCloseNotes(e.target.value)}
                placeholder="Zusätzliche Details…"
                className="mt-1 min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseLostModal({ open: false, lead: null })}>Abbrechen</Button>
            <Button variant="destructive" onClick={confirmCloseLost} disabled={!closeReason}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Closed Lost bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════ FOLLOW-UP MODAL ══════ */}
      <Dialog open={followUpModal.open} onOpenChange={open => !open && setFollowUpModal({ open: false, lead: null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Follow-up planen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Follow-up in (Tage)</label>
              <Select value={followUpDays} onValueChange={setFollowUpDays}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Tag</SelectItem>
                  <SelectItem value="2">2 Tage</SelectItem>
                  <SelectItem value="3">3 Tage</SelectItem>
                  <SelectItem value="5">5 Tage</SelectItem>
                  <SelectItem value="7">1 Woche</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notiz (optional)</label>
              <Textarea
                value={followUpNote}
                onChange={e => setFollowUpNote(e.target.value)}
                placeholder="Was soll beim Follow-up besprochen werden…"
                className="mt-1 min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpModal({ open: false, lead: null })}>Abbrechen</Button>
            <Button onClick={confirmFollowUp}>Follow-up planen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Copilot Panel */}
      {/* Old copilot panel removed — V2 is now per-lead inside detail panel */}
    </div>
  );
}
