import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  Activity, TrendingUp, TrendingDown, AlertTriangle, Brain,
  BarChart3, Zap, RefreshCw, Shield, Eye, Target, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SessionStats {
  total: number;
  won: number;
  lost: number;
  noDecision: number;
  fragileYes: number;
  pending: number;
  avgDuration: number;
}

interface StateFrequency {
  state: string;
  count: number;
  percentage: number;
}

interface SignalFrequency {
  cluster: string;
  count: number;
}

interface PatternInsight {
  id: string;
  insight_type: string;
  pattern_description: string;
  correlation_outcome: string;
  confidence_score: number;
  state_sequence: string[];
  signal_indicators: string[];
  recommendation: string;
  sample_size: number;
  generated_at: string;
}

const STATE_COLORS: Record<string, string> = {
  surface: 'hsl(220,9%,46%)',
  exploration: 'hsl(217,91%,60%)',
  depth: 'hsl(12,76%,61%)',
  resistance: 'hsl(39,41%,55%)',
  confusion: 'hsl(263,70%,50%)',
  decision: 'hsl(152,60%,40%)',
};

const STATE_LABELS: Record<string, string> = {
  surface: 'Surface',
  exploration: 'Exploration',
  depth: 'Emotional Depth',
  resistance: 'Resistance',
  confusion: 'Confusion',
  decision: 'Decision',
};

const INSIGHT_TYPE_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  winning_pattern: { label: 'Winning Pattern', color: 'text-green-600', icon: TrendingUp },
  losing_pattern: { label: 'Losing Pattern', color: 'text-destructive', icon: TrendingDown },
  fragile_predictor: { label: 'Fragile Predictor', color: 'text-amber-600', icon: AlertTriangle },
  risk_indicator: { label: 'Risk Indicator', color: 'text-destructive', icon: Shield },
};

export default function FlywheelDashboard() {
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [stateFreqs, setStateFreqs] = useState<StateFrequency[]>([]);
  const [signalFreqs, setSignalFreqs] = useState<SignalFrequency[]>([]);
  const [insights, setInsights] = useState<PatternInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Sessions stats
      const { data: sessions } = await supabase
        .from('copilot_sessions')
        .select('outcome, duration_seconds');

      if (sessions) {
        const s: SessionStats = {
          total: sessions.length,
          won: sessions.filter(x => x.outcome === 'won').length,
          lost: sessions.filter(x => x.outcome === 'lost').length,
          noDecision: sessions.filter(x => x.outcome === 'no_decision').length,
          fragileYes: sessions.filter(x => x.outcome === 'fragile_yes').length,
          pending: sessions.filter(x => x.outcome === 'pending').length,
          avgDuration: sessions.length > 0
            ? Math.round(sessions.reduce((a, x) => a + (x.duration_seconds || 0), 0) / sessions.length)
            : 0,
        };
        setStats(s);
      }

      // State frequencies
      const { data: stateEvents } = await supabase
        .from('copilot_state_events')
        .select('state');

      if (stateEvents && stateEvents.length > 0) {
        const counts: Record<string, number> = {};
        stateEvents.forEach(e => { counts[e.state] = (counts[e.state] || 0) + 1; });
        const total = stateEvents.length;
        const freqs = Object.entries(counts)
          .map(([state, count]) => ({ state, count, percentage: Math.round((count / total) * 100) }))
          .sort((a, b) => b.count - a.count);
        setStateFreqs(freqs);
      }

      // Signal frequencies
      const { data: signals } = await supabase
        .from('copilot_signal_log')
        .select('signal_cluster, occurrence_count');

      if (signals && signals.length > 0) {
        const counts: Record<string, number> = {};
        signals.forEach(s => { counts[s.signal_cluster] = (counts[s.signal_cluster] || 0) + s.occurrence_count; });
        const freqs = Object.entries(counts)
          .map(([cluster, count]) => ({ cluster, count }))
          .sort((a, b) => b.count - a.count);
        setSignalFreqs(freqs);
      }

      // Pattern insights
      const { data: patternData } = await supabase
        .from('copilot_pattern_insights')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(20);

      if (patternData) {
        setInsights(patternData as PatternInsight[]);
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const runExtraction = async () => {
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-call-patterns');
      if (error) throw error;
      toast({ title: 'Pattern Extraction', description: `${data.insights_generated || 0} Insights generiert aus ${data.sessions_analyzed || 0} Sessions.` });
      loadData();
    } catch (e: any) {
      toast({ title: 'Fehler', description: e.message || 'Extraction fehlgeschlagen', variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-xl font-semibold text-foreground">Data Flywheel</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">Internal Intelligence · Copilot Improvement Loop</p>
        </div>
        <button onClick={runExtraction} disabled={extracting}
          className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50">
          <RefreshCw className={cn('h-3.5 w-3.5', extracting && 'animate-spin')} />
          {extracting ? 'Extrahiere...' : 'Patterns extrahieren'}
        </button>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Sessions', value: stats.total, icon: Activity },
            { label: 'Won', value: stats.won, icon: TrendingUp, color: 'text-green-600' },
            { label: 'Lost', value: stats.lost, icon: TrendingDown, color: 'text-destructive' },
            { label: 'Fragile', value: stats.fragileYes, icon: AlertTriangle, color: 'text-amber-600' },
            { label: 'Ø Dauer', value: formatTime(stats.avgDuration), icon: Clock },
          ].map((kpi, i) => (
            <div key={i} className="rounded-xl border border-border/40 bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className={cn('h-4 w-4 text-muted-foreground', kpi.color)} />
                <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{kpi.label}</span>
              </div>
              <p className={cn('text-2xl font-semibold text-foreground', kpi.color)}>{kpi.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* State Distribution */}
        <div className="rounded-xl border border-border/40 bg-card p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4">State-Verteilung (alle Sessions)</p>
          {stateFreqs.length > 0 ? (
            <div className="space-y-2.5">
              {stateFreqs.map(f => (
                <div key={f.state} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-foreground">{STATE_LABELS[f.state] || f.state}</span>
                    <span className="text-[11px] text-muted-foreground">{f.percentage}% ({f.count})</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/20 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${f.percentage}%`, backgroundColor: STATE_COLORS[f.state] || 'hsl(var(--primary))' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/50 py-6 text-center">Noch keine State-Daten vorhanden</p>
          )}
        </div>

        {/* Signal Frequency */}
        <div className="rounded-xl border border-border/40 bg-card p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4">Signal-Häufigkeit</p>
          {signalFreqs.length > 0 ? (
            <div className="space-y-2">
              {signalFreqs.slice(0, 8).map(f => {
                const maxCount = signalFreqs[0]?.count || 1;
                return (
                  <div key={f.cluster} className="flex items-center gap-3">
                    <span className="text-[11px] font-medium text-foreground min-w-[120px]">{f.cluster}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted/20 overflow-hidden">
                      <div className="h-full rounded-full bg-primary/40 transition-all duration-500"
                        style={{ width: `${(f.count / maxCount) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground min-w-[30px] text-right">{f.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/50 py-6 text-center">Noch keine Signal-Daten vorhanden</p>
          )}
        </div>
      </div>

      {/* Pattern Insights */}
      <div className="rounded-xl border border-border/40 bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary/60" />
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Extrahierte Patterns</p>
          </div>
          {insights.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Zuletzt: {new Date(insights[0].generated_at).toLocaleDateString('de-DE')}
            </span>
          )}
        </div>

        {insights.length > 0 ? (
          <div className="space-y-3">
            {insights.map(insight => {
              const meta = INSIGHT_TYPE_LABELS[insight.insight_type] || { label: insight.insight_type, color: 'text-muted-foreground', icon: BarChart3 };
              const Icon = meta.icon;
              return (
                <div key={insight.id} className="rounded-lg border border-border/30 bg-muted/[0.04] p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', meta.color)} />
                    <span className={cn('text-[11px] font-bold uppercase tracking-wider', meta.color)}>{meta.label}</span>
                    <span className="ml-auto rounded-full bg-muted/30 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                      {Math.round(insight.confidence_score * 100)}% Konfidenz
                    </span>
                  </div>
                  <p className="text-[13px] text-foreground leading-relaxed">{insight.pattern_description}</p>

                  {insight.state_sequence && insight.state_sequence.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] text-muted-foreground mr-1">States:</span>
                      {insight.state_sequence.map((s, i) => (
                        <span key={i} className="rounded bg-muted/20 px-1.5 py-0.5 text-[9px] font-medium text-foreground"
                          style={{ borderLeft: `2px solid ${STATE_COLORS[s] || 'hsl(var(--primary))'}` }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {insight.signal_indicators && insight.signal_indicators.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[9px] text-muted-foreground mr-1">Signals:</span>
                      {insight.signal_indicators.map((s, i) => (
                        <span key={i} className="rounded bg-primary/[0.06] px-1.5 py-0.5 text-[9px] text-primary/80">{s}</span>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg bg-primary/[0.03] border border-primary/10 p-2.5 mt-1">
                    <p className="text-[10px] uppercase tracking-wider text-primary/50 mb-0.5">Empfehlung</p>
                    <p className="text-[12px] text-foreground">{insight.recommendation}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/15 mx-auto mb-2" />
            <p className="text-[12px] text-muted-foreground">Noch keine Patterns extrahiert</p>
            <p className="text-[11px] text-muted-foreground/50 mt-1">Starte Sessions im Live Copilot und tagge Outcomes</p>
          </div>
        )}
      </div>

      {/* Data Quality */}
      {stats && stats.total > 0 && (
        <div className="rounded-xl border border-border/40 bg-card p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">Datenqualität</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Outcome-Rate</p>
              <p className="text-[16px] font-semibold text-foreground">
                {stats.total > 0 ? Math.round(((stats.total - stats.pending) / stats.total) * 100) : 0}%
              </p>
              <p className="text-[10px] text-muted-foreground/60">{stats.total - stats.pending} von {stats.total} getaggt</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">State Events</p>
              <p className="text-[16px] font-semibold text-foreground">{stateFreqs.reduce((a, f) => a + f.count, 0)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Signal Log</p>
              <p className="text-[16px] font-semibold text-foreground">{signalFreqs.reduce((a, f) => a + f.count, 0)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
