import { useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useKpis } from '@/hooks/useKpis';
import { useAuth } from '@/hooks/useAuth';
import { getLevelForStage, isPlacementReady } from '@/lib/kpi-config';
import { Briefcase, CheckCircle2, Circle } from 'lucide-react';

/**
 * Placement Readiness Block — visible from L3+.
 * Shows exact % readiness, missing requirements, and next milestone.
 */
export default function PlacementReadinessBlock() {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const stage = (profile as any)?.business_stage || 'opener';
  const level = getLevelForStage(stage);

  const result = useMemo(() => {
    const kpiValues: Record<string, number> = {
      closing_rate: kpis?.closing_rate ?? 0,
      show_rate: kpis?.show_rate ?? 0,
      revenue_closed: kpis?.revenue_closed ?? 0,
      storno_rate: kpis?.storno_rate ?? 0,
      response_time: kpis?.response_time ?? 0,
      follow_up_rate: kpis?.follow_up_rate ?? 0,
      crm_hygiene_score: kpis?.crm_hygiene_score ?? 0,
    };
    return isPlacementReady(kpiValues);
  }, [kpis]);

  // Only show for L3+
  if (level < 3) return null;

  const metCount = result.checks.filter(c => c.met).length;
  const totalCount = result.checks.length;
  const readinessPercent = Math.round((metCount / totalCount) * 100);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            {tl('Placement-Bereitschaft', 'Placement Readiness')}
          </p>
        </div>
        <span className={`text-lg font-bold ${result.ready ? 'text-green-500' : 'text-primary'}`}>
          {readinessPercent}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted mb-4">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${readinessPercent}%` }}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {result.checks.map((check) => (
          <div key={check.key} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {check.met ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              )}
              <span className={check.met ? 'text-muted-foreground' : 'text-foreground font-medium'}>
                {check.label}
              </span>
            </div>
            <span className={check.met ? 'text-muted-foreground' : 'text-foreground'}>
              {check.current}{check.key.includes('rate') || check.key.includes('score') ? '%' : check.key.includes('time') ? 'min' : '€'} / {check.target}{check.key.includes('rate') || check.key.includes('score') ? '%' : check.key.includes('time') ? 'min' : '€'}
            </span>
          </div>
        ))}
      </div>

      {result.ready && (
        <p className="text-xs text-green-600 font-medium mt-3">
          ✓ {tl('Du bist placement-bereit!', 'You are placement-ready!')}
        </p>
      )}
    </div>
  );
}
