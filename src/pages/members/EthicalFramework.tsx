import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PRODUCT } from '@/config/product';
import { ArrowRight, Check, ChevronDown, ChevronUp, AlertTriangle, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { ClosingModeProvider, useClosingMode } from '@/contexts/ClosingModeContext';
import ModeSwitch from '@/components/members/ModeSwitch';
import DualModeBlock from '@/components/members/DualModeBlock';

const ease = [0.25, 0.1, 0.25, 1] as const;

interface Stage {
  number: number;
  title: { de: string; en: string };
  subtitle: { de: string; en: string };
  purpose: { de: string; en: string };
  teaching: { de: string; en: string };
  teachingTop: { de: string; en: string };
  questions: { de: string; en: string }[];
  greenFlags: { de: string; en: string }[];
  redFlags: { de: string; en: string }[];
  leadFeels: { de: string; en: string };
  beginnerMistake: { de: string; en: string };
}

const STAGES: Stage[] = [
  {
    number: 1,
    title: { de: 'Ankommen', en: 'Arrival' },
    subtitle: {
      de: 'Ruhe, Vertrauen und Offenheit schaffen – bevor der Inhalt beginnt.',
      en: 'Create calm, trust, and openness before content.',
    },
    purpose: {
      de: 'Sicherheit, Präsenz und Erlaubnis für echte Gespräche schaffen.',
      en: 'Create safety, presence, and relational permission.',
    },
    teaching: {
      de: `Jedes echte Entscheidungsgespräch beginnt vor der ersten echten Frage.

Es beginnt mit Tonalität, Tempo, Aufmerksamkeit und Sicherheit.

Wenn die Person sich unter Druck gesetzt, beobachtet oder manipuliert fühlt,
wird Bewusstheit sich nicht öffnen.`,
      en: `Every real decision conversation begins before the first real question.

It begins with tone, pace, attention, and safety.

If the person feels pressured, guarded, or handled,
awareness will not open.`,
    },
    teachingTop: {
      de: `Rapport schnell aufbauen und die Kontrolle über das Gespräch übernehmen. Den Rahmen früh setzen, damit der Interessent weiß, dass du führst. Spiegeln und Matching nutzen, um schnell Autorität aufzubauen.`,
      en: `Build rapport quickly and take control of the conversation. Set the frame early so the prospect knows you're leading. Use mirroring and matching to establish authority fast.`,
    },
    questions: [
      { de: '„Bevor wir tiefer gehen – was ist dir heute am wichtigsten?"', en: '"Before we go deeper, what feels most important for you today?"' },
      { de: '„Was hat dich dazu gebracht, dir dafür Zeit zu nehmen?"', en: '"What made this worth your time?"' },
      { de: '„Was würde dieses Gespräch für dich wirklich nützlich machen?"', en: '"What would make this conversation genuinely useful for you?"' },
    ],
    greenFlags: [
      { de: 'Ruhig', en: 'Calm' },
      { de: 'Präzise', en: 'Precise' },
      { de: 'Präsent', en: 'Present' },
      { de: 'Neugierig', en: 'Curious' },
    ],
    redFlags: [
      { de: 'Zu viel reden', en: 'Over-talking' },
      { de: 'Zu früh pitchen', en: 'Premature pitching' },
      { de: 'Erzwungener Rapport', en: 'Forced rapport' },
      { de: 'Zu schnell zum Abschluss', en: 'Jumping to close' },
    ],
    leadFeels: {
      de: 'Sicher genug, um ehrlich zu sein. Nicht verkauft.',
      en: 'Safe enough to be honest. Not sold to.',
    },
    beginnerMistake: {
      de: 'In die Diagnose gehen, bevor die Person sich gesehen fühlt.',
      en: 'Rushing into diagnosis before the person feels seen.',
    },
  },
  {
    number: 2,
    title: { de: 'Kontext', en: 'Context' },
    subtitle: {
      de: 'Die sichtbare Realität verstehen, bevor das tiefere Muster erforscht wird.',
      en: 'Understand the surface reality before exploring the deeper pattern.',
    },
    purpose: {
      de: 'Die externe Situation und das gewünschte Ergebnis verstehen.',
      en: 'Understand the external situation and desired outcome.',
    },
    teaching: {
      de: `Zuerst die sichtbare Geschichte verstehen:
Situation, Ziel, Zeitrahmen, Frustration, Bedeutung.

Nicht zu früh interpretieren.

Lass die Person ihre Welt offenlegen.`,
      en: `First understand the visible story:
situation, goal, timeline, frustration, stakes.

Do not interpret too early.

Let the person reveal their world.`,
    },
    teachingTop: {
      de: `Schnell Informationen sammeln. Schmerzpunkte, Budget und Zeitrahmen identifizieren. Den Interessenten früh qualifizieren, um keine Zeit mit Nicht-Käufern zu verschwenden. Gezielte Fragen nutzen, um den Kauftrigger zu finden.`,
      en: `Gather intel fast. Identify pain points, budget, and timeline. Qualify the prospect early so you don't waste time on non-buyers. Use probing questions to find the hot button.`,
    },
    questions: [
      { de: '„Was passiert gerade, das dieses Thema relevant gemacht hat?"', en: '"What is happening right now that made this relevant?"' },
      { de: '„Was möchtest du verändern?"', en: '"What are you trying to change?"' },
      { de: '„Wie würde ein starkes Ergebnis für dich aussehen?"', en: '"What would a strong outcome look like for you?"' },
      { de: '„Wie lange beschäftigt dich das schon?"', en: '"How long has this been on your mind?"' },
    ],
    greenFlags: [
      { de: 'Strukturiertes Zuhören', en: 'Structured listening' },
      { de: 'Präzise Zusammenfassungen', en: 'Accurate summaries' },
      { de: 'Klares situatives Verständnis', en: 'Clear situational understanding' },
    ],
    redFlags: [
      { de: 'Annahmen treffen', en: 'Assuming' },
      { de: 'Projizieren', en: 'Projecting' },
      { de: 'Zu früh Lösungen geben', en: 'Prescribing too early' },
    ],
    leadFeels: {
      de: 'Gehört und verstanden. Nicht verhört.',
      en: 'Heard and understood. Not interrogated.',
    },
    beginnerMistake: {
      de: 'Die Situation annehmen, bevor die Person sie zu Ende beschrieben hat.',
      en: 'Assuming the situation before the person has finished describing it.',
    },
  },
  {
    number: 3,
    title: { de: 'Reibung', en: 'Friction' },
    subtitle: {
      de: 'Die Spannung zwischen Wunsch und dem, was sich wiederholt, lokalisieren.',
      en: 'Locate the tension between what they want and what keeps repeating.',
    },
    purpose: {
      de: 'Die Lücke zwischen Verlangen und Nicht-Handeln sichtbar machen.',
      en: 'Reveal the gap between desire and non-action.',
    },
    teaching: {
      de: `Hier beginnt das eigentliche Gespräch.

Die meisten Menschen brauchen keine weiteren Informationen.
Sie müssen verstehen, warum sie sich immer noch nicht bewegen.

Der Reibungspunkt ist das Tor zur Bewusstheit.`,
      en: `This is where the real conversation begins.

Most people do not need more information.
They need to understand why they are still not moving.

The friction point is the gateway to awareness.`,
    },
    teachingTop: {
      de: `Einwände bearbeiten und Momentum aufrechterhalten. Wenn der Interessent zögert, den Widerstand schnell überwinden. Dringlichkeit und Logik nutzen, um Stillstand zu durchbrechen. Jeder Einwand ist nur ein verkapptes Kaufsignal.`,
      en: `Handle objections and keep momentum. When the prospect hesitates, overcome the resistance quickly. Use urgency and logic to push past stalls. Every objection is just a buying signal in disguise.`,
    },
    questions: [
      { de: '„Was hat deiner Meinung nach bisher verhindert, dass sich das verändert?"', en: '"What do you think has stopped this from changing so far?"' },
      { de: '„Was passiert normalerweise, wenn du kurz davor bist, diese Entscheidung zu treffen?"', en: '"What tends to happen when you get close to making this decision?"' },
      { de: '„Wo merkst du, dass du dich zurückziehst?"', en: '"Where do you notice yourself pulling back?"' },
      { de: '„Was fühlt sich schwierig an, voll und ganz in diese Richtung zu gehen?"', en: '"What feels difficult about fully going toward this?"' },
    ],
    greenFlags: [
      { de: 'Neugier ohne Druck', en: 'Curiosity without pressure' },
      { de: 'Muster sanft benennen', en: 'Naming patterns gently' },
      { de: 'Mit Unbehagen bleiben', en: 'Staying with discomfort' },
    ],
    redFlags: [
      { de: 'Gegen Einwände argumentieren', en: 'Arguing with objections' },
      { de: 'Logik erzwingen', en: 'Forcing logic' },
      { de: 'Versuchen zu „gewinnen"', en: 'Trying to "win"' },
    ],
    leadFeels: {
      de: 'Herausgefordert, aber unterstützt. Nicht in die Ecke gedrängt.',
      en: 'Challenged but supported. Not cornered.',
    },
    beginnerMistake: {
      de: 'Widerstand als etwas behandeln, das überwunden werden muss, anstatt als etwas, das verstanden werden will.',
      en: 'Treating resistance as something to overcome instead of something to understand.',
    },
  },
  {
    number: 4,
    title: { de: 'Bewusstheit', en: 'Awareness' },
    subtitle: {
      de: 'Selbsterkenntnis ermöglichen statt Zustimmung erzwingen.',
      en: 'Guide self-recognition instead of pushing for compliance.',
    },
    purpose: {
      de: 'Der Person helfen, ihren eigenen inneren Mechanismus zu erkennen.',
      en: 'Help the person recognize their own inner mechanism.',
    },
    teaching: {
      de: `Ethical Closing passiert hier.

In dem Moment, in dem die Person sieht, dass ihr Zögern nicht nur äußerlich,
sondern auch innerlich ist, wird eine neue Ebene der Ehrlichkeit möglich.

Das ist keine Überzeugung.
Das ist Erkenntnis.`,
      en: `Ethical Closing happens here.

The moment the person sees that their hesitation is not just external,
but also internal, a new level of honesty becomes possible.

This is not persuasion.
This is recognition.`,
    },
    teachingTop: {
      de: `Die Lösung als klare Antwort präsentieren. Social Proof, Fallstudien und Dringlichkeit nutzen, um Verlangen zu erzeugen. Die Transformation lebendig ausmalen. Den Wert stapeln, bis der Preis klein wirkt.`,
      en: `Present your solution as the clear answer. Use social proof, case studies, and urgency to create desire. Paint the transformation vividly. Stack the value until the price feels small.`,
    },
    questions: [
      { de: '„Es klingt so, als will ein Teil von dir das, und ein anderer Teil schützt dich noch."', en: '"It sounds like one part of you wants this, and another part is still protecting you."' },
      { de: '„Mir fällt auf, dass der Wunsch klar ist, aber das Vertrauen in die Bewegung noch nicht vollständig da ist."', en: '"I\'m noticing that the desire is clear, but the trust in moving is not fully there yet."' },
      { de: '„Wäre es fair zu sagen, dass es weniger um die Option selbst geht, und mehr darum, was der Schritt für dich bedeuten würde?"', en: '"Would it be fair to say that this is less about the option itself, and more about what stepping into it would mean for you?"' },
      { de: '„Ich frage mich, ob die echte Schwierigkeit nicht die Entscheidung ist, sondern was die Entscheidung dich aufgeben lässt."', en: '"I wonder whether the real difficulty is not the decision, but what the decision asks you to leave behind."' },
    ],
    greenFlags: [
      { de: 'Präzise Reflexion', en: 'Precise reflection' },
      { de: 'Emotionale Intelligenz', en: 'Emotional intelligence' },
      { de: 'Gut getimte Stille', en: 'Well-timed silence' },
      { de: 'Nicht-defensives Pacing', en: 'Non-defensive pacing' },
    ],
    redFlags: [
      { de: 'Pseudo-Therapie', en: 'Pseudo-therapy' },
      { de: 'Überinterpretation', en: 'Over-interpretation' },
      { de: 'Dramatische emotionale Sprache', en: 'Dramatic emotional language' },
      { de: 'Versuchen tiefsinnig zu klingen', en: 'Trying to sound deep' },
    ],
    leadFeels: {
      de: 'Auf einer Ebene gesehen, die sie nicht erwartet haben. Berührt.',
      en: 'Seen at a level they didn\'t expect. Moved.',
    },
    beginnerMistake: {
      de: 'Versuchen einsichtsvoll zu klingen, anstatt wirklich präsent zu sein.',
      en: 'Trying to sound insightful instead of being genuinely present.',
    },
  },
  {
    number: 5,
    title: { de: 'Verantwortung', en: 'Ownership' },
    subtitle: {
      de: 'Der Wandel von „Das passiert mir" zu „Ich sehe meinen Anteil daran."',
      en: 'The shift from "this is happening to me" to "I see my role in it."',
    },
    purpose: {
      de: 'Die Person von Bewusstheit in persönliche Verantwortung bewegen.',
      en: 'Move the person from awareness into personal responsibility.',
    },
    teaching: {
      de: `Bewusstheit allein reicht nicht.

Die Person muss spüren, dass der nächste Schritt ihr gehört.

Das Ziel ist nicht Abhängigkeit vom Closer.
Das Ziel ist Eigenverantwortung.`,
      en: `Awareness alone is not enough.

The person must feel that the next step belongs to them.

The goal is not dependence on the closer.
The goal is ownership.`,
    },
    teachingTop: {
      de: `Trial Close. Die Gewässer testen. Annehmende Sprache nutzen: „Wenn wir starten…" statt „Falls du dich entscheidest…" Commitment durch kleine Vereinbarungen aufbauen, die zum großen Ja führen.`,
      en: `Trial close. Test the waters. Use assumptive language: "When we start..." not "If you decide..." Create commitment through small agreements building to the big yes.`,
    },
    questions: [
      { de: '„Was denkst du, fordert das jetzt von dir?"', en: '"What do you think this is asking from you now?"' },
      { de: '„Was würde sich ändern, wenn du aufhörst, auf perfekte Sicherheit zu warten?"', en: '"What would change if you stopped waiting for perfect certainty?"' },
      { de: '„Was siehst du jetzt klarer als zu Beginn dieses Gesprächs?"', en: '"What are you seeing more clearly now than at the beginning of this conversation?"' },
      { de: '„Was weißt du, dass du hier übernehmen musst?"', en: '"What do you know you need to take ownership of here?"' },
    ],
    greenFlags: [
      { de: 'Ermächtigung', en: 'Empowerment' },
      { de: 'Präzision', en: 'Precision' },
      { de: 'Nicht-Anhaftung', en: 'Non-attachment' },
      { de: 'Internaler Kontrollort', en: 'Internal locus of control' },
    ],
    redFlags: [
      { de: 'Emotionales Retten', en: 'Emotional rescuing' },
      { de: 'Abhängigkeitsframing', en: 'Dependency framing' },
      { de: 'Zu früh Dringlichkeit erzeugen', en: 'Pushing urgency too early' },
    ],
    leadFeels: {
      de: 'Selbstbestimmt in der Entscheidung. Nicht abhängig.',
      en: 'In charge of their own decision. Not dependent.',
    },
    beginnerMistake: {
      de: 'Die Person retten, anstatt sie ihre eigene Stärke finden zu lassen.',
      en: 'Rescuing the person instead of letting them find their own strength.',
    },
  },
  {
    number: 6,
    title: { de: 'Entscheidung', en: 'Decision' },
    subtitle: {
      de: 'Eine echte Entscheidung ist klar, eigenverantwortlich und frei von Druck.',
      en: 'A real decision is clear, owned, and undistorted by pressure.',
    },
    purpose: {
      de: 'Einen ehrlichen, klaren Entscheidungsmoment schaffen.',
      en: 'Create an honest, clean decision moment.',
    },
    teaching: {
      de: `Der Entscheidungsmoment ist nicht der Punkt, an dem du Bewegung erzwingst.

Es ist der Punkt, an dem du klärst, was jetzt wahr ist.

Wenn Bewusstheit und Verantwortung korrekt aufgebaut wurden,
wird die Entscheidung zum natürlichen nächsten Schritt.`,
      en: `The decision moment is not where you force movement.

It is where you clarify what is now true.

If awareness and ownership were built correctly,
decision becomes a natural next step.`,
    },
    teachingTop: {
      de: `Selbstbewusst nach dem Abschluss fragen und Frame Control halten. Stille nach der Frage nutzen. Last-Minute-Einwände souverän bearbeiten. Dringlichkeit erzeugen: limitierte Plätze, Preiserhöhung, Bonus-Ablauf.`,
      en: `Ask confidently for the sale and maintain frame control. Use silence after the ask. Handle last-minute objections with confidence. Create urgency: limited spots, price increase, bonus expiry.`,
    },
    questions: [
      { de: '„Basierend auf allem, was wir gesehen haben – was fühlt sich für dich jetzt wahr an?"', en: '"Based on everything we\'ve seen, what feels true for you now?"' },
      { de: '„Fühlst du dich bereit, damit voranzugehen?"', en: '"Do you feel ready to move forward with this?"' },
      { de: '„Ist das ein echtes Ja für dich, oder musst du ehrlich sein, dass du noch nicht so weit bist?"', en: '"Is this a real yes for you, or do you need to be honest that you\'re not there?"' },
      { de: '„Welche Entscheidung bist du bereit, heute zu vertreten?"', en: '"What decision are you willing to stand behind today?"' },
    ],
    greenFlags: [
      { de: 'Ruhige Frage', en: 'Calm ask' },
      { de: 'Keine Druckenergie', en: 'No pressure energy' },
      { de: 'Klarer Umgang mit Ja oder Nein', en: 'Clean handling of yes or no' },
      { de: 'Integrität', en: 'Integrity' },
    ],
    redFlags: [
      { de: 'Verknappung', en: 'Scarcity push' },
      { de: 'Emotionaler Druck', en: 'Emotional pressure' },
      { de: 'Scham-basierte Dringlichkeit', en: 'Shame-based urgency' },
      { de: 'Erzwungener Abschluss', en: 'Forced close' },
    ],
    leadFeels: {
      de: 'Frei zu wählen. In beiden Richtungen respektiert.',
      en: 'Free to choose. Respected either way.',
    },
    beginnerMistake: {
      de: 'Druck nutzen, um Zustimmung statt Klarheit zu erzeugen.',
      en: 'Using pressure to convert compliance instead of clarity.',
    },
  },
];

const CALLOUTS = [
  { de: 'Der Einwand ist selten der echte Einwand.', en: 'The objection is rarely the real objection.' },
  { de: 'Druck erzeugt Zustimmung. Bewusstheit eröffnet Wahrheit.', en: 'Pressure closes compliance. Awareness opens truth.' },
  { de: 'Ein echtes Ja ist ruhig.', en: 'A real yes is calm.' },
  { de: 'Zögern ist Information.', en: 'Hesitation is information.' },
  { de: 'Die Person muss nicht geschoben werden. Sie muss sehen.', en: 'The person does not need to be pushed. They need to see.' },
  { de: 'Entscheidungsqualität zählt mehr als Entscheidungsgeschwindigkeit.', en: 'Decision quality matters more than decision speed.' },
  { de: 'Das Ziel ist nicht Zustimmung. Das Ziel ist Ehrlichkeit.', en: 'The goal is not agreement. The goal is honesty.' },
  { de: 'Wahrheit skaliert besser als Druck.', en: 'Truth scales better than pressure.' },
];

const SHIFTS = [
  { de: 'Sicherheit', en: 'Safety' },
  { de: 'Wahrheit', en: 'Truth' },
  { de: 'Bewusstheit', en: 'Awareness' },
  { de: 'Verantwortung', en: 'Ownership' },
  { de: 'Entscheidung', en: 'Decision' },
];

function StageModule({ stage, index, lang }: { stage: Stage; index: number; lang: 'de' | 'en' }) {
  const [expanded, setExpanded] = useState(false);
  const t = (obj: { de: string; en: string }) => obj[lang];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay: index * 0.08, ease }}
      className="border-b border-border/30 pb-12 last:border-b-0"
    >
      {/* Stage header */}
      <div className="mb-6">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
          {lang === 'de' ? 'Stufe' : 'Stage'} {stage.number}
        </p>
        <h3 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {t(stage.title)}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t(stage.subtitle)}</p>
      </div>

      {/* Purpose */}
      <p className="mb-6 text-xs font-semibold uppercase tracking-[0.15em] text-primary/70">
        {t(stage.purpose)}
      </p>

      {/* Dual-mode teaching copy */}
      <DualModeBlock
        ethical={
          <div className="mb-8 max-w-[680px] whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">
            {t(stage.teaching)}
          </div>
        }
        topClosing={
          <div className="mb-8 max-w-[680px] whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">
            {t(stage.teachingTop)}
          </div>
        }
      />

      {/* Expandable detail */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-foreground/70"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded
          ? (lang === 'de' ? 'Einklappen' : 'Collapse')
          : (lang === 'de' ? 'Fragen, Signale & Muster erkunden' : 'Explore Questions, Flags & Patterns')}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            {/* Questions */}
            <div className="mb-6">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground/50">
                {lang === 'de' ? 'Beispiel-Fragen' : 'Example Questions'}
              </p>
              <div className="space-y-2">
                {stage.questions.map((q, i) => (
                  <div key={i} className="rounded-lg border border-border/20 bg-card/50 px-4 py-3 text-sm italic text-foreground/80">
                    {t(q)}
                  </div>
                ))}
              </div>
            </div>

            {/* Flags side by side */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-500/70">
                  {lang === 'de' ? 'Positive Signale' : 'Green Flags'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {stage.greenFlags.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                      <Check className="h-3 w-3" /> {t(f)}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-red-400/70">
                  {lang === 'de' ? 'Warnsignale' : 'Red Flags'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {stage.redFlags.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-400">
                      <AlertTriangle className="h-3 w-3" /> {t(f)}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Callout boxes */}
            <div className="mb-4 rounded-lg border border-primary/10 bg-primary/5 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary/60 mb-1">
                {lang === 'de' ? 'Wie sich der Lead hier fühlt' : 'How the lead feels here'}
              </p>
              <p className="text-sm text-foreground/75">{t(stage.leadFeels)}</p>
            </div>
            <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500/60 mb-1">
                {lang === 'de' ? 'Häufiger Anfängerfehler' : 'Common beginner mistake'}
              </p>
              <p className="text-sm text-foreground/75">{t(stage.beginnerMistake)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FrameworkInner() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const de = lang === 'de';
  const t = (obj: { de: string; en: string }) => obj[lang];

  useEffect(() => {
    if (!user) return;
    supabase
      .from('onboarding_progress')
      .select('completed')
      .eq('user_id', user.id)
      .eq('item_key', 'ethical_conversation_framework_completed')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.completed) setCompleted(true);
        setLoading(false);
      });
  }, [user]);

  const handleComplete = async () => {
    if (!user || completed) return;
    const { error } = await supabase.from('onboarding_progress').upsert({
      user_id: user.id,
      item_key: 'ethical_conversation_framework_completed',
      completed: true,
      completed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,item_key' });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setCompleted(true);
      toast({ title: de ? 'Framework abgeschlossen' : 'Framework completed' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative flex min-h-[50vh] flex-col items-center justify-center px-6 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease }}
        >
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/50">
            {de ? 'Kern-Framework' : 'Core Framework'}
          </p>
          <h1 className="mx-auto max-w-3xl font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            {de ? 'Das Ethische Entscheidungs-Gespräch™' : 'The Ethical Decision Conversation™'}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground/70 sm:text-lg">
            {de
              ? 'Ein strukturiertes Framework, das Menschen von Zögern zu ehrlicher Entscheidungsbereitschaft führt.'
              : 'A structured framework to guide human beings from hesitation to honest decision readiness.'}
          </p>
          <p className="mt-3 text-xs text-muted-foreground/40">
            {de
              ? `Dies ist die Gesprächsarchitektur hinter ${PRODUCT.name} by ${PRODUCT.brand}.`
              : `This is the conversation architecture behind ${PRODUCT.name} by ${PRODUCT.brand}.`}
          </p>
        </motion.div>
      </section>

      {/* Mode Switch (sticky) */}
      <div className="sticky top-0 z-30 border-b border-border/20 bg-background/95 backdrop-blur-md py-4">
        <ModeSwitch />
      </div>

      {/* 5 Internal Shifts */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
            {de ? 'Kernprinzip' : 'Core Principle'}
          </p>
          <p className="text-center text-sm text-muted-foreground/70 mb-6">
            {de
              ? 'Das Gespräch bewegt sich nicht durch Druck. Es bewegt sich durch 5 innere Verschiebungen:'
              : 'The conversation does NOT move by pressure. It moves through 5 internal shifts:'}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {SHIFTS.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-foreground/80">{t(s)}</span>
                {i < 4 && <ArrowRight className="h-3 w-3 text-muted-foreground/30" />}
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* 6 Stage Modules */}
      <section className="mx-auto max-w-3xl space-y-12 px-6 pb-16">
        {STAGES.map((stage, i) => (
          <StageModule key={stage.number} stage={stage} index={i} lang={lang} />
        ))}
      </section>

      {/* Callout quotes */}
      <section className="mx-auto max-w-2xl px-6 pb-16">
        <div className="grid gap-3 sm:grid-cols-2">
          {CALLOUTS.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="rounded-lg border border-border/15 bg-card/30 px-4 py-3 text-center text-[13px] italic text-muted-foreground/60"
            >
              „{t(c)}"
            </motion.div>
          ))}
        </div>
      </section>

      {/* Why this framework is different */}
      <section className="mx-auto max-w-2xl px-6 pb-16">
        <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-8 text-center">
          <Sparkles className="mx-auto mb-4 h-5 w-5 text-primary/40" />
          <h3 className="mb-4 font-serif text-xl font-semibold text-foreground">
            {de ? 'Warum dieses Framework anders ist' : 'Why this framework is different'}
          </h3>
          <div className="mx-auto max-w-lg space-y-3 text-sm leading-relaxed text-muted-foreground/70">
            <p>{de ? 'Die meisten Verkaufssysteme trainieren Kontrolle.' : 'Most sales systems train control.'}<br />
              {de ? 'Dieses System trainiert Wahrnehmung.' : 'This system trains perception.'}</p>
            <p>{de ? 'Die meisten Verkaufssysteme lehren, Menschen zu bewegen.' : 'Most sales systems teach how to move people.'}<br />
              {de ? 'Dieses System lehrt, Menschen sehen zu helfen.' : 'This system teaches how to help people see.'}</p>
            <p>{de ? 'Die meisten Verkaufssysteme optimieren nur Conversion.' : 'Most sales systems optimize conversion only.'}<br />
              <span className="font-medium text-foreground/80">
                {PRODUCT.name} by {PRODUCT.brand} {de ? 'optimiert Entscheidungsqualität.' : 'optimizes decision quality.'}
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Completion gate */}
      <section className="mx-auto max-w-lg px-6 pb-24 text-center">
        {completed ? (
          <div className="flex items-center justify-center gap-2 text-sm text-emerald-500">
            <Check className="h-4 w-4" />
            {de ? 'Framework abgeschlossen' : 'Framework completed'}
          </div>
        ) : (
          <>
            <p className="mb-6 text-sm text-muted-foreground/60">
              {de
                ? 'Dieses Framework ist die Grundlage für den Simulator, die Zertifizierung und deine Karriereentwicklung.'
                : 'This framework is the foundation for the simulator, certification, and your career progression.'}
            </p>
            <button
              onClick={handleComplete}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {de ? 'Ich verstehe das Framework' : 'I understand the framework'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </>
        )}
      </section>
    </div>
  );
}

export default function EthicalFramework() {
  return (
    <ClosingModeProvider>
      <FrameworkInner />
    </ClosingModeProvider>
  );
}
