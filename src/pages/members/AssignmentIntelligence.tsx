import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { mapLegacyQualityGrade, type LeadQuality } from '@/lib/canonical-decision-engine';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users, TrendingUp, BarChart3, AlertTriangle, Target, Zap,
  ArrowRight, CheckCircle2, XCircle, Clock, Shield, Brain,
  RefreshCw, Crown, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type Profile = Record<string, any>;
type Kpi = Record<string, any>;
type Lead = Record<string, any>;

const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

/* ── Scoring formulas (mirrors edge function logic) ── */
function setterScore(k: Kpi | null): number {
  if (!k) return 50;
  return Math.round(
    (k.show_rate ?? 0) * 0.30 +
    (k.handover_rate ?? 0) * 0.25 +
    (k.qualification_accuracy ?? 0) * 0.20 +
    Math.min((k.calls_handled ?? 0) / 20 * 100, 100) * 0.15 +
    (k.crm_hygiene_score ?? 0) * 0.10
  );
}

function closerScore(k: Kpi | null): number {
  if (!k) return 50;
  return Math.round(
    (k.closing_rate ?? 0) * 0.35 +
    (k.show_rate ?? 0) * 0.20 +
    Math.min((k.earnings_per_call ?? 0) / 500 * 100, 100) * 0.25 +
    Math.min((k.revenue_closed ?? 0) / 50000 * 100, 100) * 0.10 +
    (100 - (k.storno_rate ?? 0)) * 0.10
  );
}

const SETTER_STAGES = ['setter', 'associate_setter', 'senior_associate', 'senior_setter'];
const CLOSER_STAGES = ['junior_manager', 'manager', 'senior_manager', 'director'];

export default function AssignmentIntelligence() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [capacities, setCapacities] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [closedWonRevenue, setClosedWonRevenue] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [pRes, kRes, lRes, cRes, eRes, callsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, business_stage, avatar_url'),
      supabase.from('member_kpis').select('*'),
      supabase.from('leads').select('id, stage, setter_id, closer_id, lead_quality, lead_score, deal_value, created_at, setter_qualification_score'),
      supabase.from('setter_capacity' as any).select('*'),
      supabase.from('lead_events' as any).select('event_type, lead_id, created_by, created_at').in('event_type', [
        'setter_assigned', 'setter_assignment_failed', 'closer_assigned', 'sla_breach',
      ]).order('created_at', { ascending: false }).limit(50),
      // Confirmed Revenue: source of truth from calls table
      supabase.from('calls' as any).select('closer_id, revenue, result').eq('result', 'closed_won'),
    ]);
    setProfiles(pRes.data ?? []);
    setKpis(kRes.data ?? []);
    setLeads(lRes.data ?? []);
    setCapacities(cRes.data ?? []);
    setEvents(eRes.data ?? []);

    // Build closer_id → confirmed revenue map
    const revMap: Record<string, number> = {};
    for (const c of (callsRes.data ?? []) as any[]) {
      if (c.closer_id) {
        revMap[c.closer_id] = (revMap[c.closer_id] || 0) + (Number(c.revenue) || 0);
      }
    }
    setClosedWonRevenue(revMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const triggerRebalance = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke('assign-leads');
      if (error) throw error;
      toast({ title: 'Rebalance ausgeführt', description: 'Leads wurden neu verteilt.' });
      await load();
    } catch (e) {
      toast({ title: 'Fehler', description: 'Rebalance fehlgeschlagen.', variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  /* ── Derived Data ── */
  const setters = useMemo(() => {
    return profiles
      .filter(p => SETTER_STAGES.includes(p.business_stage))
      .map(p => {
        const kpi = kpis.find(k => k.user_id === p.id) || null;
        const score = setterScore(kpi);
        const activeLeads = leads.filter(l => l.setter_id === p.id && !['closed_won', 'closed_lost', 'cancelled', 'recycled'].includes(l.stage)).length;
        const cap = capacities.find((c: any) => c.setter_id === p.id);
        const maxDaily = cap?.max_daily_leads || 2;
        const qualifiedLeads = leads.filter(l => l.setter_id === p.id && ['setter_qualified', 'ready_for_closer', 'assigned_closer'].includes(l.stage)).length;
        const totalAssigned = leads.filter(l => l.setter_id === p.id).length;
        const qualRate = pct(qualifiedLeads, totalAssigned);
        return { id: p.id as string, full_name: (p.full_name || 'Unbekannt') as string, business_stage: p.business_stage as string, score, activeLeads, maxDaily, qualRate, kpi, totalAssigned };
      })
      .sort((a, b) => b.score - a.score);
  }, [profiles, kpis, leads, capacities]);

  const closers = useMemo(() => {
    return profiles
      .filter(p => CLOSER_STAGES.includes(p.business_stage))
      .map(p => {
        const kpi = kpis.find(k => k.user_id === p.id) || null;
        const score = closerScore(kpi);
        const activeLeads = leads.filter(l => l.closer_id === p.id && !['closed_won', 'closed_lost', 'cancelled'].includes(l.stage)).length;
        const won = leads.filter(l => l.closer_id === p.id && l.stage === 'closed_won').length;
        const lost = leads.filter(l => l.closer_id === p.id && l.stage === 'closed_lost').length;
        const revenue = closedWonRevenue[p.id] || 0; // Confirmed Revenue from calls table (source of truth)
        const closeRate = pct(won, won + lost);
        return { id: p.id as string, full_name: (p.full_name || 'Unbekannt') as string, business_stage: p.business_stage as string, score, activeLeads, won, lost, revenue, closeRate, kpi };
      })
      .sort((a, b) => b.score - a.score);
  }, [profiles, kpis, leads, closedWonRevenue]);

  // Alerts
  const alerts = useMemo(() => {
    const a: { type: string; message: string; severity: 'warning' | 'critical' }[] = [];
    const failedAssignments = events.filter(e => e.event_type === 'setter_assignment_failed').length;
    if (failedAssignments > 0) a.push({ type: 'capacity', message: `${failedAssignments} Zuweisungen fehlgeschlagen (Kapazität erschöpft)`, severity: 'critical' });
    const overloaded = setters.filter(s => s.activeLeads > s.maxDaily * 2);
    if (overloaded.length > 0) a.push({ type: 'overload', message: `${overloaded.length} Setter überlastet`, severity: 'warning' });
    const unassignedLeads = leads.filter(l => l.stage === 'in_pool' && !l.setter_id).length;
    if (unassignedLeads > 5) a.push({ type: 'pool', message: `${unassignedLeads} Leads ohne Zuweisung im Pool`, severity: 'warning' });
    const slaBreaches = events.filter(e => e.event_type === 'sla_breach').length;
    if (slaBreaches > 0) a.push({ type: 'sla', message: `${slaBreaches} SLA-Verstöße in letzten Events`, severity: 'critical' });
    return a;
  }, [setters, leads, events]);

  // Distribution stats
  const distStats = useMemo(() => {
    const highLeads = leads.filter(l => mapLegacyQualityGrade(l.lead_quality) === 'high').length;
    const midLeads = leads.filter(l => mapLegacyQualityGrade(l.lead_quality) === 'mid').length;
    const lowLeads = leads.filter(l => mapLegacyQualityGrade(l.lead_quality) === 'low').length;
    const unassigned = leads.filter(l => !l.setter_id && l.stage === 'in_pool').length;
    const readyForCloser = leads.filter(l => l.stage === 'ready_for_closer' && !l.closer_id).length;
    return { aLeads: highLeads, bLeads: midLeads, cLeads: lowLeads, unassigned, readyForCloser };
  }, [leads]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Assignment Intelligence
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automatisches Verteilungssystem · Performance-basiert · Kapazitätsgesteuert
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={triggerRebalance} disabled={refreshing} className="gap-2">
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Rebalance
        </Button>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={cn(
              'flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm',
              a.severity === 'critical' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-yellow-500/30 bg-yellow-50/50 text-yellow-700 dark:bg-yellow-500/5 dark:text-yellow-400'
            )}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{a.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Distribution Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { icon: Crown, label: 'A-Leads', value: distStats.aLeads, accent: true },
          { icon: Target, label: 'B-Leads', value: distStats.bLeads, accent: false },
          { icon: Users, label: 'C-Leads', value: distStats.cLeads, accent: false },
          { icon: Clock, label: 'Unzugewiesen', value: distStats.unassigned, accent: distStats.unassigned > 0 },
          { icon: ArrowRight, label: 'Ready f. Closer', value: distStats.readyForCloser, accent: distStats.readyForCloser > 0 },
        ].map((m, i) => (
          <div key={i} className={cn(
            'rounded-xl border border-border p-3 bg-card',
            m.accent && 'border-primary/30 bg-primary/5'
          )}>
            <div className="flex items-center gap-2 mb-1">
              <m.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">{m.label}</span>
            </div>
            <p className={cn('text-xl font-bold', m.accent ? 'text-primary' : 'text-foreground')}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Setter Rankings */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Setter Ranking & Kapazität</span>
          <Badge variant="outline" className="ml-auto text-[10px]">{setters.length} aktiv</Badge>
        </div>
        <div className="divide-y divide-border">
          {setters.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Keine Setter gefunden</p>
          ) : (
            setters.map((s, rank) => {
              const capPct = pct(s.activeLeads, s.maxDaily * 5);
              return (
                <div key={s.id} className="px-4 py-3 flex items-center gap-4">
                  {/* Rank */}
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    rank === 0 ? 'bg-primary text-primary-foreground' :
                    rank < 3 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                  )}>
                    {rank + 1}
                  </div>

                  {/* Name & Stage */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.full_name || 'Unbekannt'}</p>
                    <p className="text-[11px] text-muted-foreground">{s.business_stage}</p>
                  </div>

                  {/* Score */}
                  <div className="text-center w-16">
                    <p className={cn(
                      'text-lg font-bold',
                      s.score >= 70 ? 'text-primary' : s.score >= 50 ? 'text-foreground' : 'text-destructive'
                    )}>
                      {s.score}
                    </p>
                    <p className="text-[9px] text-muted-foreground">Score</p>
                  </div>

                  {/* Capacity bar */}
                  <div className="w-24">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">{s.activeLeads}/{s.maxDaily * 5}</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', capPct > 80 ? 'bg-destructive' : capPct > 50 ? 'bg-yellow-500' : 'bg-primary')}
                        style={{ width: `${Math.min(capPct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Qual Rate */}
                  <div className="text-center w-14">
                    <p className="text-sm font-semibold text-foreground">{s.qualRate}%</p>
                    <p className="text-[9px] text-muted-foreground">Qual.</p>
                  </div>

                  {/* Status */}
                  <Badge variant={s.activeLeads >= s.maxDaily * 5 ? 'destructive' : 'outline'} className="text-[10px]">
                    {s.activeLeads >= s.maxDaily * 5 ? 'Voll' : 'Verfügbar'}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Closer Rankings */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Closer Ranking & Revenue</span>
          <Badge variant="outline" className="ml-auto text-[10px]">{closers.length} aktiv</Badge>
        </div>
        <div className="divide-y divide-border">
          {closers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Keine Closer gefunden</p>
          ) : (
            closers.map((c, rank) => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-4">
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  rank === 0 ? 'bg-primary text-primary-foreground' :
                  rank < 3 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {rank + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.full_name || 'Unbekannt'}</p>
                  <p className="text-[11px] text-muted-foreground">{c.business_stage}</p>
                </div>

                <div className="text-center w-16">
                  <p className={cn(
                    'text-lg font-bold',
                    c.score >= 70 ? 'text-primary' : c.score >= 50 ? 'text-foreground' : 'text-destructive'
                  )}>
                    {c.score}
                  </p>
                  <p className="text-[9px] text-muted-foreground">Score</p>
                </div>

                <div className="text-center w-16">
                  <p className="text-sm font-semibold text-foreground">{c.closeRate}%</p>
                  <p className="text-[9px] text-muted-foreground">Close</p>
                </div>

                <div className="text-center w-20">
                  <p className="text-sm font-semibold text-foreground">
                    {c.revenue >= 1000 ? `€${(c.revenue / 1000).toFixed(1)}k` : `€${c.revenue}`}
                  </p>
                  <p className="text-[9px] text-muted-foreground">Revenue</p>
                </div>

                <div className="flex gap-1.5">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5 text-primary" />{c.won}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <XCircle className="h-2.5 w-2.5 text-destructive" />{c.lost}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Assignment Events */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Letzte Zuweisungen</span>
        </div>
        <div className="divide-y divide-border max-h-64 overflow-y-auto">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Keine Events</p>
          ) : (
            events.slice(0, 20).map((e, i) => {
              const assignee = profiles.find(p => p.id === e.created_by);
              const isFailure = e.event_type.includes('failed') || e.event_type.includes('breach');
              return (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  <div className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    isFailure ? 'bg-destructive' : 'bg-primary'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">
                      <span className="font-medium">{e.event_type.replace(/_/g, ' ')}</span>
                      {assignee && <span className="text-muted-foreground"> → {assignee.full_name}</span>}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(e.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Scoring Logic Explanation */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Scoring-Logik</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-foreground mb-1.5">Setter Score</p>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>• Show-Rate: 30%</p>
              <p>• Handover-Rate: 25%</p>
              <p>• Qualifizierungs-Genauigkeit: 20%</p>
              <p>• Calls bearbeitet: 15%</p>
              <p>• CRM-Hygiene: 10%</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-foreground mb-1.5">Closer Score</p>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>• Close-Rate: 35%</p>
              <p>• Show-Rate: 20%</p>
              <p>• Earnings/Call: 25%</p>
              <p>• Revenue gesamt: 10%</p>
              <p>• Storno-Resistenz: 10%</p>
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">Zuweisung:</span> Kapazität (40%) + Performance (40%) + Fairness (20%).
            A-Leads → Top 3 Setter. B-Leads → Round-Robin. C-Leads → nur bei freier Kapazität.
          </p>
        </div>
      </div>
    </div>
  );
}
