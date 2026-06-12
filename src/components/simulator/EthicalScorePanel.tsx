import { cn } from '@/lib/utils';
import { Shield } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface EthicalScoreData {
  integrity: number;
  clarity: number;
  trust_building: number;
  respectful_objection_handling: number;
  pressure_balance: number;
  qualification_quality: number;
}

interface EthicalScorePanelProps {
  scores?: Partial<EthicalScoreData>;
  feedbackDe?: string;
  feedbackEn?: string;
  strengthsDe?: string;
  strengthsEn?: string;
  improvementDe?: string;
  improvementEn?: string;
}

const CATEGORIES: { key: keyof EthicalScoreData; de: string; en: string }[] = [
  { key: 'integrity', de: 'Integrität', en: 'Integrity' },
  { key: 'clarity', de: 'Klarheit', en: 'Clarity' },
  { key: 'trust_building', de: 'Vertrauensaufbau', en: 'Trust Building' },
  { key: 'respectful_objection_handling', de: 'Respektvolle Einwandbehandlung', en: 'Respectful Objection Handling' },
  { key: 'pressure_balance', de: 'Druckbalance', en: 'Pressure Balance' },
  { key: 'qualification_quality', de: 'Qualifizierungsqualität', en: 'Qualification Quality' },
];

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className={cn(
          'text-[11px] font-semibold',
          value >= 70 ? 'text-emerald-500' : value >= 40 ? 'text-amber-500' : 'text-destructive'
        )}>{value}/100</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-destructive'
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function EthicalScorePanel({
  scores, feedbackDe, feedbackEn, strengthsDe, strengthsEn, improvementDe, improvementEn,
}: EthicalScorePanelProps) {
  const { lang } = useLanguage();
  const de = lang === 'de';

  const hasScores = scores && Object.values(scores).some(v => v != null && v > 0);
  const avg = hasScores
    ? Math.round(Object.values(scores!).filter(v => v != null).reduce((s, v) => s + (v || 0), 0) / Object.values(scores!).filter(v => v != null).length)
    : null;

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="font-serif text-base font-semibold text-foreground">Ethical Closing Score</h3>
        {avg != null && (
          <span className={cn(
            'ml-auto text-lg font-bold',
            avg >= 70 ? 'text-emerald-500' : avg >= 40 ? 'text-amber-500' : 'text-destructive'
          )}>{avg}</span>
        )}
      </div>

      {hasScores ? (
        <div className="space-y-2.5">
          {CATEGORIES.map(cat => {
            const val = scores?.[cat.key];
            if (val == null) return null;
            return <ScoreBar key={cat.key} label={de ? cat.de : cat.en} value={val} />;
          })}
        </div>
      ) : (
        <div className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            {de
              ? 'Starte ein Szenario, um deinen Ethical Closing Score zu erhalten.'
              : 'Start a scenario to receive your Ethical Closing Score.'}
          </p>
        </div>
      )}

      {/* Feedback Section */}
      {(feedbackDe || feedbackEn) && (
        <div className="rounded-lg bg-muted/20 p-3 space-y-2">
          {(strengthsDe || strengthsEn) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-0.5">
                {de ? 'Stärken' : 'Strengths'}
              </p>
              <p className="text-[12px] text-foreground leading-relaxed">{de ? strengthsDe : strengthsEn}</p>
            </div>
          )}
          {(improvementDe || improvementEn) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-0.5">
                {de ? 'Verbesserung' : 'Improvement'}
              </p>
              <p className="text-[12px] text-foreground leading-relaxed">{de ? improvementDe : improvementEn}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { EthicalScoreData };
