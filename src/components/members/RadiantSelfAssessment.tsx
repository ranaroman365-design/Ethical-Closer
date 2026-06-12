import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, RotateCcw, ExternalLink, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/i18n/LanguageContext';
import { PRODUCT } from '@/config/product';

interface Question {
  question: { de: string; en: string };
  options: { label: { de: string; en: string }; score: number }[];
}

const QUESTIONS: Question[] = [
  {
    question: {
      de: 'Wie oft fühlst du dich vor wichtigen Calls nervös oder angespannt?',
      en: 'How often do you feel nervous or tense before important calls?',
    },
    options: [
      { label: { de: 'Fast immer', en: 'Almost always' }, score: 1 },
      { label: { de: 'Oft', en: 'Often' }, score: 2 },
      { label: { de: 'Manchmal', en: 'Sometimes' }, score: 3 },
      { label: { de: 'Selten oder nie', en: 'Rarely or never' }, score: 4 },
    ],
  },
  {
    question: {
      de: 'Wie schnell kannst du dich nach einem verlorenen Deal emotional erholen?',
      en: 'How quickly can you recover emotionally after a lost deal?',
    },
    options: [
      { label: { de: 'Dauert Tage', en: 'Takes days' }, score: 1 },
      { label: { de: 'Rest des Tages betroffen', en: 'Affected for the rest of the day' }, score: 2 },
      { label: { de: 'Nach 1-2 Stunden wieder fokussiert', en: 'Refocused after 1-2 hours' }, score: 3 },
      { label: { de: 'Sofort — nächster Call', en: 'Immediately — next call' }, score: 4 },
    ],
  },
  {
    question: {
      de: 'Wie konsistent ist deine Energie über den Tag verteilt?',
      en: 'How consistent is your energy throughout the day?',
    },
    options: [
      { label: { de: 'Starke Schwankungen, kaum vorhersehbar', en: 'Major fluctuations, unpredictable' }, score: 1 },
      { label: { de: 'Morgens gut, nachmittags Einbruch', en: 'Good in the morning, afternoon crash' }, score: 2 },
      { label: { de: 'Meist stabil mit kleinen Tiefs', en: 'Mostly stable with minor dips' }, score: 3 },
      { label: { de: 'Konstant hoch den ganzen Tag', en: 'Consistently high all day' }, score: 4 },
    ],
  },
  {
    question: {
      de: 'Wie gut kannst du unter Druck klare Entscheidungen treffen?',
      en: 'How well can you make clear decisions under pressure?',
    },
    options: [
      { label: { de: 'Werde unsicher und zögere', en: 'Become uncertain and hesitate' }, score: 1 },
      { label: { de: 'Brauche länger als normal', en: 'Takes longer than usual' }, score: 2 },
      { label: { de: 'Meistens gut, aber nicht immer', en: 'Usually good, but not always' }, score: 3 },
      { label: { de: 'Druck macht mich fokussierter', en: 'Pressure makes me more focused' }, score: 4 },
    ],
  },
  {
    question: {
      de: 'Wie oft sabotierst du dich selbst (Prokrastination, Vermeidung)?',
      en: 'How often do you self-sabotage (procrastination, avoidance)?',
    },
    options: [
      { label: { de: 'Täglich', en: 'Daily' }, score: 1 },
      { label: { de: 'Mehrmals pro Woche', en: 'Several times a week' }, score: 2 },
      { label: { de: 'Gelegentlich', en: 'Occasionally' }, score: 3 },
      { label: { de: 'Praktisch nie', en: 'Practically never' }, score: 4 },
    ],
  },
  {
    question: {
      de: 'Wie gut schläfst du in stressigen Phasen?',
      en: 'How well do you sleep during stressful periods?',
    },
    options: [
      { label: { de: 'Schlecht — Gedankenkarussell', en: 'Poorly — racing thoughts' }, score: 1 },
      { label: { de: 'Unruhig, wache oft auf', en: 'Restless, wake up often' }, score: 2 },
      { label: { de: 'Okay, aber nicht optimal', en: 'Okay, but not optimal' }, score: 3 },
      { label: { de: 'Gut — ich kann abschalten', en: 'Well — I can switch off' }, score: 4 },
    ],
  },
  {
    question: {
      de: 'Wie reagierst du auf Ablehnung im Sales-Kontext?',
      en: 'How do you respond to rejection in a sales context?',
    },
    options: [
      { label: { de: 'Nehme es persönlich', en: 'Take it personally' }, score: 1 },
      { label: { de: 'Es nagt an mir', en: 'It gnaws at me' }, score: 2 },
      { label: { de: 'Kann es meistens einordnen', en: 'Can usually put it in perspective' }, score: 3 },
      { label: { de: 'Teil des Spiels — kein Problem', en: 'Part of the game — no problem' }, score: 4 },
    ],
  },
  {
    question: {
      de: 'Wie oft fühlst du dich emotional erschöpft nach der Arbeit?',
      en: 'How often do you feel emotionally exhausted after work?',
    },
    options: [
      { label: { de: 'Jeden Tag', en: 'Every day' }, score: 1 },
      { label: { de: 'Mehrmals pro Woche', en: 'Several times a week' }, score: 2 },
      { label: { de: 'Ab und zu', en: 'Occasionally' }, score: 3 },
      { label: { de: 'Selten — gutes Energiemanagement', en: 'Rarely — good energy management' }, score: 4 },
    ],
  },
  {
    question: {
      de: 'Wie gut kannst du dich in einem Call voll auf den Kunden fokussieren?',
      en: 'How well can you fully focus on the client during a call?',
    },
    options: [
      { label: { de: 'Bin oft abgelenkt', en: 'Often distracted' }, score: 1 },
      { label: { de: 'Schwankt stark', en: 'Fluctuates a lot' }, score: 2 },
      { label: { de: 'Meistens gut fokussiert', en: 'Usually well focused' }, score: 3 },
      { label: { de: 'Volle Präsenz — Deep Focus', en: 'Full presence — Deep Focus' }, score: 4 },
    ],
  },
  {
    question: {
      de: 'Wie würdest du dein allgemeines Stresslevel beschreiben?',
      en: 'How would you describe your general stress level?',
    },
    options: [
      { label: { de: 'Chronisch überlastet', en: 'Chronically overwhelmed' }, score: 1 },
      { label: { de: 'Häufig gestresst', en: 'Frequently stressed' }, score: 2 },
      { label: { de: 'Manageable', en: 'Manageable' }, score: 3 },
      { label: { de: 'Souverän und stabil', en: 'Confident and stable' }, score: 4 },
    ],
  },
];

interface ResultProfile {
  label: { de: string; en: string };
  description: { de: string; en: string };
  recommendation: { de: string; en: string };
  color: string;
}

function getResultProfile(pct: number): ResultProfile {
  if (pct >= 85) return {
    label: { de: 'Stabil & Souverän', en: 'Stable & Confident' },
    description: {
      de: 'Dein Nervensystem ist gut reguliert. Du arbeitest aus einem stabilen Zustand heraus.',
      en: 'Your nervous system is well regulated. You operate from a stable state.',
    },
    recommendation: {
      de: 'Halte dieses Niveau — und nutze Druckphasen als Trainingsfeld für noch mehr Klarheit.',
      en: 'Maintain this level — and use pressure phases as training ground for even more clarity.',
    },
    color: 'text-primary',
  };
  if (pct >= 60) return {
    label: { de: 'Solide Basis, Potenzial oben', en: 'Solid Base, Upside Potential' },
    description: {
      de: 'Du hast gute Grundlagen, aber unter Druck gibt es noch Schwankungen.',
      en: 'You have good foundations, but there are still fluctuations under pressure.',
    },
    recommendation: {
      de: 'Fokussiere dich auf Stabilität in High-Stake Situationen — das ist dein nächster Hebel.',
      en: 'Focus on stability in high-stake situations — that\'s your next lever.',
    },
    color: 'text-accent',
  };
  if (pct >= 40) return {
    label: { de: 'Ausbaufähig', en: 'Room for Growth' },
    description: {
      de: 'Stress und emotionale Reaktionen beeinflussen deine Performance merklich.',
      en: 'Stress and emotional reactions noticeably affect your performance.',
    },
    recommendation: {
      de: 'Gezielte Regulation deines Nervensystems kann deine Arbeit fundamental verändern.',
      en: 'Targeted regulation of your nervous system can fundamentally change your work.',
    },
    color: 'text-[hsl(var(--chart-4))]',
  };
  return {
    label: { de: 'Dringender Handlungsbedarf', en: 'Urgent Action Needed' },
    description: {
      de: 'Dein Nervensystem arbeitet im Überlebensmodus. Das kostet dich Deals, Energie und Gesundheit.',
      en: 'Your nervous system is in survival mode. This costs you deals, energy, and health.',
    },
    recommendation: {
      de: 'Priorisiere Regulation — jeder Tag ohne kostet dich Performance und Wohlbefinden.',
      en: 'Prioritize regulation — every day without costs you performance and well-being.',
    },
    color: 'text-destructive',
  };
}

const VOUCHER_CODE = `${PRODUCT.slug.toUpperCase()}VIP500`;
const RADIANT_LINK = 'https://yourradiantway.com';

export default function RadiantSelfAssessment() {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const { toast } = useToast();
  const { lang } = useLanguage();

  const progress = (current / QUESTIONS.length) * 100;

  const t = (de: string, en: string) => lang === 'de' ? de : en;

  const handleNext = () => {
    if (selected === null) return;
    const newAnswers = [...answers, QUESTIONS[current].options[selected].score];
    setAnswers(newAnswers);
    setSelected(null);

    if (current < QUESTIONS.length - 1) {
      setCurrent(current + 1);
    } else {
      setAnswers(newAnswers);
      setFinished(true);
    }
  };

  const handleRestart = () => {
    setCurrent(0);
    setAnswers([]);
    setSelected(null);
    setFinished(false);
  };

  const copyVoucher = async () => {
    await navigator.clipboard.writeText(VOUCHER_CODE);
    toast({ title: t('Code kopiert!', 'Code copied!'), description: VOUCHER_CODE });
  };

  if (finished) {
    const total = answers.reduce((s, v) => s + v, 0);
    const max = QUESTIONS.length * 4;
    const pct = Math.round((total / max) * 100);
    const result = getResultProfile(pct);

    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-5 sm:py-10">
        <div className="rounded-xl border border-border/40 bg-card p-6 sm:p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <Sparkles className="h-7 w-7 text-accent" />
          </div>
          <h2 className="font-serif text-xl font-semibold text-foreground mb-1">
            {t('Dein Ergebnis', 'Your Result')}
          </h2>
          <p className="text-3xl font-bold mb-1">{pct}%</p>
          <Badge className={`${result.color} bg-transparent border border-current text-[11px] mb-4`}>
            {result.label[lang]}
          </Badge>

          <p className="text-[13px] text-muted-foreground mb-3">{result.description[lang]}</p>
          <p className="text-[13px] text-foreground font-medium mb-6">{result.recommendation[lang]}</p>

          {/* Why this matters */}
          <div className="rounded-lg border border-accent/20 bg-accent/[0.04] p-4 mb-6 text-left">
            <p className="text-[12px] font-semibold text-foreground mb-1.5">
              {t('Warum das wichtig ist', 'Why this matters')}
            </p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {t(
                'Deine Performance hängt nicht nur von Skills ab, sondern maßgeblich von deinem inneren Zustand. Nervensystem-Regulation, Stressmuster und Entscheidungsfähigkeit unter Druck bestimmen, ob du in Gesprächen wirklich präsent bist — oder nur funktionierst.',
                'Your performance doesn\'t just depend on skills — it\'s fundamentally shaped by your internal state. Nervous system regulation, stress patterns, and decision-making under pressure determine whether you\'re truly present in conversations — or just going through the motions.'
              )}
            </p>
          </div>

          {/* Voucher */}
          <div className="rounded-lg border border-accent/30 bg-accent/[0.06] p-4 mb-4">
            <p className="text-[12px] font-semibold text-foreground mb-1">
              {t('Dein exklusiver Gutschein', 'Your exclusive voucher')}
            </p>
            <p className="text-[11px] text-muted-foreground mb-3">
              {t('€500 Wert — Zugang zur Radiant Nervous System Calibration', '€500 value — Access to Radiant Nervous System Calibration')}
            </p>
            <div className="flex items-center justify-center gap-2 mb-3">
              <code className="rounded-md bg-muted px-3 py-1.5 text-sm font-mono font-bold text-foreground">
                {VOUCHER_CODE}
              </code>
              <Button variant="outline" size="sm" className="text-xs h-8" onClick={copyVoucher}>
                <Copy className="h-3 w-3 mr-1" />
                {t('Kopieren', 'Copy')}
              </Button>
            </div>
            <a
              href={RADIANT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline"
            >
              {t('Jetzt einlösen', 'Redeem now')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Clarity Call */}
          <div className="rounded-lg border border-border/30 bg-muted/20 p-4 mb-4 text-left">
            <p className="text-[12px] font-semibold text-foreground mb-1">
              {t('Brauchst du Orientierung?', 'Need orientation?')}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
              {t(
                'Wenn du dich festgefahren fühlst oder Unterstützung brauchst, kannst du ein persönliches Gespräch buchen. Wir helfen dir, Klarheit zu gewinnen.',
                'If you feel stuck or need support, you can book a personal conversation. We help you gain clarity.'
              )}
            </p>
            <a
              href="https://yourradiantway.com/clarity-call"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline"
            >
              {t('Clarity Call buchen', 'Book a Clarity Call')}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <Button onClick={handleRestart} variant="outline" className="text-xs gap-2">
            <RotateCcw className="h-3 w-3" />
            {t('Erneut durchführen', 'Take again')}
          </Button>
        </div>
      </div>
    );
  }

  const q = QUESTIONS[current];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-5 sm:py-10">
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <h1 className="font-serif text-lg font-semibold tracking-tight text-foreground">Radiant Diagnostic</h1>
        </div>
        <p className="text-[12px] text-muted-foreground">
          {t(
            'Finde heraus, wo dein Nervensystem aktuell steht — ehrlich und vertraulich.',
            'Find out where your nervous system currently stands — honestly and confidentially.'
          )}
        </p>
      </div>

      <Progress value={progress} className="mb-6 h-1.5 bg-muted" />
      <p className="text-[10px] text-muted-foreground mb-4 text-center">
        {t('Frage', 'Question')} {current + 1} {t('von', 'of')} {QUESTIONS.length}
      </p>

      <div className="rounded-xl border border-border/40 bg-card p-5 sm:p-6 mb-4">
        <p className="text-[15px] font-semibold text-foreground mb-5">{q.question[lang]}</p>
        <div className="space-y-2">
          {q.options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => setSelected(idx)}
              className={`w-full text-left rounded-lg border p-3 text-[13px] transition-all ${
                selected === idx
                  ? 'border-accent/50 bg-accent/5 shadow-sm'
                  : 'border-border/40 bg-background hover:border-border/70'
              }`}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-[10px] font-bold text-muted-foreground mr-2.5">
                {String.fromCharCode(65 + idx)}
              </span>
              {opt.label[lang]}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={handleNext} disabled={selected === null} className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs" size="sm">
        {current < QUESTIONS.length - 1 ? t('Weiter', 'Next') : t('Ergebnis anzeigen', 'Show result')}
        <ArrowRight className="ml-2 h-3 w-3" />
      </Button>
    </div>
  );
}
