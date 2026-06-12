import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useKpis } from '@/hooks/useKpis';
import { useAcademyData } from '@/hooks/useAcademyData';
import { useAuth } from '@/hooks/useAuth';
import { getLevelForStage, getKpisForLevel, getKpiStatus, KPI_DEFINITIONS } from '@/lib/kpi-config';
import { Target, ArrowRight, Flame } from 'lucide-react';

interface Props {
  streak?: number;
}

export default function DailyFocusCard({ streak = 0 }: Props) {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { overallProgress } = useAcademyData();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const stage = (profile as any)?.business_stage || 'opener';
  const level = getLevelForStage(stage);

  const focus = useMemo(() => {
    const actions: { text: string; link: string; priority: number }[] = [];

    // Check weakest KPI
    const defs = getKpisForLevel(level);
    const kpiValues: Record<string, number> = {
      closing_rate: kpis?.closing_rate ?? 0,
      show_rate: kpis?.show_rate ?? 0,
      revenue_closed: kpis?.revenue_closed ?? 0,
      follow_up_rate: kpis?.follow_up_rate ?? 0,
      crm_hygiene_score: kpis?.crm_hygiene_score ?? 0,
      response_time: kpis?.response_time ?? 0,
      storno_rate: kpis?.storno_rate ?? 0,
      qualification_accuracy: kpis?.qualification_accuracy ?? 0,
      handover_rate: kpis?.handover_rate ?? 0,
    };

    // Find red KPIs first, then yellow
    for (const def of defs) {
      const status = getKpiStatus(def.key, kpiValues[def.key] ?? 0, level);
      if (status === 'red') {
        actions.push({
          text: tl(`${def.label} verbessern`, `Improve ${def.label}`),
          link: '/members/path',
          priority: 1,
        });
      }
    }

    // Module progress
    if (overallProgress < 100) {
      actions.push({
        text: tl('1 Modul abschließen', 'Complete 1 module'),
        link: '/members/academy',
        priority: overallProgress < 50 ? 2 : 4,
      });
    }

    // No calls recently
    if ((kpis?.calls_handled ?? 0) < 5) {
      actions.push({
        text: tl('2 Calls buchen', 'Book 2 calls'),
        link: '/members/closer-workspace',
        priority: 3,
      });
    }

    // Follow-up
    if ((kpis?.follow_up_rate ?? 0) < 80) {
      actions.push({
        text: tl('3 Leads nachfassen', 'Follow up 3 leads'),
        link: '/members/pool',
        priority: 2,
      });
    }

    // Sort by priority and take top 2
    actions.sort((a, b) => a.priority - b.priority);
    return actions.slice(0, 2);
  }, [kpis, overallProgress, level, lang]);

  if (focus.length === 0) return null;

  return (
    <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.03] to-transparent p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {tl('Dein Fokus heute', 'Your Focus Today')}
            </p>
          </div>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/5 px-2.5 py-1">
            <Flame className="h-3.5 w-3.5 text-warning" />
            <span className="text-xs font-semibold text-warning">
              {streak} {streak === 1 ? 'Tag' : tl('Tage', 'days')}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {focus.map((item, i) => (
          <Link
            key={i}
            to={item.link}
            className="group flex items-center justify-between rounded-xl border border-border/50 bg-card/80 px-4 py-3 transition-all hover:border-primary/20 hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
                {i + 1}
              </span>
              <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {item.text}
              </span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
