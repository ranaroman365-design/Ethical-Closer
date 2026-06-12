import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/i18n/LanguageContext';

type Mode = 'closing' | 'top' | 'ethical';

const MODES: { key: Mode; label: { de: string; en: string }; color: string }[] = [
  { key: 'closing', label: { de: 'Closing', en: 'Closing' }, color: 'bg-destructive/15 text-destructive' },
  { key: 'top', label: { de: 'Top Closing', en: 'Top Closing' }, color: 'bg-[hsl(30,80%,50%)]/15 text-[hsl(30,80%,45%)]' },
  { key: 'ethical', label: { de: 'Ethical Top Closing', en: 'Ethical Top Closing' }, color: 'bg-primary/15 text-primary' },
];

const DATA: Record<Mode, { response: { de: string; en: string }; results: { de: string[]; en: string[] } }> = {
  closing: {
    response: {
      de: '„Ich verstehe, aber wenn du weiter wartest, wird sich nichts ändern. Lass uns das jetzt festmachen."',
      en: '"I understand, but if you keep waiting, nothing will change. Let\'s lock this in now."',
    },
    results: {
      de: ['Druck entsteht', 'Vertrauen sinkt', 'Widerstand steigt'],
      en: ['Pressure builds', 'Trust drops', 'Resistance rises'],
    },
  },
  top: {
    response: {
      de: '„Was genau hält dich gerade davon ab, jetzt zu starten?"',
      en: '"What exactly is holding you back from starting right now?"',
    },
    results: {
      de: ['Bessere Klarheit', 'Aber noch oberflächlich', 'Widerstand bleibt teilweise'],
      en: ['Better clarity', 'But still surface-level', 'Resistance partially remains'],
    },
  },
  ethical: {
    response: {
      de: '„Was genau macht es für dich gerade schwierig, den nächsten Schritt zu gehen?"\n\n(Pause)\n\n„Woran würdest du merken, dass es sich wirklich richtig anfühlt?"',
      en: '"What exactly makes it difficult for you right now to take the next step?"\n\n(Pause)\n\n"How would you know if it truly felt right?"',
    },
    results: {
      de: ['Reflexion entsteht', 'Widerstand löst sich', 'Entscheidung wird möglich'],
      en: ['Reflection emerges', 'Resistance dissolves', 'Decision becomes possible'],
    },
  },
};

const RESULT_COLORS: Record<Mode, string> = {
  closing: 'border-destructive/20 bg-destructive/5',
  top: 'border-[hsl(30,80%,50%)]/20 bg-[hsl(30,80%,50%)]/5',
  ethical: 'border-primary/20 bg-primary/5',
};

export default function LiveConversationExample() {
  const [mode, setMode] = useState<Mode>('closing');
  const { lang } = useLanguage();
  const de = lang === 'de';

  const current = DATA[mode];

  return (
    <section className="mb-24">
      {/* Headline */}
      <h2 className="mb-2 text-center font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
        {de ? 'So fühlt sich der Unterschied an' : 'Feel the Difference'}
      </h2>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        {de ? 'Drei Arten zu führen. Drei völlig unterschiedliche Ergebnisse.' : 'Three ways to lead. Three completely different outcomes.'}
      </p>

      {/* Segmented Control */}
      <div className="mx-auto mb-8 flex max-w-md rounded-full border border-border bg-muted/50 p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`relative flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-all duration-200 sm:text-sm ${
              mode === m.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground/70'
            }`}
          >
            {m.label[de ? 'de' : 'en']}
          </button>
        ))}
      </div>

      {/* Scenario Setup */}
      <div className="mb-6 rounded-xl border border-border bg-foreground/[0.02] px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          {de ? 'Lead sagt:' : 'Lead says:'}
        </p>
        <p className="font-serif text-base text-foreground italic">
          {de
            ? '„Ich bin interessiert… aber ich bin mir nicht sicher, ob jetzt der richtige Zeitpunkt ist."'
            : '"I\'m interested… but I\'m not sure if now is the right time."'}
        </p>
      </div>

      {/* Response + Results */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          {/* Response */}
          <div className="rounded-xl border border-border bg-card px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              {de ? 'Antwort:' : 'Response:'}
            </p>
            <p className="whitespace-pre-line font-serif text-base leading-relaxed text-foreground">
              {current.response[de ? 'de' : 'en']}
            </p>
          </div>

          {/* Results */}
          <div className={`rounded-xl border px-6 py-5 ${RESULT_COLORS[mode]}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              {de ? 'Ergebnis:' : 'Result:'}
            </p>
            <ul className="space-y-1.5">
              {current.results[de ? 'de' : 'en'].map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    mode === 'closing' ? 'bg-destructive' : mode === 'top' ? 'bg-[hsl(30,80%,50%)]' : 'bg-primary'
                  }`} />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Callout */}
      <div className="mt-6 rounded-xl border border-accent/20 bg-accent/5 px-6 py-4 text-center">
        <p className="font-serif text-sm text-foreground">
          {de
            ? 'Der Unterschied ist nicht die Frage. Der Unterschied ist die Tiefe der Wahrnehmung.'
            : 'The difference is not the question. The difference is the depth of perception.'}
        </p>
      </div>
    </section>
  );
}
