import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { useXp } from '@/hooks/useXp';
import {
  MessageCircle, CheckCircle2, XCircle, ArrowRight, RotateCcw,
  Lock, Trophy, TrendingUp, AlertTriangle, Zap,
} from 'lucide-react';

/* ─── Scenario Data ─── */
interface Choice {
  text: string;
  correct: boolean;
  feedback: string;
  kpiImpact?: string;
}

interface DecisionPoint {
  situation: string;
  speaker: 'client' | 'narrator';
  choices: Choice[];
}

interface Scenario {
  id: string;
  title: string;
  intro: string;
  kpiArea: string;
  steps: DecisionPoint[];
}

const SCENARIOS: Scenario[] = [
  {
    id: 'think-about-it',
    title: '"Ich muss darüber nachdenken"',
    intro: 'Du bist am Ende eines 45-Minuten Sales Calls. Der Kunde hat sein Problem erkannt, die Lösung verstanden, und plötzlich sagt er...',
    kpiArea: 'Close Rate',
    steps: [
      {
        situation: '"Hör mal, das klingt alles super. Aber ich muss erst nochmal eine Nacht darüber schlafen."',
        speaker: 'client',
        choices: [
          { text: 'Kein Problem, melden Sie sich einfach!', correct: false, feedback: 'Du gibst die Kontrolle ab. 90% der "Ich melde mich"-Leads melden sich nie. Du verlierst den Deal.', kpiImpact: 'Close Rate sinkt' },
          { text: 'Ich verstehe. Was genau möchten Sie sich nochmal durch den Kopf gehen lassen?', correct: true, feedback: 'Richtig. "Nachdenken" bedeutet Unklarheit. Du identifizierst das echte Bedenken, statt den Call zu beenden.' },
          { text: 'Okay, dann biete ich Ihnen 10% Rabatt wenn Sie heute entscheiden.', correct: false, feedback: 'Rabatt zeigt Unsicherheit und zerstört deine Positionierung. Der Kunde denkt: "Warum war der Preis vorher höher?"', kpiImpact: 'Close Rate + Revenue sinken' },
          { text: 'Ich kann das Angebot nur heute halten.', correct: false, feedback: 'Fake-Urgency zerstört Vertrauen. Der Kunde spürt den Druck und zieht sich zurück.', kpiImpact: 'Close Rate sinkt' },
        ],
      },
      {
        situation: '"Naja, ich bin mir einfach nicht sicher, ob das der richtige Zeitpunkt ist."',
        speaker: 'client',
        choices: [
          { text: '"Verstehe ich. Was müsste passieren, damit es der richtige Zeitpunkt wäre?"', correct: true, feedback: 'Perfekt. Du lässt den Kunden selbst die Bedingungen definieren – und zeigst dann, dass sie bereits erfüllt sind.' },
          { text: '"Das Timing wird nie perfekt sein."', correct: false, feedback: 'Klingt belehrend. Du invalidierst das Gefühl des Kunden statt es zu adressieren.' },
          { text: '"Okay, rufen Sie mich an wenn Sie bereit sind."', correct: false, feedback: 'Du gibst auf. Ein Closer führt die Entscheidung – er wartet nicht darauf.', kpiImpact: 'Follow-Up Rate leidet' },
          { text: '"Andere Kunden hatten die gleichen Bedenken und sind trotzdem gestartet."', correct: false, feedback: 'Social Proof ist hier zu früh. Erst musst du das spezifische Bedenken verstehen.' },
        ],
      },
      {
        situation: '"Eigentlich habe ich Angst, dass es nicht funktioniert."',
        speaker: 'client',
        choices: [
          { text: '"Das ist absolut verständlich. Lassen Sie uns anschauen, was passiert wenn Sie NICHTS verändern."', correct: true, feedback: 'Exzellent. Du validierst die Angst und reframest: Die wahren Kosten sind Nicht-Handeln.' },
          { text: '"Es funktioniert garantiert!"', correct: false, feedback: 'Leere Versprechen zerstören Glaubwürdigkeit. Der Kunde braucht Verständnis, keine Garantien.' },
          { text: '"Probieren Sie es einfach aus, Sie können jederzeit kündigen."', correct: false, feedback: 'Du reduzierst den Wert deines Angebots zu einem risikolosen Test. Das ist schwach.' },
          { text: '"Was genau macht Ihnen Angst?"', correct: false, feedback: 'Gute Richtung, aber du hast die Angst bereits bekommen. Jetzt ist Reframing dran, nicht weiteres Fragen.' },
        ],
      },
      {
        situation: 'Der Kunde wird nachdenklich. "Stimmt, so wie es jetzt ist, kann es nicht weitergehen."',
        speaker: 'client',
        choices: [
          { text: '"Genau. Die Frage ist nicht ob, sondern wann. Und wann ist besser als jetzt?"', correct: true, feedback: 'Stark. Du führst zur Entscheidung ohne Druck. Der Kunde erkennt selbst, dass Handeln die logische Konsequenz ist.' },
          { text: '"Also, sollen wir starten?"', correct: false, feedback: 'Zu abrupt. Du springst zur Abschlussfrage ohne den emotionalen Moment zu nutzen.' },
          { text: '"Ich schicke Ihnen nochmal alle Infos per Mail."', correct: false, feedback: 'Du verzögerst die Entscheidung. Infos per Mail = 90% Dealverlust.', kpiImpact: 'Close Rate sinkt drastisch' },
          { text: 'Schweigen und warten.', correct: false, feedback: 'Schweigen kann mächtig sein – aber nicht hier. Der Kunde braucht jetzt Führung, nicht Stille.' },
        ],
      },
    ],
  },
  {
    id: 'price-objection',
    title: 'Preis-Einwand',
    intro: 'Mitte eines Discovery-Calls. Der Kunde ist interessiert, hat Pain erkannt, und du nennst den Preis...',
    kpiArea: 'Close Rate',
    steps: [
      {
        situation: '"Das ist mir zu teuer. Gibt es da nicht was Günstigeres?"',
        speaker: 'client',
        choices: [
          { text: '"Zu teuer im Vergleich wozu?"', correct: true, feedback: 'Top. Du deckst den Vergleichsrahmen auf. Oft vergleicht der Kunde mit etwas Irrelevantem.' },
          { text: '"Wir können den Preis etwas anpassen."', correct: false, feedback: 'Sofort nachgeben zeigt: Der Preis war von Anfang an zu hoch. Vertrauen zerstört.', kpiImpact: 'Revenue pro Deal sinkt' },
          { text: '"Das ist der faire Preis für den Wert."', correct: false, feedback: 'Klingt defensiv. Du argumentierst statt zu hinterfragen.' },
          { text: '"Ich verstehe, dann passt es wohl nicht."', correct: false, feedback: 'Du gibst auf beim ersten Einwand. Ein Preis-Einwand ist selten ein echtes Nein.' },
        ],
      },
      {
        situation: '"Naja, ich habe online auch andere Anbieter gesehen, die günstiger sind."',
        speaker: 'client',
        choices: [
          { text: '"Was genau haben die angeboten?"', correct: false, feedback: 'Du lenkst das Gespräch auf die Konkurrenz statt auf den Wert deines Angebots.' },
          { text: '"Verstehe. Lassen Sie mich eine Frage stellen: Was kostet es Sie, wenn sich in 12 Monaten nichts ändert?"', correct: true, feedback: 'Perfekt. Du reframest von Preis zu Kosten der Inaktivität. Der Kunde sieht das bigger picture.' },
          { text: '"Wir sind besser als die Konkurrenz."', correct: false, feedback: 'Unbelegte Behauptungen ohne Kontext. Wirkt unsicher und unprofessionell.' },
          { text: '"Dann sollten Sie dort kaufen."', correct: false, feedback: 'Sarkasmus zerstört die Beziehung. Du verlierst den Deal und den Ruf.' },
        ],
      },
      {
        situation: '"Hmm... wenn ich ehrlich bin, wahrscheinlich meinen Job."',
        speaker: 'client',
        choices: [
          { text: '"Und was ist Ihnen Ihr Job wert? Mehr oder weniger als [Preis]?"', correct: true, feedback: 'Meisterhaft. Du verbindest den Preis mit dem echten Wert – der Kunde reframet sich selbst.' },
          { text: '"Sehen Sie, deshalb brauchen Sie das!"', correct: false, feedback: 'Zu pushy. Du nutzt die Angst des Kunden gegen ihn. Das ist nicht ethisch.' },
          { text: '"Genau, deshalb biete ich Ihnen einen Sonderpreis an."', correct: false, feedback: 'Du hast gerade den perfekten Wert-Frame und zerstörst ihn mit einem Rabatt.', kpiImpact: 'Revenue sinkt' },
          { text: '"Das ist krass. Wollen wir weitermachen?"', correct: false, feedback: 'Zu schnell. Der Kunde braucht einen Moment, die Erkenntnis zu verarbeiten.' },
        ],
      },
    ],
  },
  {
    id: 'trust-issue',
    title: 'Mangelndes Vertrauen',
    intro: 'Erster Call mit einem Lead. Er ist skeptisch, wurde schon von anderen Anbietern enttäuscht...',
    kpiArea: 'Close Rate',
    steps: [
      {
        situation: '"Ich wurde schon dreimal abgezockt. Woher weiß ich, dass Sie nicht genauso sind?"',
        speaker: 'client',
        choices: [
          { text: '"Das ist eine berechtigte Frage. Können Sie mir erzählen, was genau schiefgelaufen ist?"', correct: true, feedback: 'Perfekt. Du validierst die Erfahrung und sammelst Intel. Jetzt weißt du, welche Pain Points du adressieren musst.' },
          { text: '"Wir sind anders, versprochen!"', correct: false, feedback: 'Jeder sagt das. Leere Versprechen bestätigen genau die Skepsis des Kunden.' },
          { text: '"Schauen Sie sich unsere Bewertungen an."', correct: false, feedback: 'Social Proof kommt zu früh. Erst musst du die spezifische Angst verstehen.' },
          { text: '"Dann ist das wohl nichts für Sie."', correct: false, feedback: 'Du gibst auf. Skeptische Kunden sind oft die besten – sie haben bereits investiert und wollen es richtig machen.' },
        ],
      },
      {
        situation: '"Die haben große Versprechen gemacht und dann war der Support miserabel."',
        speaker: 'client',
        choices: [
          { text: '"Support ist genau der Punkt, der uns unterscheidet. Aber statt Versprechen – was wäre ein Beweis für Sie?"', correct: true, feedback: 'Stark. Du lässt den Kunden definieren, was Vertrauen für ihn bedeutet. Dann kannst du es liefern.' },
          { text: '"Bei uns ist der Support 24/7 verfügbar."', correct: false, feedback: 'Wieder ein Versprechen. Genau das, was den Kunden vorher enttäuscht hat.' },
          { text: '"Das tut mir leid zu hören."', correct: false, feedback: 'Empathie ist gut, aber ohne Follow-Up-Frage verpufft sie. Du musst weiterführen.' },
          { text: '"Wir können eine Testphase machen."', correct: false, feedback: 'Du reduzierst den Commitment-Level. Der Kunde braucht Vertrauen, nicht einen Exit.' },
        ],
      },
      {
        situation: '"Naja, wenn ich jemanden persönlich kenne, der es gemacht hat, wäre das was."',
        speaker: 'client',
        choices: [
          { text: '"Ich kann Sie gerne mit einem unserer Kunden verbinden, der eine ähnliche Situation hatte. Wäre das hilfreich?"', correct: true, feedback: 'Exzellent. Du bietest einen konkreten Social Proof an, der genau zum Bedenken passt.' },
          { text: '"Wir haben 500 zufriedene Kunden."', correct: false, feedback: 'Zahlen ohne Kontext. Der Kunde will einen echten Menschen, keine Statistik.' },
          { text: '"Vertrauen Sie mir einfach."', correct: false, feedback: 'Der Satz "Vertrauen Sie mir" ist der schnellste Weg, Vertrauen zu verlieren.' },
          { text: '"Okay, ich schicke Ihnen Testimonials."', correct: false, feedback: 'Testimonials per Mail werden selten gelesen. Ein persönliches Gespräch ist 10x stärker.' },
        ],
      },
    ],
  },
  {
    id: 'no-show-followup',
    title: 'No-Show Follow-Up',
    intro: 'Dein 14:00 Uhr Call ist nicht erschienen. 14:15 – immer noch nichts. Du greifst zum Telefon...',
    kpiArea: 'Show Rate & Follow-Up',
    steps: [
      {
        situation: 'Der Kunde geht nicht ran. Du erreichst die Mailbox.',
        speaker: 'narrator',
        choices: [
          { text: '"Hi [Name], ich hoffe es geht Ihnen gut. Wir hatten gerade unseren Termin – kein Stress, Dinge kommen dazwischen. Ich halte den Slot morgen gleiche Zeit frei. Kurz bestätigen? LG"', correct: true, feedback: 'Perfekt. Freundlich, keine Vorwürfe, konkreter Alternativvorschlag. Das maximiert die Reschedule-Rate.' },
          { text: 'Keine Nachricht hinterlassen und warten.', correct: false, feedback: 'Jede Minute die du wartest, sinkt die Wahrscheinlichkeit eines Reschedules. Sofort handeln.', kpiImpact: 'Follow-Up Rate = 0%' },
          { text: '"Sie haben unseren Termin verpasst. Bitte buchen Sie einen neuen Termin über den Link."', correct: false, feedback: 'Klingt vorwurfsvoll. Der Kunde fühlt sich schuldig und vermeidet dich komplett.' },
          { text: '"Schade dass Sie nicht da waren. Melden Sie sich wenn Sie bereit sind."', correct: false, feedback: 'Passiv. Du gibst die Kontrolle ab und hoffst auf Initiative des Kunden.', kpiImpact: 'Follow-Up Rate sinkt' },
        ],
      },
      {
        situation: 'Nächster Tag: Kunde antwortet "Sorry, hatte einen Notfall. Kann gerade nicht."',
        speaker: 'client',
        choices: [
          { text: '"Kein Thema! Wann passt es Ihnen diese Woche? Ich bin flexibel – Mi oder Do Nachmittag?"', correct: true, feedback: 'Stark. Kein Vorwurf, direkte Alternative mit konkreten Optionen. Professionell und effizient.' },
          { text: '"Kein Problem, melden Sie sich!"', correct: false, feedback: '"Melden Sie sich" = Ende des Deals. Du musst die Initiative behalten.' },
          { text: '"Das ist jetzt schon das zweite Mal..."', correct: false, feedback: 'Vorwürfe bringen nichts. Der Kunde hat einen Grund genannt – akzeptiere und führe weiter.' },
          { text: 'In 2 Wochen nochmal schreiben.', correct: false, feedback: '2 Wochen ist zu lang. Der Lead wird kalt. 24-48h ist das Fenster.', kpiImpact: 'Show Rate sinkt bei Reschedule' },
        ],
      },
      {
        situation: '"Okay, Donnerstag 15:00 passt."',
        speaker: 'client',
        choices: [
          { text: 'Sofort bestätigen + Kalendereintrag senden + 24h vorher Reminder einplanen + 1h vorher kurze Bestätigung.', correct: true, feedback: 'Das ist das Protokoll eines Profis. Dreifache Bestätigung = maximale Show Rate beim Reschedule.' },
          { text: 'Nur "Super, bis dann!" schreiben.', correct: false, feedback: 'Kein Kalendereintrag, kein Reminder. Bei einem No-Show-Lead brauchst du extra Absicherung.' },
          { text: 'Bestätigen und hoffen dass er kommt.', correct: false, feedback: 'Hoffen ist keine Strategie. Systematisches Follow-Up ist Pflicht, besonders bei Reschedules.' },
          { text: '"Perfekt. Aber diesmal bitte pünktlich."', correct: false, feedback: 'Passiv-aggressiv. Du sabotierst die Beziehung bevor der Call überhaupt stattfindet.' },
        ],
      },
    ],
  },
  {
    id: 'low-confidence',
    title: 'Unsicherer Closer',
    intro: 'Du fühlst dich heute nicht gut. Die letzten 3 Calls waren verlorene Deals. Jetzt kommt der nächste...',
    kpiArea: 'Close Rate & Calls',
    steps: [
      {
        situation: 'Der Call startet. Der Kunde fragt: "Also, warum sollte ich bei Ihnen kaufen?"',
        speaker: 'client',
        choices: [
          { text: '"Bevor ich das beantworte – erzählen Sie mir, was Sie hierher geführt hat. Was ist gerade Ihre größte Herausforderung?"', correct: true, feedback: 'Stark. Du führst das Gespräch zurück zum Kunden. Deine Unsicherheit wird irrelevant, wenn der Fokus auf seinem Problem liegt.' },
          { text: '"Wir haben das beste Produkt am Markt."', correct: false, feedback: 'Unbelegte Behauptung. Und deine Unsicherheit schwingt in der Stimme mit – der Kunde spürt die Inkongruenz.' },
          { text: '"Äh... also wir bieten verschiedene Pakete an..."', correct: false, feedback: 'Unsicherheit pur. Du flüchtest in Produktdetails statt zu führen. Der Kunde verliert sofort Vertrauen.' },
          { text: '"Schauen Sie sich unsere Website an, da steht alles."', correct: false, feedback: 'Du delegierst deine Aufgabe an eine Website. Das ist kein Closing, das ist Aufgeben.' },
        ],
      },
      {
        situation: '"Mein Problem ist, dass ich seit 6 Monaten stagniere und nichts funktioniert."',
        speaker: 'client',
        choices: [
          { text: '"6 Monate ist lang. Was haben Sie bisher versucht und warum hat es nicht funktioniert?"', correct: true, feedback: 'Du vertiefst den Pain. Je tiefer der Pain, desto stärker der Entscheidungsdruck – und desto weniger relevant ist deine Unsicherheit.' },
          { text: '"Ja, das kennen viele unserer Kunden."', correct: false, feedback: 'Zu generisch. Du verpasst die Chance, die spezifische Situation zu verstehen.' },
          { text: '"Wir können das definitiv lösen!"', correct: false, feedback: 'Versprechen ohne Verständnis. Erst verstehen, dann lösen.' },
          { text: '"Hmm, das ist schwierig..."', correct: false, feedback: 'Du validierst die Hoffnungslosigkeit statt sie aufzulösen. Der Kunde braucht Führung.' },
        ],
      },
      {
        situation: '"Ich habe alles probiert: Coaches, Kurse, Bücher. Nichts hat funktioniert."',
        speaker: 'client',
        choices: [
          { text: '"Interessant. Haben Sie schon mal analysiert, was genau bei jedem Ansatz gefehlt hat? Oft ist es nicht der Ansatz, sondern ein fehlender Baustein."', correct: true, feedback: 'Meisterhaft. Du reframest: Es ist nicht "nichts funktioniert" – es fehlt ein spezifisches Element. Und genau das bietest du.' },
          { text: '"Vielleicht sind wir auch nicht das Richtige für Sie."', correct: false, feedback: 'Deine Unsicherheit spricht. Du disqualifizierst dich selbst. Ein Closer hinterfragt, gibt aber nicht auf.' },
          { text: '"Bei uns ist das anders, garantiert."', correct: false, feedback: 'Wieder leere Versprechen. Der Kunde hat schon genug davon gehört.' },
          { text: '"Dann brauchen Sie wahrscheinlich mehr Zeit."', correct: false, feedback: 'Du verschiebst die Lösung in die Zukunft. Der Kunde will jetzt Klarheit.' },
        ],
      },
      {
        situation: '"Hmm, das stimmt. Ich hatte nie jemanden, der mich wirklich begleitet hat."',
        speaker: 'client',
        choices: [
          { text: '"Genau das ist der Punkt. Die Frage ist: Wollen Sie es nochmal alleine versuchen – oder diesmal mit echtem Support?"', correct: true, feedback: 'Closing-Moment. Du stellst die Entscheidungsfrage basierend auf der Erkenntnis des Kunden. Nicht pushy, sondern logisch.' },
          { text: '"Super, dann melden Sie sich bei uns wenn Sie bereit sind."', correct: false, feedback: 'Du verlierst den Moment. Der Kunde ist emotional offen – jetzt ist die Entscheidung dran.', kpiImpact: 'Close Rate sinkt' },
          { text: '"Dann lassen Sie uns starten!"', correct: false, feedback: 'Zu abrupt. Du übergehst den emotionalen Moment und springst zur Transaktion.' },
          { text: '"Ich schicke Ihnen erstmal mehr Infos."', correct: false, feedback: 'Infos per Mail = Deal-Killer. Der Kunde ist jetzt bereit, nicht morgen.', kpiImpact: 'Close Rate sinkt drastisch' },
        ],
      },
    ],
  },
];

/* ─── Component ─── */

interface ScenarioResult {
  scenarioId: string;
  correct: number;
  total: number;
  mistakes: { step: number; kpiImpact?: string }[];
}

export default function CloserSimulator() {
  const { profile } = useAuth();
  const { awardXp } = useXp();
  const [activeScenario, setActiveScenario] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [mistakes, setMistakes] = useState<{ step: number; kpiImpact?: string }[]>([]);
  const [finished, setFinished] = useState(false);
  const [completedScenarios, setCompletedScenarios] = useState<ScenarioResult[]>([]);
  const [chatLog, setChatLog] = useState<{ type: 'client' | 'narrator' | 'you' | 'feedback'; text: string; correct?: boolean }[]>([]);

  const scenario = activeScenario !== null ? SCENARIOS[activeScenario] : null;
  const step = scenario ? scenario.steps[currentStep] : null;

  const startScenario = (idx: number) => {
    // Can only unlock next if previous completed
    if (idx > 0 && !completedScenarios.find(r => r.scenarioId === SCENARIOS[idx - 1].id)) return;
    setActiveScenario(idx);
    setCurrentStep(0);
    setSelectedChoice(null);
    setRevealed(false);
    setCorrectCount(0);
    setMistakes([]);
    setFinished(false);
    const s = SCENARIOS[idx];
    setChatLog([
      { type: 'narrator', text: s.intro },
      { type: 'client', text: s.steps[0].situation },
    ]);
  };

  const handleChoice = (choiceIdx: number) => {
    if (revealed || !step) return;
    setSelectedChoice(choiceIdx);
  };

  const handleReveal = () => {
    if (selectedChoice === null || !step) return;
    setRevealed(true);
    const choice = step.choices[selectedChoice];

    setChatLog(prev => [
      ...prev,
      { type: 'you', text: choice.text },
      { type: 'feedback', text: choice.feedback, correct: choice.correct },
    ]);

    if (choice.correct) {
      setCorrectCount(prev => prev + 1);
    } else {
      setMistakes(prev => [...prev, { step: currentStep, kpiImpact: choice.kpiImpact }]);
    }
  };

  const handleNext = async () => {
    if (!scenario) return;
    if (currentStep < scenario.steps.length - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setSelectedChoice(null);
      setRevealed(false);
      setChatLog(prev => [
        ...prev,
        { type: scenario.steps[nextStep].speaker, text: scenario.steps[nextStep].situation },
      ]);
    } else {
      // Scenario complete
      const result: ScenarioResult = {
        scenarioId: scenario.id,
        correct: correctCount,
        total: scenario.steps.length,
        mistakes,
      };
      setCompletedScenarios(prev => [...prev.filter(r => r.scenarioId !== scenario.id), result]);
      setFinished(true);
      await awardXp('lesson_complete', { type: 'simulator', scenario: scenario.id });
    }
  };

  const overallScore = completedScenarios.length > 0
    ? Math.round(completedScenarios.reduce((sum, r) => sum + (r.correct / r.total) * 100, 0) / completedScenarios.length)
    : 0;

  // Scenario selection view
  if (activeScenario === null || (!finished && !step)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
        <div className="mb-8">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Closer Simulator</h1>
          <p className="mt-1 text-sm text-muted-foreground">Simuliere echte Sales Calls. Triff Entscheidungen unter Druck.</p>
        </div>

        {/* Overall Progress */}
        {completedScenarios.length > 0 && (
          <div className="mb-6 rounded-xl border border-border/40 bg-card p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Gesamtbewertung</p>
              <span className="text-sm font-bold text-accent">{overallScore}%</span>
            </div>
            <Progress value={overallScore} className="h-1.5 bg-muted mb-2" />
            <p className="text-[10px] text-muted-foreground">
              {completedScenarios.length}/{SCENARIOS.length} Szenarien abgeschlossen
            </p>
          </div>
        )}

        {/* Scenario List */}
        <div className="space-y-3">
          {SCENARIOS.map((s, idx) => {
            const result = completedScenarios.find(r => r.scenarioId === s.id);
            const isUnlocked = idx === 0 || completedScenarios.find(r => r.scenarioId === SCENARIOS[idx - 1].id);
            const pct = result ? Math.round((result.correct / result.total) * 100) : null;
            const scoreLabel = pct !== null ? (pct === 100 ? 'Exzellent' : pct >= 80 ? 'Gut' : 'Verbesserbar') : null;

            return (
              <button
                key={s.id}
                onClick={() => isUnlocked && startScenario(idx)}
                disabled={!isUnlocked}
                className={`w-full text-left rounded-xl border p-5 transition-all ${
                  isUnlocked
                    ? 'border-border/40 bg-card hover:border-border/70 cursor-pointer'
                    : 'border-border/20 bg-muted/20 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {!isUnlocked && <Lock className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                    {result && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    {isUnlocked && !result && <MessageCircle className="h-4 w-4 text-accent shrink-0" />}
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">Szenario {idx + 1}: {s.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">KPI-Bereich: {s.kpiArea} · {s.steps.length} Entscheidungen</p>
                    </div>
                  </div>
                  {pct !== null && (
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${pct === 100 ? 'text-primary border-primary/30' : pct >= 80 ? 'text-accent border-accent/30' : 'text-destructive border-destructive/30'}`}>
                      {pct}% · {scoreLabel}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Scenario finished
  if (finished && scenario) {
    const pct = Math.round((correctCount / scenario.steps.length) * 100);
    const isPerfect = pct === 100;
    const isGood = pct >= 80;
    const kpiWeaknesses = [...new Set(mistakes.filter(m => m.kpiImpact).map(m => m.kpiImpact!))];

    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
        <div className="rounded-xl border border-border/40 bg-card p-6 text-center">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${isPerfect ? 'bg-primary/10' : isGood ? 'bg-accent/10' : 'bg-destructive/10'}`}>
            {isPerfect ? <Trophy className="h-8 w-8 text-primary" /> : isGood ? <Zap className="h-8 w-8 text-accent" /> : <AlertTriangle className="h-8 w-8 text-destructive" />}
          </div>
          <h2 className="font-serif text-xl font-semibold text-foreground mb-1">
            {isPerfect ? 'Exzellente Leistung' : isGood ? 'Gute Leistung' : 'Verbesserung nötig'}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {correctCount} von {scenario.steps.length} Entscheidungen korrekt ({pct}%)
          </p>

          {/* Strengths */}
          {correctCount > 0 && (
            <div className="mb-4 rounded-lg bg-primary/5 border border-primary/20 p-4 text-left">
              <p className="text-[11px] font-semibold text-primary mb-1 flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" /> Stärken
              </p>
              <p className="text-[12px] text-muted-foreground">
                Du hast {correctCount} Entscheidung{correctCount > 1 ? 'en' : ''} im Bereich "{scenario.kpiArea}" korrekt getroffen.
              </p>
            </div>
          )}

          {/* Weaknesses */}
          {mistakes.length > 0 && (
            <div className="mb-4 rounded-lg bg-destructive/5 border border-destructive/20 p-4 text-left">
              <p className="text-[11px] font-semibold text-destructive mb-1 flex items-center gap-1.5">
                <XCircle className="h-3 w-3" /> Schwachstellen
              </p>
              <p className="text-[12px] text-muted-foreground mb-2">
                {mistakes.length} Fehler in diesem Szenario.
              </p>
              {kpiWeaknesses.length > 0 && (
                <div className="space-y-1">
                  {kpiWeaknesses.map(kpi => (
                    <div key={kpi} className="flex items-center gap-2 text-[11px]">
                      <TrendingUp className="h-3 w-3 text-destructive" />
                      <span className="text-foreground font-medium">KPI Impact: {kpi}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {pct < 80 && (
            <p className="text-[11px] text-muted-foreground mb-4">
              Empfehlung: Wiederhole dieses Szenario, bis du mindestens 80% erreichst.
            </p>
          )}

          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => startScenario(activeScenario)}>
              <RotateCcw className="mr-2 h-3 w-3" /> Nochmal spielen
            </Button>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setActiveScenario(null)}>
              Alle Szenarien <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Active scenario - chat interface
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Szenario {activeScenario + 1}</p>
          <h2 className="font-serif text-base font-semibold text-foreground">{scenario!.title}</h2>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {currentStep + 1} / {scenario!.steps.length}
        </Badge>
      </div>

      {/* Progress */}
      <Progress value={((currentStep + (revealed ? 1 : 0)) / scenario!.steps.length) * 100} className="mb-6 h-1 bg-muted" />

      {/* Chat Log */}
      <div className="mb-6 space-y-3 max-h-[40vh] overflow-y-auto">
        {chatLog.map((msg, i) => (
          <div key={i} className={`flex ${msg.type === 'you' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 text-[13px] leading-relaxed ${
              msg.type === 'client' ? 'bg-muted/50 border border-border/30 text-foreground' :
              msg.type === 'narrator' ? 'bg-accent/5 border border-accent/20 text-muted-foreground italic' :
              msg.type === 'you' ? 'bg-accent/15 text-foreground ml-auto' :
              msg.correct ? 'bg-primary/5 border border-primary/20 text-foreground' :
              'bg-destructive/5 border border-destructive/20 text-foreground'
            }`}>
              {msg.type === 'client' && <p className="text-[9px] font-semibold text-muted-foreground mb-1">KUNDE</p>}
              {msg.type === 'narrator' && <p className="text-[9px] font-semibold text-muted-foreground mb-1">SITUATION</p>}
              {msg.type === 'you' && <p className="text-[9px] font-semibold text-accent mb-1">DEINE ANTWORT</p>}
              {msg.type === 'feedback' && (
                <p className={`text-[9px] font-semibold mb-1 ${msg.correct ? 'text-primary' : 'text-destructive'}`}>
                  {msg.correct ? '✓ RICHTIG' : '✗ FALSCH'}
                </p>
              )}
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Choice buttons */}
      {step && !revealed && (
        <div className="space-y-2 mb-4">
          {step.choices.map((choice, idx) => (
            <button
              key={idx}
              onClick={() => handleChoice(idx)}
              className={`w-full text-left rounded-lg border p-3 text-[13px] transition-colors ${
                selectedChoice === idx
                  ? 'border-accent/50 bg-accent/5'
                  : 'border-border/40 bg-background hover:border-border/70'
              }`}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/60 text-[10px] font-bold text-muted-foreground mr-2">
                {String.fromCharCode(65 + idx)}
              </span>
              {choice.text}
            </button>
          ))}
        </div>
      )}

      {/* Action button */}
      {!revealed ? (
        <Button onClick={handleReveal} disabled={selectedChoice === null} className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs" size="sm">
          Antwort bestätigen
        </Button>
      ) : (
        <Button onClick={handleNext} className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs" size="sm">
          {currentStep < scenario!.steps.length - 1 ? 'Weiter' : 'Ergebnis anzeigen'}
          <ArrowRight className="ml-2 h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
