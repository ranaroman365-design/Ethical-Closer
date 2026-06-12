import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useKpis } from '@/hooks/useKpis';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, BarChart3, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface Snapshot {
  week_start: string;
  closing_rate: number;
  calls_per_week: number;
  show_rate: number;
  follow_up_rate: number;
  crm_hygiene_score: number;
  storno_rate: number;
}

const KPI_META: { key: string; label: string; labelEn: string; suffix: string; invert?: boolean }[] = [
  { key: 'closing_rate', label: 'Close Rate', labelEn: 'Close Rate', suffix: '%' },
  { key: 'calls_per_week', label: 'Calls/Woche', labelEn: 'Calls/Week', suffix: '' },
  { key: 'show_rate', label: 'Show Rate', labelEn: 'Show Rate', suffix: '%' },
  { key: 'follow_up_rate', label: 'Follow-Up', labelEn: 'Follow-Up', suffix: '%' },
  { key: 'crm_hygiene_score', label: 'CRM Hygiene', labelEn: 'CRM Hygiene', suffix: '%' },
  { key: 'storno_rate', label: 'Storno Rate', labelEn: 'Chargeback', suffix: '%', invert: true },
];

export default function KpiTrendDashboard() {
  const { user } = useAuth();
  const { kpis, loading: kpiLoading } = useKpis();
  const { lang } = useLanguage();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTrend, setShowTrend] = useState(false);
  const [range, setRange] = useState<4 | 8 | 12>(8);

  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  useEffect(() => {
    if (!user?.id) return;
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const saveAndLoad = async () => {
      if (kpis) {
        await supabase.from('kpi_snapshots').upsert({
          user_id: user.id,
          week_start: weekStartStr,
          closing_rate: kpis.closing_rate ?? 0,
          calls_per_week: kpis.calls_per_week ?? 0,
          show_rate: kpis.show_rate ?? 0,
          follow_up_rate: kpis.follow_up_rate ?? 0,
          crm_hygiene_score: kpis.crm_hygiene_score ?? 0,
          storno_rate: kpis.storno_rate ?? 0,
          revenue_closed: kpis.revenue_closed ?? 0,
          calls_handled: kpis.calls_handled ?? 0,
        } as any, { onConflict: 'user_id,week_start' } as any);
      }

      const { data } = await supabase
        .from('kpi_snapshots')
        .select('week_start, closing_rate, calls_per_week, show_rate, follow_up_rate, crm_hygiene_score, storno_rate')
        .eq('user_id', user.id)
        .order('week_start', { ascending: false })
        .limit(12);

      setSnapshots((data as Snapshot[]) ?? []);
      setLoading(false);
    };

    if (!kpiLoading) saveAndLoad();
  }, [user?.id, kpis, kpiLoading]);

  const visibleSnapshots = useMemo(() => snapshots.slice(0, range), [snapshots, range]);
  const reversed = useMemo(() => [...visibleSnapshots].reverse(), [visibleSnapshots]);

  const calcTrend = (key: string) => {
    if (reversed.length < 3) return null;
    const values = reversed.map((s, i) => ({ x: i, y: (s as any)[key] ?? 0 }));
    const n = values.length;
    const sumX = values.reduce((a, v) => a + v.x, 0);
    const sumY = values.reduce((a, v) => a + v.y, 0);
    const sumXY = values.reduce((a, v) => a + v.x * v.y, 0);
    const sumX2 = values.reduce((a, v) => a + v.x * v.x, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept, start: intercept, end: slope * (n - 1) + intercept };
  };

  if (loading || kpiLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  const currentWeek = visibleSnapshots[0];
  const lastWeek = visibleSnapshots[1];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          {tl('Wöchentliche Entwicklung', 'Weekly Development')}
        </h3>
        <div className="flex items-center gap-2">
          {/* Range selector */}
          <div className="flex items-center rounded-md border border-border/50 bg-background">
            {([4, 8, 12] as const).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  range === r ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}W
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowTrend(!showTrend)}
            className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showTrend ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {showTrend ? tl('Trend aus', 'Hide Trend') : tl('Trend an', 'Show Trend')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {KPI_META.map(meta => {
          const current = (currentWeek as any)?.[meta.key] ?? (kpis as any)?.[meta.key] ?? 0;
          const previous = (lastWeek as any)?.[meta.key] ?? current;
          const diff = Number((current - previous).toFixed(1));
          const isPositive = meta.invert ? diff < 0 : diff > 0;
          const isNegative = meta.invert ? diff > 0 : diff < 0;
          const trend = showTrend ? calcTrend(meta.key) : null;

          return (
            <div key={meta.key} className="rounded-lg border border-border/40 bg-background p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                {lang === 'de' ? meta.label : meta.labelEn}
              </p>
              <div className="flex items-end justify-between mb-3">
                <p className="text-xl font-bold tracking-tight text-foreground">{current}{meta.suffix}</p>
                {diff !== 0 ? (
                  <div className={`flex items-center gap-0.5 text-[11px] font-medium ${
                    isPositive ? 'text-success' : isNegative ? 'text-danger' : 'text-muted-foreground'
                  }`}>
                    {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {diff > 0 ? '+' : ''}{diff}{meta.suffix}
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <Minus className="h-3 w-3" /> 0
                  </div>
                )}
              </div>

              {/* Sparkline */}
              {reversed.length > 1 && (
                <div className="relative h-10">
                  <div className="flex items-end gap-[2px] h-full">
                    {reversed.map((snap, i) => {
                      const val = (snap as any)[meta.key] ?? 0;
                      const max = Math.max(...visibleSnapshots.map(s => (s as any)[meta.key] ?? 0), 1);
                      const height = Math.max((val / max) * 100, 6);
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-sm transition-all ${
                            i === reversed.length - 1 ? 'bg-primary' : 'bg-muted-foreground/15'
                          }`}
                          style={{ height: `${height}%` }}
                        />
                      );
                    })}
                  </div>
                  {showTrend && trend && reversed.length > 2 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                      <line
                        x1="0"
                        y1={`${100 - Math.max(0, Math.min(100, (trend.start / Math.max(...visibleSnapshots.map(s => (s as any)[meta.key] ?? 0), 1)) * 100))}%`}
                        x2="100%"
                        y2={`${100 - Math.max(0, Math.min(100, (trend.end / Math.max(...visibleSnapshots.map(s => (s as any)[meta.key] ?? 0), 1)) * 100))}%`}
                        stroke={trend.slope > 0.1 ? (meta.invert ? 'hsl(var(--danger))' : 'hsl(var(--success))') : trend.slope < -0.1 ? (meta.invert ? 'hsl(var(--success))' : 'hsl(var(--danger))') : 'hsl(var(--muted-foreground))'}
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        opacity="0.7"
                      />
                    </svg>
                  )}
                </div>
              )}

              {/* Trend interpretation */}
              {showTrend && trend && (
                <p className={`mt-2 text-[9px] font-medium ${
                  trend.slope > 0.1 ? (meta.invert ? 'text-danger' : 'text-success') :
                  trend.slope < -0.1 ? (meta.invert ? 'text-success' : 'text-danger') :
                  'text-muted-foreground'
                }`}>
                  {trend.slope > 0.1
                    ? (meta.invert ? tl('↑ Steigend', '↑ Rising') : tl('↑ Aufwärtstrend', '↑ Upward'))
                    : trend.slope < -0.1
                      ? (meta.invert ? tl('↓ Sinkend — positiv', '↓ Declining — good') : tl('↓ Abwärtstrend', '↓ Downward'))
                      : tl('→ Stabil', '→ Stable')}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {visibleSnapshots.length > 1 && (
        <p className="mt-4 text-[10px] text-muted-foreground text-center">
          {visibleSnapshots.length} {tl('Wochen erfasst', 'weeks tracked')} · {tl('Vergleich: aktuelle vs. Vorwoche', 'Current vs. previous week')}
          {showTrend && ` · ${tl('Gestrichelte Linie = Trendrichtung', 'Dashed line = trend direction')}`}
        </p>
      )}
    </div>
  );
}