import { useState, useEffect, useCallback } from 'react';
import { PRODUCT } from '@/config/product';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, ArrowRight, Check, X, AlertTriangle, Shield, Eye, Target, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/i18n/LanguageContext';

/* ─── Types ─── */
interface QuizQuestion {
  id: string;
  stage: string;
  question: string;
  questionDe: string;
  options: { key: string; text: string; textDe: string; type: 'ethical' | 'pressure' | 'neutral' }[];
  correctKey: string;
  feedbackCorrect: string;
  feedbackCorrectDe: string;
  feedbackWrong: string;
  feedbackWrongDe: string;
}

interface ScenarioChoice {
  key: string;
  label: string;
  labelDe: string;
  text: string;
  textDe: string;
  type: 'ethical' | 'pressure' | 'neutral';
  impact: { awareness: number; resistance: number; decisionReadiness: number; pressure: number };
  feedback: string;
  feedbackDe: string;
}

interface Scenario {
  id: string;
  stage: string;
  setup: string;
  setupDe: string;
  leadSays: string;
  leadSaysDe: string;
  question: string;
  questionDe: string;
  choices: ScenarioChoice[];
}

type Phase = 'intro' | 'quiz' | 'scenarios' | 'result';

interface StageScore {
  arrival: number;
  context: number;
  friction: number;
  awareness: number;
  ownership: number;
  decision: number;
}

interface FinalResult {
  stageScores: StageScore;
  ethicalAlignmentScore: number;
  pressureIndex: number;
  decisionQualityScore: number;
  passed: boolean;
}

/* ─── Quiz Questions (18) ─── */
const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1', stage: 'arrival',
    question: 'What is the primary purpose of the Arrival stage?',
    questionDe: 'Was ist der Hauptzweck der Arrival-Phase?',
    options: [
      { key: 'a', text: 'Present the product immediately to capture interest', textDe: 'Das Produkt sofort präsentieren, um Interesse zu wecken', type: 'pressure' },
      { key: 'b', text: 'Create safety so truth becomes possible', textDe: 'Sicherheit schaffen, damit Wahrheit möglich wird', type: 'ethical' },
      { key: 'c', text: 'Establish dominance in the conversation', textDe: 'Dominanz im Gespräch aufbauen', type: 'pressure' },
      { key: 'd', text: 'Gather as much information as quickly as possible', textDe: 'So schnell wie möglich so viele Informationen wie möglich sammeln', type: 'neutral' },
    ],
    correctKey: 'b',
    feedbackCorrect: 'Correct. Safety enables honesty. Without it, awareness cannot open.',
    feedbackCorrectDe: 'Richtig. Sicherheit ermöglicht Ehrlichkeit. Ohne sie kann sich Bewusstsein nicht öffnen.',
    feedbackWrong: 'The Arrival stage is about creating safety — not control or speed.',
    feedbackWrongDe: 'Die Arrival-Phase dient der Sicherheit — nicht Kontrolle oder Geschwindigkeit.',
  },
  {
    id: 'q2', stage: 'arrival',
    question: 'Which behaviour is a red flag during Arrival?',
    questionDe: 'Welches Verhalten ist ein Warnsignal während der Arrival-Phase?',
    options: [
      { key: 'a', text: 'Asking what feels most important to the person today', textDe: 'Fragen, was der Person heute am wichtigsten ist', type: 'ethical' },
      { key: 'b', text: 'Listening calmly without interrupting', textDe: 'Ruhig zuhören ohne zu unterbrechen', type: 'ethical' },
      { key: 'c', text: 'Jumping into the offer within the first 60 seconds', textDe: 'Innerhalb der ersten 60 Sekunden ins Angebot springen', type: 'pressure' },
      { key: 'd', text: 'Matching the other person\'s pace', textDe: 'Das Tempo der anderen Person anpassen', type: 'neutral' },
    ],
    correctKey: 'c',
    feedbackCorrect: 'Correct. Premature pitching destroys safety.',
    feedbackCorrectDe: 'Richtig. Vorzeitiges Pitchen zerstört die Sicherheit.',
    feedbackWrong: 'Jumping to the offer before trust exists creates defensiveness, not openness.',
    feedbackWrongDe: 'Zum Angebot zu springen, bevor Vertrauen besteht, erzeugt Abwehr, keine Offenheit.',
  },
  {
    id: 'q3', stage: 'context',
    question: 'What is the goal of the Context stage?',
    questionDe: 'Was ist das Ziel der Context-Phase?',
    options: [
      { key: 'a', text: 'Find weaknesses to leverage during the close', textDe: 'Schwächen finden, um sie beim Abschluss zu nutzen', type: 'pressure' },
      { key: 'b', text: 'Understand the visible situation before exploring depth', textDe: 'Die sichtbare Situation verstehen, bevor man in die Tiefe geht', type: 'ethical' },
      { key: 'c', text: 'Build a case for why the product is the answer', textDe: 'Argumente aufbauen, warum das Produkt die Antwort ist', type: 'pressure' },
      { key: 'd', text: 'Skip to emotions as fast as possible', textDe: 'So schnell wie möglich zu Emotionen springen', type: 'neutral' },
    ],
    correctKey: 'b',
    feedbackCorrect: 'Correct. Surface first. Depth second.',
    feedbackCorrectDe: 'Richtig. Erst die Oberfläche. Dann die Tiefe.',
    feedbackWrong: 'Context means understanding reality — not building a sales argument.',
    feedbackWrongDe: 'Context bedeutet, die Realität zu verstehen — kein Verkaufsargument aufzubauen.',
  },
  {
    id: 'q4', stage: 'context',
    question: 'Which is a green flag in the Context stage?',
    questionDe: 'Was ist ein positives Signal in der Context-Phase?',
    options: [
      { key: 'a', text: 'Prescribing a solution before hearing the full story', textDe: 'Eine Lösung vorschlagen, bevor man die ganze Geschichte gehört hat', type: 'pressure' },
      { key: 'b', text: 'Structured listening with accurate summaries', textDe: 'Strukturiertes Zuhören mit präzisen Zusammenfassungen', type: 'ethical' },
      { key: 'c', text: 'Steering answers toward the product', textDe: 'Antworten in Richtung des Produkts lenken', type: 'pressure' },
      { key: 'd', text: 'Asking rapid-fire questions', textDe: 'Schnellfeuer-Fragen stellen', type: 'neutral' },
    ],
    correctKey: 'b',
    feedbackCorrect: 'Correct. Accurate understanding is the foundation of trust.',
    feedbackCorrectDe: 'Richtig. Genaues Verständnis ist das Fundament von Vertrauen.',
    feedbackWrong: 'Listening carefully and summarising accurately shows respect and builds trust.',
    feedbackWrongDe: 'Aufmerksam zuhören und genau zusammenfassen zeigt Respekt und baut Vertrauen auf.',
  },
  {
    id: 'q5', stage: 'friction',
    question: 'What does hesitation most often indicate?',
    questionDe: 'Was zeigt Zögern am häufigsten an?',
    options: [
      { key: 'a', text: 'Lack of information', textDe: 'Mangel an Informationen', type: 'neutral' },
      { key: 'b', text: 'Price sensitivity', textDe: 'Preissensibilität', type: 'pressure' },
      { key: 'c', text: 'An internal protection mechanism', textDe: 'Ein innerer Schutzmechanismus', type: 'ethical' },
      { key: 'd', text: 'Weak motivation', textDe: 'Schwache Motivation', type: 'pressure' },
    ],
    correctKey: 'c',
    feedbackCorrect: 'Correct. Resistance is protection, not failure.',
    feedbackCorrectDe: 'Richtig. Widerstand ist Schutz, kein Versagen.',
    feedbackWrong: 'Hesitation is almost always a sign of internal protection — not a logical problem.',
    feedbackWrongDe: 'Zögern ist fast immer ein Zeichen inneren Schutzes — kein logisches Problem.',
  },
  {
    id: 'q6', stage: 'friction',
    question: 'How should a closer respond when a lead says "I need to think about it"?',
    questionDe: 'Wie sollte ein Closer reagieren, wenn ein Lead sagt „Ich muss darüber nachdenken"?',
    options: [
      { key: 'a', text: '"If you leave now, this opportunity is gone."', textDe: '„Wenn du jetzt gehst, ist diese Chance vorbei."', type: 'pressure' },
      { key: 'b', text: '"What specifically would you be thinking about?"', textDe: '„Worüber genau würdest du nachdenken?"', type: 'neutral' },
      { key: 'c', text: '"What feels difficult about fully going toward this right now?"', textDe: '„Was fühlt sich gerade schwierig an, voll dafür zu gehen?"', type: 'ethical' },
      { key: 'd', text: '"Most successful clients decided immediately."', textDe: '„Die erfolgreichsten Kunden haben sich sofort entschieden."', type: 'pressure' },
    ],
    correctKey: 'c',
    feedbackCorrect: 'Correct. You invited reflection instead of pushing.',
    feedbackCorrectDe: 'Richtig. Du hast Reflexion eingeladen, statt zu drängen.',
    feedbackWrong: 'The ethical response invites self-exploration, not urgency or shame.',
    feedbackWrongDe: 'Die ethische Antwort lädt zur Selbsterforschung ein, nicht zu Druck oder Scham.',
  },
  {
    id: 'q7', stage: 'friction',
    question: 'Which approach destroys trust during Friction?',
    questionDe: 'Welcher Ansatz zerstört Vertrauen während der Friction-Phase?',
    options: [
      { key: 'a', text: 'Naming patterns gently', textDe: 'Muster sanft benennen', type: 'ethical' },
      { key: 'b', text: 'Staying with discomfort without rushing', textDe: 'Bei Unbehagen bleiben, ohne zu hetzen', type: 'ethical' },
      { key: 'c', text: 'Arguing with objections to "win"', textDe: 'Gegen Einwände argumentieren, um zu „gewinnen"', type: 'pressure' },
      { key: 'd', text: 'Asking open questions with curiosity', textDe: 'Offene Fragen mit Neugier stellen', type: 'ethical' },
    ],
    correctKey: 'c',
    feedbackCorrect: 'Correct. Arguing creates resistance, not resolution.',
    feedbackCorrectDe: 'Richtig. Argumentieren erzeugt Widerstand, keine Lösung.',
    feedbackWrong: 'Trying to "win" against objections is pressure — it increases resistance.',
    feedbackWrongDe: 'Gegen Einwände „gewinnen" zu wollen ist Druck — es verstärkt den Widerstand.',
  },
  {
    id: 'q8', stage: 'awareness',
    question: 'What is the primary goal of Ethical Closing?',
    questionDe: 'Was ist das Hauptziel von Ethical Closing?',
    options: [
      { key: 'a', text: 'Increase conversion rate', textDe: 'Conversion Rate erhöhen', type: 'pressure' },
      { key: 'b', text: 'Overcome objections', textDe: 'Einwände überwinden', type: 'pressure' },
      { key: 'c', text: 'Create decision readiness through awareness', textDe: 'Entscheidungsbereitschaft durch Bewusstsein schaffen', type: 'ethical' },
      { key: 'd', text: 'Guide the conversation to a sale', textDe: 'Das Gespräch zum Verkauf führen', type: 'pressure' },
    ],
    correctKey: 'c',
    feedbackCorrect: 'Correct. Ethical Closing enables decisions — it does not force them.',
    feedbackCorrectDe: 'Richtig. Ethical Closing ermöglicht Entscheidungen — es erzwingt sie nicht.',
    feedbackWrong: 'The goal is never conversion itself. It is creating the conditions for real decision.',
    feedbackWrongDe: 'Das Ziel ist nie die Conversion selbst. Es geht darum, die Bedingungen für echte Entscheidungen zu schaffen.',
  },
  {
    id: 'q9', stage: 'awareness',
    question: 'What is the correct role of the closer in the Awareness stage?',
    questionDe: 'Welche Rolle hat der Closer in der Awareness-Phase?',
    options: [
      { key: 'a', text: 'Explain the product better', textDe: 'Das Produkt besser erklären', type: 'pressure' },
      { key: 'b', text: 'Reframe objections logically', textDe: 'Einwände logisch umformulieren', type: 'neutral' },
      { key: 'c', text: 'Help the person recognize their own pattern', textDe: 'Der Person helfen, ihr eigenes Muster zu erkennen', type: 'ethical' },
      { key: 'd', text: 'Increase urgency to create action', textDe: 'Dringlichkeit erhöhen, um Handlung zu erzeugen', type: 'pressure' },
    ],
    correctKey: 'c',
    feedbackCorrect: 'Correct. Mirror, do not dominate.',
    feedbackCorrectDe: 'Richtig. Spiegeln, nicht dominieren.',
    feedbackWrong: 'Awareness is about helping the person see themselves — not about explaining better.',
    feedbackWrongDe: 'Awareness bedeutet, der Person zu helfen, sich selbst zu sehen — nicht besser zu erklären.',
  },
  {
    id: 'q10', stage: 'awareness',
    question: 'Which formulation best demonstrates ethical awareness creation?',
    questionDe: 'Welche Formulierung zeigt am besten ethische Bewusstseinsschaffung?',
    options: [
      { key: 'a', text: '"You clearly need this product."', textDe: '„Du brauchst dieses Produkt eindeutig."', type: 'pressure' },
      { key: 'b', text: '"It sounds like one part of you wants this, and another part is still protecting you."', textDe: '„Es klingt so, als ob ein Teil von dir das will, und ein anderer Teil dich noch schützt."', type: 'ethical' },
      { key: 'c', text: '"Everyone who hesitates ends up regretting it."', textDe: '„Jeder, der zögert, bereut es am Ende."', type: 'pressure' },
      { key: 'd', text: '"Let me explain again why this works."', textDe: '„Lass mich nochmal erklären, warum das funktioniert."', type: 'neutral' },
    ],
    correctKey: 'b',
    feedbackCorrect: 'Correct. You named the internal conflict without judgement.',
    feedbackCorrectDe: 'Richtig. Du hast den inneren Konflikt ohne Bewertung benannt.',
    feedbackWrong: 'Ethical awareness means reflecting what you see — not prescribing what they should do.',
    feedbackWrongDe: 'Ethisches Bewusstsein bedeutet, zu spiegeln, was du siehst — nicht vorzuschreiben, was sie tun sollen.',
  },
  {
    id: 'q11', stage: 'ownership',
    question: 'What is the shift that happens in the Ownership stage?',
    questionDe: 'Welche Veränderung findet in der Ownership-Phase statt?',
    options: [
      { key: 'a', text: 'The closer takes responsibility for the outcome', textDe: 'Der Closer übernimmt die Verantwortung für das Ergebnis', type: 'pressure' },
      { key: 'b', text: 'The lead agrees to buy', textDe: 'Der Lead stimmt dem Kauf zu', type: 'pressure' },
      { key: 'c', text: 'The lead moves from "this is happening to me" to "I see my role in it"', textDe: 'Der Lead wechselt von „das passiert mir" zu „ich sehe meine Rolle darin"', type: 'ethical' },
      { key: 'd', text: 'The closer reveals the price', textDe: 'Der Closer nennt den Preis', type: 'neutral' },
    ],
    correctKey: 'c',
    feedbackCorrect: 'Correct. Responsibility creates readiness.',
    feedbackCorrectDe: 'Richtig. Verantwortung schafft Bereitschaft.',
    feedbackWrong: 'Ownership is about the lead recognising their own agency — not about the sale.',
    feedbackWrongDe: 'Ownership bedeutet, dass der Lead seine eigene Handlungsfähigkeit erkennt — nicht den Verkauf.',
  },
  {
    id: 'q12', stage: 'ownership',
    question: 'Which is a red flag in the Ownership stage?',
    questionDe: 'Was ist ein Warnsignal in der Ownership-Phase?',
    options: [
      { key: 'a', text: 'Empowering the lead to see their own clarity', textDe: 'Den Lead befähigen, seine eigene Klarheit zu sehen', type: 'ethical' },
      { key: 'b', text: 'Emotionally rescuing the lead from discomfort', textDe: 'Den Lead emotional aus dem Unbehagen retten', type: 'pressure' },
      { key: 'c', text: 'Inviting personal agency', textDe: 'Zu persönlicher Handlungsfähigkeit einladen', type: 'ethical' },
      { key: 'd', text: 'Asking what the lead sees more clearly now', textDe: 'Fragen, was der Lead jetzt klarer sieht', type: 'ethical' },
    ],
    correctKey: 'b',
    feedbackCorrect: 'Correct. Rescuing creates dependency, not empowerment.',
    feedbackCorrectDe: 'Richtig. Retten erzeugt Abhängigkeit, nicht Ermächtigung.',
    feedbackWrong: 'Emotional rescuing prevents the lead from developing their own ownership.',
    feedbackWrongDe: 'Emotionales Retten hindert den Lead daran, eigene Ownership zu entwickeln.',
  },
  {
    id: 'q13', stage: 'decision',
    question: 'What defines a clean decision?',
    questionDe: 'Was definiert eine saubere Entscheidung?',
    options: [
      { key: 'a', text: 'Fast response from the lead', textDe: 'Schnelle Antwort vom Lead', type: 'pressure' },
      { key: 'b', text: 'Emotional intensity and excitement', textDe: 'Emotionale Intensität und Begeisterung', type: 'neutral' },
      { key: 'c', text: 'Clear ownership without pressure', textDe: 'Klare Ownership ohne Druck', type: 'ethical' },
      { key: 'd', text: 'Agreement with the closer\'s recommendation', textDe: 'Zustimmung zur Empfehlung des Closers', type: 'pressure' },
    ],
    correctKey: 'c',
    feedbackCorrect: 'Correct. A real decision is calm, owned, and undistorted by pressure.',
    feedbackCorrectDe: 'Richtig. Eine echte Entscheidung ist ruhig, eigenverantwortlich und frei von Druck.',
    feedbackWrong: 'Speed and excitement are not markers of quality decisions. Clarity is.',
    feedbackWrongDe: 'Geschwindigkeit und Aufregung sind keine Marker für Qualitätsentscheidungen. Klarheit schon.',
  },
  {
    id: 'q14', stage: 'decision',
    question: 'When a lead says "Yes", what must the closer verify?',
    questionDe: 'Wenn ein Lead „Ja" sagt, was muss der Closer überprüfen?',
    options: [
      { key: 'a', text: 'That the contract is signed immediately', textDe: 'Dass der Vertrag sofort unterschrieben wird', type: 'pressure' },
      { key: 'b', text: 'Whether it is a real yes or a compliance yes', textDe: 'Ob es ein echtes Ja oder ein Compliance-Ja ist', type: 'ethical' },
      { key: 'c', text: 'Nothing — a yes is a yes', textDe: 'Nichts — ein Ja ist ein Ja', type: 'pressure' },
      { key: 'd', text: 'That they don\'t speak to others who might dissuade them', textDe: 'Dass sie nicht mit anderen sprechen, die sie abhalten könnten', type: 'pressure' },
    ],
    correctKey: 'b',
    feedbackCorrect: 'Correct. Truth over conversion.',
    feedbackCorrectDe: 'Richtig. Wahrheit über Conversion.',
    feedbackWrong: 'An ethical closer distinguishes real agreement from compliance under pressure.',
    feedbackWrongDe: 'Ein ethischer Closer unterscheidet echte Zustimmung von Compliance unter Druck.',
  },
  {
    id: 'q15', stage: 'decision',
    question: 'How should an ethical closer respond to "No"?',
    questionDe: 'Wie sollte ein ethischer Closer auf „Nein" reagieren?',
    options: [
      { key: 'a', text: 'Push harder — they clearly need more convincing', textDe: 'Stärker drängen — sie brauchen offensichtlich mehr Überzeugung', type: 'pressure' },
      { key: 'b', text: 'Use scarcity to create urgency', textDe: 'Knappheit nutzen, um Dringlichkeit zu erzeugen', type: 'pressure' },
      { key: 'c', text: 'Honour it when it is honest', textDe: 'Es respektieren, wenn es ehrlich ist', type: 'ethical' },
      { key: 'd', text: 'Make them feel guilty about the time invested', textDe: 'Ihnen ein schlechtes Gewissen wegen der investierten Zeit machen', type: 'pressure' },
    ],
    correctKey: 'c',
    feedbackCorrect: 'Correct. A clean no has as much integrity as a clean yes.',
    feedbackCorrectDe: 'Richtig. Ein sauberes Nein hat genauso viel Integrität wie ein sauberes Ja.',
    feedbackWrong: 'Respecting an honest no is the mark of ethical excellence.',
    feedbackWrongDe: 'Ein ehrliches Nein zu respektieren ist das Zeichen ethischer Exzellenz.',
  },
  {
    id: 'q16', stage: 'awareness',
    question: 'Which phrase reflects pressure, not awareness?',
    questionDe: 'Welcher Satz spiegelt Druck wider, nicht Bewusstsein?',
    options: [
      { key: 'a', text: '"What do you think this is asking from you now?"', textDe: '„Was denkst du, fordert das gerade von dir?"', type: 'ethical' },
      { key: 'b', text: '"If you don\'t act now, you\'ll be in the same place next year."', textDe: '„Wenn du jetzt nicht handelst, bist du nächstes Jahr am gleichen Punkt."', type: 'pressure' },
      { key: 'c', text: '"What are you seeing more clearly now?"', textDe: '„Was siehst du jetzt klarer?"', type: 'ethical' },
      { key: 'd', text: '"Would it be fair to say the difficulty is not the option itself?"', textDe: '„Wäre es fair zu sagen, dass die Schwierigkeit nicht die Option selbst ist?"', type: 'ethical' },
    ],
    correctKey: 'b',
    feedbackCorrect: 'Correct. Time-pressure framing is manipulation disguised as concern.',
    feedbackCorrectDe: 'Richtig. Zeitdruck-Framing ist Manipulation, verkleidet als Sorge.',
    feedbackWrong: 'Using future pain as leverage is pressure — not ethical awareness creation.',
    feedbackWrongDe: 'Zukünftigen Schmerz als Hebel zu nutzen ist Druck — keine ethische Bewusstseinsschaffung.',
  },
  {
    id: 'q17', stage: 'friction',
    question: '"The objection is rarely the real objection." What does this mean?',
    questionDe: '„Der Einwand ist selten der echte Einwand." Was bedeutet das?',
    options: [
      { key: 'a', text: 'Leads always lie about their reasons', textDe: 'Leads lügen immer über ihre Gründe', type: 'pressure' },
      { key: 'b', text: 'The stated concern often masks a deeper pattern of protection', textDe: 'Die genannte Sorge verbirgt oft ein tieferes Schutzmuster', type: 'ethical' },
      { key: 'c', text: 'You should ignore what leads say', textDe: 'Man sollte ignorieren, was Leads sagen', type: 'pressure' },
      { key: 'd', text: 'Price is always the real issue', textDe: 'Der Preis ist immer das wahre Problem', type: 'neutral' },
    ],
    correctKey: 'b',
    feedbackCorrect: 'Correct. Hesitation is information, not opposition.',
    feedbackCorrectDe: 'Richtig. Zögern ist Information, nicht Opposition.',
    feedbackWrong: 'Objections are surface expressions of deeper internal protection mechanisms.',
    feedbackWrongDe: 'Einwände sind oberflächliche Ausdrücke tieferer innerer Schutzmechanismen.',
  },
  {
    id: 'q18', stage: 'ownership',
    question: 'What is the danger of creating dependency on the closer?',
    questionDe: 'Was ist die Gefahr, wenn man Abhängigkeit vom Closer erzeugt?',
    options: [
      { key: 'a', text: 'There is no danger — dependency means loyalty', textDe: 'Es gibt keine Gefahr — Abhängigkeit bedeutet Loyalität', type: 'pressure' },
      { key: 'b', text: 'It undermines the lead\'s ability to own their decision', textDe: 'Es untergräbt die Fähigkeit des Leads, seine Entscheidung zu besitzen', type: 'ethical' },
      { key: 'c', text: 'It slows down the sales cycle', textDe: 'Es verlangsamt den Verkaufszyklus', type: 'neutral' },
      { key: 'd', text: 'It reduces the closer\'s workload', textDe: 'Es reduziert die Arbeitslast des Closers', type: 'neutral' },
    ],
    correctKey: 'b',
    feedbackCorrect: 'Correct. The goal is empowerment, not dependency.',
    feedbackCorrectDe: 'Richtig. Das Ziel ist Ermächtigung, nicht Abhängigkeit.',
    feedbackWrong: 'Dependency prevents genuine ownership — and genuine ownership drives real decisions.',
    feedbackWrongDe: 'Abhängigkeit verhindert echte Ownership — und echte Ownership treibt echte Entscheidungen.',
  },
];

/* ─── Scenarios (5) ─── */
const SCENARIOS: Scenario[] = [
  {
    id: 's1', stage: 'friction',
    setup: 'You are 12 minutes into a conversation with a business owner who clearly needs support but keeps hesitating.',
    setupDe: 'Du bist 12 Minuten in einem Gespräch mit einem Unternehmer, der offensichtlich Unterstützung braucht, aber immer wieder zögert.',
    leadSays: '"I\'m interested… but I\'m not sure if now is the right time."',
    leadSaysDe: '„Ich bin interessiert… aber ich bin mir nicht sicher, ob jetzt der richtige Zeitpunkt ist."',
    question: 'How do you respond?',
    questionDe: 'Wie reagierst du?',
    choices: [
      {
        key: 'a', label: 'Urgency Push', labelDe: 'Dringlichkeit',
        type: 'pressure',
        text: '"I understand, but if you wait, nothing will change. Let\'s make a decision now."',
        textDe: '„Ich verstehe, aber wenn du wartest, wird sich nichts ändern. Lass uns jetzt eine Entscheidung treffen."',
        impact: { awareness: -10, resistance: 20, decisionReadiness: -5, pressure: 25 },
        feedback: 'You created pressure. The lead would likely become defensive.',
        feedbackDe: 'Du hast Druck erzeugt. Der Lead würde wahrscheinlich in die Defensive gehen.',
      },
      {
        key: 'b', label: 'Open Question', labelDe: 'Offene Frage',
        type: 'neutral',
        text: '"What exactly is holding you back?"',
        textDe: '„Was genau hält dich zurück?"',
        impact: { awareness: 5, resistance: 0, decisionReadiness: 5, pressure: 0 },
        feedback: 'Neutral. You opened the door, but did not guide deeply.',
        feedbackDe: 'Neutral. Du hast die Tür geöffnet, aber nicht tief geführt.',
      },
      {
        key: 'c', label: 'Reflective Inquiry', labelDe: 'Reflektive Frage',
        type: 'ethical',
        text: '"What makes this feel like it might not be the right time right now?"',
        textDe: '„Was lässt es sich gerade so anfühlen, als wäre jetzt nicht der richtige Zeitpunkt?"',
        impact: { awareness: 20, resistance: -10, decisionReadiness: 10, pressure: -5 },
        feedback: 'Strong. You invited reflection instead of pushing.',
        feedbackDe: 'Stark. Du hast Reflexion eingeladen, statt zu drängen.',
      },
    ],
  },
  {
    id: 's2', stage: 'awareness',
    setup: 'The lead has acknowledged they want change but keeps circling back to external reasons for why they can\'t commit.',
    setupDe: 'Der Lead hat erkannt, dass er Veränderung will, aber kommt immer wieder auf externe Gründe zurück, warum er sich nicht committen kann.',
    leadSays: '"It\'s just that my partner isn\'t supportive, my finances are tight, and the timing is bad."',
    leadSaysDe: '„Es ist nur so, dass mein Partner mich nicht unterstützt, meine Finanzen knapp sind und der Zeitpunkt schlecht ist."',
    question: 'What is your next move?',
    questionDe: 'Was ist dein nächster Schritt?',
    choices: [
      {
        key: 'a', label: 'Dismiss Concerns', labelDe: 'Sorgen abtun',
        type: 'pressure',
        text: '"Those are just excuses. Successful people find a way regardless."',
        textDe: '„Das sind nur Ausreden. Erfolgreiche Menschen finden immer einen Weg."',
        impact: { awareness: -15, resistance: 25, decisionReadiness: -10, pressure: 30 },
        feedback: 'You dismissed their reality. Trust is broken.',
        feedbackDe: 'Du hast ihre Realität abgetan. Das Vertrauen ist gebrochen.',
      },
      {
        key: 'b', label: 'Problem Solve', labelDe: 'Problem lösen',
        type: 'neutral',
        text: '"Let\'s look at each of those one by one and find solutions."',
        textDe: '„Lass uns jeden Punkt einzeln betrachten und Lösungen finden."',
        impact: { awareness: 5, resistance: 5, decisionReadiness: 5, pressure: 5 },
        feedback: 'Logical but surface-level. You addressed symptoms, not the pattern.',
        feedbackDe: 'Logisch, aber oberflächlich. Du hast Symptome behandelt, nicht das Muster.',
      },
      {
        key: 'c', label: 'Pattern Recognition', labelDe: 'Mustererkennung',
        type: 'ethical',
        text: '"I notice these are all external reasons. I wonder whether the real difficulty is something you feel internally — something harder to name."',
        textDe: '„Mir fällt auf, dass das alles externe Gründe sind. Ich frage mich, ob die eigentliche Schwierigkeit etwas ist, das du innerlich fühlst — etwas, das schwerer zu benennen ist."',
        impact: { awareness: 25, resistance: -15, decisionReadiness: 15, pressure: -5 },
        feedback: 'Excellent. You helped them see the difference between external noise and internal truth.',
        feedbackDe: 'Ausgezeichnet. Du hast ihnen geholfen, den Unterschied zwischen externem Rauschen und innerer Wahrheit zu sehen.',
      },
    ],
  },
  {
    id: 's3', stage: 'ownership',
    setup: 'After deep reflection, the lead has tears in their eyes and says they finally see what has been holding them back.',
    setupDe: 'Nach tiefer Reflexion hat der Lead Tränen in den Augen und sagt, er sieht endlich, was ihn zurückgehalten hat.',
    leadSays: '"I think I\'ve been afraid of actually succeeding. That sounds crazy, doesn\'t it?"',
    leadSaysDe: '„Ich glaube, ich hatte Angst davor, tatsächlich erfolgreich zu sein. Das klingt verrückt, oder?"',
    question: 'How do you respond to this moment of vulnerability?',
    questionDe: 'Wie reagierst du auf diesen verletzlichen Moment?',
    choices: [
      {
        key: 'a', label: 'Close Immediately', labelDe: 'Sofort abschließen',
        type: 'pressure',
        text: '"Great insight! So let\'s lock this in while you\'re feeling motivated."',
        textDe: '„Tolle Erkenntnis! Lass uns das festmachen, solange du motiviert bist."',
        impact: { awareness: -5, resistance: 15, decisionReadiness: -10, pressure: 20 },
        feedback: 'You exploited a vulnerable moment. This is the opposite of ethical closing.',
        feedbackDe: 'Du hast einen verletzlichen Moment ausgenutzt. Das ist das Gegenteil von ethischem Closing.',
      },
      {
        key: 'b', label: 'Comfort and Redirect', labelDe: 'Trösten und umlenken',
        type: 'neutral',
        text: '"That\'s totally normal. A lot of people feel that way."',
        textDe: '„Das ist völlig normal. Viele Menschen fühlen so."',
        impact: { awareness: 0, resistance: 0, decisionReadiness: 5, pressure: 0 },
        feedback: 'Compassionate but generic. You normalised without deepening ownership.',
        feedbackDe: 'Mitfühlend, aber generisch. Du hast normalisiert, ohne Ownership zu vertiefen.',
      },
      {
        key: 'c', label: 'Anchor Ownership', labelDe: 'Ownership verankern',
        type: 'ethical',
        text: '"That doesn\'t sound crazy at all. That sounds like the most honest thing you\'ve said today. What does seeing that clearly change for you?"',
        textDe: '„Das klingt überhaupt nicht verrückt. Das klingt wie das Ehrlichste, was du heute gesagt hast. Was verändert sich für dich, wenn du das so klar siehst?"',
        impact: { awareness: 20, resistance: -20, decisionReadiness: 20, pressure: -10 },
        feedback: 'Powerful. You honoured their truth and invited them to own what comes next.',
        feedbackDe: 'Kraftvoll. Du hast ihre Wahrheit gewürdigt und sie eingeladen, das Nächste selbst zu besitzen.',
      },
    ],
  },
  {
    id: 's4', stage: 'decision',
    setup: 'You\'ve had a clean conversation. Awareness is high, the lead understands their pattern, and they\'re ready.',
    setupDe: 'Du hattest ein sauberes Gespräch. Das Bewusstsein ist hoch, der Lead versteht sein Muster und ist bereit.',
    leadSays: '"I think I want to do this… yes."',
    leadSaysDe: '„Ich glaube, ich möchte das machen… ja."',
    question: 'What do you do?',
    questionDe: 'Was tust du?',
    choices: [
      {
        key: 'a', label: 'Rush to Close', labelDe: 'Schnell abschließen',
        type: 'pressure',
        text: '"Perfect! Let me send the contract right now before you change your mind."',
        textDe: '„Perfekt! Lass mich dir sofort den Vertrag schicken, bevor du es dir anders überlegst."',
        impact: { awareness: -5, resistance: 10, decisionReadiness: -5, pressure: 20 },
        feedback: '"Before you change your mind" reveals distrust. A real yes does not need urgency.',
        feedbackDe: '„Bevor du es dir anders überlegst" zeigt Misstrauen. Ein echtes Ja braucht keine Dringlichkeit.',
      },
      {
        key: 'b', label: 'Accept and Proceed', labelDe: 'Akzeptieren und weitermachen',
        type: 'neutral',
        text: '"Great, let\'s move forward."',
        textDe: '„Super, lass uns weitermachen."',
        impact: { awareness: 0, resistance: 0, decisionReadiness: 10, pressure: 0 },
        feedback: 'Adequate. But you missed the chance to verify decision quality.',
        feedbackDe: 'Angemessen. Aber du hast die Chance verpasst, die Entscheidungsqualität zu prüfen.',
      },
      {
        key: 'c', label: 'Verify Decision Quality', labelDe: 'Entscheidungsqualität prüfen',
        type: 'ethical',
        text: '"Before we move forward — is this a real yes for you? Something you\'re willing to stand behind?"',
        textDe: '„Bevor wir weitermachen — ist das ein echtes Ja für dich? Etwas, hinter dem du stehen kannst?"',
        impact: { awareness: 15, resistance: -10, decisionReadiness: 25, pressure: -10 },
        feedback: 'Exemplary. You prioritised truth over speed. This creates lasting commitment.',
        feedbackDe: 'Vorbildlich. Du hast Wahrheit über Geschwindigkeit gestellt. Das schafft nachhaltiges Commitment.',
      },
    ],
  },
  {
    id: 's5', stage: 'arrival',
    setup: 'You just started a call. The lead was referred and seems slightly nervous.',
    setupDe: 'Du hast gerade einen Call gestartet. Der Lead wurde empfohlen und wirkt leicht nervös.',
    leadSays: '"So… I was told to talk to you. I\'m not really sure what this is about."',
    leadSaysDe: '„Also… mir wurde gesagt, ich soll mit dir sprechen. Ich weiß nicht genau, worum es geht."',
    question: 'How do you open?',
    questionDe: 'Wie eröffnest du?',
    choices: [
      {
        key: 'a', label: 'Take Control', labelDe: 'Kontrolle übernehmen',
        type: 'pressure',
        text: '"No worries, I\'ll walk you through everything. So first, let me tell you what we do…"',
        textDe: '„Keine Sorge, ich führe dich durch alles. Also zuerst, lass mich dir erzählen, was wir machen…"',
        impact: { awareness: -5, resistance: 10, decisionReadiness: -5, pressure: 15 },
        feedback: 'You took control but removed their agency. The lead is now a passive listener.',
        feedbackDe: 'Du hast die Kontrolle übernommen, aber ihre Eigeninitiative entfernt. Der Lead ist jetzt ein passiver Zuhörer.',
      },
      {
        key: 'b', label: 'Ask About Expectations', labelDe: 'Nach Erwartungen fragen',
        type: 'neutral',
        text: '"What were you told about this conversation?"',
        textDe: '„Was wurde dir über dieses Gespräch gesagt?"',
        impact: { awareness: 5, resistance: -5, decisionReadiness: 5, pressure: 0 },
        feedback: 'Decent start. You showed interest but didn\'t create safety.',
        feedbackDe: 'Guter Start. Du hast Interesse gezeigt, aber keine Sicherheit geschaffen.',
      },
      {
        key: 'c', label: 'Create Safety', labelDe: 'Sicherheit schaffen',
        type: 'ethical',
        text: '"That\'s completely fine. There\'s no agenda here. What would make this conversation genuinely useful for you?"',
        textDe: '„Das ist völlig in Ordnung. Es gibt hier keine Agenda. Was würde dieses Gespräch wirklich nützlich für dich machen?"',
        impact: { awareness: 15, resistance: -15, decisionReadiness: 10, pressure: -10 },
        feedback: 'Strong. You removed pressure and gave them ownership of the conversation\'s direction.',
        feedbackDe: 'Stark. Du hast Druck entfernt und ihnen die Ownership über die Gesprächsrichtung gegeben.',
      },
    ],
  },
];

const STAGE_NAMES = ['arrival', 'context', 'friction', 'awareness', 'ownership', 'decision'] as const;
const STAGE_LABELS: Record<string, string> = {
  arrival: 'Arrival', context: 'Context', friction: 'Friction',
  awareness: 'Awareness', ownership: 'Ownership', decision: 'Decision',
};

const ease = [0.25, 0.1, 0.25, 1] as const;

/* ─── Main Component ─── */
export default function Certification() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { tx } = useLanguage();
  const [phase, setPhase] = useState<Phase>('intro');
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizStageScores, setQuizStageScores] = useState<Record<string, { correct: number; total: number }>>({});
  const [currentScenario, setCurrentScenario] = useState(0);
  const [scenarioSelected, setScenarioSelected] = useState<string | null>(null);
  const [showScenarioFeedback, setShowScenarioFeedback] = useState(false);
  const [scenarioTotals, setScenarioTotals] = useState({ awareness: 0, resistance: 0, decisionReadiness: 0, pressure: 0 });
  const [scenarioStageScores, setScenarioStageScores] = useState<Record<string, number>>({});
  const [result, setResult] = useState<FinalResult | null>(null);
  const [alreadyCertified, setAlreadyCertified] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('onboarding_progress').select('*').eq('user_id', user.id).eq('item_key', 'ethical_certification_passed').eq('completed', true).maybeSingle()
      .then(({ data }) => { if (data) setAlreadyCertified(true); });
  }, [user]);

  const totalQuizQuestions = QUIZ_QUESTIONS.length;
  const totalScenarios = SCENARIOS.length;

  const handleQuizAnswer = useCallback(() => {
    if (!selected) return;
    const q = QUIZ_QUESTIONS[currentQ];
    const isCorrect = selected === q.correctKey;
    setShowFeedback(true);
    if (isCorrect) setQuizCorrect(prev => prev + 1);
    const stage = q.stage;
    setQuizStageScores(prev => ({
      ...prev,
      [stage]: {
        correct: (prev[stage]?.correct ?? 0) + (isCorrect ? 1 : 0),
        total: (prev[stage]?.total ?? 0) + 1,
      },
    }));
  }, [selected, currentQ]);

  const handleQuizNext = useCallback(() => {
    setShowFeedback(false);
    setSelected(null);
    if (currentQ + 1 < totalQuizQuestions) {
      setCurrentQ(prev => prev + 1);
    } else {
      setPhase('scenarios');
    }
  }, [currentQ, totalQuizQuestions]);

  const handleScenarioAnswer = useCallback(() => {
    if (!scenarioSelected) return;
    setShowScenarioFeedback(true);
    const scenario = SCENARIOS[currentScenario];
    const choice = scenario.choices.find(c => c.key === scenarioSelected)!;
    setScenarioTotals(prev => ({
      awareness: prev.awareness + choice.impact.awareness,
      resistance: prev.resistance + choice.impact.resistance,
      decisionReadiness: prev.decisionReadiness + choice.impact.decisionReadiness,
      pressure: prev.pressure + choice.impact.pressure,
    }));
    const stageBonus = choice.type === 'ethical' ? 100 : choice.type === 'neutral' ? 50 : 10;
    setScenarioStageScores(prev => ({
      ...prev,
      [scenario.stage]: Math.max(prev[scenario.stage] ?? 0, stageBonus),
    }));
  }, [scenarioSelected, currentScenario]);

  const handleScenarioNext = useCallback(() => {
    setShowScenarioFeedback(false);
    setScenarioSelected(null);
    if (currentScenario + 1 < totalScenarios) {
      setCurrentScenario(prev => prev + 1);
    } else {
      computeResult();
    }
  }, [currentScenario, totalScenarios]);

  const computeResult = useCallback(async () => {
    const stageScores: StageScore = { arrival: 0, context: 0, friction: 0, awareness: 0, ownership: 0, decision: 0 };
    for (const stage of STAGE_NAMES) {
      const quizPart = quizStageScores[stage] ? (quizStageScores[stage].correct / quizStageScores[stage].total) * 100 : 50;
      const scenarioPart = scenarioStageScores[stage] ?? 50;
      stageScores[stage] = Math.round((quizPart * 0.4 + scenarioPart * 0.6));
    }

    const avgStage = Object.values(stageScores).reduce((a, b) => a + b, 0) / 6;
    const quizPercent = (quizCorrect / totalQuizQuestions) * 100;
    const maxPressure = totalScenarios * 30;
    const pressureIndex = Math.max(0, Math.min(100, Math.round((scenarioTotals.pressure / maxPressure) * 100)));
    const ethicalAlignmentScore = Math.round(quizPercent * 0.5 + avgStage * 0.5);
    const decisionQualityScore = Math.round(Math.max(0, Math.min(100, scenarioTotals.decisionReadiness / totalScenarios * 2 + 50)));
    const passed = ethicalAlignmentScore > 75 && pressureIndex < 30 && stageScores.awareness > 60;

    const finalResult: FinalResult = { stageScores, ethicalAlignmentScore, pressureIndex, decisionQualityScore, passed };
    setResult(finalResult);
    setPhase('result');

    if (user) {
      await supabase.from('member_kpis').update({
        arrival_score: stageScores.arrival,
        context_score: stageScores.context,
        friction_score: stageScores.friction,
        awareness_score: stageScores.awareness,
        ownership_score: stageScores.ownership,
        decision_score: stageScores.decision,
        ethical_alignment_score: ethicalAlignmentScore,
        pressure_index: pressureIndex,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);

      if (passed) {
        await supabase.from('onboarding_progress').upsert({
          user_id: user.id,
          item_key: 'ethical_certification_passed',
          completed: true,
          completed_at: new Date().toISOString(),
        }, { onConflict: 'user_id,item_key' });
        await supabase.from('profiles').update({
          certification_status: 'certified',
          certified: true,
          updated_at: new Date().toISOString(),
        }).eq('id', user.id);
        toast({ title: tx('Zertifizierung bestanden', 'Certification passed'), description: tx('Du bist jetzt ein zertifizierter Ethical Closer.', 'You are now a certified Ethical Closer.') });
      }
    }
  }, [quizStageScores, scenarioStageScores, quizCorrect, scenarioTotals, totalQuizQuestions, totalScenarios, user, toast, tx]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-10">
      <AnimatePresence mode="wait">
        {phase === 'intro' && <IntroScreen key="intro" onStart={() => setPhase('quiz')} alreadyCertified={alreadyCertified} onPreview={isAdmin ? () => {
          setResult({
            stageScores: { arrival: 88, context: 92, friction: 85, awareness: 90, ownership: 87, decision: 94 },
            ethicalAlignmentScore: 91,
            pressureIndex: 12,
            decisionQualityScore: 89,
            passed: true,
          });
          setPhase('result');
        } : undefined} />}
        {phase === 'quiz' && (
          <QuizScreen
            key="quiz"
            question={QUIZ_QUESTIONS[currentQ]}
            index={currentQ}
            total={totalQuizQuestions}
            selected={selected}
            showFeedback={showFeedback}
            onSelect={setSelected}
            onSubmit={handleQuizAnswer}
            onNext={handleQuizNext}
          />
        )}
        {phase === 'scenarios' && (
          <ScenarioScreen
            key="scenarios"
            scenario={SCENARIOS[currentScenario]}
            index={currentScenario}
            total={totalScenarios}
            selected={scenarioSelected}
            showFeedback={showScenarioFeedback}
            onSelect={setScenarioSelected}
            onSubmit={handleScenarioAnswer}
            onNext={handleScenarioNext}
          />
        )}
        {phase === 'result' && result && <ResultScreen key="result" result={result} onRetry={() => { setPhase('intro'); setCurrentQ(0); setQuizCorrect(0); setQuizStageScores({}); setCurrentScenario(0); setScenarioTotals({ awareness: 0, resistance: 0, decisionReadiness: 0, pressure: 0 }); setScenarioStageScores({}); setResult(null); setSelected(null); setScenarioSelected(null); }} />}
      </AnimatePresence>
    </div>
  );
}

/* ─── Intro Screen ─── */
function IntroScreen({ onStart, alreadyCertified, onPreview }: { onStart: () => void; alreadyCertified: boolean; onPreview?: () => void }) {
  const { tx } = useLanguage();
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, ease }} className="text-center py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 mx-auto mb-6">
        <Award className="h-8 w-8 text-accent" />
      </div>
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
        {tx('Ethical Conversation Zertifizierung', 'Ethical Conversation Certification')}
      </h1>
      <p className="mt-3 text-base text-muted-foreground max-w-lg mx-auto leading-relaxed">
        {tx('Diese Prüfung bewertet deine Fähigkeit, Menschen zu echter Entscheidungsbereitschaft zu führen.', 'This exam evaluates your ability to guide people toward genuine decision readiness.')}
      </p>
      <div className="mt-8 mx-auto max-w-md rounded-xl border border-border/40 bg-card p-6 text-left">
        <p className="text-sm text-foreground leading-relaxed">
          {tx('Es geht nicht um Wissen.', 'It\'s not about knowledge.')}
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed italic">
          {tx('Es geht darum, wie du denkst,\nwie du wahrnimmst,\nund wie du Entscheidungen begleitest.', 'It\'s about how you think,\nhow you perceive,\nand how you guide decisions.')}
        </p>
        <div className="mt-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> {tx('18 Wissensfragen', '18 Knowledge Questions')}</div>
          <span className="text-border">·</span>
          <div className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> {tx('5 Szenario-Simulationen', '5 Scenario Simulations')}</div>
        </div>
      </div>
      {alreadyCertified && (
        <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary">
          <Check className="h-4 w-4" /> {tx('Du bist bereits zertifiziert. Du kannst die Prüfung wiederholen.', 'You are already certified. You can retake the exam.')}
        </div>
      )}
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button onClick={onStart} size="lg" className="gap-2 text-sm">
          {tx('Zertifizierung starten', 'Start Certification')} <ArrowRight className="h-4 w-4" />
        </Button>
        {onPreview && (
          <Button onClick={onPreview} variant="outline" size="sm" className="gap-2 text-xs">
            <Eye className="h-3.5 w-3.5" /> {tx('Abgeschlossene Zertifizierung ansehen', 'View completed certification')}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Quiz Screen ─── */
function QuizScreen({ question, index, total, selected, showFeedback, onSelect, onSubmit, onNext }: {
  question: QuizQuestion; index: number; total: number; selected: string | null; showFeedback: boolean;
  onSelect: (v: string) => void; onSubmit: () => void; onNext: () => void;
}) {
  const { tx, lang } = useLanguage();
  const de = lang === 'de';
  const isCorrect = selected === question.correctKey;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4, ease }}>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
         <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{tx('Wissensprüfung', 'Knowledge Test')}</span>
          <span className="text-xs text-muted-foreground">{index + 1} / {total}</span>
        </div>
        <Progress value={((index + 1) / total) * 100} className="h-1 bg-muted" />
      </div>
      <div className="mb-2">
        <span className="inline-block rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent uppercase tracking-wider">
          {STAGE_LABELS[question.stage]}
        </span>
      </div>
      <h2 className="font-serif text-xl font-semibold text-foreground leading-snug mb-6">{de ? question.questionDe : question.question}</h2>
      <RadioGroup value={selected ?? ''} onValueChange={onSelect} disabled={showFeedback} className="space-y-3">
        {question.options.map(opt => (
          <label key={opt.key} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
            showFeedback && opt.key === question.correctKey ? 'border-primary/50 bg-primary/5' :
            showFeedback && selected === opt.key && !isCorrect ? 'border-destructive/50 bg-destructive/5' :
            selected === opt.key ? 'border-accent/50 bg-accent/5' : 'border-border/40 bg-card hover:border-border'
          }`}>
            <RadioGroupItem value={opt.key} id={opt.key} className="mt-0.5" />
            <Label htmlFor={opt.key} className="text-sm text-foreground leading-relaxed cursor-pointer flex-1">
              {de ? opt.textDe : opt.text}
            </Label>
          </label>
        ))}
      </RadioGroup>
      <AnimatePresence>
        {showFeedback && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-5">
            <div className={`rounded-xl p-4 text-sm leading-relaxed ${isCorrect ? 'bg-primary/5 border border-primary/20 text-foreground' : 'bg-destructive/5 border border-destructive/20 text-foreground'}`}>
              <div className="flex items-center gap-2 mb-1.5 font-medium text-xs">
                {isCorrect ? <><Check className="h-3.5 w-3.5 text-primary" /> {tx('Richtig', 'Correct')}</> : <><X className="h-3.5 w-3.5 text-destructive" /> {tx('Nicht ganz', 'Not quite')}</>}
              </div>
              <p className="text-muted-foreground text-[13px]">{isCorrect ? (de ? question.feedbackCorrectDe : question.feedbackCorrect) : (de ? question.feedbackWrongDe : question.feedbackWrong)}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-6 flex justify-end">
        {!showFeedback ? (
          <Button onClick={onSubmit} disabled={!selected} size="sm" className="gap-1.5 text-xs">
            {tx('Bestätigen', 'Confirm')} <ChevronRight className="h-3 w-3" />
          </Button>
        ) : (
          <Button onClick={onNext} size="sm" className="gap-1.5 text-xs">
            {index + 1 < total ? tx('Nächste Frage', 'Next Question') : tx('Weiter zu Szenarien', 'Continue to Scenarios')} <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Scenario Screen ─── */
function ScenarioScreen({ scenario, index, total, selected, showFeedback, onSelect, onSubmit, onNext }: {
  scenario: Scenario; index: number; total: number; selected: string | null; showFeedback: boolean;
  onSelect: (v: string) => void; onSubmit: () => void; onNext: () => void;
}) {
  const { tx, lang } = useLanguage();
  const de = lang === 'de';
  const chosenChoice = scenario.choices.find(c => c.key === selected);
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4, ease }}>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{tx('Szenario-Simulation', 'Scenario Simulation')}</span>
          <span className="text-xs text-muted-foreground">{index + 1} / {total}</span>
        </div>
        <Progress value={((index + 1) / total) * 100} className="h-1 bg-muted" />
      </div>
      <div className="mb-2">
        <span className="inline-block rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent uppercase tracking-wider">
          {STAGE_LABELS[scenario.stage]}
        </span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{de ? scenario.setupDe : scenario.setup}</p>
      <div className="rounded-xl border border-border/40 bg-card p-4 mb-5">
        <p className="text-xs text-muted-foreground mb-1">{tx('Der Lead sagt:', 'The lead says:')}</p>
        <p className="text-sm font-medium text-foreground italic leading-relaxed">{de ? scenario.leadSaysDe : scenario.leadSays}</p>
      </div>
      <h3 className="font-serif text-lg font-semibold text-foreground mb-4">{de ? scenario.questionDe : scenario.question}</h3>
      <div className="space-y-3">
        {scenario.choices.map(choice => (
          <button key={choice.key} onClick={() => !showFeedback && onSelect(choice.key)}
            disabled={showFeedback}
            className={`w-full text-left rounded-xl border p-4 transition-all ${
              showFeedback && choice.type === 'ethical' ? 'border-primary/50 bg-primary/5' :
              showFeedback && selected === choice.key && choice.type === 'pressure' ? 'border-destructive/50 bg-destructive/5' :
              selected === choice.key ? 'border-accent/50 bg-accent/5' : 'border-border/40 bg-card hover:border-border'
            }`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{de ? choice.labelDe : choice.label}</span>
              {showFeedback && choice.type === 'ethical' && <Check className="h-3 w-3 text-primary" />}
            </div>
            <p className="text-sm text-foreground leading-relaxed">{de ? choice.textDe : choice.text}</p>
          </button>
        ))}
      </div>
      <AnimatePresence>
        {showFeedback && chosenChoice && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-5">
            <div className={`rounded-xl p-4 text-sm leading-relaxed ${chosenChoice.type === 'ethical' ? 'bg-primary/5 border border-primary/20' : chosenChoice.type === 'pressure' ? 'bg-destructive/5 border border-destructive/20' : 'bg-muted/50 border border-border/40'}`}>
              <div className="flex items-center gap-2 mb-1.5 font-medium text-xs text-foreground">
                {chosenChoice.type === 'ethical' ? <><Check className="h-3.5 w-3.5 text-primary" /> {tx('Stark', 'Strong')}</> :
                 chosenChoice.type === 'pressure' ? <><AlertTriangle className="h-3.5 w-3.5 text-destructive" /> {tx('Druck erkannt', 'Pressure detected')}</> :
                 <><Shield className="h-3.5 w-3.5 text-muted-foreground" /> {tx('Neutral', 'Neutral')}</>}
              </div>
              <p className="text-muted-foreground text-[13px]">{de ? chosenChoice.feedbackDe : chosenChoice.feedback}</p>
              {chosenChoice.type !== 'ethical' && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">{tx('Ethische Antwort:', 'Ethical response:')}</span>{' '}
                    {de ? scenario.choices.find(c => c.type === 'ethical')?.textDe : scenario.choices.find(c => c.type === 'ethical')?.text}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-6 flex justify-end">
        {!showFeedback ? (
          <Button onClick={onSubmit} disabled={!selected} size="sm" className="gap-1.5 text-xs">
            {tx('Bestätigen', 'Confirm')} <ChevronRight className="h-3 w-3" />
          </Button>
        ) : (
          <Button onClick={onNext} size="sm" className="gap-1.5 text-xs">
            {index + 1 < total ? tx('Nächstes Szenario', 'Next Scenario') : tx('Ergebnis anzeigen', 'Show Results')} <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Result Screen ─── */
function ResultScreen({ result, onRetry }: { result: FinalResult; onRetry: () => void }) {
  const { user, profile, isAdmin } = useAuth();
  const { tx, lang } = useLanguage();
  const de = lang === 'de';
  const { passed, stageScores, ethicalAlignmentScore, pressureIndex, decisionQualityScore } = result;

  const showPassed = isAdmin || passed;

  const downloadCertificate = () => {
    const name = profile?.full_name || 'Name';
    const date = new Date().toLocaleDateString(de ? 'de-DE' : 'en-US', { day: '2-digit', month: 'long', year: 'numeric' });

    const certWindow = window.open('', '_blank');
    if (!certWindow) return;
    certWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>${tx('Zertifikat', 'Certificate')}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; background: #faf8f5; font-family: 'Inter', sans-serif; }
        .cert { width: 800px; padding: 80px 60px; background: linear-gradient(145deg, #fdfcfa 0%, #f7f3ed 100%); border: 2px solid #d4c9b8; position: relative; text-align: center; }
        .cert::before { content: ''; position: absolute; inset: 12px; border: 1px solid #e0d6c8; pointer-events: none; }
        .brand { font-family: 'Playfair Display', serif; font-size: 14px; letter-spacing: 6px; text-transform: uppercase; color: #8a7d6b; margin-bottom: 40px; }
        .title { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 600; color: #2c2620; margin-bottom: 8px; }
        .subtitle { font-size: 13px; color: #8a7d6b; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 50px; }
        .label { font-size: 12px; color: #a09484; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
        .name { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 700; color: #2c2620; margin-bottom: 40px; padding-bottom: 12px; border-bottom: 2px solid #c4b8a4; display: inline-block; }
        .body { font-size: 14px; color: #6b6052; line-height: 1.8; max-width: 500px; margin: 0 auto 40px; }
        .date-label { font-size: 11px; color: #a09484; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
        .date { font-size: 14px; color: #6b6052; }
        .scores { display: flex; justify-content: center; gap: 40px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0d6c8; }
        .score-item { text-align: center; }
        .score-val { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 600; color: #2c2620; }
        .score-label { font-size: 10px; color: #a09484; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }
        @media print { body { background: white; } .cert { border: none; } .cert::before { border-color: #e8e0d4; } }
      </style>
      </head><body>
      <div class="cert">
        <p class="brand">${PRODUCT.name}</p>
        <h1 class="title">${tx('Zertifizierung', 'Certification')}</h1>
        <p class="subtitle">Ethical Conversation Mastery</p>
        <p class="label">${tx('Verliehen an', 'Awarded to')}</p>
        <p class="name">${name}</p>
        <p class="body">
          ${tx(
            `Für den erfolgreichen Abschluss der ${PRODUCT.name} Zertifizierung.<br>Nachweis der Fähigkeit, Entscheidungen durch Bewusstsein statt Druck zu begleiten.`,
            `For the successful completion of the ${PRODUCT.name} Certification.<br>Proof of the ability to guide decisions through awareness rather than pressure.`
          )}
        </p>
        <p class="date-label">${tx('Ausgestellt am', 'Issued on')}</p>
        <p class="date">${date}</p>
        <div class="scores">
          <div class="score-item"><p class="score-val">${ethicalAlignmentScore}%</p><p class="score-label">${tx('Ethische Ausrichtung', 'Ethical Alignment')}</p></div>
          <div class="score-item"><p class="score-val">${decisionQualityScore}%</p><p class="score-label">${tx('Entscheidungsqualität', 'Decision Quality')}</p></div>
          <div class="score-item"><p class="score-val">${pressureIndex}</p><p class="score-label">${tx('Druck-Index', 'Pressure Index')}</p></div>
        </div>
      </div>
      <script>setTimeout(() => window.print(), 500);</script>
      </body></html>
    `);
    certWindow.document.close();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, ease }} className="py-8">
      <div className="text-center mb-10">
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl mx-auto mb-4 ${showPassed ? 'bg-primary/10' : 'bg-destructive/10'}`}>
          {showPassed ? <Award className="h-8 w-8 text-primary" /> : <AlertTriangle className="h-8 w-8 text-destructive" />}
        </div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">
          {showPassed
            ? tx('Zertifizierter Ethical Closer', 'Certified Ethical Closer')
            : ethicalAlignmentScore > 60
              ? tx('Ethical Closer in Entwicklung', 'Ethical Closer in Development')
              : tx('Noch nicht zertifiziert', 'Not Yet Certified')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          {showPassed
            ? tx('Du hast die Fähigkeit bewiesen, Entscheidungen durch Bewusstsein statt Druck zu begleiten.', 'You have demonstrated the ability to guide decisions through awareness rather than pressure.')
            : tx('Entwickle deine ethischen Gesprächsfähigkeiten weiter. Überprüfe das Framework und versuche es erneut.', 'Continue developing your ethical conversation skills. Review the framework and try again.')}
        </p>
      </div>

      {/* Meta Scores */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <ScoreCard label={tx('Ethische Ausrichtung', 'Ethical Alignment')} value={ethicalAlignmentScore} threshold={75} icon={<Shield className="h-4 w-4" />} />
        <ScoreCard label={tx('Druck-Index', 'Pressure Index')} value={pressureIndex} threshold={30} inverse icon={<AlertTriangle className="h-4 w-4" />} />
        <ScoreCard label={tx('Entscheidungsqualität', 'Decision Quality')} value={decisionQualityScore} threshold={70} icon={<Target className="h-4 w-4" />} />
      </div>

      {/* Stage Breakdown */}
      <div className="rounded-xl border border-border/40 bg-card p-5 mb-8">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">{tx('Stufenauswertung', 'Stage Breakdown')}</h3>
        <div className="space-y-3">
          {STAGE_NAMES.map(stage => (
            <div key={stage} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-20">{STAGE_LABELS[stage]}</span>
              <div className="flex-1">
                <Progress value={stageScores[stage]} className="h-1.5 bg-muted" />
              </div>
              <span className={`text-xs font-medium w-10 text-right ${stageScores[stage] >= 70 ? 'text-primary' : stageScores[stage] >= 50 ? 'text-accent' : 'text-destructive'}`}>
                {stageScores[stage]}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Callout */}
      <div className="rounded-xl border border-accent/20 bg-accent/[0.03] p-5 text-center mb-8">
        <p className="text-sm text-muted-foreground italic leading-relaxed">
          {tx('Ethical Closing bedeutet nicht Perfektion.\nEs bedeutet Präzision in Momenten, die zählen.', 'Ethical Closing doesn\'t mean perfection.\nIt means precision in the moments that matter.')}
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        {showPassed && (
          <Button onClick={downloadCertificate} variant="outline" size="sm" className="text-xs gap-1.5">
            <Download className="h-3 w-3" /> {tx('Zertifikat herunterladen', 'Download Certificate')}
          </Button>
        )}
        {!showPassed && (
          <Button onClick={onRetry} variant="outline" size="sm" className="text-xs gap-1.5">
            {tx('Erneut versuchen', 'Try Again')} <ArrowRight className="h-3 w-3" />
          </Button>
        )}
        {showPassed && (
          <Button asChild variant="outline" size="sm" className="text-xs gap-1.5">
            <a href="/members/ethical-simulator">{tx('Weiter zum Simulator', 'Continue to Simulator')} <ArrowRight className="h-3 w-3" /></a>
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Score Card ─── */
function ScoreCard({ label, value, threshold, inverse, icon }: { label: string; value: number; threshold: number; inverse?: boolean; icon: React.ReactNode }) {
  const { tx } = useLanguage();
  const passes = inverse ? value < threshold : value >= threshold;
  return (
    <div className={`rounded-xl border p-4 text-center ${passes ? 'border-primary/20 bg-primary/[0.03]' : 'border-destructive/20 bg-destructive/[0.03]'}`}>
      <div className={`flex items-center justify-center gap-1.5 mb-1 ${passes ? 'text-primary' : 'text-destructive'}`}>
        {icon}
      </div>
      <p className={`text-2xl font-serif font-semibold ${passes ? 'text-primary' : 'text-destructive'}`}>
        {value}{inverse ? '' : '%'}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      <p className="text-[9px] text-muted-foreground mt-0.5">
        {inverse ? `${tx('Ziel', 'Target')}: < ${threshold}` : `${tx('Ziel', 'Target')}: > ${threshold}%`}
      </p>
    </div>
  );
}
