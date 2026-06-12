import { useAuth } from '@/hooks/useAuth';
import { useKpis } from '@/hooks/useKpis';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Shield, CheckCircle2, Coins } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useMemo } from 'react';
import {
  getKpisForLevel,
  getKpiStatus,
  getLevelForStage,
  isPlacementReady,
  KpiDefinition,
  KPI_THRESHOLDS,
  KPI_DEFINITIONS,
  COMMISSION_RATES,
} from '@/lib/kpi-config';
import { normalizeBusinessStage } from '@/lib/stage-utils';

const STATUS_COLORS = {
  green: 'text-success border-success/20 bg-success-muted',
  yellow: 'text-warning border-warning/20 bg-warning-muted',
  red: 'text-danger border-danger/20 bg-danger-muted',
  neutral: 'text-muted-foreground border-border/30 bg-muted/30',
};

const STATUS_PROGRESS_COLORS = {
  green: 'bg-success',
  yellow: 'bg-warning',
  red: 'bg-danger',
  neutral: 'bg-muted-foreground',
};

/** Cap percentage KPIs at 100% — safety layer against bad data */
function clampRate(value: number, format?: string): number {
  if (format === 'percent') return Math.min(Math.max(value, 0), 100);
  return value;
}

/** Derive 4-state feedback for microcopy */
type FeedbackState = 'below' | 'approaching' | 'on_target' | 'above';

function getStateMicrocopy(state: FeedbackState, lang: string): string {
  const lines: Record<FeedbackState, { de: string; en: string }> = {
    below: { de: 'Unter dem Zielwert.', en: 'Below target.' },
    approaching: { de: 'Nahe am Zielwert.', en: 'Close to target.' },
    on_target: { de: 'Auf Zielniveau.', en: 'On target.' },
    above: { de: 'Über dem Zielwert.', en: 'Above target.' },
  };
  return lines[state][lang === 'de' ? 'de' : 'en'];
}

function deriveFeedbackState(
  key: string,
  value: number,
  level: number,
): FeedbackState {
  const status = getKpiStatus(key as any, value, level);
  const thresholds = KPI_THRESHOLDS[level]?.[key as keyof (typeof KPI_THRESHOLDS)[number]];
  const def = KPI_DEFINITIONS.find(d => d.key === key);
  if (!thresholds || !def) return 'on_target';

  if (status === 'green') {
    const target = def.invert ? (thresholds as any).max : (thresholds as any).min;
    if (target === undefined) return 'on_target';
    const overshoot = def.invert
      ? (target - value) / target
      : (value - target) / target;
    return overshoot > 0.1 ? 'above' : 'on_target';
  }
  if (status === 'yellow') return 'approaching';
  return 'below';
}

function formatKpiValue(key: string, value: number, format?: string): string {
  const clamped = clampRate(value, format);
  if (format === 'currency' || key.includes('revenue') || key === 'commission_earned') {
    if (clamped >= 1000) return `${(clamped / 1000).toFixed(1)}k`;
    return `${clamped.toFixed(0)}`;
  }
  if (typeof clamped === 'number' && !Number.isInteger(clamped)) {
    return clamped.toFixed(1);
  }
  return `${clamped}`;
}

export default function KpiCareerDashboard() {
  const { profile } = useAuth();
  const { kpis, loading } = useKpis();
  const { t, lang } = useLanguage();

  if (loading || !profile) return <Skeleton className="h-64 w-full rounded-xl" />;

  const stage = (profile as any).business_stage ?? 'opener';
  const level = getLevelForStage(stage);
  const visibleKpis = getKpisForLevel(level);
  const thresholds = KPI_THRESHOLDS[level] ?? {};

  const kpiValues: Record<string, number> = {
    closing_rate: kpis?.closing_rate ?? 0,
    show_rate: kpis?.show_rate ?? 0,
    revenue_closed: kpis?.revenue_closed ?? 0,
    commission_earned: (kpis as any)?.commission_earned ?? 0,
    setter_influenced_revenue: (kpis as any)?.setter_influenced_revenue ?? 0,
    storno_rate: kpis?.storno_rate ?? 0,
    response_time: kpis?.response_time ?? 0,
    follow_up_rate: kpis?.follow_up_rate ?? 0,
    crm_hygiene_score: kpis?.crm_hygiene_score ?? 0,
    lead_quality_sensitivity: kpis?.lead_quality_sensitivity ?? 0,
    earnings_per_call: kpis?.earnings_per_call ?? 0,
    qualification_accuracy: kpis?.qualification_accuracy ?? 0,
    handover_rate: (kpis as any)?.handover_rate ?? 0,
    leads_assigned: (kpis as any)?.leads_assigned ?? 0,
  };

  const placement = level >= 4 ? isPlacementReady(kpiValues) : null;

  const revenueKpis = visibleKpis.filter(k => k.category === 'revenue');
  const performanceKpis = visibleKpis.filter(k => k.category === 'performance');
  const executionKpis = visibleKpis.filter(k => k.category === 'execution');
  const advancedKpis = visibleKpis.filter(k => k.category === 'advanced');

  const commissionInfo = COMMISSION_RATES[stage] || COMMISSION_RATES[normalizeBusinessStage(stage)];
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  return (
    <div className="space-y-6">
      {/* Commission Rate Info */}
      {commissionInfo && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Coins className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {tl('Dein Provisionssatz', 'Your Commission Rate')}: {commissionInfo.label}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {tl(
                'Provision wird automatisch aus abgeschlossenen Deals berechnet.',
                'Commission is automatically calculated from closed deals.'
              )}
            </p>
          </div>
        </div>
      )}

      {placement && (
        <div className={`rounded-xl border p-5 ${placement.ready ? 'border-success/20 bg-success-muted' : 'border-border/40 bg-card'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Shield className={`h-4 w-4 ${placement.ready ? 'text-success' : 'text-muted-foreground'}`} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              {t('kpi_placement_ready')}
            </span>
            {placement.ready && (
              <Badge variant="outline" className="border-success/30 text-success text-[10px]">
                <CheckCircle2 className="h-3 w-3 mr-1" /> READY
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {placement.checks.map(c => (
              <div key={c.key} className={`rounded-lg border px-3 py-2 text-center ${c.met ? 'border-success/20 bg-success-muted' : 'border-danger/20 bg-danger-muted'}`}>
                <p className="text-[9px] text-muted-foreground">{c.label}</p>
                <p className={`text-xs font-bold ${c.met ? 'text-success' : 'text-danger'}`}>
                  {c.current} / {c.target}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {revenueKpis.length > 0 && (
        <KpiSection title={tl('Umsatz & Provision', 'Revenue & Commission')} kpis={revenueKpis} values={kpiValues} level={level} thresholds={thresholds} targetLabel={tl('Ziel', 'Target')} lang={lang} highlight />
      )}
      <KpiSection title={tl('Performance', 'Performance')} kpis={performanceKpis} values={kpiValues} level={level} thresholds={thresholds} targetLabel={tl('Ziel', 'Target')} lang={lang} />
      <KpiSection title={tl('Ausführung', 'Execution')} kpis={executionKpis} values={kpiValues} level={level} thresholds={thresholds} targetLabel={tl('Ziel', 'Target')} lang={lang} />
      {advancedKpis.length > 0 && (
        <KpiSection title={tl('Erweitert', 'Advanced')} kpis={advancedKpis} values={kpiValues} level={level} thresholds={thresholds} targetLabel={tl('Ziel', 'Target')} lang={lang} />
      )}
    </div>
  );
}

function KpiSection({
  title,
  kpis,
  values,
  level,
  thresholds,
  targetLabel,
  lang,
  highlight,
}: {
  title: string;
  kpis: KpiDefinition[];
  values: Record<string, number>;
  level: number;
  thresholds: Record<string, any>;
  targetLabel: string;
  lang: string;
  highlight?: boolean;
}) {
  if (kpis.length === 0) return null;

  return (
    <div className={`rounded-xl border p-6 ${highlight ? 'border-primary/20 bg-primary/[0.02]' : 'border-border/60 bg-card'}`}>
      <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {kpis.map(kpi => {
          const rawValue = values[kpi.key] ?? 0;
          const value = clampRate(rawValue, kpi.format);
          const isAnomalous = kpi.format === 'percent' && rawValue > 100;
          const status = isAnomalous ? 'neutral' as const : getKpiStatus(kpi.key as any, value, level);
          const t = thresholds[kpi.key];
          const target = kpi.invert ? t?.max : t?.min;
          const progress = target ? Math.min((kpi.invert ? (target / Math.max(value, 0.1)) : (value / target)) * 100, 100) : 0;
          const isRevenue = kpi.category === 'revenue';
          const displayValue = formatKpiValue(kpi.key, value, kpi.format);
          const hasNoData = value === 0;
          const emptyLabel = isRevenue
            ? 'Noch keine attribuierten Deals.'
            : kpi.key === 'leads_assigned'
              ? 'Noch keine Leads zugewiesen.'
              : kpi.key === 'qualification_accuracy' || kpi.key === 'handover_rate'
                ? 'Noch nicht genug Daten.'
                : null;

          return (
            <div key={kpi.key} className={`rounded-lg border p-4 ${isRevenue && value > 0 ? 'border-primary/20 bg-primary/[0.04]' : STATUS_COLORS[status]}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider">{kpi.label}</p>
                {!isRevenue && !hasNoData && <span className={`h-2 w-2 rounded-full ${STATUS_PROGRESS_COLORS[status]}`} />}
                {hasNoData && !isRevenue && (
                  <span className="text-[9px] text-muted-foreground/60 italic">ausstehend</span>
                )}
              </div>
              <div className="flex items-end justify-between">
                <p className={`text-xl font-bold tracking-tight ${isRevenue && value > 0 ? 'text-primary' : hasNoData ? 'text-muted-foreground/40' : ''}`}>
                  {hasNoData ? '—' : displayValue}
                  {!hasNoData && <span className="text-xs font-normal text-muted-foreground ml-0.5">{kpi.suffix}</span>}
                </p>
                {target !== undefined && (
                  <p className="text-[10px] text-muted-foreground">
                    {targetLabel}: {kpi.invert ? '≤' : '≥'}{target}{kpi.suffix}
                  </p>
                )}
              </div>
              {target !== undefined && !hasNoData && (
                <div className="mt-3 h-1.5 w-full rounded-full bg-background/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${STATUS_PROGRESS_COLORS[status]}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              {/* Microcopy status line */}
              {target !== undefined && !hasNoData && !isAnomalous && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  {getStateMicrocopy(deriveFeedbackState(kpi.key, value, level), lang === 'de' ? 'de' : 'en')}
                </p>
              )}
              {isAnomalous && (
                <p className="mt-2 text-[10px] text-warning italic">
                  Daten werden synchronisiert — KPI temporär eingeschränkt.
                </p>
              )}
              {hasNoData && emptyLabel && (
                <p className="mt-2 text-[10px] text-muted-foreground italic">
                  {emptyLabel}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
