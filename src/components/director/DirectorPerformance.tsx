import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/i18n/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';
import { formatK } from '@/lib/utils';
import { BarChart3, Brain, ShieldAlert, Target } from 'lucide-react';
import BottleneckTeamPanel from '@/components/admin/performance/BottleneckTeamPanel';
import { useBottleneckDiagnosis } from '@/hooks/useBottleneckDiagnosis';

interface TeamKpis {
  avgClosingRate: number;
  avgAwarenessScore: number;
  avgPressureIndex: number;
  avgDecisionScore: number;
  avgEthicalAlignment: number;
  totalRevenue: number;
}

export default function DirectorPerformance() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const [kpis, setKpis] = useState<TeamKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamEmails, setTeamEmails] = useState<string[]>([]);
  const { data: bottleneckDx } = useBottleneckDiagnosis(30);

  useEffect(() => {
    if (!user) return;

    const fetch = async () => {
      // Get team closer IDs
      const { data: assignments } = await supabase
        .from('director_team_assignments')
        .select('closer_id')
        .eq('director_id', user.id)
        .eq('status', 'active');

      const closerIds = [...new Set(((assignments as any[]) ?? []).map(a => a.closer_id))];

      if (closerIds.length === 0) {
        setKpis({ avgClosingRate: 0, avgAwarenessScore: 0, avgPressureIndex: 0, avgDecisionScore: 0, avgEthicalAlignment: 0, totalRevenue: 0 });
        setLoading(false);
        return;
      }

      const [{ data: memberKpis }, { data: emails }] = await Promise.all([
        supabase
          .from('member_kpis')
          .select('closing_rate, awareness_score, pressure_index, decision_score, ethical_alignment_score, revenue_closed')
          .in('user_id', closerIds),
        supabase
          .from('profiles')
          .select('email')
          .in('id', closerIds),
      ]);
      setTeamEmails(((emails as any[]) ?? []).map(e => e.email).filter(Boolean));

      const k = (memberKpis as any[]) ?? [];
      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      setKpis({
        avgClosingRate: Math.round(avg(k.map(x => x.closing_rate || 0)) * 10) / 10,
        avgAwarenessScore: Math.round(avg(k.map(x => x.awareness_score || 0)) * 10) / 10,
        avgPressureIndex: Math.round(avg(k.map(x => x.pressure_index || 0)) * 10) / 10,
        avgDecisionScore: Math.round(avg(k.map(x => x.decision_score || 0)) * 10) / 10,
        avgEthicalAlignment: Math.round(avg(k.map(x => x.ethical_alignment_score || 0)) * 10) / 10,
        totalRevenue: k.reduce((s, x) => s + (x.revenue_closed || 0), 0),
      });
      setLoading(false);
    };

    fetch();
  }, [user]);

  if (loading) return <Skeleton className="h-48" />;
  if (!kpis) return null;

  const metrics = [
    { label: t('Ø Abschlussquote', 'Avg Close Rate'), value: `${kpis.avgClosingRate}%`, icon: BarChart3, good: kpis.avgClosingRate >= 20 },
    { label: t('Ø Awareness Score', 'Avg Awareness Score'), value: `${kpis.avgAwarenessScore}%`, icon: Brain, good: kpis.avgAwarenessScore >= 70 },
    { label: t('Ø Pressure Index', 'Avg Pressure Index'), value: `${kpis.avgPressureIndex}%`, icon: ShieldAlert, good: kpis.avgPressureIndex <= 30 },
    { label: t('Ø Decision Score', 'Avg Decision Score'), value: `${kpis.avgDecisionScore}%`, icon: Target, good: kpis.avgDecisionScore >= 70 },
    { label: t('Ø Ethical Alignment', 'Avg Ethical Alignment'), value: `${kpis.avgEthicalAlignment}%`, icon: Brain, good: kpis.avgEthicalAlignment >= 75 },
  ];

  return (
    <div className="space-y-6">
      {/* Revenue Banner */}
      <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
          {t('Gesamtumsatz Team', 'Total Team Revenue')}
        </p>
        <p className="text-4xl font-semibold text-foreground tracking-tight">
          {formatK(kpis.totalRevenue, '€')}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <m.icon className="h-4 w-4 text-muted-foreground/50" />
              <span className={`h-2 w-2 rounded-full ${m.good ? 'bg-success' : 'bg-warning'}`} />
            </div>
            <p className="text-2xl font-semibold text-foreground">{m.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Quality Callout */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {t('Qualitätskontrolle', 'Quality Control')}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t(
            'Closer mit einem Pressure Index über 30% oder einem Awareness Score unter 60% werden automatisch aus dem aktiven Matching-Pool entfernt, bis ihre Werte sich verbessern.',
            'Closers with a Pressure Index above 30% or an Awareness Score below 60% are automatically removed from the active matching pool until their metrics improve.'
          )}
        </p>
      </div>
    </div>
  );
}
