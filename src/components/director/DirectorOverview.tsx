import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import {
  Users, ArrowRight, CheckCircle2, TrendingUp, Activity,
  AlertTriangle, Clock, BarChart3, ArrowDown,
} from 'lucide-react';
import DirectorProductHealth from './DirectorProductHealth';
import DirectorKpiOverview from './DirectorKpiOverview';
import EscalationPanel from '@/components/members/EscalationPanel';

interface LeadStats {
  total: number; pool: number; setter: number; closer: number; won: number; lost: number; l1: number;
}

interface RecentEvent {
  id: string; lead_name: string; previous_stage: string; new_stage: string; created_at: string;
}

const STAGE_LABEL_MAP: Record<string, string> = {
  new: 'Neu', backlog: 'Backlog', recycled: 'Recycelt', in_pool: 'Im Pool',
  booked: 'Termin gebucht (neu)', assigned_setter: 'Setter zugewiesen', setter_attempting: 'Kontakt versucht',
  setter_contacting: 'Kontakt aufgenommen', setter_no_response: 'Keine Antwort',
  setter_qualified: 'Qualifiziert', setter_booked: 'Closer Call gebucht',
  ready_for_closer: 'Bereit für Closer', assigned_closer: 'Closer zugewiesen',
  closer_in_progress: 'In Bearbeitung', offer_made: 'Angebot gemacht',
  follow_up: 'Follow-Up', closed_won: 'Closed Won', closed_lost: 'Closed Lost',
  cancelled: 'Storniert', returned_to_pool: 'Zurück im Pool',
};

const FUNNEL_STAGES = [
  { key: 'pool', label: 'Pool', stages: ['new', 'in_pool', 'recycled', 'returned_to_pool', 'backlog'] },
  { key: 'setter', label: 'Setter', stages: ['assigned_setter', 'setter_contacting', 'setter_attempting', 'setter_no_response', 'setter_qualified', 'setter_booked'] },
  { key: 'closer', label: 'Closer', stages: ['ready_for_closer', 'assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up'] },
  { key: 'won', label: 'Won', stages: ['closed_won'] },
  { key: 'lost', label: 'Lost', stages: ['closed_lost'] },
];

export default function DirectorOverview() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [stats, setStats] = useState<LeadStats>({ total: 0, pool: 0, setter: 0, closer: 0, won: 0, lost: 0, l1: 0 });
  const [funnelData, setFunnelData] = useState<{ key: string; label: string; count: number }[]>([]);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [priorities, setPriorities] = useState({ newPool: 0, unassigned: 0, setterWaiting: 0, closerWaiting: 0, stuckLeads: 0 });
  const [teamPerf, setTeamPerf] = useState<any[]>([]);

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('leads').select('id, stage, lead_level, closer_id, setter_id, deal_value, updated_at'),
      supabase.from('lead_transitions').select('id, lead_id, previous_stage, new_stage, created_at')
        .order('created_at', { ascending: false }).limit(15),
      supabase.from('leads').select('id, name'),
      supabase.from('profiles').select('id, full_name, business_stage')
        .in('business_stage', ['setter', 'associate_setter', 'senior_associate', 'senior_setter', 'junior_manager', 'manager', 'senior_manager']),
      // Confirmed Revenue: source of truth from calls table
      supabase.from('calls' as any).select('closer_id, revenue, result').eq('result', 'closed_won'),
    ]).then(([{ data: leads }, { data: transitions }, { data: allLeads }, { data: teamProfiles }, { data: callsData }]) => {
      const l = (leads ?? []) as any[];
      const nameMap: Record<string, string> = {};
      ((allLeads ?? []) as any[]).forEach(ld => { nameMap[ld.id] = ld.name; });

      // Build closer_id → confirmed revenue map from calls
      const revByCloser: Record<string, number> = {};
      for (const c of (callsData ?? []) as any[]) {
        if (c.closer_id) revByCloser[c.closer_id] = (revByCloser[c.closer_id] || 0) + (Number(c.revenue) || 0);
      }

      const poolStages = ['new', 'backlog', 'recycled', 'in_pool', 'returned_to_pool'];
      const setterStages = ['assigned_setter', 'setter_attempting', 'setter_contacting', 'setter_no_response', 'setter_qualified', 'setter_booked'];
      const closerStages = ['ready_for_closer', 'assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up'];

      setStats({
        total: l.length,
        pool: l.filter(x => poolStages.includes(x.stage)).length,
        setter: l.filter(x => setterStages.includes(x.stage)).length,
        closer: l.filter(x => closerStages.includes(x.stage)).length,
        won: l.filter(x => x.stage === 'closed_won').length,
        lost: l.filter(x => x.stage === 'closed_lost').length,
        l1: l.filter(x => x.lead_level === 'L1').length,
      });

      setFunnelData(FUNNEL_STAGES.map(fs => ({
        key: fs.key,
        label: fs.label,
        count: l.filter(x => fs.stages.includes(x.stage)).length,
      })));

      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const stuckCount = l.filter(x =>
        [...setterStages, ...closerStages].includes(x.stage) && x.updated_at < sevenDaysAgo
      ).length;

      setPriorities({
        newPool: l.filter(x => x.stage === 'new').length,
        unassigned: l.filter(x => poolStages.includes(x.stage)).length,
        setterWaiting: l.filter(x => x.stage === 'assigned_setter').length,
        closerWaiting: l.filter(x => x.stage === 'assigned_closer').length,
        stuckLeads: stuckCount,
      });

      const profiles = (teamProfiles ?? []) as any[];
      const perf = profiles.map(p => {
        const userLeads = l.filter(x => x.closer_id === p.id || x.setter_id === p.id);
        const won = userLeads.filter(x => x.stage === 'closed_won').length;
        const active = userLeads.filter(x => !['closed_won', 'closed_lost', 'cancelled', 'recycled'].includes(x.stage)).length;
        const rev = revByCloser[p.id] || 0; // Confirmed Revenue from calls table
        return { name: p.full_name, stage: p.business_stage, won, active, total: userLeads.length, revenue: rev };
      }).filter(p => p.total > 0).sort((a, b) => b.won - a.won);
      setTeamPerf(perf);

      setEvents(((transitions ?? []) as any[]).slice(0, 10).map(tr => ({
        id: tr.id,
        lead_name: nameMap[tr.lead_id] || 'Lead',
        previous_stage: tr.previous_stage,
        new_stage: tr.new_stage,
        created_at: tr.created_at,
      })));

      setLoading(false);
    });
  }, [user]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const kpis = [
    { label: t('Leads gesamt', 'Total Leads'), value: stats.total, icon: Users },
    { label: t('Im Pool', 'In Pool'), value: stats.pool, icon: Activity },
    { label: t('Setter-Phase', 'Setter Stage'), value: stats.setter, icon: Activity },
    { label: t('Closer-Phase', 'Closer Stage'), value: stats.closer, icon: TrendingUp },
    { label: 'Closed Won', value: stats.won, icon: CheckCircle2, highlight: true },
  ];

  const maxFunnel = Math.max(...funnelData.map(f => f.count), 1);
  const convRate = stats.total > 0 ? ((stats.won / stats.total) * 100).toFixed(1) : '0';

  return (
    <div>
      {/* ── Escalation Alerts (filtered insights) ── */}
      <div className="mb-8">
        <EscalationPanel />
      </div>

      {/* ── Header ── */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-1">
          {t('Operativer Überblick', 'Operational Overview')}
        </p>
        <h2 className="font-serif text-xl font-semibold text-foreground">{t('Pipeline & Team', 'Pipeline & Team')}</h2>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 mb-8">
        {kpis.map(kpi => (
          <div
            key={kpi.label}
            className={`rounded-xl border p-5 ${
              (kpi as any).highlight ? 'border-success/20 bg-success-muted' : 'border-border/60 bg-card'
            }`}
          >
            <kpi.icon className="h-4 w-4 text-muted-foreground/40 mb-3" />
            <p className="text-3xl font-bold tracking-tight text-foreground">{kpi.value}</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* ── Pipeline Funnel ── */}
      <div className="mb-8 rounded-xl border border-border/60 bg-card p-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-5 flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5" /> {t('Pipeline Funnel', 'Pipeline Funnel')}
        </h3>
        <div className="flex items-end gap-4 h-36">
          {funnelData.map(f => {
            const height = Math.max((f.count / maxFunnel) * 100, 4);
            const isWon = f.key === 'won';
            const isLost = f.key === 'lost';
            return (
              <div key={f.key} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-sm font-bold text-foreground">{f.count}</span>
                <div
                  className={`w-full rounded-t-lg transition-all ${
                    isWon ? 'bg-success/60' : isLost ? 'bg-danger/30' : 'bg-primary/20'
                  }`}
                  style={{ height: `${height}%` }}
                />
                <span className="text-[10px] font-medium text-muted-foreground">{f.label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-border/30 pt-3">
          <span>{t('Conversion', 'Conversion')}: <span className="font-semibold text-foreground">{convRate}%</span></span>
          <span>{t('Win/Loss', 'Win/Loss')}: <span className="font-semibold text-foreground">{stats.won}/{stats.lost}</span></span>
        </div>
      </div>

      {/* ── Bottleneck Alerts ── */}
      {(priorities.stuckLeads > 0 || priorities.closerWaiting > 10 || priorities.newPool > 20) && (
        <div className="mb-8 rounded-xl border border-warning/30 bg-warning-muted p-5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-warning mb-3 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> {t('System-Empfehlungen', 'System Recommendations')}
          </h3>
          <div className="space-y-2">
            {priorities.stuckLeads > 0 && (
              <div className="flex items-start gap-2 text-xs text-foreground">
                <ArrowDown className="h-3 w-3 mt-0.5 text-warning shrink-0" />
                <span>{priorities.stuckLeads} {t('Leads seit 7+ Tagen ohne Bewegung — Re-Routing oder Recycling empfohlen.', 'leads stuck 7+ days — consider re-routing or recycling.')}</span>
              </div>
            )}
            {priorities.closerWaiting > 10 && (
              <div className="flex items-start gap-2 text-xs text-foreground">
                <ArrowDown className="h-3 w-3 mt-0.5 text-warning shrink-0" />
                <span>{priorities.closerWaiting} {t('Leads warten auf Closer — Kapazitätsengpass prüfen.', 'leads awaiting Closer — check capacity.')}</span>
              </div>
            )}
            {priorities.newPool > 20 && (
              <div className="flex items-start gap-2 text-xs text-foreground">
                <ArrowDown className="h-3 w-3 mt-0.5 text-warning shrink-0" />
                <span>{priorities.newPool} {t('unbearbeitete neue Leads — Setter-Zuweisung beschleunigen.', 'unprocessed new leads — speed up Setter assignment.')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Grid: Priorities + Team + Activity ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Priorities */}
        <div className="rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/40 px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">{t('Handlungsbedarf', 'Action Required')}</h3>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: t('Neue Leads', 'New Leads'), value: priorities.newPool, icon: Users, warning: false },
              { label: t('Nicht zugewiesen', 'Unassigned'), value: priorities.unassigned, icon: Clock, warning: priorities.unassigned > 20 },
              { label: t('Warten auf Setter', 'Awaiting Setter'), value: priorities.setterWaiting, icon: Activity, warning: false },
              { label: t('Warten auf Closer', 'Awaiting Closer'), value: priorities.closerWaiting, icon: TrendingUp, warning: false },
              { label: t('Stuck Leads (7+ Tage)', 'Stuck Leads (7+ days)'), value: priorities.stuckLeads, icon: AlertTriangle, warning: priorities.stuckLeads > 0 },
            ].map(item => (
              <Link
                key={item.label}
                to="/members/pool"
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors hover:border-border ${
                  item.warning ? 'border-warning/30 bg-warning-muted' : 'border-border/40 bg-background'
                }`}
              >
                <div className="flex items-center gap-2">
                  <item.icon className={`h-3.5 w-3.5 ${item.warning ? 'text-warning' : 'text-muted-foreground/40'}`} />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${item.warning ? 'text-warning' : 'text-foreground'}`}>{item.value}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/20" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Team Performance */}
        <div className="rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/40 px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">{t('Team Performance', 'Team Performance')}</h3>
          </div>
          <div className="p-4 space-y-2">
            {teamPerf.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-6">{t('Keine Teammitglieder.', 'No team members.')}</p>
            )}
            {teamPerf.slice(0, 6).map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/30 bg-background px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{p.stage?.replace('_', ' ')}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <p className="font-bold text-success">{p.won}</p>
                    <p className="text-[9px] text-muted-foreground">Won</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-foreground">{p.active}</p>
                    <p className="text-[9px] text-muted-foreground">Active</p>
                  </div>
                  {p.revenue > 0 && (
                    <div className="text-center">
                      <p className="font-bold text-accent">€{(p.revenue / 1000).toFixed(0)}k</p>
                      <p className="text-[9px] text-muted-foreground">Rev</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div className="rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/40 px-5 py-4">
            <h3 className="text-sm font-semibold text-foreground">{t('Letzte Aktivität', 'Recent Activity')}</h3>
          </div>
          <div className="divide-y divide-border/30 max-h-72 overflow-y-auto">
            {events.length === 0 && (
              <p className="px-5 py-8 text-center text-xs text-muted-foreground">{t('Noch keine Aktivität.', 'No activity yet.')}</p>
            )}
            {events.map(ev => (
              <div key={ev.id} className="flex items-start gap-2 px-4 py-3">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/20" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">
                    <span className="font-medium">{ev.lead_name}</span>
                    <span className="text-muted-foreground"> → </span>
                    <span className="font-medium">{STAGE_LABEL_MAP[ev.new_stage] || ev.new_stage}</span>
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground/50">
                  {new Date(ev.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Product Health ── */}
      <div className="mt-8">
        <DirectorProductHealth />
      </div>

      {/* ── KPI Overview ── */}
      <div className="mt-6">
        <DirectorKpiOverview />
      </div>
    </div>
  );
}