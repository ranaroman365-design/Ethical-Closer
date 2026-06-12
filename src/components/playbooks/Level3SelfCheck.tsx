import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * Level 3 Self-Check — 3 deterministic comprehension questions
 * covering Call Review System + Auszahlungspolitik.
 *
 * Pure UI / client-side. No persistence (re-takeable any time).
 * Appears below the L3 card grid once a user has opened ≥ 1 L3 PDF.
 */

interface Question {
  id: string;
  prompt: { de: string; en: string };
  options: { de: string; en: string }[];
  correct: number; // index
  rationale: { de: string; en: string };
}

const QUESTIONS: Question[] = [
  {
    id: 'q1_review_window',
    prompt: {
      de: 'Wann sollte ein Call laut Call-Review-System spätestens reviewt werden?',
      en: 'By when should a call be reviewed according to the Call Review System?',
    },
    options: [
      { de: 'Innerhalb von 24 Stunden', en: 'Within 24 hours' },
      { de: 'Am Wochenende gesammelt', en: 'Batched on the weekend' },
      { de: 'Nur bei verlorenen Calls', en: 'Only for lost calls' },
      { de: 'Wenn Zeit übrig ist', en: 'Whenever time permits' },
    ],
    correct: 0,
    rationale: {
      de: 'Frische Reviews innerhalb von 24h sichern präzise Erinnerungen und schnelle Korrekturen.',
      en: 'Reviews within 24h preserve accurate memory and enable fast correction loops.',
    },
  },
  {
    id: 'q2_payout_eligibility',
    prompt: {
      de: 'Wann beginnt das Eligibility-Fenster einer Provision?',
      en: 'When does the eligibility window for a commission start?',
    },
    options: [
      { de: 'Mit Lead-Erstellung', en: 'When the lead is created' },
      { de: 'Mit Closed-Won (Zahlung erhalten)', en: 'On Closed-Won (payment received)' },
      { de: 'Mit dem Termin-Booking', en: 'On appointment booking' },
      { de: 'Mit dem Show', en: 'On show' },
    ],
    correct: 1,
    rationale: {
      de: 'Erst wenn die Zahlung tatsächlich eingegangen ist (Closed-Won), läuft das Eligibility-Fenster.',
      en: 'The eligibility window only starts once the payment is actually received (Closed-Won).',
    },
  },
  {
    id: 'q3_payout_process',
    prompt: {
      de: 'Wie werden Provisionen ausgezahlt?',
      en: 'How are commissions paid out?',
    },
    options: [
      { de: 'Automatisch sofort nach jedem Close', en: 'Automatically right after each close' },
      { de: 'In manuellen Batches nach geprüftem Status', en: 'In manual batches after verified status' },
      { de: 'Nur einmal pro Quartal', en: 'Only once per quarter' },
      { de: 'Auf Anfrage per Support-Ticket', en: 'On request via support ticket' },
    ],
    correct: 1,
    rationale: {
      de: 'Auszahlungen erfolgen in geprüften Batches — der Status muss durch alle Übergänge laufen, bevor die manuelle Zahlung freigegeben wird.',
      en: 'Payouts run in verified batches — status must complete all transitions before the manual payment is released.',
    },
  },
];

export default function Level3SelfCheck() {
  const { lang } = useLanguage();
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = useMemo(
    () => QUESTIONS.reduce((acc, q) => acc + (answers[q.id] === q.correct ? 1 : 0), 0),
    [answers],
  );
  const allAnswered = QUESTIONS.every((q) => answers[q.id] != null);

  function reset() {
    setAnswers({});
    setSubmitted(false);
  }

  return (
    <Card className="mt-6 border-border/40 p-5 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-[hsl(39,41%,55%)]" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[hsl(39,41%,55%)]">
              {lang === 'de' ? 'Selbstcheck · L3' : 'Self-Check · L3'}
            </span>
          </div>
          <h3 className="font-serif text-lg font-semibold text-foreground md:text-xl">
            {lang === 'de' ? '3 Fragen — sofortiges Feedback' : '3 questions — instant feedback'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === 'de'
              ? 'Prüfe in 60 Sekunden, ob das Gelesene wirklich sitzt. Keine Speicherung.'
              : 'Check in 60 seconds whether what you read actually landed. Nothing is stored.'}
          </p>
        </div>
        {submitted && (
          <span className="rounded-full border border-[hsl(39,41%,55%)]/40 bg-[hsl(39,41%,55%)]/5 px-3 py-1 font-mono text-xs font-semibold text-[hsl(39,41%,55%)]">
            {score} / {QUESTIONS.length}
          </span>
        )}
      </div>

      <ol className="space-y-5">
        {QUESTIONS.map((q, qi) => {
          const selected = answers[q.id];
          return (
            <li key={q.id}>
              <p className="mb-2 text-sm font-medium text-foreground">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{qi + 1}.</span>
                {lang === 'de' ? q.prompt.de : q.prompt.en}
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {q.options.map((opt, oi) => {
                  const isSelected = selected === oi;
                  const isCorrect = oi === q.correct;
                  const showState = submitted && (isSelected || isCorrect);
                  return (
                    <button
                      key={oi}
                      type="button"
                      disabled={submitted}
                      onClick={() => setAnswers((p) => ({ ...p, [q.id]: oi }))}
                      className={cn(
                        'flex items-start gap-2 rounded-md border px-3 py-2 text-left text-xs transition-colors',
                        !submitted && 'hover:border-[hsl(39,41%,55%)]/50',
                        !showState && isSelected && 'border-[hsl(39,41%,55%)]/60 bg-[hsl(39,41%,55%)]/5',
                        !showState && !isSelected && 'border-border/40 bg-card',
                        showState && isCorrect && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        showState && isSelected && !isCorrect && 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400',
                      )}
                    >
                      {showState && isCorrect && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
                      {showState && isSelected && !isCorrect && <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
                      <span>{lang === 'de' ? opt.de : opt.en}</span>
                    </button>
                  );
                })}
              </div>
              {submitted && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {lang === 'de' ? 'Hintergrund: ' : 'Why: '}
                  </span>
                  {lang === 'de' ? q.rationale.de : q.rationale.en}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/40 pt-4">
        {submitted ? (
          <>
            <p className="text-xs text-muted-foreground">
              {score === QUESTIONS.length
                ? (lang === 'de' ? 'Sitzt. Du bist bereit für die Praxis.' : 'Solid. You\'re ready for execution.')
                : (lang === 'de' ? 'Lies die markierten Stellen kurz nach — dann wiederhole.' : 'Re-read the highlighted sections briefly, then retry.')}
            </p>
            <Button size="sm" variant="outline" onClick={reset} className="border-border/60">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {lang === 'de' ? 'Nochmal' : 'Retry'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {lang === 'de'
                ? `${Object.values(answers).filter((v) => v != null).length} / ${QUESTIONS.length} beantwortet`
                : `${Object.values(answers).filter((v) => v != null).length} / ${QUESTIONS.length} answered`}
            </p>
            <Button
              size="sm"
              disabled={!allAnswered}
              onClick={() => setSubmitted(true)}
              className="bg-[hsl(39,41%,55%)] text-[hsl(220,15%,8%)] hover:bg-[hsl(39,41%,50%)]"
            >
              {lang === 'de' ? 'Auswerten' : 'Evaluate'}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
