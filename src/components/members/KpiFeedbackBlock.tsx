import { useMemo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useKpis } from '@/hooks/useKpis';
import {
  getLevelForStage,
  getKpisForLevel,
  getKpiStatus,
  KPI_THRESHOLDS,
  KPI_DEFINITIONS,
  KpiKey,
} from '@/lib/kpi-config';
import { Target } from 'lucide-react';

type FeedbackState = 'below' | 'approaching' | 'on_target' | 'above';

interface KpiFeedback {
  key: string;
  label: string;
  value: number;
  target: number;
  suffix: string;
  state: FeedbackState;
  statusLine: string;
  nextAction: string;
  invert?: boolean;
}

/** Map traffic-light status + proximity into 4-state feedback */
function deriveFeedbackState(
  key: KpiKey,
  value: number,
  level: number,
): FeedbackState {
  const status = getKpiStatus(key, value, level);
  const thresholds = KPI_THRESHOLDS[level]?.[key];
  const def = KPI_DEFINITIONS.find(d => d.key === key);
  if (!thresholds || !def) return 'on_target';

  if (status === 'green') {
    const target = def.invert ? thresholds.max : thresholds.min;
    if (target === undefined) return 'on_target';
    const overshoot = def.invert
      ? (target - value) / target
      : (value - target) / target;
    return overshoot > 0.1 ? 'above' : 'on_target';
  }
  if (status === 'yellow') return 'approaching';
  return 'below';
}

const STATUS_LINES: Record<FeedbackState, { de: string; en: string }> = {
  below: { de: 'Unter dem Zielwert.', en: 'You are below target.' },
  approaching: { de: 'Nahe am Zielwert.', en: 'You are close to target.' },
  on_target: { de: 'Auf Zielniveau.', en: 'You are on target.' },
  above: { de: 'Über dem Zielwert.', en: 'You are above target.' },
};

/** KPI-specific actionable guidance (calm, directive) */
const NEXT_ACTIONS: Record<string, Record<FeedbackState, { de: string; en: string }>> = {
  show_rate: {
    below: { de: 'Bestätigungsnachrichten früher senden.', en: 'Send confirmation messages earlier.' },
    approaching: { de: 'Erinnerungen optimieren.', en: 'Refine your reminders.' },
    on_target: { de: 'Konsistenz beibehalten.', en: 'Maintain consistency.' },
    above: { de: 'Prozess funktioniert.', en: 'Your process is working.' },
  },
  closing_rate: {
    below: { de: 'Einwandbehandlung überprüfen.', en: 'Review objection handling.' },
    approaching: { de: 'Entscheidungsklarheit verbessern.', en: 'Improve decision clarity.' },
    on_target: { de: 'Struktur beibehalten.', en: 'Maintain structure.' },
    above: { de: 'Gespräche konvertieren.', en: 'Your conversations convert.' },
  },
  revenue_closed: {
    below: { de: 'Call-Volumen und Close Rate prüfen.', en: 'Review call volume and close rate.' },
    approaching: { de: 'Fokus auf höhere Deal-Werte.', en: 'Focus on higher deal values.' },
    on_target: { de: 'Umsatzniveau stabil.', en: 'Revenue level is stable.' },
    above: { de: 'Umsatzentwicklung positiv.', en: 'Revenue trend is positive.' },
  },
  storno_rate: {
    below: { de: 'Storno-Rate kontrolliert.', en: 'Cancellation rate is controlled.' },
    approaching: { de: 'Kundenqualifikation prüfen.', en: 'Review customer qualification.' },
    on_target: { de: 'Storno-Rate stabil.', en: 'Cancellation rate is stable.' },
    above: { de: 'Qualifikationsgespräche vertiefen.', en: 'Deepen qualification conversations.' },
  },
  response_time: {
    below: { de: 'Reaktionszeit optimal.', en: 'Response time is optimal.' },
    approaching: { de: 'Benachrichtigungen priorisieren.', en: 'Prioritize notifications.' },
    on_target: { de: 'Reaktionszeit stabil.', en: 'Response time is stable.' },
    above: { de: 'Leads schneller kontaktieren.', en: 'Contact leads faster.' },
  },
  follow_up_rate: {
    below: { de: 'Follow-Up-Prozess systematisieren.', en: 'Systematize follow-up process.' },
    approaching: { de: 'Verbleibende Follow-Ups abschließen.', en: 'Complete remaining follow-ups.' },
    on_target: { de: 'Follow-Up-Rate konstant.', en: 'Follow-up rate is consistent.' },
    above: { de: 'Follow-Up-Prozess funktioniert.', en: 'Follow-up process is working.' },
  },
  crm_hygiene_score: {
    below: { de: 'CRM-Einträge aktualisieren.', en: 'Update CRM entries.' },
    approaching: { de: 'Fehlende Felder ergänzen.', en: 'Complete missing fields.' },
    on_target: { de: 'CRM-Qualität stabil.', en: 'CRM quality is stable.' },
    above: { de: 'Datenqualität gesichert.', en: 'Data quality is secured.' },
  },
  qualification_accuracy: {
    below: { de: 'Qualifikationsfragen überprüfen.', en: 'Review qualification questions.' },
    approaching: { de: 'Qualifikationskriterien schärfen.', en: 'Sharpen qualification criteria.' },
    on_target: { de: 'Qualifikation konsistent.', en: 'Qualification is consistent.' },
    above: { de: 'Qualifikationsprozess stark.', en: 'Qualification process is strong.' },
  },
  handover_rate: {
    below: { de: 'Übergabe-Prozess optimieren.', en: 'Optimize handover process.' },
    approaching: { de: 'Übergabe-Timing prüfen.', en: 'Review handover timing.' },
    on_target: { de: 'Übergaberate stabil.', en: 'Handover rate is stable.' },
    above: { de: 'Übergabe-Prozess funktioniert.', en: 'Handover process is working.' },
  },
};

const DEFAULT_ACTIONS: Record<FeedbackState, { de: string; en: string }> = {
  below: { de: 'Fokusbereich identifizieren.', en: 'Identify area of focus.' },
  approaching: { de: 'Aktuelle Strategie beibehalten.', en: 'Maintain current strategy.' },
  on_target: { de: 'Konsistenz beibehalten.', en: 'Maintain consistency.' },
  above: { de: 'Standard halten.', en: 'Hold the standard.' },
};

export default function KpiFeedbackBlock() {
  const { profile } = useAuth();
  const { kpis } = useKpis();
  const { lang } = useLanguage();
  const tl = (de: string, en: string) => (lang === 'de' ? de : en);

  const stage = (profile as any)?.business_stage || 'opener';
  const level = getLevelForStage(stage);
  const thresholds = KPI_THRESHOLDS[level] ?? {};

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

  const feedbacks = useMemo(() => {
    const kpiDefs = getKpisForLevel(level);
    const results: KpiFeedback[] = [];

    for (const def of kpiDefs) {
      const th = thresholds[def.key as keyof typeof thresholds];
      if (!th) continue;
      const value = kpiValues[def.key] ?? 0;
      if (value === 0 && def.category !== 'performance') continue; // skip empty

      const state = deriveFeedbackState(def.key, value, level);
      const target = def.invert ? (th as any)?.max : (th as any)?.min;
      const actions = NEXT_ACTIONS[def.key] ?? DEFAULT_ACTIONS;
      const action = actions[state] ?? DEFAULT_ACTIONS[state];

      results.push({
        key: def.key,
        label: def.label,
        value,
        target: target ?? 0,
        suffix: def.suffix,
        state,
        statusLine: STATUS_LINES[state][lang],
        nextAction: action[lang],
        invert: def.invert,
      });
    }

    // Sort: below first, then approaching, then on_target, then above
    const order: Record<FeedbackState, number> = { below: 0, approaching: 1, on_target: 2, above: 3 };
    results.sort((a, b) => order[a.state] - order[b.state]);
    return results;
  }, [level, thresholds, kpiValues, lang]);

  // Get top 2 actionable items (below or approaching)
  const actionableItems = feedbacks.filter(f => f.state === 'below' || f.state === 'approaching').slice(0, 3);
  const onTargetCount = feedbacks.filter(f => f.state === 'on_target' || f.state === 'above').length;

  if (feedbacks.length === 0) return null;

  const STATE_INDICATOR: Record<FeedbackState, string> = {
    below: 'bg-danger',
    approaching: 'bg-warning',
    on_target: 'bg-success',
    above: 'bg-success',
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <Target className="h-4 w-4 text-muted-foreground" />
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {tl('Aktueller Fokus', 'Current Focus')}
        </p>
      </div>

      {/* Status Summary */}
      <div className="space-y-3 mb-5">
        {feedbacks.slice(0, 4).map(f => (
          <div key={f.key} className="flex items-start gap-3">
            <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${STATE_INDICATOR[f.state]}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{f.label}</span>
                <span className="text-xs text-muted-foreground">
                  {f.value}{f.suffix} / {f.invert ? '≤' : '≥'}{f.target}{f.suffix}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {f.statusLine}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      {actionableItems.length > 0 && (
        <>
          <div className="h-px bg-border/60 mb-4" />
          {/* Next Actions */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-3">
              {tl('Nächste Schritte', 'Next Steps')}
            </p>
            <div className="space-y-2">
              {actionableItems.map(f => (
                <div key={f.key} className="flex items-center gap-2.5 text-sm">
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-foreground">{f.nextAction}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* All on target */}
      {actionableItems.length === 0 && onTargetCount > 0 && (
        <>
          <div className="h-px bg-border/60 mb-4" />
          <p className="text-sm text-muted-foreground">
            {tl(
              'Alle relevanten KPIs auf Zielniveau. Konsistenz beibehalten.',
              'All relevant KPIs are on target. Maintain consistency.'
            )}
          </p>
        </>
      )}
    </div>
  );
}