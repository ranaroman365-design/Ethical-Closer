import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Users, ArrowRight, TrendingUp, DollarSign, BarChart3,
  AlertTriangle, CheckCircle2, XCircle, Target, Flame,
  Clock, Globe, Brain, Shield, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Types ── */
type Lead = Record<string, any>;

/* ── Helpers ── */
const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;
const formatK = (n: number, s = '€') => n >= 1000 ? `${s}${(n / 1000).toFixed(1)}k` : `${s}${n}`;

const FUNNEL_STAGES = [
  { key: 'total', label: 'Leads gesamt' },
  { key: 'booked', label: 'Gebucht' },
  { key: 'setter_qualified', label: 'Qualifiziert' },
  { key: 'assigned_closer', label: 'Zum Closer' },
  { key: 'offer_made', label: 'Angebot' },
  { key: 'closed_won', label: 'Closed Won' },
];

const ALERT_THRESHOLDS = {
  bookingRate: 40,
  qualRate: 25,
  closeRate: 15,
  showUpRate: 60,
};

export default function RevenueIntelligence() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [callsRevByCloser, setCallsRevByCloser] = useState<Record<string, number>>({});
  const [totalConfirmedRevenue, setTotalConfirmedRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('calls' as any).select('closer_id, revenue, result').eq('result', 'closed_won'),
    ]).then(([{ data: leadsData }, { data: callsData }]) => {
      setLeads((leadsData as Lead[]) ?? []);
      // Build confirmed revenue map from calls
      const revMap: Record<string, number> = {};
      let total = 0;
      for (const c of (callsData ?? []) as any[]) {
        const rev = Number(c.revenue) || 0;
        total += rev;
        if (c.closer_id) revMap[c.closer_id] = (revMap[c.closer_id] || 0) + rev;
      }
      setCallsRevByCloser(revMap);
      setTotalConfirmedRevenue(total);
      setLoading(false);
    });
  }, []);

  /* ── FUNNEL ── */
  const funnel = useMemo(() => {
    const total = leads.length;
    const booked = leads.filter(l => l.has_booking || ['setter_booked', 'assigned_setter', 'setter_contacting', 'setter_qualified', 'assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up', 'closed_won', 'closed_lost'].includes(l.stage)).length;
    const qualified = leads.filter(l => ['setter_qualified', 'assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up', 'closed_won', 'closed_lost'].includes(l.stage)).length;
    const toCloser = leads.filter(l => ['assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up', 'closed_won', 'closed_lost'].includes(l.stage)).length;
    const offered = leads.filter(l => ['offer_made', 'closed_won', 'closed_lost'].includes(l.stage)).length;
    const won = leads.filter(l => l.stage === 'closed_won').length;
    const lost = leads.filter(l => l.stage === 'closed_lost').length;
    const revenue = totalConfirmedRevenue; // Confirmed Revenue from calls table

    const stages = [
      { ...FUNNEL_STAGES[0], count: total, rate: null as number | null },
      { ...FUNNEL_STAGES[1], count: booked, rate: pct(booked, total) },
      { ...FUNNEL_STAGES[2], count: qualified, rate: pct(qualified, booked) },
      { ...FUNNEL_STAGES[3], count: toCloser, rate: pct(toCloser, qualified) },
      { ...FUNNEL_STAGES[4], count: offered, rate: pct(offered, toCloser) },
      { ...FUNNEL_STAGES[5], count: won, rate: pct(won, toCloser) },
    ];

    return { stages, total, booked, qualified, toCloser, offered, won, lost, revenue };
  }, [leads, totalConfirmedRevenue]);

  /* ── REVENUE ── */
  const revenue = useMemo(() => {
    const wonLeads = leads.filter(l => l.stage === 'closed_won');
    const total = totalConfirmedRevenue; // Confirmed Revenue from calls
    const avgDeal = wonLeads.length > 0 ? Math.round(total / wonLeads.length) : 0;
    const closedTotal = wonLeads.length + leads.filter(l => l.stage === 'closed_lost').length;
    const closeRate = pct(wonLeads.length, closedTotal);

    // Per-closer confirmed revenue from calls
    const closerMap: Record<string, { name: string; won: number; lost: number; revenue: number }> = {};
    leads.filter(l => l.closer_id && ['closed_won', 'closed_lost'].includes(l.stage)).forEach(l => {
      if (!closerMap[l.closer_id]) closerMap[l.closer_id] = { name: l.closer_id.slice(0, 8), won: 0, lost: 0, revenue: 0 };
      if (l.stage === 'closed_won') { closerMap[l.closer_id].won++; closerMap[l.closer_id].revenue = callsRevByCloser[l.closer_id] || 0; }
      else closerMap[l.closer_id].lost++;
    });
    const closers = Object.entries(closerMap).map(([id, d]) => ({
      id, ...d, closeRate: pct(d.won, d.won + d.lost),
    })).sort((a, b) => b.revenue - a.revenue);

    return { total, avgDeal, closeRate, closers, wonCount: wonLeads.length };
  }, [leads, totalConfirmedRevenue, callsRevByCloser]);

  /* ── SETTER PERFORMANCE ── */
  const setterPerf = useMemo(() => {
    const setterMap: Record<string, { name: string; assigned: number; qualified: number; toCloser: number; won: number }> = {};
    leads.filter(l => l.setter_id).forEach(l => {
      if (!setterMap[l.setter_id]) setterMap[l.setter_id] = { name: l.setter_id.slice(0, 8), assigned: 0, qualified: 0, toCloser: 0, won: 0 };
      setterMap[l.setter_id].assigned++;
      if (['setter_qualified', 'assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up', 'closed_won', 'closed_lost'].includes(l.stage)) setterMap[l.setter_id].qualified++;
      if (['assigned_closer', 'closer_in_progress', 'offer_made', 'follow_up', 'closed_won', 'closed_lost'].includes(l.stage)) setterMap[l.setter_id].toCloser++;
      if (l.stage === 'closed_won') setterMap[l.setter_id].won++;
    });
    return Object.entries(setterMap).map(([id, d]) => ({
      id, ...d, qualRate: pct(d.qualified, d.assigned), downstreamCloseRate: pct(d.won, d.toCloser),
    })).sort((a, b) => b.qualRate - a.qualRate);
  }, [leads]);

  /* ── LEAD QUALITY ── */
  const qualityAnalysis = useMemo(() => {
    const buckets = ['high', 'mid', 'low'] as const;
    return buckets.map(bucket => {
      const inBucket = leads.filter(l => l.qualification_bucket === bucket);
      const won = inBucket.filter(l => l.stage === 'closed_won').length;
      const closed = inBucket.filter(l => ['closed_won', 'closed_lost'].includes(l.stage)).length;
      return { bucket, count: inBucket.length, won, closeRate: pct(won, closed) };
    });
  }, [leads]);

  /* ── SOURCE PERFORMANCE ── */
  const sourcePerf = useMemo(() => {
    const sourceMap: Record<string, { count: number; won: number; pipelineValue: number }> = {};
    leads.forEach(l => {
      const src = l.source_funnel || l.quiz_funnel_source || 'direct';
      if (!sourceMap[src]) sourceMap[src] = { count: 0, won: 0, pipelineValue: 0 };
      sourceMap[src].count++;
      if (l.stage === 'closed_won') { sourceMap[src].won++; sourceMap[src].pipelineValue += Number(l.deal_value) || 0; }
    });
    return Object.entries(sourceMap).map(([source, d]) => ({
      source, ...d, closeRate: pct(d.won, d.count),
    })).sort((a, b) => b.pipelineValue - a.pipelineValue);
  }, [leads]);

  /* ── BOTTLENECK ALERTS ── */
  const alerts = useMemo(() => {
    const a: { label: string; value: string; severity: 'critical' | 'warning' | 'info'; action: string }[] = [];
    const bookingRate = pct(funnel.booked, funnel.total);
    const qualRate = pct(funnel.qualified, funnel.booked);
    const closeRate = pct(funnel.won, funnel.toCloser);

    if (bookingRate < ALERT_THRESHOLDS.bookingRate && funnel.total > 5)
      a.push({ label: `Booking Rate: ${bookingRate}%`, value: `< ${ALERT_THRESHOLDS.bookingRate}%`, severity: 'critical', action: 'Quiz/Booking Flow prüfen — zu viel Drop-off vor Buchung.' });
    if (qualRate < ALERT_THRESHOLDS.qualRate && funnel.booked > 5)
      a.push({ label: `Qualification Rate: ${qualRate}%`, value: `< ${ALERT_THRESHOLDS.qualRate}%`, severity: 'warning', action: 'Setter-Qualität prüfen — zu wenige Leads werden qualifiziert.' });
    if (closeRate < ALERT_THRESHOLDS.closeRate && funnel.toCloser > 5)
      a.push({ label: `Close Rate: ${closeRate}%`, value: `< ${ALERT_THRESHOLDS.closeRate}%`, severity: 'critical', action: 'Closer Performance oder Offer prüfen — zu wenig Abschlüsse.' });

    const overdueFollowUps = leads.filter(l => l.stage === 'follow_up' && l.follow_up_date && Date.now() - new Date(l.follow_up_date).getTime() > 48 * 3600000).length;
    if (overdueFollowUps > 0)
      a.push({ label: `${overdueFollowUps} Follow-ups überfällig`, value: '> 48h', severity: 'warning', action: 'Setter/Closer müssen überfällige Follow-ups abarbeiten.' });

    return a;
  }, [funnel, leads]);

  /* ── TIME METRICS ── */
  const timeMetrics = useMemo(() => {
    const wonLeads = leads.filter(l => l.stage === 'closed_won' && l.created_at && l.closed_at);
    if (wonLeads.length === 0) return null;
    const avgDays = wonLeads.reduce((s, l) => {
      const diff = new Date(l.closed_at).getTime() - new Date(l.created_at).getTime();
      return s + diff / 86400000;
    }, 0) / wonLeads.length;
    return { avgDaysToClose: Math.round(avgDays * 10) / 10 };
  }, [leads]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">Revenue Intelligence</p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Revenue Operating System
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Echtzeit-Überblick über Funnel, Revenue, Setter/Closer Performance und Engpässe.
        </p>
      </div>

      {/* ═══ BOTTLENECK ALERTS ═══ */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={cn(
              'rounded-lg border px-4 py-3 flex items-start gap-3',
              a.severity === 'critical' ? 'border-destructive/30 bg-destructive/5' : 'border-yellow-500/30 bg-yellow-500/5'
            )}>
              <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', a.severity === 'critical' ? 'text-destructive' : 'text-yellow-600')} />
              <div>
                <p className="text-sm font-semibold text-foreground">{a.label}</p>
                <p className="text-xs text-muted-foreground">{a.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ BLOCK 1: FUNNEL OVERVIEW ═══ */}
      <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary/60" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Funnel Overview</h2>
        </div>

        {/* Funnel Flow */}
        <div className="flex items-center justify-between gap-1 flex-wrap">
          {funnel.stages.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-1">
              <div className={cn(
                'rounded-xl border p-3 min-w-[90px] text-center',
                stage.key === 'closed_won' ? 'border-primary/20 bg-primary/[0.03]' : 'border-border/30 bg-muted/[0.03]'
              )}>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{stage.label}</p>
                <p className="text-xl font-semibold text-foreground mt-0.5">{stage.count}</p>
                {stage.rate !== null && (
                  <p className={cn('text-[10px] font-medium mt-0.5', stage.rate >= 30 ? 'text-primary' : stage.rate >= 15 ? 'text-yellow-600' : 'text-destructive')}>
                    {stage.rate}%
                  </p>
                )}
              </div>
              {i < funnel.stages.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />}
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={DollarSign} label="Total Revenue" value={formatK(funnel.revenue)} accent />
          <StatCard icon={Target} label="Close Rate" value={`${pct(funnel.won, funnel.won + funnel.lost)}%`} />
          <StatCard icon={CheckCircle2} label="Won / Lost" value={`${funnel.won} / ${funnel.lost}`} />
          {timeMetrics && <StatCard icon={Clock} label="Ø Tage bis Close" value={`${timeMetrics.avgDaysToClose}d`} />}
        </div>
      </div>

      {/* ═══ BLOCK 2: REVENUE ═══ */}
      <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary/60" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Revenue Dashboard</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard icon={DollarSign} label="Total Revenue" value={formatK(revenue.total)} accent />
          <StatCard icon={TrendingUp} label="Ø Deal Size" value={formatK(revenue.avgDeal)} />
          <StatCard icon={Target} label="Close Rate" value={`${revenue.closeRate}%`} />
          <StatCard icon={CheckCircle2} label="Deals Won" value={String(revenue.wonCount)} />
        </div>

        {/* Closer Revenue Table */}
        {revenue.closers.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Revenue per Closer</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Closer</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Won</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Lost</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Rate</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {revenue.closers.map(c => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 text-foreground font-medium">{c.name}</td>
                      <td className="px-3 py-2 text-primary font-medium">{c.won}</td>
                      <td className="px-3 py-2 text-muted-foreground">{c.lost}</td>
                      <td className="px-3 py-2">
                        <span className={cn('font-medium', c.closeRate >= 30 ? 'text-primary' : c.closeRate >= 15 ? 'text-yellow-600' : 'text-destructive')}>
                          {c.closeRate}%
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-foreground">{formatK(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ═══ BLOCK 3: SETTER PERFORMANCE ═══ */}
      {setterPerf.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary/60" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Setter Performance</h2>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Setter</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Assigned</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Qual. Rate</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">→ Closer</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground">Downstream Close</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {setterPerf.map(s => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 text-foreground font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.assigned}</td>
                    <td className="px-3 py-2">
                      <span className={cn('font-medium', s.qualRate >= 40 ? 'text-primary' : s.qualRate >= 20 ? 'text-yellow-600' : 'text-destructive')}>
                        {s.qualRate}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{s.toCloser}</td>
                    <td className="px-3 py-2">
                      <span className={cn('font-medium', s.downstreamCloseRate >= 25 ? 'text-primary' : 'text-muted-foreground')}>
                        {s.downstreamCloseRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ BLOCK 4: LEAD QUALITY ANALYSIS ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary/60" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Lead Quality Analysis</h2>
          </div>
          {qualityAnalysis.some(q => q.count > 0) ? (
            <div className="space-y-3">
              {qualityAnalysis.map(q => (
                <div key={q.bucket} className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/[0.03] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn('text-[9px] font-bold uppercase',
                      q.bucket === 'high' ? 'bg-primary/10 text-primary border-primary/20' :
                      q.bucket === 'mid' ? 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20' :
                      'bg-destructive/10 text-destructive border-destructive/20'
                    )}>{q.bucket}</Badge>
                    <span className="text-sm text-foreground">{q.count} Leads</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{q.won} Won</p>
                    <p className={cn('text-[10px] font-medium', q.closeRate >= 20 ? 'text-primary' : 'text-muted-foreground')}>
                      {q.closeRate}% Close Rate
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">Noch keine Qualification-Daten verfügbar.</p>
          )}
        </div>

        {/* ═══ BLOCK 5: SOURCE PERFORMANCE ═══ */}
        <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary/60" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Source Performance</h2>
          </div>
          {sourcePerf.length > 0 ? (
            <div className="space-y-2">
              {sourcePerf.slice(0, 8).map(s => (
                <div key={s.source} className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/[0.03] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm text-foreground capitalize">{s.source}</span>
                    <span className="text-[10px] text-muted-foreground">{s.count} Leads</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{formatK(s.pipelineValue)}</p>
                    <p className="text-[10px] text-muted-foreground">{s.closeRate}% CR</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">Keine Source-Daten.</p>
          )}
        </div>
      </div>

      {/* ═══ BLOCK 6: PIPELINE STATUS ═══ */}
      <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary/60" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Pipeline Status (Live)</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: 'Neuer Lead', count: leads.filter(l => l.stage === 'new').length },
            { label: 'Im Pool', count: leads.filter(l => l.stage === 'in_pool').length },
            { label: 'Setter aktiv', count: leads.filter(l => ['assigned_setter', 'setter_contacting', 'setter_booked'].includes(l.stage)).length },
            { label: 'Closer aktiv', count: leads.filter(l => ['assigned_closer', 'closer_in_progress'].includes(l.stage)).length },
            { label: 'Angebot offen', count: leads.filter(l => l.stage === 'offer_made').length },
            { label: 'Follow-up', count: leads.filter(l => l.stage === 'follow_up').length },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border/30 bg-muted/[0.03] px-3 py-2.5 text-center">
              <p className="text-lg font-semibold text-foreground">{s.count}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Reusable stat card ── */
function StatCard({ icon: Icon, label, value, accent = false }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border px-3 py-2.5',
      accent ? 'border-primary/20 bg-primary/[0.03]' : 'border-border bg-muted/[0.03]'
    )}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
