import { useState, useEffect } from 'react';
import { PRODUCT } from '@/config/product';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ClosingModeProvider, useClosingMode, ClosingMode } from '@/contexts/ClosingModeContext';
import { Textarea } from '@/components/ui/textarea';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/i18n/LanguageContext';

const ease = [0.25, 0.1, 0.25, 1] as const;
const fade = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease } };

/* ── 3-Mode Switch (inline) ── */
function ThreeModeSwitch({ modes, active, onChange }: {
  modes: { key: string; label: string; color: string }[];
  active: string;
  onChange: (k: string) => void;
}) {
  const activeIdx = modes.findIndex(m => m.key === active);
  return (
    <div className="mx-auto flex max-w-md rounded-full border border-border bg-muted/50 p-1">
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="absolute rounded-full"
        style={{
          width: `calc(${100 / modes.length}% - 4px)`,
          left: `calc(${activeIdx * (100 / modes.length)}% + 2px)`,
          height: 'calc(100% - 8px)',
          top: 4,
          background: modes[activeIdx]?.color || 'hsl(var(--primary))',
        }}
      />
      {modes.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className={`relative z-10 flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-all duration-200 sm:text-sm ${
            active === m.key ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground/70'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/* ── Scenario Block ── */
interface ScenarioContent {
  response: string;
  effects: { text: string; positive: boolean }[];
}

function ScenarioBlock({ setup, modes, data, onSwitchCount }: {
  setup: string;
  modes: { key: string; label: string; color: string; dotColor: string }[];
  data: Record<string, ScenarioContent>;
  onSwitchCount?: (count: number) => void;
}) {
  const [active, setActive] = useState(modes[0].key);
  const [switchCount, setSwitchCount] = useState(0);
  const current = data[active];
  const activeMeta = modes.find(m => m.key === active)!;
  const { tx } = useLanguage();

  const handleSwitch = (key: string) => {
    if (key !== active) {
      const newCount = switchCount + 1;
      setSwitchCount(newCount);
      onSwitchCount?.(newCount);
    }
    setActive(key);
  };

  return (
    <div className="space-y-6">
      {/* Switch */}
      <div className="mx-auto flex max-w-md rounded-full border border-border bg-muted/50 p-1 relative">
        {modes.map((m, i) => (
          <button
            key={m.key}
            onClick={() => handleSwitch(m.key)}
            className={`relative z-10 flex-1 rounded-full px-3 py-2.5 text-xs font-semibold transition-all duration-200 sm:text-sm ${
              active === m.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground/70'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Lead says */}
      <div className="rounded-xl border border-border bg-foreground/[0.02] px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{tx('Lead sagt:', 'Lead says:')}</p>
        <p className="font-serif text-base text-foreground italic">„{setup}"</p>
      </div>

      {/* Response + Effects */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          <div className="rounded-xl border border-border bg-card px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{tx('Antwort:', 'Response:')}</p>
            <p className="whitespace-pre-line font-serif text-base leading-relaxed text-foreground">
              {current.response}
            </p>
          </div>

          <div className={`rounded-xl border px-6 py-5 ${
            active === 'closing' ? 'border-destructive/20 bg-destructive/5' :
            active === 'top' ? 'border-orange-500/20 bg-orange-500/5' :
            'border-primary/20 bg-primary/5'
          }`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{tx('Wirkung:', 'Effect:')}</p>
            <ul className="space-y-1.5">
              {current.effects.map((e, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${activeMeta.dotColor}`} />
                  {e.text}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ── Pop-up Dialog ── */
function InsightPopup({ onContinue, onNotYet }: { onContinue: () => void; onNotYet: () => void }) {
  const { tx } = useLanguage();
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="mx-6 max-w-[400px] rounded-2xl border border-border bg-card px-8 py-8 text-center shadow-xl"
      >
        <p className="font-serif text-lg text-foreground">{tx('Spürst du den Unterschied?', 'Can you feel the difference?')}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={onContinue}
            className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tx('Ja', 'Yes')}
          </button>
          <button
            onClick={onNotYet}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/30"
          >
            {tx('Noch nicht ganz', 'Not quite yet')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Main Inner Component ── */
function PhilosophyInner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { tx } = useLanguage();
  const [entered, setEntered] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [showPopup1, setShowPopup1] = useState(false);
  const [popup1Done, setPopup1Done] = useState(false);
  const [showExplanation1, setShowExplanation1] = useState(false);
  const [showPopup2, setShowPopup2] = useState(false);
  const [popup2Done, setPopup2Done] = useState(false);
  const [reflection, setReflection] = useState('');
  const [scenario1Interacted, setScenario1Interacted] = useState(false);
  const [scenario2Interacted, setScenario2Interacted] = useState(false);
  const [sliderSwitchCount, setSliderSwitchCount] = useState(0);
  const [showSliderMessage, setShowSliderMessage] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('onboarding_progress')
      .select('completed')
      .eq('user_id', user.id)
      .eq('item_key', 'philosophy_completed')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.completed) { setCompleted(true); setEntered(true); }
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (!entered) {
      const timer = setTimeout(() => setCtaVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [entered]);

  const handleSliderSwitch = (count: number) => {
    setSliderSwitchCount(count);
    if (count === 3 && !showSliderMessage && !popup1Done) {
      setShowSliderMessage(true);
      setTimeout(() => setShowPopup1(true), 800);
    }
  };

  useEffect(() => {
    if (scenario2Interacted && !popup2Done) {
      const t = setTimeout(() => setShowPopup2(true), 800);
      return () => clearTimeout(t);
    }
  }, [scenario2Interacted, popup2Done]);

  const handleComplete = async () => {
    if (!user) return;
    const { error } = await supabase.from('onboarding_progress').upsert(
      { user_id: user.id, item_key: 'philosophy_completed', completed: true, completed_at: new Date().toISOString() },
      { onConflict: 'user_id,item_key' }
    );
    if (error) {
      toast({ title: tx('Fehler', 'Error'), description: error.message, variant: 'destructive' });
      return;
    }
    setCompleted(true);
    toast({ title: tx('Mission abgeschlossen – Academy freigeschaltet', 'Mission complete – Academy unlocked') });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  /* ── HERO / ENTRY ── */
  if (!entered) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 bg-background">
        <motion.div {...fade} className="max-w-[640px] text-center">
          <h1 className="font-serif text-3xl leading-[1.25] tracking-tight text-foreground sm:text-4xl md:text-5xl">
            {tx('Es geht nicht um Verkauf.\nEs geht um Entscheidung.', 'It\'s not about selling.\nIt\'s about decision.')}
          </h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 1 }}
            className="mt-8 text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            {tx(
              'Die meisten Gespräche scheitern nicht an Argumenten.\nSondern daran, dass Menschen innerlich nicht bereit sind zu entscheiden.\n\nGenau hier setzt Ethical Top Closing an.',
              'Most conversations don\'t fail because of arguments.\nBut because people aren\'t internally ready to decide.\n\nThis is exactly where Ethical Top Closing begins.'
            )}
          </motion.p>
          <AnimatePresence>
            {ctaVisible && (
              <motion.button
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                onClick={() => setEntered(true)}
                className="mt-12 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-8 py-3.5 font-serif text-sm font-medium text-foreground transition-colors hover:bg-accent/20"
              >
                {tx('Mission entdecken', 'Discover the mission')}
                <ArrowRight className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  /* ── MAIN CONTENT ── */
  return (
    <div className="min-h-screen bg-background">
      {/* Pop-ups */}
      <AnimatePresence>
        {showPopup1 && (
          <InsightPopup
            onContinue={() => { setShowPopup1(false); setPopup1Done(true); }}
            onNotYet={() => {
              setShowPopup1(false);
              setPopup1Done(true);
              setShowExplanation1(true);
            }}
          />
        )}
        {showPopup2 && (
          <InsightPopup
            onContinue={() => { setShowPopup2(false); setPopup2Done(true); }}
            onNotYet={() => { setShowPopup2(false); setPopup2Done(true); }}
          />
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="mx-auto max-w-[720px] px-6 py-16 sm:py-24">

        {/* ── MISSION STATEMENT — Premium Identity Block ── */}
        <section className="mb-28 sm:mb-36 text-center">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.1 }}
            className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground"
          >
            {tx('Unsere Mission', 'Our Mission')}
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="mt-10 font-serif text-2xl leading-[1.35] tracking-tight text-foreground sm:text-3xl md:text-[2.5rem] md:leading-[1.3]"
          >
            {tx(
              'Wir formen Menschen, die Verantwortung übernehmen —',
              'We shape people who take responsibility —'
            )}
            <br />
            <span className="text-muted-foreground">
              {tx(
                'für ihr Leben, ihr Einkommen und ihren Einfluss.',
                'for their life, their income, and their impact.'
              )}
            </span>
          </motion.h2>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="mx-auto mt-12 h-px w-16 bg-accent/40 origin-center"
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.9 }}
            className="mt-12 space-y-1"
          >
            <p className="font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {tx('Hier geht es nicht um Wissen, sondern um Umsetzung.', 'This is not about knowledge, but about execution.')}
            </p>
            <p className="font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {tx('Nicht um Theorie, sondern um echte Ergebnisse.', 'Not about theory, but about real results.')}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1.3 }}
            className="mt-16"
          >
            <p className="font-serif text-xl leading-[1.4] text-foreground sm:text-2xl md:text-[1.75rem]">
              {tx(
                'Du lernst nicht nur Closing —\ndu wirst zu jemandem, der Ergebnisse erzeugt.',
                'You don\'t just learn closing —\nyou become someone who creates results.'
              )}
            </p>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 1.8 }}
            className="mt-14 text-sm tracking-wide text-muted-foreground/60"
          >
            {tx('Das ist kein Kurs.\nDas ist ein Weg.', 'This is not a course.\nThis is a path.')}
          </motion.p>
        </section>

        {/* ── SECTION 2: Erlebnisblock 1 (3 Modes) ── */}
        <section className="mb-20">
          <h2 className="mb-2 text-center font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
            {tx('Vergleiche die drei Ansätze', 'Compare the three approaches')}
          </h2>
          <p className="mb-8 text-center text-sm text-muted-foreground">
            {tx('Gleiche Situation. Drei völlig unterschiedliche Ergebnisse.', 'Same situation. Three completely different results.')}
          </p>

          <div>
            <ScenarioBlock
              setup={tx(
                'Ich bin interessiert… aber ich bin mir nicht sicher, ob jetzt der richtige Zeitpunkt ist.',
                'I\'m interested… but I\'m not sure if now is the right time.'
              )}
              modes={[
                { key: 'closing', label: 'Closing', color: 'hsl(var(--destructive))', dotColor: 'bg-destructive' },
                { key: 'top', label: 'Top Closing', color: 'hsl(30 80% 50%)', dotColor: 'bg-orange-500' },
                { key: 'ethical', label: 'Ethical', color: 'hsl(var(--primary))', dotColor: 'bg-primary' },
              ]}
              data={{
                closing: {
                  response: tx(
                    '„Wenn du weiter wartest, wird sich nichts ändern.\nLass uns das jetzt festmachen."',
                    '"If you keep waiting, nothing will change.\nLet\'s lock this in now."'
                  ),
                  effects: [
                    { text: tx('Wirkt unprofessionell', 'Appears unprofessional'), positive: false },
                    { text: tx('Kunde geht in Abwehr', 'Customer becomes defensive'), positive: false },
                    { text: tx('Entscheidung wird unwahrscheinlicher', 'Decision becomes less likely'), positive: false },
                  ],
                },
                top: {
                  response: tx(
                    '„Was genau hält dich gerade davon ab, jetzt zu starten?"',
                    '"What exactly is holding you back from starting now?"'
                  ),
                  effects: [
                    { text: tx('Erzeugt Druck', 'Creates pressure'), positive: false },
                    { text: tx('Aber noch oberflächlich', 'But still surface-level'), positive: false },
                    { text: tx('Widerstand bleibt teilweise bestehen', 'Resistance partially remains'), positive: false },
                  ],
                },
                ethical: {
                  response: tx(
                    '„Was genau macht es für dich gerade schwierig, den nächsten Schritt zu gehen?"\n\n(Pause)\n\n„Woran würdest du merken, dass es sich wirklich richtig anfühlt?"',
                    '"What exactly makes it difficult for you to take the next step right now?"\n\n(Pause)\n\n"How would you know it truly feels right?"'
                  ),
                  effects: [
                    { text: tx('Schafft Entscheidungsbereitschaft', 'Creates decision readiness'), positive: true },
                    { text: tx('Widerstand wird bewusst', 'Resistance becomes conscious'), positive: true },
                    { text: tx('Entscheidung wird möglich', 'Decision becomes possible'), positive: true },
                  ],
                },
              }}
              onSwitchCount={handleSliderSwitch}
            />
          </div>

          <AnimatePresence>
            {showSliderMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-8 rounded-xl border border-primary/20 bg-primary/5 px-6 py-6 text-center"
              >
                <p className="font-serif text-lg text-foreground leading-relaxed">
                  {tx('Spürst du den Unterschied?', 'Can you feel the difference?')}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tx('Genau deshalb existiert dieses System.', 'This is exactly why this system exists.')}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showExplanation1 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 rounded-xl border border-accent/20 bg-accent/5 px-6 py-5"
              >
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {tx(
                    'Der Unterschied liegt nicht in den Worten – sondern in der Haltung dahinter.',
                    'The difference isn\'t in the words — but in the attitude behind them.'
                  )}
                  <strong className="text-foreground"> Closing</strong> {tx('erzeugt Druck.', 'creates pressure.')}
                  <strong className="text-foreground"> Top Closing</strong> {tx('stellt die richtige Frage.', 'asks the right question.')}
                  <strong className="text-foreground"> Ethical Top Closing</strong> {tx('öffnet einen Raum, in dem der Mensch sich selbst erkennt.', 'opens a space where the person recognizes themselves.')}
                </p>
                <p className="mt-3 text-sm text-foreground font-medium">
                  {tx('Wechsle nochmal zwischen den drei Modi – und achte auf dein eigenes Gefühl dabei.', 'Switch between the three modes again — and pay attention to how you feel.')}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ── SECTION 3: Erlebnisblock 2 (2 Modes – Vertiefung) ── */}
        <section className="mb-20">
          <h2 className="mb-2 text-center font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
            {tx('Der feine Unterschied', 'The subtle difference')}
          </h2>
          <p className="mb-8 text-center text-sm text-muted-foreground">
            {tx('Jetzt nur noch zwei Ebenen.', 'Now just two levels.')}
          </p>

          <div onClick={() => !scenario2Interacted && setScenario2Interacted(true)}>
            <ScenarioBlock
              setup={tx('Ich muss nochmal darüber nachdenken.', 'I need to think about it again.')}
              modes={[
                { key: 'top', label: 'Top Closing', color: 'hsl(30 80% 50%)', dotColor: 'bg-orange-500' },
                { key: 'ethical', label: 'Ethical', color: 'hsl(var(--primary))', dotColor: 'bg-primary' },
              ]}
              data={{
                top: {
                  response: tx('„Was genau musst du noch klären?"', '"What exactly do you still need to clarify?"'),
                  effects: [
                    { text: tx('Rational', 'Rational'), positive: true },
                    { text: tx('Korrekt', 'Correct'), positive: true },
                    { text: tx('Aber begrenzt', 'But limited'), positive: false },
                  ],
                },
                ethical: {
                  response: tx(
                    '„Was genau fühlt sich noch nicht klar genug an, um jetzt zu entscheiden?"\n\n(Pause)\n\n„Ist es eher Unsicherheit – oder fehlendes Vertrauen?"',
                    '"What exactly doesn\'t feel clear enough to decide right now?"\n\n(Pause)\n\n"Is it more uncertainty — or a lack of trust?"'
                  ),
                  effects: [
                    { text: tx('Emotionale Ebene wird sichtbar', 'Emotional layer becomes visible'), positive: true },
                    { text: tx('Echte Ursache kommt hoch', 'Real cause surfaces'), positive: true },
                    { text: tx('Entscheidung wird ehrlich', 'Decision becomes honest'), positive: true },
                  ],
                },
              }}
            />
          </div>
        </section>

        {/* ── SECTION 4: Philosophische Einordnung ── */}
        <motion.section {...fade} className="mb-20">
          <h2 className="mb-6 text-center font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
            {tx('Was hier wirklich passiert', 'What\'s really happening here')}
          </h2>
          <div className="mx-auto max-w-[560px] space-y-4 text-base leading-[1.85] text-muted-foreground">
            <p>{tx('Ethical Top Closing bedeutet nicht, besser zu argumentieren.', 'Ethical Top Closing doesn\'t mean arguing better.')}</p>
            <p className="text-foreground font-medium">{tx('Es bedeutet, besser zu sehen.', 'It means seeing better.')}</p>
            <p>{tx('Du hilfst einem Menschen:', 'You help a person:')}</p>
            <ul className="space-y-1 pl-4">
              <li className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {tx('sich selbst zu erkennen', 'recognize themselves')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {tx('seinen eigenen Widerstand zu verstehen', 'understand their own resistance')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                {tx('und dadurch frei zu entscheiden', 'and therefore decide freely')}
              </li>
            </ul>
            <p>{tx('Das ist kein Verkauf.', 'This is not selling.')}</p>
            <p className="text-foreground font-medium">{tx('Das ist ein Moment von Klarheit.', 'This is a moment of clarity.')}</p>
          </div>

          <div className="mt-10 rounded-xl border border-accent/20 bg-accent/5 px-6 py-6 text-center">
            <p className="font-serif text-base text-foreground">
              {tx('Du schließt keine Menschen.\nDu öffnest Bewusstsein.', 'You don\'t close people.\nYou open awareness.')}
            </p>
          </div>
        </motion.section>

        {/* ── SECTION 5: Brücke zu Radiant ── */}
        <motion.section {...fade} className="mb-20">
          <h2 className="mb-6 text-center font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
            {tx('Und was hat das mit dir zu tun?', 'And what does this have to do with you?')}
          </h2>
          <div className="mx-auto max-w-[560px] space-y-4 text-base leading-[1.85] text-muted-foreground text-center">
            <p>{tx('Du kannst andere nur dann klar führen,\nwenn du selbst klar bist.', 'You can only lead others clearly\nwhen you are clear yourself.')}</p>
            <p><strong className="text-foreground">Radiant</strong> {tx('ist die Fähigkeit,\nauch unter Druck entscheidungsfähig zu bleiben.', 'is the ability\nto remain decisive even under pressure.')}</p>
            <p className="text-foreground font-medium">{tx('Zusammen entsteht: → Decision Mastery', 'Together they create: → Decision Mastery')}</p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">{PRODUCT.nameTM}</p>
              <p className="mt-1 text-sm text-muted-foreground">{tx('Externe Entscheidungsaktivierung', 'External decision activation')}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {tx(
                  'Die Fähigkeit, einen anderen Menschen in das Bewusstsein seines eigenen Widerstands zu führen — damit er bereit wird zu entscheiden.',
                  'The ability to guide another person into awareness of their own resistance — so they become ready to decide.'
                )}
              </p>
            </div>
            <div className="rounded-xl border border-border p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">Radiant™</p>
              <p className="mt-1 text-sm text-muted-foreground">{tx('Interne Entscheidungsstabilität', 'Internal decision stability')}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {tx(
                  'Die Fähigkeit, klar, reguliert und entscheidungsfähig zu bleiben — selbst unter Druck.',
                  'The ability to remain clear, regulated, and decisive — even under pressure.'
                )}
              </p>
            </div>
          </div>
        </motion.section>

        {/* ── SECTION 6: Mini-Reflexion ── */}
        <motion.section {...fade} className="mb-20">
          <h2 className="mb-6 text-center font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
            {tx('Eine kurze Frage', 'A quick question')}
          </h2>
          <div className="mx-auto max-w-[520px]">
            <p className="mb-4 text-center text-base text-muted-foreground italic">
              {tx(
                'Wann hast du zuletzt gewusst, was richtig wäre –\nund es trotzdem nicht getan?',
                'When was the last time you knew what was right —\nand still didn\'t do it?'
              )}
            </p>
            <Textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder={tx('Deine Antwort (nur für dich)...', 'Your answer (just for you)...')}
              className="min-h-[80px] resize-none border-border/50 bg-card text-sm"
            />
            <p className="mt-3 text-center text-xs text-muted-foreground/60">
              {tx('Genau hier beginnt diese Fähigkeit.', 'This is exactly where this skill begins.')}
            </p>
          </div>
        </motion.section>

        {/* ── SECTION 7: Unlock / CTA ── */}
        <motion.section {...fade} className="rounded-2xl border border-border bg-card px-6 py-10 text-center sm:px-10">
          {completed ? (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <p className="font-serif text-lg text-foreground">{tx('Mission abgeschlossen.', 'Mission complete.')}</p>
              <p className="mt-2 text-sm text-muted-foreground">{tx('Die Academy ist freigeschaltet.', 'The Academy is unlocked.')}</p>
              <button
                onClick={() => navigate('/members/academy')}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 font-serif text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {tx('Academy starten', 'Start Academy')}
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <h2 className="mb-4 font-serif text-xl text-foreground">{tx('Der nächste Schritt', 'The next step')}</h2>
              <p className="mx-auto max-w-[460px] text-sm leading-relaxed text-muted-foreground">
                {tx(
                  'Wenn du diesen Unterschied verstanden hast,\nbist du bereit für den nächsten Schritt.\n\nJetzt lernst du, wie du diese Gespräche systematisch führst.',
                  'If you\'ve understood this difference,\nyou\'re ready for the next step.\n\nNow you\'ll learn how to lead these conversations systematically.'
                )}
              </p>
              <button
                onClick={handleComplete}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 font-serif text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {tx('Academy starten', 'Start Academy')}
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </motion.section>
      </motion.div>
    </div>
  );
}

export default function Philosophy() {
  return (
    <ClosingModeProvider>
      <PhilosophyInner />
    </ClosingModeProvider>
  );
}
