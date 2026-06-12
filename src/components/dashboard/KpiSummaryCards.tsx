import { useMemo, useState } from 'react';
import { formatK } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { getUserLevel } from '@/components/members/CareerPath';
import { getLevelForStage, getKpisForLevel, KPI_THRESHOLDS, getKpiStatus } from '@/lib/kpi-config';
import KpiCareerDashboard from '@/components/members/KpiCareerDashboard';
import KpiTrendDashboard from '@/components/members/KpiTrendDashboard';
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  stage: string;
  kpiValues: Record<string, number>;
  maxCards?: number;
}

export default function KpiSummaryCards({ stage, kpiValues, maxCards }: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);
  const [kpiOpen, setKpiOpen] = useState(false);

  const userLevel = getUserLevel(stage);
  const level = getLevelForStage(stage);
  const thresholds = KPI_THRESHOLDS[level] ?? {};

  const summaryKpis = useMemo(() => {
    let defs = getKpisForLevel(level).slice(0, maxCards ?? 4);
    if (userLevel <= 3) {
      defs = defs.filter(d => d.key !== 'revenue_closed');
    }
    return defs.map(def => {
      const value = kpiValues[def.key] ?? 0;
      const th = thresholds[def.key as keyof typeof thresholds];
      const target = def.invert ? (th as any)?.max : (th as any)?.min;
      const status = getKpiStatus(def.key, value, level);
      const pct = target ? Math.min((def.invert ? (target / Math.max(value, 0.01)) : (value / target)) * 100, 100) : 0;
      return { ...def, value, target, status, pct };
    });
  }, [level, kpiValues, thresholds, userLevel]);

  return (
    <>
      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {tl('Kern-KPIs', 'Core KPIs')}
        </p>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          {summaryKpis.map(kpi => {
            const hasNoData = kpi.value === 0;
            return (
              <button
                key={kpi.key}
                onClick={() => setKpiOpen(true)}
                className="group rounded-xl border border-border/60 bg-card p-4 text-left transition-all hover:border-primary/20 hover:shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
                  {!hasNoData && (
                    <span className={`h-2 w-2 rounded-full ${
                      kpi.status === 'green' ? 'bg-success' : kpi.status === 'yellow' ? 'bg-warning' : kpi.status === 'red' ? 'bg-danger' : 'bg-muted-foreground/30'
                    }`} />
                  )}
                </div>
                <p className={`text-2xl font-bold tracking-tight ${hasNoData ? 'text-muted-foreground/40' : 'text-foreground'}`}>
                  {hasNoData ? '—' : (kpi.key === 'revenue_closed' || kpi.key === 'commission_earned') ? formatK(kpi.value, '€') : kpi.value}
                  {!hasNoData && !(kpi.key === 'revenue_closed' || kpi.key === 'commission_earned') && <span className="text-sm font-normal text-muted-foreground ml-0.5">{kpi.suffix}</span>}
                </p>
                {kpi.target !== undefined && !hasNoData && (
                  <div className="mt-3">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          kpi.status === 'green' ? 'bg-success' : kpi.status === 'yellow' ? 'bg-warning' : 'bg-danger'
                        }`}
                        style={{ width: `${kpi.pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {tl('Ziel', 'Target')}: {kpi.invert ? '≤' : '≥'}{kpi.target}{kpi.suffix}
                    </p>
                  </div>
                )}
                {hasNoData && (
                  <p className="mt-2 text-[10px] text-muted-foreground italic">{tl('Daten ausstehend', 'Data pending')}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Deep Dive */}
      <div className="mb-8">
        <button
          onClick={() => setKpiOpen(!kpiOpen)}
          className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-card px-6 py-4 text-left transition-all hover:border-primary/15"
        >
          <div className="flex items-center gap-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">{tl('Performance Analyse', 'Performance Analysis')}</p>
              <p className="text-[11px] text-muted-foreground">{tl('Wöchentliche Trends, Trendlinien & Detailansicht', 'Weekly trends, trendlines & detailed view')}</p>
            </div>
          </div>
          {kpiOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {kpiOpen && (
          <div className="mt-4 space-y-6">
            <KpiCareerDashboard />
            <KpiTrendDashboard />
          </div>
        )}
      </div>
    </>
  );
}
