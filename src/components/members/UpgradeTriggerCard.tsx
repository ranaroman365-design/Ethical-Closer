import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useKpis } from '@/hooks/useKpis';
import { useLanguage } from '@/i18n/LanguageContext';
import { getLevelForStage, getKpiStatus, getKpisForLevel, KPI_THRESHOLDS } from '@/lib/kpi-config';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import { ArrowRight, Rocket } from 'lucide-react';

interface UpgradeSuggestion {
  title: string;
  description: string;
  cta: string;
  to: string;
  product: string;
}

export default function UpgradeTriggerCard() {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const stage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
  const level = getLevelForStage(stage);

  const suggestion = useMemo((): UpgradeSuggestion | null => {
    if (!kpis) return null;

    const kpiValues: Record<string, number> = {
      closing_rate: kpis.closing_rate ?? 0,
      show_rate: kpis.show_rate ?? 0,
      follow_up_rate: kpis.follow_up_rate ?? 0,
    };

    // Count red/yellow KPIs
    const defs = getKpisForLevel(level);
    let redCount = 0;
    for (const def of defs) {
      const status = getKpiStatus(def.key, kpiValues[def.key] ?? 0, level);
      if (status === 'red') redCount++;
    }

    // L3+ with struggling close rate → Advanced Lab
    if (level >= 3 && level < 6 && (kpis.closing_rate ?? 0) < 20) {
      return {
        title: tl('Close Rate steigern', 'Increase Close Rate'),
        description: tl(
          'Das Advanced Lab hilft dir, komplexe Einwände zu meistern und deine Abschlussrate zu erhöhen.',
          'The Advanced Lab helps you master complex objections and increase your close rate.'
        ),
        cta: tl('Advanced Lab entdecken', 'Explore Advanced Lab'),
        to: '/members/advanced-lab',
        product: 'advanced_lab',
      };
    }

    // L4+ approaching next level → Scale Lab
    if (level >= 4 && level < 7) {
      const thresholds = KPI_THRESHOLDS[level + 1];
      if (thresholds) {
        const closeTarget = (thresholds.closing_rate as any)?.min ?? 0;
        if ((kpis.closing_rate ?? 0) >= closeTarget * 0.8) {
          return {
            title: tl(`Du bist nah an Level ${level + 1}`, `You're close to Level ${level + 1}`),
            description: tl(
              'Der Scale Lab beschleunigt deine Entwicklung zum nächsten Karriereschritt.',
              'Scale Lab accelerates your development to the next career step.'
            ),
            cta: tl('Scale Lab öffnen', 'Open Scale Lab'),
            to: '/members/scale-hub',
            product: 'scale_lab',
          };
        }
      }
    }

    // L5+ with strong performance → Quarterly Crossing
    if (level >= 5 && (kpis.closing_rate ?? 0) >= 25 && redCount === 0) {
      return {
        title: tl('Netzwerk erweitern', 'Expand Your Network'),
        description: tl(
          'Quarterly Crossing verbindet dich mit Top-Performern und exklusiven Events.',
          'Quarterly Crossing connects you with top performers and exclusive events.'
        ),
        cta: tl('Quarterly Crossing ansehen', 'View Quarterly Crossing'),
        to: '/members/quarterly-crossing',
        product: 'quarterly_crossing',
      };
    }

    // L2-L3 stagnating → Mentor Space
    if (level >= 2 && level <= 3 && redCount >= 2) {
      return {
        title: tl('Unterstützung holen', 'Get Support'),
        description: tl(
          'Ein Mentor kann dir helfen, deine aktuellen Engpässe zu überwinden.',
          'A mentor can help you overcome your current bottlenecks.'
        ),
        cta: tl('Mentor Space öffnen', 'Open Mentor Space'),
        to: '/members/mentor-space',
        product: 'mentor',
      };
    }

    return null;
  }, [kpis, level, lang]);

  if (!suggestion) return null;

  return (
    <div className="rounded-2xl border border-accent/15 bg-gradient-to-br from-accent/[0.03] to-transparent p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 mt-0.5">
          <Rocket className="h-4.5 w-4.5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground mb-1">{suggestion.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            {suggestion.description}
          </p>
          <Link
            to={suggestion.to}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/10 transition-colors"
          >
            {suggestion.cta}
            <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  );
}
