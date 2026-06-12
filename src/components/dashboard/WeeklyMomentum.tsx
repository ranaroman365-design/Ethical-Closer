import { formatK } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { getUserLevel } from '@/components/members/CareerPath';
import { BarChart3, CheckCircle2, TrendingUp } from 'lucide-react';

interface Props {
  stage: string;
  kpis: any;
}

export default function WeeklyMomentum({ stage, kpis }: Props) {
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);
  const userLevel = getUserLevel(stage);
  const clampedShowRate = Math.min(Math.max(kpis?.show_rate ?? 0, 0), 100);

  const cards = [
    { label: tl('Calls/Woche', 'Calls/Week'), value: kpis?.calls_per_week ?? 0, icon: BarChart3, show: true },
    { label: tl('Show Rate', 'Show Rate'), value: `${clampedShowRate}%`, icon: CheckCircle2, show: true },
    { label: tl('Provision', 'Commission'), value: formatK(kpis?.commission_earned ?? 0, '€'), icon: TrendingUp, show: userLevel < 4 },
    { label: tl('Revenue', 'Revenue'), value: formatK(kpis?.revenue_closed ?? 0, '€'), icon: TrendingUp, show: userLevel >= 4 },
  ].filter(c => c.show);

  return (
    <div className="mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
        {tl('Wöchentliches Momentum', 'Weekly Momentum')}
      </p>
      <div className={`grid gap-4 ${userLevel <= 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {cards.map(card => (
          <div key={card.label} className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <card.icon className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-xl font-bold tracking-tight text-foreground">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
