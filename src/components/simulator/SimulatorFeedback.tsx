import { cn } from '@/lib/utils';
import { TrendingUp, Lightbulb, AlertTriangle, Zap } from 'lucide-react';

interface FeedbackData {
  clarity: number;
  relevance?: number;
  energy?: number;
  timing?: number;
  direction?: number;
  emotion?: number;
  conversion?: number;
  overall: number;
  suggestion: string;
  explanation: string;
}

interface MicroSkills {
  [key: string]: number;
}

interface SimulatorFeedbackProps {
  feedback: FeedbackData;
  microSkills?: MicroSkills;
  behaviorFlags?: string[];
  leadEngagement?: number;
  setterMetrics?: { qualification_depth?: number; call_control?: number; handover_readiness?: number };
  lang: string;
  compact?: boolean;
}

const SCORE_LABELS: Record<string, { de: string; en: string }> = {
  clarity: { de: 'Klarheit', en: 'Clarity' },
  relevance: { de: 'Relevanz', en: 'Relevance' },
  energy: { de: 'Energie', en: 'Energy' },
  timing: { de: 'Timing', en: 'Timing' },
  direction: { de: 'Richtung', en: 'Direction' },
  emotion: { de: 'Emotion', en: 'Emotion' },
  conversion: { de: 'Conversion', en: 'Conversion' },
};

const MICRO_SKILL_LABELS: Record<string, { de: string; en: string }> = {
  hook_precision: { de: 'Hook Precision', en: 'Hook Precision' },
  context_framing: { de: 'Context Framing', en: 'Context Framing' },
  curiosity_loop: { de: 'Curiosity Loop', en: 'Curiosity Loop' },
  emotional_calibration: { de: 'Emotional Calibration', en: 'Emotional Calibration' },
  objection_redirection: { de: 'Objection Redirection', en: 'Objection Redirection' },
  qualification_filtering: { de: 'Qualification Filtering', en: 'Qualification Filtering' },
  commitment_lock: { de: 'Commitment Lock', en: 'Commitment Lock' },
  authority_framing: { de: 'Authority Framing', en: 'Authority Framing' },
  trust_building: { de: 'Trust Building', en: 'Trust Building' },
  pain_extraction: { de: 'Pain Extraction', en: 'Pain Extraction' },
  truth_calibration: { de: 'Truth Calibration', en: 'Truth Calibration' },
  disqualification_strength: { de: 'Disqualification Strength', en: 'Disqualification Strength' },
  commitment_anchoring: { de: 'Commitment Anchoring', en: 'Commitment Anchoring' },
  call_direction: { de: 'Call Direction', en: 'Call Direction' },
};

const BEHAVIOR_LABELS: Record<string, { de: string; en: string; icon: string }> = {
  too_pushy: { de: 'Zu aufdringlich', en: 'Too pushy', icon: '⚡' },
  too_passive: { de: 'Zu passiv', en: 'Too passive', icon: '😐' },
  too_long: { de: 'Zu lang', en: 'Too long', icon: '📏' },
  unclear: { de: 'Unklar', en: 'Unclear', icon: '❓' },
  wrong_frame: { de: 'Falscher Rahmen', en: 'Wrong frame', icon: '🖼️' },
  missing_followup: { de: 'Kein Follow-up', en: 'Missing follow-up', icon: '🔄' },
  too_aggressive: { de: 'Zu aggressiv', en: 'Too aggressive', icon: '💥' },
  shallow_qualification: { de: 'Oberflächlich', en: 'Shallow qualification', icon: '🏊' },
  wrong_decision: { de: 'Falsche Entscheidung', en: 'Wrong decision', icon: '❌' },
  no_structure: { de: 'Kein Struktur', en: 'No structure', icon: '🔀' },
  weak_handover: { de: 'Schwache Übergabe', en: 'Weak handover', icon: '🤝' },
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className={cn('text-[10px] font-semibold', value >= 70 ? 'text-emerald-500' : value >= 40 ? 'text-amber-500' : 'text-destructive')}>{value}</span>
      </div>
      <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-destructive')} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function SimulatorFeedback({ feedback, microSkills, behaviorFlags, leadEngagement, setterMetrics, lang, compact }: SimulatorFeedbackProps) {
  const de = lang === 'de';

  const conversionDnaKeys = ['clarity', 'relevance', 'energy', 'timing', 'direction'].filter(k => (feedback as any)[k] != null);

  return (
    <div className="rounded-xl border border-border/40 bg-card p-3 space-y-3">
      {/* Conversion DNA */}
      {conversionDnaKeys.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Zap className="h-3 w-3" /> Conversion DNA
          </p>
          {conversionDnaKeys.map(key => (
            <ScoreBar key={key} label={SCORE_LABELS[key]?.[lang] || key} value={(feedback as any)[key]} />
          ))}
        </div>
      )}

      {/* Micro-Skills (top 3 only in compact mode) */}
      {microSkills && Object.keys(microSkills).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Micro-Skills</p>
          {Object.entries(microSkills)
            .filter(([, v]) => v != null && v > 0)
            .sort(([, a], [, b]) => a - b)
            .slice(0, compact ? 3 : 7)
            .map(([key, value]) => (
              <ScoreBar key={key} label={MICRO_SKILL_LABELS[key]?.[lang] || key} value={value} />
            ))}
        </div>
      )}

      {/* Setter Metrics */}
      {setterMetrics && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{de ? 'Setter-Metriken' : 'Setter Metrics'}</p>
          {setterMetrics.qualification_depth != null && <ScoreBar label={de ? 'Qualifizierungstiefe' : 'Qualification Depth'} value={setterMetrics.qualification_depth} />}
          {setterMetrics.call_control != null && <ScoreBar label={de ? 'Gesprächsführung' : 'Call Control'} value={setterMetrics.call_control} />}
          {setterMetrics.handover_readiness != null && <ScoreBar label={de ? 'Übergabe-Readiness' : 'Handover Readiness'} value={setterMetrics.handover_readiness} />}
        </div>
      )}

      {/* Behavior Flags */}
      {behaviorFlags && behaviorFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {behaviorFlags.map(flag => {
            const label = BEHAVIOR_LABELS[flag];
            return (
              <span key={flag} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[9px] text-destructive font-medium">
                {label?.icon} {de ? label?.de : label?.en || flag}
              </span>
            );
          })}
        </div>
      )}

      {/* Lead Engagement */}
      {leadEngagement != null && (
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-muted-foreground">{de ? 'Lead-Engagement:' : 'Lead Engagement:'}</span>
          <span className={cn('font-semibold', leadEngagement >= 70 ? 'text-emerald-500' : leadEngagement >= 40 ? 'text-amber-500' : 'text-destructive')}>{leadEngagement}%</span>
        </div>
      )}

      {/* Better Version */}
      {feedback.suggestion && (
        <div className="rounded-lg bg-primary/5 border border-primary/10 p-2.5 space-y-1">
          <div className="flex items-center gap-1">
            <Lightbulb className="h-3 w-3 text-primary" />
            <span className="text-[9px] font-semibold text-primary">{de ? 'Bessere Version' : 'Better Version'}</span>
          </div>
          <p className="text-[11px] text-foreground italic leading-relaxed">{feedback.suggestion}</p>
        </div>
      )}

      {/* Explanation */}
      {feedback.explanation && (
        <div className="flex items-start gap-1.5">
          <TrendingUp className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">{feedback.explanation}</p>
        </div>
      )}
    </div>
  );
}

export type { FeedbackData, MicroSkills };
