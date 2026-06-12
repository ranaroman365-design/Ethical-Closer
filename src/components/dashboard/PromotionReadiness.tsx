import { useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { CAREER_LEVELS, getLevelForStage, getKpisForLevel, KPI_THRESHOLDS, getKpiStatus, KPI_DEFINITIONS } from '@/lib/kpi-config';
import PromotionBlockers from '@/components/dashboard/PromotionBlockers';

interface Props {
  stage: string;
  overallProgress: number;
  kpiValues: Record<string, number>;
}

export default function PromotionReadiness({ stage, overallProgress, kpiValues }: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const level = getLevelForStage(stage);
  const thresholds = KPI_THRESHOLDS[level] ?? {};
  const kpiKeys = Object.keys(thresholds);

  const { greenCount, missingKpiList } = useMemo(() => {
    let gc = 0;
    const missing: { key: string; label: string; current: number; target: number; suffix: string }[] = [];
    for (const k of kpiKeys) {
      const status = getKpiStatus(k as any, kpiValues[k] ?? 0, level);
      if (status === 'green') {
        gc++;
      } else {
        const def = KPI_DEFINITIONS.find(d => d.key === k);
        const th = thresholds[k as keyof typeof thresholds];
        const target = def?.invert ? (th as any)?.max : (th as any)?.min;
        if (def && target !== undefined) {
          missing.push({ key: k, label: def.label, current: kpiValues[k] ?? 0, target, suffix: def.suffix });
        }
      }
    }
    return { greenCount: gc, missingKpiList: missing };
  }, [kpiKeys, kpiValues, level, thresholds]);

  const kpiCompletion = kpiKeys.length > 0 ? Math.round((greenCount / kpiKeys.length) * 100) : 0;
  const combinedProgress = Math.round(overallProgress * 0.3 + kpiCompletion * 0.7);
  const nextLevel = CAREER_LEVELS.find(c => c.level === level + 1);
  const nextLevelTitle = nextLevel ? (lang === 'de' ? nextLevel.title : nextLevel.titleEn) : '';

  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (combinedProgress / 100) * circumference;

  return (
    <div className="mb-8 rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start">
        <div className="shrink-0 relative">
          <svg width="140" height="140" viewBox="0 0 140 140" className="transform -rotate-90">
            <circle cx="70" cy="70" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
            <circle
              cx="70" cy="70" r={radius} fill="none"
              stroke="hsl(var(--primary))" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-sans text-3xl font-bold tracking-tight text-foreground">{combinedProgress}</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
              {tl('% bereit', '% ready')}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
              {tl('Beförderungsstatus', 'Promotion Readiness')}
            </p>
            <p className="font-serif text-xl font-semibold text-foreground sm:text-2xl">
              {combinedProgress >= 90
                ? tl('Kurz vor dem nächsten Karriereschritt', 'Close to your next career step')
                : combinedProgress >= 70
                  ? tl('Solider Fortschritt — weiter so', 'Solid progress — keep going')
                  : tl('Im Aufbau — Fokus halten', 'Building up — stay focused')}
            </p>
            {nextLevel && (
              <p className="mt-1 text-sm text-muted-foreground">
                {tl('Nächster Schritt:', 'Next step:')} <span className="font-medium text-foreground">{nextLevelTitle}</span>
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>{tl('Lernfortschritt', 'Learning Progress')}</span>
                <span className="font-medium text-foreground">{overallProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${overallProgress}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>{tl('KPI-Erfüllung', 'KPI Fulfillment')}</span>
                <span className="font-medium text-foreground">{kpiCompletion}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${kpiCompletion}%` }} />
              </div>
            </div>
          </div>

          {missingKpiList.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">
                {tl('Fehlende Anforderungen', 'Missing Requirements')}
              </p>
              <div className="flex flex-wrap gap-2">
                {missingKpiList.slice(0, 4).map(m => {
                  const def = KPI_DEFINITIONS.find(d => d.key === m.key);
                  return (
                    <span key={m.key} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px]">
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className="font-semibold text-foreground">{m.current}{m.suffix}</span>
                      <span className="text-muted-foreground/50">/ {def?.invert ? '≤' : '≥'}{m.target}{m.suffix}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <PromotionBlockers />
        </div>
      </div>
    </div>
  );
}
