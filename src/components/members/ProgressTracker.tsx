import { useMemo, useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useKpis } from '@/hooks/useKpis';
import { useAcademyData } from '@/hooks/useAcademyData';
import { supabase } from '@/integrations/supabase/client';
import {
  getLevelForStage,
  getKpisForLevel,
  getKpiStatus,
  KPI_THRESHOLDS,
  CAREER_LEVELS,
} from '@/lib/kpi-config';
import { CheckCircle2 } from 'lucide-react';

export default function ProgressTracker() {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { overallProgress } = useAcademyData();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const stage = (profile as any)?.business_stage || 'opener';
  const level = getLevelForStage(stage);
  const thresholds = KPI_THRESHOLDS[level] ?? {};
  const kpiKeys = Object.keys(thresholds);

  const kpiValues: Record<string, number> = useMemo(() => ({
    closing_rate: kpis?.closing_rate ?? 0,
    show_rate: kpis?.show_rate ?? 0,
    revenue_closed: kpis?.revenue_closed ?? 0,
    storno_rate: kpis?.storno_rate ?? 0,
    response_time: kpis?.response_time ?? 0,
    follow_up_rate: kpis?.follow_up_rate ?? 0,
    crm_hygiene_score: kpis?.crm_hygiene_score ?? 0,
    qualification_accuracy: kpis?.qualification_accuracy ?? 0,
    handover_rate: (kpis as any)?.handover_rate ?? 0,
  }), [kpis]);

  // KPI completion
  const greenCount = useMemo(() => {
    let gc = 0;
    for (const k of kpiKeys) {
      if (getKpiStatus(k as any, kpiValues[k] ?? 0, level) === 'green') gc++;
    }
    return gc;
  }, [kpiKeys, kpiValues, level]);

  const kpiCompletion = kpiKeys.length > 0 ? Math.round((greenCount / kpiKeys.length) * 100) : 0;
  const combinedProgress = Math.round(overallProgress * 0.3 + kpiCompletion * 0.7);

  const nextLevel = CAREER_LEVELS.find(c => c.level === level + 1);
  const nextLevelTitle = nextLevel ? (lang === 'de' ? nextLevel.title : nextLevel.titleEn) : null;

  const academyComplete = overallProgress >= 100;
  const kpiComplete = kpiCompletion >= 100;
  const levelReady = academyComplete && kpiComplete;

  // Consistency tracker — count consecutive days with activity
  const [consistencyDays, setConsistencyDays] = useState(0);
  useEffect(() => {
    if (!profile) return;
    const uid = (profile as any).id;
    // Check recent calls for activity streak
    supabase
      .from('calls')
      .select('created_at')
      .eq('user_id', uid)
      .eq('is_simulation', false)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const days = new Set(
          data.map(c => new Date(c.created_at).toISOString().slice(0, 10))
        );
        // Count consecutive days from today backwards
        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 30; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          if (days.has(key)) {
            streak++;
          } else if (i > 0) {
            break;
          }
        }
        setConsistencyDays(streak);
      });
  }, [profile]);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
      {/* Level Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {tl('Fortschritt zum nächsten Level', 'Progress to next level')}
          </p>
          <span className="text-sm font-bold text-foreground">{combinedProgress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
            style={{ width: `${combinedProgress}%` }}
          />
        </div>
        {nextLevelTitle && (
          <p className="mt-2 text-xs text-muted-foreground">
            {tl('Nächster Schritt:', 'Next step:')} <span className="font-medium text-foreground">{nextLevelTitle}</span>
          </p>
        )}
      </div>

      {/* Completion States */}
      <div className="space-y-2.5">
        <CompletionRow
          label={tl('Academy abgeschlossen', 'Academy completed')}
          done={academyComplete}
          detail={academyComplete ? undefined : `${overallProgress}%`}
        />
        <CompletionRow
          label={tl('KPI-Anforderungen erreicht', 'KPI requirements met')}
          done={kpiComplete}
          detail={kpiComplete ? undefined : `${greenCount}/${kpiKeys.length}`}
        />
      </div>

      {/* Level Ready State */}
      {levelReady && nextLevelTitle && (
        <div className="rounded-lg border border-success/20 bg-success-muted px-4 py-3">
          <p className="text-sm text-foreground">
            {tl(
              'Alle Anforderungen erfüllt. Bereit für den nächsten Karriereschritt.',
              'All requirements met. Ready for the next career step.'
            )}
          </p>
        </div>
      )}

      {/* Consistency */}
      {consistencyDays > 0 && (
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {tl('Konsistenz', 'Consistency')}
          </p>
          <span className="text-sm font-medium text-foreground">
            {consistencyDays} {tl('Tage', 'days')}
          </span>
        </div>
      )}
    </div>
  );
}

function CompletionRow({ label, done, detail }: { label: string; done: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/20 shrink-0" />
      )}
      <span className={`text-sm ${done ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
      {detail && (
        <span className="text-xs text-muted-foreground ml-auto">{detail}</span>
      )}
    </div>
  );
}