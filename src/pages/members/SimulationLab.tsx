import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, RotateCcw, ArrowRight } from 'lucide-react';

interface Scenario {
  id: number;
  stateDe: string;
  stateEn: string;
  customerDe: string;
  customerEn: string;
  options: { labelDe: string; labelEn: string; correct: boolean; whyDe: string; whyEn: string }[];
}

const SCENARIOS: Scenario[] = [
  {
    id: 1, stateDe: 'Widerstand', stateEn: 'Resistance',
    customerDe: '"Ich muss erst nochmal darüber nachdenken."',
    customerEn: '"I need to think about it first."',
    options: [
      { labelDe: 'Wert nochmal erklären', labelEn: 'Explain value again', correct: false, whyDe: 'Widerstand ist kein Wert-Problem. Du beantwortest die falsche Frage.', whyEn: 'Resistance is not a value problem. You\'re answering the wrong question.' },
      { labelDe: 'Dringlichkeit erzeugen', labelEn: 'Apply urgency', correct: false, whyDe: 'Druck verstärkt Widerstand. Der Kunde zieht sich weiter zurück.', whyEn: 'Pressure amplifies resistance. The customer will retreat further.' },
      { labelDe: 'Fragen, was unklar ist', labelEn: 'Ask what is unclear', correct: true, whyDe: 'Widerstand = Schutzmechanismus. Erst diagnostizieren, dann reagieren.', whyEn: 'Resistance = protection mechanism. Diagnose first, then respond.' },
    ],
  },
  {
    id: 2, stateDe: 'Emotionale Tiefe', stateEn: 'Emotional Depth',
    customerDe: '"Ich glaube, ich habe einfach Angst, dass ich es wieder nicht schaffe."',
    customerEn: '"I think I\'m just afraid I\'ll fail again."',
    options: [
      { labelDe: 'Ermutigen: „Das schaffst du!"', labelEn: 'Encourage: "You can do it!"', correct: false, whyDe: 'Trösten entschärft die Emotion. Du nimmst dem Kunden die Kraft seiner eigenen Erkenntnis.', whyEn: 'Comforting defuses the emotion. You take away the customer\'s own realization.' },
      { labelDe: 'Stille halten, dann: „Was bedeutet das für dich?"', labelEn: 'Hold silence, then: "What does that mean for you?"', correct: true, whyDe: 'In emotionaler Tiefe brauchst du Raum, keine Worte. Lass den Kunden seine eigene Antwort finden.', whyEn: 'In emotional depth you need space, not words. Let the customer find their own answer.' },
      { labelDe: 'Erfolgsgeschichte teilen', labelEn: 'Share a success story', correct: false, whyDe: 'Geschichten anderer minimieren sein Gefühl. Das ist sein Moment — nicht deiner.', whyEn: 'Others\' stories minimize their feeling. This is their moment — not yours.' },
    ],
  },
  {
    id: 3, stateDe: 'Verwirrung', stateEn: 'Confusion',
    customerDe: '"Ich verstehe die Unterschiede zwischen den Paketen nicht wirklich."',
    customerEn: '"I don\'t really understand the differences between the packages."',
    options: [
      { labelDe: 'Alle Pakete nochmal erklären', labelEn: 'Explain all packages again', correct: false, whyDe: 'Mehr Information verstärkt die Verwirrung. Das Gehirn blockiert.', whyEn: 'More information amplifies confusion. The brain blocks.' },
      { labelDe: 'Fragen, was sein Ziel ist, dann eine klare Empfehlung geben', labelEn: 'Ask about their goal, then give one clear recommendation', correct: true, whyDe: 'Verwirrung braucht Klarheit, nicht Input. Eine Empfehlung = Entscheidungshilfe.', whyEn: 'Confusion needs clarity, not input. One recommendation = decision support.' },
      { labelDe: 'Zum günstigsten Paket raten', labelEn: 'Suggest the cheapest package', correct: false, whyDe: 'Preis-basierte Empfehlung ignoriert das Ziel. Du löst Verwirrung nicht durch Preis.', whyEn: 'Price-based recommendation ignores the goal. You don\'t solve confusion with price.' },
    ],
  },
  {
    id: 4, stateDe: 'Surface', stateEn: 'Surface',
    customerDe: '"Ja, läuft alles ganz gut eigentlich."',
    customerEn: '"Yeah, everything is going quite well actually."',
    options: [
      { labelDe: 'Direkt ins Angebot übergehen', labelEn: 'Go straight into the offer', correct: false, whyDe: 'Ohne echtes Problem gibt es keine Entscheidungsgrundlage. Du verkaufst ins Leere.', whyEn: 'Without a real problem there\'s no basis for decision. You\'re selling into nothing.' },
      { labelDe: '„Was hat dich dann dazu gebracht, heute hier zu sein?"', labelEn: '"What made you show up today then?"', correct: true, whyDe: 'Surface-Antworten sind soziale Masken. Eine gezielte Frage öffnet die nächste Ebene.', whyEn: 'Surface answers are social masks. A targeted question opens the next level.' },
      { labelDe: 'Testimonials zeigen', labelEn: 'Show testimonials', correct: false, whyDe: 'Bevor der Kunde sein Problem erkennt, sind fremde Ergebnisse irrelevant.', whyEn: 'Before the customer recognizes their problem, others\' results are irrelevant.' },
    ],
  },
  {
    id: 5, stateDe: 'Entscheidung', stateEn: 'Decision',
    customerDe: '"Das klingt wirklich gut. Ich glaube, das ist das Richtige."',
    customerEn: '"That sounds really good. I think this is the right thing."',
    options: [
      { labelDe: 'Nochmal alle Vorteile aufzählen', labelEn: 'List all benefits again', correct: false, whyDe: 'Der Kunde ist bereit. Weiter verkaufen erzeugt Zweifel.', whyEn: 'The customer is ready. Continuing to sell creates doubt.' },
      { labelDe: '„Perfekt — dann starten wir gemeinsam. Ich schicke dir gleich alles zu."', labelEn: '"Perfect — let\'s start together. I\'ll send you everything right away."', correct: true, whyDe: 'Klare, ruhige Einladung. Keine Unsicherheit. Kein Überverkaufen.', whyEn: 'Clear, calm invitation. No uncertainty. No overselling.' },
      { labelDe: 'Fragen, ob er noch Bedenkzeit braucht', labelEn: 'Ask if they need more time to think', correct: false, whyDe: 'Du gibst dem Kunden einen Grund zum Zögern, den er gar nicht hatte.', whyEn: 'You give the customer a reason to hesitate that they didn\'t have.' },
    ],
  },
];

export default function SimulationLab() {
  const { lang } = useLanguage();
  const de = lang === 'de';
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(0);

  const scenario = SCENARIOS[currentIdx];
  const isAnswered = selected !== null;
  const allDone = completed >= SCENARIOS.length;

  const handleSelect = (optIdx: number) => {
    if (isAnswered) return;
    setSelected(optIdx);
    if (scenario.options[optIdx].correct) setScore(s => s + 1);
    setCompleted(c => c + 1);
  };

  const handleNext = () => {
    setSelected(null);
    setCurrentIdx(i => Math.min(i + 1, SCENARIOS.length - 1));
  };

  const handleReset = () => {
    setCurrentIdx(0);
    setSelected(null);
    setScore(0);
    setCompleted(0);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-1">
          {de ? 'Simulation Lab' : 'Simulation Lab'}
        </p>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          {de ? 'Entscheidungstraining unter Druck' : 'Decision Training Under Pressure'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {de ? 'Erkenne die Situation. Wähle die richtige Reaktion.' : 'Recognize the situation. Choose the correct response.'}
        </p>
      </div>

      {/* Progress */}
      <div className="mb-4 flex items-center justify-between text-[12px] text-muted-foreground">
        <span>{de ? `Szenario ${currentIdx + 1} / ${SCENARIOS.length}` : `Scenario ${currentIdx + 1} / ${SCENARIOS.length}`}</span>
        <span>{de ? `${score} richtig` : `${score} correct`}</span>
      </div>
      <div className="mb-6 h-1 rounded-full bg-muted/30">
        <div className="h-full rounded-full bg-primary/40 transition-all" style={{ width: `${(completed / SCENARIOS.length) * 100}%` }} />
      </div>

      {allDone && currentIdx === SCENARIOS.length - 1 && isAnswered ? (
        <div className="rounded-2xl border border-border/40 bg-card p-8 text-center space-y-4">
          <p className="font-serif text-xl font-semibold text-foreground">
            {de ? 'Training abgeschlossen' : 'Training Complete'}
          </p>
          <p className="text-3xl font-bold text-primary">{score} / {SCENARIOS.length}</p>
          <p className="text-sm text-muted-foreground">
            {score === SCENARIOS.length
              ? (de ? 'Perfekt. Du denkst wie ein Top-Closer.' : 'Perfect. You think like a top closer.')
              : score >= 3
                ? (de ? 'Starkes Ergebnis. Überprüfe die Fehler.' : 'Strong result. Review the mistakes.')
                : (de ? 'Wiederhole das Training. Lies das Closing OS.' : 'Repeat the training. Study the Closing OS.')}
          </p>
          <button onClick={handleReset} className="inline-flex items-center gap-2 rounded-lg bg-foreground/[0.06] px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/[0.1] transition-colors">
            <RotateCcw className="h-4 w-4" /> {de ? 'Nochmal' : 'Again'}
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/40 bg-card p-5 sm:p-6 space-y-5">
          {/* State badge */}
          <span className="inline-flex rounded-full bg-muted/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {de ? scenario.stateDe : scenario.stateEn}
          </span>

          {/* Customer statement */}
          <div className="rounded-xl bg-muted/20 border border-border/20 p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{de ? 'Kunde sagt:' : 'Customer says:'}</p>
            <p className="text-[15px] leading-relaxed text-foreground italic">
              {de ? scenario.customerDe : scenario.customerEn}
            </p>
          </div>

          {/* Options */}
          <div className="space-y-2">
            {scenario.options.map((opt, i) => {
              const isSelected = selected === i;
              const showFeedback = isAnswered;
              return (
                <button
                  key={i}
                  onClick={() => handleSelect(i)}
                  disabled={isAnswered}
                  className={cn(
                    'w-full text-left rounded-xl border px-4 py-3 transition-all',
                    !isAnswered && 'hover:border-foreground/20 hover:bg-muted/20 cursor-pointer',
                    isAnswered && !isSelected && 'opacity-50',
                    isSelected && opt.correct && 'border-primary/30 bg-primary/[0.05]',
                    isSelected && !opt.correct && 'border-destructive/30 bg-destructive/[0.05]',
                    !isSelected && showFeedback && opt.correct && 'border-primary/20 bg-primary/[0.03]',
                    !isAnswered && 'border-border/30 bg-card',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {showFeedback && opt.correct && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                    {showFeedback && isSelected && !opt.correct && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    <span className="text-[13px] font-medium text-foreground">
                      {de ? opt.labelDe : opt.labelEn}
                    </span>
                  </div>
                  {showFeedback && (isSelected || opt.correct) && (
                    <p className="mt-1.5 text-[12px] text-muted-foreground leading-relaxed">
                      {de ? opt.whyDe : opt.whyEn}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {isAnswered && currentIdx < SCENARIOS.length - 1 && (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 rounded-lg bg-foreground/[0.06] px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground/[0.1] transition-colors"
            >
              {de ? 'Weiter' : 'Next'} <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
