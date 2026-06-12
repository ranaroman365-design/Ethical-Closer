import { useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useKpis } from '@/hooks/useKpis';
import { getUserLevel } from '@/components/members/CareerPath';
import { getLevelForStage, KPI_THRESHOLDS, getKpiStatus, KPI_DEFINITIONS } from '@/lib/kpi-config';
import { AlertTriangle, TrendingDown, BookOpen, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  stage: string;
}

interface Diagnostic {
  kpi: string;
  label: string;
  current: number;
  target: number;
  suffix: string;
  reason: string;
  action: string;
  actionLink: string;
  icon: typeof AlertTriangle;
}

export default function KpiDiagnostics({ stage }: Props) {
  const { lang } = useLanguage();
  const { kpis } = useKpis();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const level = getLevelForStage(stage);
  const thresholds = KPI_THRESHOLDS[level] ?? {};
  const userLevel = getUserLevel(stage);

  const diagnostics = useMemo(() => {
    const result: Diagnostic[] = [];
    const kpiValues: Record<string, number> = {
      closing_rate: kpis?.closing_rate ?? 0,
      show_rate: kpis?.show_rate ?? 0,
      storno_rate: kpis?.storno_rate ?? 0,
      follow_up_rate: kpis?.follow_up_rate ?? 0,
      crm_hygiene_score: kpis?.crm_hygiene_score ?? 0,
      response_time: kpis?.response_time ?? 0,
    };

    for (const k of Object.keys(thresholds)) {
      const status = getKpiStatus(k as any, kpiValues[k] ?? 0, level);
      if (status === 'red') {
        const def = KPI_DEFINITIONS.find(d => d.key === k);
        const th = thresholds[k as keyof typeof thresholds];
        const target = def?.invert ? (th as any)?.max : (th as any)?.min;
        if (!def || target === undefined) continue;

        let reason = '';
        let action = '';
        let actionLink = '/members/academy';
        let icon: typeof AlertTriangle = TrendingDown;

        switch (k) {
          case 'closing_rate':
            reason = tl('Deine Abschlussquote liegt unter dem Minimum.', 'Your close rate is below the threshold.');
            action = tl('Closer Framework & Objection Handling trainieren', 'Train Closer Framework & Objection Handling');
            actionLink = '/members/closer-framework';
            icon = Target;
            break;
          case 'show_rate':
            reason = tl('Zu viele No-Shows. Leads erscheinen nicht zum Call.', 'Too many no-shows. Leads aren\'t showing up.');
            action = tl('Follow-Up Strategie überprüfen', 'Review follow-up strategy');
            actionLink = '/members/call-framework';
            break;
          case 'storno_rate':
            reason = tl('Hohe Stornorate: Kunden ziehen nach dem Kauf zurück.', 'High cancellation rate: clients are pulling back.');
            action = tl('Ethical Framework & Post-Close Check', 'Ethical Framework & Post-Close Check');
            actionLink = '/members/ethical-framework';
            icon = AlertTriangle;
            break;
          case 'follow_up_rate':
            reason = tl('Follow-Ups werden nicht konsequent durchgeführt.', 'Follow-ups aren\'t being executed consistently.');
            action = tl('CRM-Disziplin verbessern', 'Improve CRM discipline');
            actionLink = '/members/tools';
            icon = BookOpen;
            break;
          case 'response_time':
            reason = tl('Reaktionszeit zu langsam. Leads kühlen ab.', 'Response time too slow. Leads are cooling off.');
            action = tl('Speed-to-Lead Strategie umsetzen', 'Implement speed-to-lead strategy');
            actionLink = '/members/setter-workspace';
            break;
          default:
            reason = tl(`${def.label} liegt unter dem Zielwert.`, `${def.label} is below the target.`);
            action = tl('Academy Modul absolvieren', 'Complete Academy module');
        }

        result.push({
          kpi: k,
          label: def.label,
          current: kpiValues[k] ?? 0,
          target,
          suffix: def.suffix,
          reason,
          action,
          actionLink,
          icon,
        });
      }
    }
    return result;
  }, [kpis, level, thresholds, lang]);

  if (diagnostics.length === 0) return null;

  return (
    <div className="mb-8 rounded-xl border border-warning/30 bg-warning/5 p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <p className="text-sm font-semibold text-foreground">
          {tl('Warum du feststeckst', 'Why you\'re stuck')}
        </p>
      </div>
      <div className="space-y-3">
        {diagnostics.slice(0, 3).map(d => (
          <div key={d.kpi} className="rounded-lg border border-border/40 bg-card p-4">
            <div className="flex items-start gap-3">
              <d.icon className="h-4 w-4 mt-0.5 text-warning shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-foreground">{d.label}</span>
                  <span className="text-[10px] text-destructive font-medium">
                    {d.current}{d.suffix} → {tl('Ziel', 'Target')}: {d.target}{d.suffix}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-2">{d.reason}</p>
                <Link
                  to={d.actionLink}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  {d.action} →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
