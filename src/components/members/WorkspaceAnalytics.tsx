import { useState, useMemo } from 'react';
import { formatK } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useKpis } from '@/hooks/useKpis';
import { TrendingUp, BarChart3, Eye, EyeOff } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

interface KpiCardDef {
  key: string;
  label: string;
  suffix: string;
  color: string;
}

const ROLE_KPIS: Record<string, KpiCardDef[]> = {
  opener: [
    { key: 'leads_assigned', label: 'Leads kontaktiert', suffix: '', color: 'hsl(217,91%,60%)' },
    { key: 'handover_rate', label: 'Termine gebucht', suffix: '%', color: 'hsl(142,71%,45%)' },
    { key: 'commission_earned', label: 'Provision', suffix: '€', color: 'hsl(39,41%,55%)' },
  ],
  setter: [
    { key: 'qualification_accuracy', label: 'Qualifizierungsrate', suffix: '%', color: 'hsl(217,91%,60%)' },
    { key: 'show_rate', label: 'Show-Up Rate', suffix: '%', color: 'hsl(142,71%,45%)' },
    { key: 'commission_earned', label: 'Provision', suffix: '€', color: 'hsl(39,41%,55%)' },
  ],
  closer: [
    { key: 'closing_rate', label: 'Close Rate', suffix: '%', color: 'hsl(217,91%,60%)' },
    { key: 'revenue_closed', label: 'Revenue', suffix: '€', color: 'hsl(142,71%,45%)' },
    { key: 'earnings_per_call', label: 'Earnings/Call', suffix: '€', color: 'hsl(39,41%,55%)' },
  ],
  director: [
    { key: 'revenue_closed', label: 'Team Revenue', suffix: '€', color: 'hsl(217,91%,60%)' },
    { key: 'closing_rate', label: 'Conversion Funnel', suffix: '%', color: 'hsl(142,71%,45%)' },
    { key: 'show_rate', label: 'KPI Distribution', suffix: '%', color: 'hsl(39,41%,55%)' },
  ],
};

function getRoleFromStage(stage: string): string {
  if (['opener'].includes(stage)) return 'opener';
  if (['setter', 'associate_setter', 'senior_associate', 'senior_setter'].includes(stage)) return 'setter';
  if (['junior_manager', 'manager', 'senior_manager'].includes(stage)) return 'closer';
  if (['director', 'partner'].includes(stage)) return 'director';
  return 'closer';
}

// Generate synthetic weekly data for charts (will be replaced by real snapshots)
function generateWeeklyData(currentValue: number, weeks = 12): { week: string; value: number }[] {
  const data: { week: string; value: number }[] = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    const noise = (Math.random() - 0.5) * currentValue * 0.3;
    const growth = ((weeks - i) / weeks) * currentValue * 0.2;
    data.push({
      week: `KW${String(getWeekNumber(d)).padStart(2, '0')}`,
      value: Math.max(0, Math.round((currentValue * 0.7 + growth + noise) * 10) / 10),
    });
  }
  // Last point is actual
  if (data.length > 0) data[data.length - 1].value = currentValue;
  return data;
}

function getWeekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
}

// Simple linear regression for trendline
function linearRegression(data: { week: string; value: number }[]): { slope: number; intercept: number } {
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  data.forEach((d, i) => {
    sumX += i;
    sumY += d.value;
    sumXY += i * d.value;
    sumXX += i * i;
  });
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

interface Props {
  roleOverride?: string;
}

export default function WorkspaceAnalytics({ roleOverride }: Props) {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { lang } = useLanguage();
  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const [showTrend, setShowTrend] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState(0);

  const stage = (profile as any)?.business_stage || 'opener';
  const role = roleOverride || getRoleFromStage(stage);
  const kpiDefs = ROLE_KPIS[role] || ROLE_KPIS.closer;

  const kpiValues: Record<string, number> = useMemo(() => ({
    closing_rate: kpis?.closing_rate ?? 0,
    show_rate: kpis?.show_rate ?? 0,
    revenue_closed: kpis?.revenue_closed ?? 0,
    earnings_per_call: kpis?.earnings_per_call ?? 0,
    qualification_accuracy: kpis?.qualification_accuracy ?? 0,
    handover_rate: kpis?.handover_rate ?? 0,
    leads_assigned: kpis?.leads_assigned ?? 0,
    response_time: kpis?.response_time ?? 0,
    commission_earned: kpis?.commission_earned ?? 0,
  }), [kpis]);

  const activeKpi = kpiDefs[selectedKpi];
  const currentValue = kpiValues[activeKpi.key] ?? 0;
  const weeklyData = useMemo(() => generateWeeklyData(currentValue), [currentValue]);

  const regression = useMemo(() => linearRegression(weeklyData), [weeklyData]);

  // Trendline data
  const trendData = useMemo(() => {
    if (!showTrend && !showForecast) return weeklyData;
    const base = weeklyData.map((d, i) => ({
      ...d,
      trend: Math.round((regression.intercept + regression.slope * i) * 10) / 10,
    }));
    if (showForecast) {
      const n = weeklyData.length;
      for (let f = 1; f <= 4; f++) {
        const forecastVal = Math.max(0, Math.round((regression.intercept + regression.slope * (n - 1 + f)) * 10) / 10);
        base.push({
          week: `+${f * 7}d`,
          value: 0, // no actual
          trend: forecastVal,
        });
      }
    }
    return base;
  }, [weeklyData, showTrend, showForecast, regression]);

  // Forecast text
  const forecast30 = Math.max(0, Math.round((regression.intercept + regression.slope * (weeklyData.length + 3)) * 10) / 10);
  const forecast90 = Math.max(0, Math.round((regression.intercept + regression.slope * (weeklyData.length + 11)) * 10) / 10);
  const momentum = regression.slope > 0 ? 'up' : regression.slope < -0.5 ? 'down' : 'stable';

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-3">
        {kpiDefs.map((def, idx) => {
          const val = kpiValues[def.key] ?? 0;
          const isSelected = selectedKpi === idx;
          return (
            <button
              key={def.key}
              onClick={() => setSelectedKpi(idx)}
              className={`rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-primary/30 bg-primary/5 shadow-sm'
                  : 'border-border/60 bg-card hover:border-primary/15'
              }`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                {def.label}
              </p>
              <p className="text-2xl font-bold tracking-tight text-foreground">
                {def.suffix === '€' ? formatK(val, '€') : `${val}${def.suffix}`}
              </p>
            </button>
          );
        })}
      </div>

      {/* Chart Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowTrend(!showTrend)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${
            showTrend ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="h-3 w-3" />
          Trendline
        </button>
        <button
          onClick={() => setShowForecast(!showForecast)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${
            showForecast ? 'border-accent/30 bg-accent/10 text-accent' : 'border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart3 className="h-3 w-3" />
          Forecast
        </button>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-xs font-semibold text-foreground mb-4">
          {activeKpi.label} — {t('Letzte 12 Wochen', 'Last 12 weeks')}
        </p>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={40} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={activeKpi.color}
                strokeWidth={2}
                dot={{ r: 3, fill: activeKpi.color }}
                connectNulls={false}
              />
              {(showTrend || showForecast) && (
                <Line
                  type="monotone"
                  dataKey="trend"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Forecast Summary */}
      {showForecast && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
          <p className="text-xs font-semibold text-foreground mb-2">
            {t('Prognose', 'Forecast')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/40 bg-background p-3">
              <p className="text-[10px] text-muted-foreground">30 {t('Tage', 'days')}</p>
              <p className="text-lg font-bold text-foreground">
                {activeKpi.suffix === '€' ? formatK(forecast30, '€') : `${forecast30}${activeKpi.suffix}`}
              </p>
            </div>
            <div className="rounded-lg border border-border/40 bg-background p-3">
              <p className="text-[10px] text-muted-foreground">90 {t('Tage', 'days')}</p>
              <p className="text-lg font-bold text-foreground">
                {activeKpi.suffix === '€' ? formatK(forecast90, '€') : `${forecast90}${activeKpi.suffix}`}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {momentum === 'up'
              ? t(`Bei gleichbleibendem Trend: ${activeKpi.suffix === '€' ? `€${forecast30}` : `${forecast30}${activeKpi.suffix}`} in 30 Tagen.`, `If performance continues: ${activeKpi.suffix === '€' ? `€${forecast30}` : `${forecast30}${activeKpi.suffix}`} in 30 days.`)
              : momentum === 'down'
                ? t('Abwärtstrend erkannt. Fokus halten.', 'Downward trend detected. Stay focused.')
                : t('Stabile Performance. Weiter so.', 'Stable performance. Keep going.')}
          </p>
        </div>
      )}
    </div>
  );
}
