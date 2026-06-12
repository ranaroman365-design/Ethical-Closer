import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { toast } from '@/hooks/use-toast';
import {
  Activity, TrendingUp, TrendingDown, AlertTriangle, Brain,
  BarChart3, Zap, RefreshCw, Shield, Users, DollarSign,
  ArrowRight, ChevronRight, Eye, Target, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AILearningStatusBanner from '@/components/intelligence/AILearningStatusBanner';
import SlaCompliancePanel from '@/components/performance/SlaCompliancePanel';
import ProfitCenterPanel from '@/components/performance/ProfitCenterPanel';

/* ─── TYPES ─── */
interface FunnelData {
  totalLeads: number;
  totalCalls: number;
  totalCloses: number;
  totalRevenue: number;
  showRate: number;
  closeRate: number;
}

interface CloserStat {
  userId: string;
  fullName: string;
  totalCalls: number;
  closeRate: number;
  revenue: number;
  avgScore: number;
  depthEvents: number;
  resistanceEvents: number;
  decisionEvents: number;
}

interface ConvoIntel {
  stateDistribution: { state: string; count: number; pct: number }[];
  topSignals: { cluster: string; count: number }[];
  typicalFlow: string[];
}

interface RiskSignals {
  fragilePercent: number;
  highRiskPercent: number;
  unresolvedObjPercent: number;
  totalSessions: number;
}

interface PatternInsight {
  id: string;
  insight_type: string;
  pattern_description: string;
  confidence_score: number;
  recommendation: string;
  state_sequence: string[];
  signal_indicators: string[];
}

const STATE_COLORS: Record<string, string> = {
  surface: 'hsl(220,9%,46%)',
  exploration: 'hsl(217,91%,60%)',
  depth: 'hsl(12,76%,61%)',
  resistance: 'hsl(39,41%,55%)',
  confusion: 'hsl(263,70%,50%)',
  decision: 'hsl(152,60%,40%)',
};

const STATE_LABELS: Record<string, { de: string; en: string }> = {
  surface: { de: 'Surface', en: 'Surface' },
  exploration: { de: 'Exploration', en: 'Exploration' },
  depth: { de: 'Emotionale Tiefe', en: 'Emotional Depth' },
  resistance: { de: 'Widerstand', en: 'Resistance' },
  confusion: { de: 'Verwirrung', en: 'Confusion' },
  decision: { de: 'Entscheidung', en: 'Decision' },
};

export default function IntelligenceDashboard() {
  const { lang } = useLanguage();
  const de = lang === 'de';
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [convoIntel, setConvoIntel] = useState<ConvoIntel | null>(null);
  const [closers, setClosers] = useState<CloserStat[]>([]);
  const [risk, setRisk] = useState<RiskSignals | null>(null);
  const [insights, setInsights] = useState<PatternInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadFunnel(), loadConvoIntel(), loadCloserPerf(), loadRisk(), loadInsights()]);
    } finally {
      setLoading(false);
    }
  };

  const loadFunnel = async () => {
    const { data: calls } = await supabase
      .from('calls')
      .select('id, status, result, revenue, showed_at, is_simulation')
      .eq('is_simulation', false);

    if (!calls) return;
    const totalCalls = calls.length;
    const showed = calls.filter(c => c.showed_at).length;
    const closes = calls.filter(c => c.result === 'closed_won').length;
    const revenue = calls.filter(c => c.result === 'closed_won').reduce((a, c) => a + (Number(c.revenue) || 0), 0);

    const { count: leadCount } = await supabase.from('leads' as any).select('id', { count: 'exact', head: true });

    setFunnel({
      totalLeads: leadCount || 0,
      totalCalls,
      totalCloses: closes,
      totalRevenue: revenue,
      showRate: totalCalls > 0 ? Math.round((showed / totalCalls) * 100) : 0,
      closeRate: showed > 0 ? Math.round((closes / showed) * 100) : 0,
    });
  };

  const loadConvoIntel = async () => {
    const { data: events } = await supabase.from('copilot_state_events').select('state');
    const { data: signals } = await supabase.from('copilot_signal_log').select('signal_cluster, occurrence_count');

    if (events && events.length > 0) {
      const counts: Record<string, number> = {};
      events.forEach(e => { counts[e.state] = (counts[e.state] || 0) + 1; });
      const total = events.length;
      const dist = Object.entries(counts)
        .map(([state, count]) => ({ state, count, pct: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);

      const sigCounts: Record<string, number> = {};
      (signals || []).forEach(s => { sigCounts[s.signal_cluster] = (sigCounts[s.signal_cluster] || 0) + s.occurrence_count; });
      const topSigs = Object.entries(sigCounts)
        .map(([cluster, count]) => ({ cluster, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      // Typical flow: top 4 states by order of first appearance
      const typicalFlow = dist.slice(0, 4).map(d => d.state);

      setConvoIntel({ stateDistribution: dist, topSignals: topSigs, typicalFlow });
    }
  };

  const loadCloserPerf = async () => {
    // Get closers with calls
    const { data: calls } = await supabase
      .from('calls')
      .select('user_id, result, revenue, showed_at')
      .eq('is_simulation', false);

    if (!calls || calls.length === 0) return;

    const byUser: Record<string, typeof calls> = {};
    calls.forEach(c => {
      if (!byUser[c.user_id]) byUser[c.user_id] = [];
      byUser[c.user_id].push(c);
    });

    // Get profiles for names
    const userIds = Object.keys(byUser);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds.slice(0, 50));

    // Get copilot state events per user
    const { data: sessions } = await supabase
      .from('copilot_sessions')
      .select('id, user_id')
      .in('user_id', userIds.slice(0, 50));

    const sessionsByUser: Record<string, string[]> = {};
    (sessions || []).forEach(s => {
      if (!sessionsByUser[s.user_id]) sessionsByUser[s.user_id] = [];
      sessionsByUser[s.user_id].push(s.id);
    });

    const allSessionIds = (sessions || []).map(s => s.id);
    const { data: stateEvents } = allSessionIds.length > 0
      ? await supabase.from('copilot_state_events').select('session_id, state').in('session_id', allSessionIds)
      : { data: [] };

    const eventsBySession: Record<string, typeof stateEvents> = {};
    (stateEvents || []).forEach(e => {
      if (!eventsBySession[e.session_id]) eventsBySession[e.session_id] = [];
      eventsBySession[e.session_id].push(e);
    });

    const stats: CloserStat[] = userIds.slice(0, 20).map(uid => {
      const userCalls = byUser[uid];
      const showed = userCalls.filter(c => c.showed_at).length;
      const won = userCalls.filter(c => c.result === 'closed_won').length;
      const rev = userCalls.filter(c => c.result === 'closed_won').reduce((a, c) => a + (Number(c.revenue) || 0), 0);
      const profile = (profiles || []).find(p => p.id === uid);

      // Count state events for this user
      const userSessions = sessionsByUser[uid] || [];
      let depth = 0, resistance = 0, decision = 0;
      userSessions.forEach(sid => {
        (eventsBySession[sid] || []).forEach(e => {
          if (e.state === 'depth') depth++;
          if (e.state === 'resistance') resistance++;
          if (e.state === 'decision') decision++;
        });
      });

      return {
        userId: uid,
        fullName: profile?.full_name || 'Unknown',
        totalCalls: userCalls.length,
        closeRate: showed > 0 ? Math.round((won / showed) * 100) : 0,
        revenue: rev,
        avgScore: 0,
        depthEvents: depth,
        resistanceEvents: resistance,
        decisionEvents: decision,
      };
    }).sort((a, b) => b.closeRate - a.closeRate);

    setClosers(stats);
  };

  const loadRisk = async () => {
    const { data: sessions } = await supabase
      .from('copilot_sessions')
      .select('outcome, final_risk, final_commitment')
      .neq('outcome', 'pending');

    if (!sessions || sessions.length === 0) return;
    const total = sessions.length;
    const fragile = sessions.filter(s => s.outcome === 'fragile_yes').length;
    const highRisk = sessions.filter(s => s.final_risk === 'high').length;
    const weakCommit = sessions.filter(s => s.final_commitment === 'weak' && s.outcome !== 'lost').length;

    setRisk({
      fragilePercent: Math.round((fragile / total) * 100),
      highRiskPercent: Math.round((highRisk / total) * 100),
      unresolvedObjPercent: Math.round((weakCommit / total) * 100),
      totalSessions: total,
    });
  };

  const loadInsights = async () => {
    const { data } = await supabase
      .from('copilot_pattern_insights')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(10);
    if (data) setInsights(data as PatternInsight[]);
  };

  const handleExtract = async () => {
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-call-patterns');
      if (error) throw error;
      toast({ title: de ? 'Pattern Extraction' : 'Pattern Extraction', description: `${data.insights_generated || 0} Insights` });
      loadInsights();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  };

  const formatK = (n: number) => n >= 1000 ? `€${(n / 1000).toFixed(1)}k` : `€${n}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">Intelligence Dashboard</p>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            {de ? 'Strategisches Steuerzentrum' : 'Strategic Control Center'}
          </h1>
          <p className="text-[12px] text-muted-foreground mt-1">{de ? 'Echtzeit-Einblicke in Sales Performance, Gesprächsmuster und Revenue-Risiken' : 'Real-time insight into sales performance, conversation patterns, and revenue risk'}</p>
        </div>
        <button onClick={handleExtract} disabled={extracting}
          className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
          <RefreshCw className={cn('h-3.5 w-3.5', extracting && 'animate-spin')} />
          {de ? 'Patterns analysieren' : 'Analyze Patterns'}
        </button>
      </div>

      {/* AI Learning truth banner — Not enough data / Collecting signal / Learning active */}
      <AILearningStatusBanner />

      {/* ═══ BLOCK 1: FUNNEL INTELLIGENCE ═══ */}
      <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary/60" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {de ? 'Funnel Intelligence' : 'Funnel Intelligence'}
          </h2>
        </div>

        {funnel ? (
          <>
            {/* Funnel flow */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {[
                { label: 'Leads', value: funnel.totalLeads, icon: Users },
                { label: 'Calls', value: funnel.totalCalls, icon: Activity },
                { label: 'Closes', value: funnel.totalCloses, icon: Zap },
                { label: 'Revenue', value: formatK(funnel.totalRevenue), icon: DollarSign },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center gap-2">
                  <div className="rounded-xl border border-border/30 bg-muted/[0.05] p-4 min-w-[100px] text-center">
                    <step.icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{step.label}</p>
                    <p className="text-xl font-semibold text-foreground mt-1">{step.value}</p>
                  </div>
                  {i < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground/20 shrink-0" />}
                </div>
              ))}
            </div>

            {/* Rates */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/30 bg-muted/[0.03] p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Show Rate</p>
                <p className="text-2xl font-semibold text-foreground">{funnel.showRate}%</p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/[0.03] p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Close Rate</p>
                <p className={cn('text-2xl font-semibold', funnel.closeRate >= 20 ? 'text-green-600' : funnel.closeRate >= 10 ? 'text-amber-600' : 'text-destructive')}>{funnel.closeRate}%</p>
              </div>
            </div>

            {/* Interpretation */}
            <div className="rounded-lg bg-primary/[0.03] border border-primary/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-primary/60 mb-1">{de ? 'Interpretation' : 'Interpretation'}</p>
              <p className="text-[12px] text-foreground leading-relaxed">
                {funnel.closeRate < 15
                  ? (de ? 'Close Rate unter Zielwert. Hauptursache häufig: zu frühe Lösungspräsentation oder ungelöste Einwände.' : 'Close rate below target. Main cause often: premature solution presentation or unresolved objections.')
                  : funnel.showRate < 70
                    ? (de ? 'Show Rate niedrig. Buchungsprozess oder Vorab-Engagement prüfen.' : 'Show rate low. Check booking process or pre-engagement.')
                    : (de ? 'Funnel-Performance im Zielbereich. Fokus auf Gesprächsqualität für weiteres Wachstum.' : 'Funnel performance on target. Focus on conversation quality for further growth.')}
              </p>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground/50 py-4 text-center">{de ? 'Noch keine Funnel-Daten' : 'No funnel data yet'}</p>
        )}
      </div>

      {/* ═══ BLOCK 2: CONVERSATION INTELLIGENCE ═══ */}
      <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary/60" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {de ? 'Conversation Intelligence' : 'Conversation Intelligence'}
          </h2>
        </div>

        {convoIntel ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* State distribution */}
            <div className="space-y-2.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{de ? 'State-Verteilung' : 'State Distribution'}</p>
              {convoIntel.stateDistribution.map(d => (
                <div key={d.state} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-foreground">{STATE_LABELS[d.state]?.[de ? 'de' : 'en'] || d.state}</span>
                    <span className="text-[10px] text-muted-foreground">{d.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${d.pct}%`, backgroundColor: STATE_COLORS[d.state] || 'hsl(var(--primary))' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Typical flow + top signals */}
            <div className="space-y-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-2">{de ? 'Typischer Gesprächsverlauf' : 'Typical Conversation Flow'}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {convoIntel.typicalFlow.map((s, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="rounded-lg px-2 py-1 text-[10px] font-medium text-foreground" style={{ backgroundColor: `${STATE_COLORS[s]}20`, borderLeft: `2px solid ${STATE_COLORS[s]}` }}>
                        {STATE_LABELS[s]?.[de ? 'de' : 'en'] || s}
                      </span>
                      {i < convoIntel.typicalFlow.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/20" />}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-2">{de ? 'Häufigste Signale' : 'Most Common Signals'}</p>
                <div className="space-y-1.5">
                  {convoIntel.topSignals.map(s => (
                    <div key={s.cluster} className="flex items-center justify-between">
                      <span className="text-[11px] text-foreground">{s.cluster}</span>
                      <span className="text-[10px] text-muted-foreground">{s.count}x</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/50 py-4 text-center">{de ? 'Starte Copilot Sessions für Conversation Intelligence' : 'Start Copilot sessions for Conversation Intelligence'}</p>
        )}
      </div>

      {/* ═══ BLOCK 3: CLOSER PERFORMANCE ═══ */}
      <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary/60" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {de ? 'Closer Performance' : 'Closer Performance'}
          </h2>
        </div>

        {closers.length > 0 ? (
          <div className="space-y-3">
            {closers.slice(0, 10).map((c, i) => (
              <div key={c.userId} className="rounded-xl border border-border/30 bg-muted/[0.02] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{i + 1}</span>
                    <span className="text-[13px] font-semibold text-foreground">{c.fullName}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{c.totalCalls} Calls</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Close Rate</p>
                    <p className={cn('text-[16px] font-semibold', c.closeRate >= 20 ? 'text-green-600' : c.closeRate >= 10 ? 'text-amber-600' : 'text-destructive')}>{c.closeRate}%</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Revenue</p>
                    <p className="text-[16px] font-semibold text-foreground">{formatK(c.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{de ? 'Tiefe Events' : 'Depth Events'}</p>
                    <p className="text-[16px] font-semibold text-foreground">{c.depthEvents}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{de ? 'Resistance' : 'Resistance'}</p>
                    <p className="text-[16px] font-semibold text-foreground">{c.resistanceEvents}</p>
                  </div>
                </div>

                {/* Insight */}
                {c.depthEvents > 0 && c.resistanceEvents > c.depthEvents && (
                  <div className="mt-2 rounded-lg bg-amber-500/[0.05] border border-amber-500/10 p-2">
                    <p className="text-[10px] text-amber-700">
                      {de ? '⚠ Mehr Widerstand als Tiefe — möglicherweise zu frühe Lösungspräsentation' : '⚠ More resistance than depth — possibly presenting solutions too early'}
                    </p>
                  </div>
                )}
                {c.depthEvents > c.resistanceEvents && c.closeRate < 15 && (
                  <div className="mt-2 rounded-lg bg-primary/[0.04] border border-primary/10 p-2">
                    <p className="text-[10px] text-primary">
                      {de ? '💡 Erzeugt Tiefe, verliert aber in der Decision-Phase — Entscheidungsführung stärken' : '💡 Creates depth but loses in decision phase — strengthen decision guidance'}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/50 py-4 text-center">{de ? 'Noch keine Closer-Daten verfügbar' : 'No closer data available yet'}</p>
        )}
      </div>

      {/* ═══ BLOCK 4: RISK & REVENUE SIGNALS ═══ */}
      <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive/60" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {de ? 'Risk & Revenue Signals' : 'Risk & Revenue Signals'}
          </h2>
        </div>

        {risk ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/30 p-4">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{de ? 'Fragile Commitments' : 'Fragile Commitments'}</p>
                <p className={cn('text-2xl font-semibold', risk.fragilePercent > 25 ? 'text-destructive' : risk.fragilePercent > 10 ? 'text-amber-600' : 'text-green-600')}>{risk.fragilePercent}%</p>
              </div>
              <div className="rounded-xl border border-border/30 p-4">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{de ? 'High-Risk Calls' : 'High-Risk Calls'}</p>
                <p className={cn('text-2xl font-semibold', risk.highRiskPercent > 30 ? 'text-destructive' : 'text-amber-600')}>{risk.highRiskPercent}%</p>
              </div>
              <div className="rounded-xl border border-border/30 p-4">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{de ? 'Schwaches Commitment' : 'Weak Commitment'}</p>
                <p className={cn('text-2xl font-semibold', risk.unresolvedObjPercent > 30 ? 'text-destructive' : 'text-amber-600')}>{risk.unresolvedObjPercent}%</p>
              </div>
            </div>

            {/* Risk interpretation */}
            {risk.fragilePercent > 20 && (
              <div className="rounded-lg bg-destructive/[0.04] border border-destructive/10 p-3">
                <p className="text-[10px] text-destructive font-semibold mb-1">{de ? 'WARNUNG' : 'WARNING'}</p>
                <p className="text-[12px] text-foreground">
                  {de
                    ? `${risk.fragilePercent}% der Zusagen zeigen fragile Signale. Hohes Storno-Risiko in der aktuellen Kohorte.`
                    : `${risk.fragilePercent}% of commitments show fragile signals. High cancellation risk in current cohort.`}
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground/50 py-4 text-center">{de ? 'Tagge Copilot Session-Outcomes für Risk-Analyse' : 'Tag Copilot session outcomes for risk analysis'}</p>
        )}
      </div>

      {/* ═══ PATTERN INSIGHTS ═══ */}
      {insights.length > 0 && (
        <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary/60" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              {de ? 'Pattern Insights' : 'Pattern Insights'}
            </h2>
          </div>

          <div className="space-y-3">
            {insights.map(ins => (
              <div key={ins.id} className="rounded-xl border border-border/30 bg-muted/[0.02] p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {ins.insight_type === 'winning_pattern' && <TrendingUp className="h-3.5 w-3.5 text-green-600" />}
                  {ins.insight_type === 'losing_pattern' && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                  {ins.insight_type === 'fragile_predictor' && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                  {ins.insight_type === 'risk_indicator' && <Shield className="h-3.5 w-3.5 text-destructive" />}
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{ins.insight_type.replace('_', ' ')}</span>
                  <span className="ml-auto text-[9px] text-muted-foreground">{Math.round(ins.confidence_score * 100)}%</span>
                </div>
                <p className="text-[13px] text-foreground leading-relaxed">{ins.pattern_description}</p>
                <div className="rounded-lg bg-primary/[0.03] border border-primary/10 p-2.5">
                  <p className="text-[10px] text-primary/60 uppercase tracking-wider mb-0.5">{de ? 'Empfehlung' : 'Recommendation'}</p>
                  <p className="text-[12px] text-foreground">{ins.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ SLA + PROFIT CENTER ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SlaCompliancePanel />
        <ProfitCenterPanel />
      </div>
    </div>
  );
}
