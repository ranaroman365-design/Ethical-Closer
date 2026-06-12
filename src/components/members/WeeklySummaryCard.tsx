import { useMemo, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useKpis } from '@/hooks/useKpis';
import { useAcademyData } from '@/hooks/useAcademyData';
import { formatK } from '@/lib/utils';
import { getLevelForStage } from '@/lib/kpi-config';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react';

export default function WeeklySummaryCard() {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { overallProgress } = useAcademyData();
  const [open, setOpen] = useState(false);

  const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
  const level = getLevelForStage(stage);

  // Detect if we're in the first 2 days of the week (Mon/Tue) — show weekly reset
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const showReset = dayOfWeek === 1 || dayOfWeek === 2;

  const nextFocus = useMemo(() => {
    if ((kpis?.show_rate ?? 0) < 70) return tl('Show Rate verbessern', 'Improve show rate');
    if ((kpis?.follow_up_rate ?? 0) < 90) return tl('Follow-ups konsequent durchführen', 'Execute follow-ups consistently');
    if (overallProgress < 100) return tl('Nächstes Modul abschließen', 'Complete next module');
    return tl('Performance halten', 'Maintain performance');
  }, [kpis, overallProgress, lang]);

  if (!showReset) return null;

  // L1-L3: show commission only. L4+: show revenue.
  const revenueLabel = level >= 4 ? tl('Revenue', 'Revenue') : tl('Provision', 'Commission');
  const revenueValue = level >= 4
    ? formatK(kpis?.revenue_closed ?? 0, '€')
    : formatK((kpis as any)?.commission_earned ?? 0, '€');

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2.5">
          <Calendar className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">
            {tl('Deine Woche', 'Your Week')}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border/40 bg-background p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tl('Calls', 'Calls')}</p>
              <p className="text-xl font-bold text-foreground">{kpis?.calls_per_week ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-background p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tl('Show Rate', 'Show Rate')}</p>
              <p className="text-xl font-bold text-foreground">{Math.min(kpis?.show_rate ?? 0, 100)}%</p>
            </div>
            <div className="rounded-lg border border-border/40 bg-background p-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{revenueLabel}</p>
              <p className="text-xl font-bold text-foreground">{revenueValue}</p>
            </div>
          </div>

          <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-1">
              {tl('Fokus diese Woche', 'Focus this week')}
            </p>
            <p className="text-sm font-medium text-foreground">{nextFocus}</p>
          </div>
        </div>
      )}
    </div>
  );
}
