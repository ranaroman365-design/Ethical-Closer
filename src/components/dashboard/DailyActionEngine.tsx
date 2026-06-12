import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useKpis } from '@/hooks/useKpis';
import { useAcademyData } from '@/hooks/useAcademyData';
import { useAuth } from '@/hooks/useAuth';
import { getLevelForStage, getKpiStatus, KPI_DEFINITIONS, KPI_THRESHOLDS, isPlacementReady } from '@/lib/kpi-config';
import { ArrowRight, Zap } from 'lucide-react';

/**
 * KPI → specific page routing map.
 * Routes users to the most relevant training for their weakest KPI.
 */
const KPI_ACTION_MAP: Record<string, { route: string; hintDe: string; hintEn: string }> = {
  show_rate: {
    route: '/members/objection-handling',
    hintDe: 'Einwandbehandlung trainieren',
    hintEn: 'Train objection handling',
  },
  closing_rate: {
    route: '/members/closer-framework',
    hintDe: 'Closer-Framework vertiefen',
    hintEn: 'Review closer framework',
  },
  follow_up_rate: {
    route: '/members/pool',
    hintDe: 'Leads nachfassen',
    hintEn: 'Follow up your leads',
  },
  crm_hygiene_score: {
    route: '/members/pool',
    hintDe: 'CRM-Einträge pflegen',
    hintEn: 'Clean up CRM entries',
  },
  response_time: {
    route: '/members/pool',
    hintDe: 'Leads schneller kontaktieren',
    hintEn: 'Respond to leads faster',
  },
  storno_rate: {
    route: '/members/closing-questions',
    hintDe: 'Closing-Fragen überprüfen',
    hintEn: 'Review closing questions',
  },
  qualification_accuracy: {
    route: '/members/setter-workspace',
    hintDe: 'Qualifikation verbessern',
    hintEn: 'Improve qualification',
  },
  handover_rate: {
    route: '/members/setter-workspace',
    hintDe: 'Übergaberate steigern',
    hintEn: 'Improve handover rate',
  },
  revenue_closed: {
    route: '/members/closer-workspace',
    hintDe: 'Umsatz steigern',
    hintEn: 'Increase revenue',
  },
};

/**
 * Daily Action Engine — resolves the single highest-value action for the user.
 * Routes to specific, relevant pages instead of generic academy links.
 */
export default function DailyActionEngine() {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { overallProgress } = useAcademyData();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const stage = (profile as any)?.business_stage || 'opener';
  const level = getLevelForStage(stage);

  const action = useMemo(() => {
    const thresholds = KPI_THRESHOLDS[level] ?? {};
    const kpiKeys = Object.keys(thresholds);
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

    // 0. Onboarding incomplete → Start Here
    if (overallProgress === 0 && level <= 2) {
      return {
        title: tl('Onboarding starten', 'Start onboarding'),
        reason: tl('Beginne mit den Grundlagen', 'Start with the basics'),
        link: '/members/start',
      };
    }

    // 1. Find red KPIs — prioritize highest-leverage (most impact on progression)
    const redKpis: { key: string; gap: number }[] = [];
    for (const k of kpiKeys) {
      const status = getKpiStatus(k as any, kpiValues[k] ?? 0, level);
      if (status === 'red') {
        const def = KPI_DEFINITIONS.find(d => d.key === k);
        const th = thresholds[k as keyof typeof thresholds];
        const target = def?.invert ? (th as any)?.max : (th as any)?.min;
        const gap = def?.invert
          ? (kpiValues[k] ?? 0) - (target ?? 0)
          : (target ?? 0) - (kpiValues[k] ?? 0);
        redKpis.push({ key: k, gap: Math.abs(gap) });
      }
    }

    if (redKpis.length > 0) {
      // Pick the KPI with smallest gap (most achievable improvement)
      redKpis.sort((a, b) => a.gap - b.gap);
      const bestKpi = redKpis[0];
      const def = KPI_DEFINITIONS.find(d => d.key === bestKpi.key);
      const mapping = KPI_ACTION_MAP[bestKpi.key];
      const th = thresholds[bestKpi.key as keyof typeof thresholds];
      const target = def?.invert ? (th as any)?.max : (th as any)?.min;

      return {
        title: mapping
          ? tl(mapping.hintDe, mapping.hintEn)
          : tl(`${def?.label} verbessern`, `Improve ${def?.label}`),
        reason: tl(
          `${def?.label}: ${kpiValues[bestKpi.key]}${def?.suffix} → Ziel: ${def?.invert ? '≤' : '≥'}${target}${def?.suffix}`,
          `${def?.label}: ${kpiValues[bestKpi.key]}${def?.suffix} → Target: ${def?.invert ? '≤' : '≥'}${target}${def?.suffix}`
        ),
        link: mapping?.route || '/members/academy',
      };
    }

    // 2. Placement readiness check for L3+
    if (level >= 3) {
      const placementResult = isPlacementReady(kpiValues);
      if (!placementResult.ready) {
        const firstMissing = placementResult.checks.find(c => !c.met);
        return {
          title: tl('Placement-Bereitschaft erhöhen', 'Increase placement readiness'),
          reason: firstMissing
            ? tl(`${firstMissing.label}: ${firstMissing.current} → ${firstMissing.target}`, `${firstMissing.label}: ${firstMissing.current} → ${firstMissing.target}`)
            : tl('Noch nicht placement-bereit', 'Not yet placement-ready'),
          link: '/members/placement',
        };
      }
    }

    // 3. Certification check for L3+
    if (level >= 3) {
      return {
        title: tl('Zertifizierung abschließen', 'Complete certification'),
        reason: tl('Dein Weg zur Platzierung', 'Your path to placement'),
        link: '/members/certification',
      };
    }

    // 4. Academy incomplete
    if (overallProgress < 100) {
      return {
        title: tl('Nächstes Modul abschließen', 'Complete next module'),
        reason: tl(`Academy: ${overallProgress}% abgeschlossen`, `Academy: ${overallProgress}% complete`),
        link: '/members/academy',
      };
    }

    // 5. Practice
    if ((kpis?.calls_handled ?? 0) < 5) {
      return {
        title: tl('Simulator-Session starten', 'Start simulator session'),
        reason: tl('Praxis festigt deine Fähigkeiten', 'Practice solidifies your skills'),
        link: '/members/practice',
      };
    }

    // 6. All good
    return {
      title: tl('Karriereweg anschauen', 'View career path'),
      reason: tl('Alle Ziele erreicht – nächstes Level planen', 'All targets met – plan next level'),
      link: '/members/path',
    };
  }, [kpis, overallProgress, level, lang]);

  return (
    <Link
      to={action.link}
      className="group flex items-center gap-4 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-transparent p-4 sm:p-5 transition-all hover:border-primary/25 hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Zap className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-0.5">
          {tl('Deine #1 Aktion heute', 'Your #1 action today')}
        </p>
        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
          {action.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">{action.reason}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
    </Link>
  );
}
