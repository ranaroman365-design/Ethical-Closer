import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, AlertTriangle, TrendingUp, RotateCcw } from 'lucide-react';

interface ReviewField {
  keyName: string;
  labelDe: string;
  labelEn: string;
  placeholderDe: string;
  placeholderEn: string;
}

const FIELDS: ReviewField[] = [
  { keyName: 'resistance', labelDe: 'Wo trat Widerstand auf?', labelEn: 'Where did resistance occur?', placeholderDe: 'Beschreibe den Moment…', placeholderEn: 'Describe the moment…' },
  { keyName: 'depth_loss', labelDe: 'Wo ging die Tiefe verloren?', labelEn: 'Where did depth get lost?', placeholderDe: 'Hast du zu früh die Ebene gewechselt?', placeholderEn: 'Did you change levels too early?' },
  { keyName: 'pushed_early', labelDe: 'Hast du zu früh gepusht?', labelEn: 'Did you push too early?', placeholderDe: 'Angebot vor dem Problem erklärt?', placeholderEn: 'Explained the offer before the problem?' },
  { keyName: 'silence', labelDe: 'Hast du Stille gehalten?', labelEn: 'Did you hold silence?', placeholderDe: 'Gab es emotionale Momente, die du übergangen hast?', placeholderEn: 'Were there emotional moments you skipped?' },
];

const STATE_OPTIONS = [
  { key: 'surface', de: 'Surface', en: 'Surface' },
  { key: 'exploration', de: 'Exploration', en: 'Exploration' },
  { key: 'depth', de: 'Emotionale Tiefe', en: 'Emotional Depth' },
  { key: 'resistance', de: 'Widerstand', en: 'Resistance' },
  { key: 'confusion', de: 'Verwirrung', en: 'Confusion' },
  { key: 'decision', de: 'Entscheidung', en: 'Decision' },
];

export default function CallReview() {
  const { lang } = useLanguage();
  const de = lang === 'de';
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeline, setTimeline] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const toggleTimeline = (key: string) => {
    setTimeline(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleSubmit = () => setSubmitted(true);
  const handleReset = () => { setAnswers({}); setTimeline([]); setSubmitted(false); };

  // Simple analysis based on answers
  const insights = (() => {
    if (!submitted) return [];
    const result: { icon: React.ComponentType<any>; textDe: string; textEn: string; type: 'warn' | 'good' | 'tip' }[] = [];
    if (answers.pushed_early?.length > 10) result.push({ icon: AlertTriangle, textDe: 'Du neigst dazu, zu früh ins Angebot zu gehen. Arbeite länger in Exploration.', textEn: 'You tend to move to the offer too early. Stay in exploration longer.', type: 'warn' });
    if (answers.silence?.length > 10) result.push({ icon: AlertTriangle, textDe: 'Stille ist dein stärkstes Werkzeug. Übe, 5 Sekunden nichts zu sagen.', textEn: 'Silence is your strongest tool. Practice saying nothing for 5 seconds.', type: 'warn' });
    if (answers.depth_loss?.length > 10) result.push({ icon: TrendingUp, textDe: 'Achte auf den Moment, in dem der Kunde emotional wird — bleib dort.', textEn: 'Pay attention to the moment the customer becomes emotional — stay there.', type: 'tip' });
    if (!answers.resistance || answers.resistance.length < 5) result.push({ icon: CheckCircle, textDe: 'Kein signifikanter Widerstand erkannt. Gutes Zeichen.', textEn: 'No significant resistance detected. Good sign.', type: 'good' });
    if (timeline.includes('depth') && timeline.includes('decision')) result.push({ icon: CheckCircle, textDe: 'Du hast emotionale Tiefe erreicht und zur Entscheidung geführt. Starkes Gespräch.', textEn: 'You reached emotional depth and guided to decision. Strong conversation.', type: 'good' });
    if (result.length === 0) result.push({ icon: TrendingUp, textDe: 'Fülle die Felder detaillierter aus für bessere Analyse.', textEn: 'Fill in the fields in more detail for better analysis.', type: 'tip' });
    return result;
  })();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
          Call Review
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {de ? 'Gesprächsreflexion' : 'Call Reflection'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {de ? 'Analysiere dein letztes Gespräch. Erkenne Muster. Verbessere dich.' : 'Analyze your last call. Recognize patterns. Improve.'}
        </p>
      </div>

      {/* Timeline selector */}
      <div className="mb-6 rounded-2xl border border-border/40 bg-card p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">
          {de ? 'Welche States hast du durchlaufen?' : 'Which states did you go through?'}
        </p>
        <div className="flex flex-wrap gap-2">
          {STATE_OPTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => toggleTimeline(s.key)}
              disabled={submitted}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all',
                timeline.includes(s.key)
                  ? 'border-foreground/20 bg-foreground/[0.06] text-foreground'
                  : 'border-border/30 text-muted-foreground hover:border-foreground/10',
              )}
            >
              {de ? s.de : s.en}
            </button>
          ))}
        </div>
      </div>

      {/* Reflection fields */}
      <div className="mb-6 space-y-4">
        {FIELDS.map(f => (
          <div key={f.keyName} className="rounded-2xl border border-border/40 bg-card p-4">
            <label className="block text-[13px] font-semibold text-foreground mb-2">
              {de ? f.labelDe : f.labelEn}
            </label>
            <Textarea
              value={answers[f.keyName] || ''}
              onChange={e => setAnswers(a => ({ ...a, [f.keyName]: e.target.value }))}
              placeholder={de ? f.placeholderDe : f.placeholderEn}
              disabled={submitted}
              className="min-h-[60px] border-border/30 bg-muted/10 text-[13px]"
            />
          </div>
        ))}
      </div>

      {!submitted ? (
        <button
          onClick={handleSubmit}
          className="w-full rounded-xl bg-foreground/[0.06] py-3 text-sm font-semibold text-foreground hover:bg-foreground/[0.1] transition-colors"
        >
          {de ? 'Analyse starten' : 'Start Analysis'}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/40 bg-card p-5 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              {de ? 'Erkenntnisse' : 'Insights'}
            </p>
            {insights.map((ins, i) => {
              const Icon = ins.icon;
              return (
                <div key={i} className={cn(
                  'flex items-start gap-2.5 rounded-xl border px-4 py-3',
                  ins.type === 'warn' && 'border-destructive/20 bg-destructive/[0.03]',
                  ins.type === 'good' && 'border-primary/20 bg-primary/[0.03]',
                  ins.type === 'tip' && 'border-border/30 bg-muted/20',
                )}>
                  <Icon className={cn('h-4 w-4 mt-0.5 shrink-0',
                    ins.type === 'warn' && 'text-destructive/60',
                    ins.type === 'good' && 'text-primary/60',
                    ins.type === 'tip' && 'text-muted-foreground',
                  )} />
                  <p className="text-[13px] leading-relaxed text-foreground">{de ? ins.textDe : ins.textEn}</p>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-lg bg-foreground/[0.06] px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/[0.1] transition-colors"
          >
            <RotateCcw className="h-4 w-4" /> {de ? 'Neues Gespräch analysieren' : 'Analyze new call'}
          </button>
        </div>
      )}
    </div>
  );
}
