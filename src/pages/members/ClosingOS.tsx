import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import {
  Layers, Search, Flame, ShieldAlert, HelpCircle, CheckCircle,
  ArrowRight, AlertTriangle, Zap, Brain, Send, Pause, TrendingUp,
  Target, MessageSquare, Volume2, Headphones, Lock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { normalizeBusinessStage } from '@/lib/stage-utils';
import LiveListeningCopilot from '@/components/closing-os/LiveListeningCopilot';
import FlywheelDashboard from '@/components/closing-os/FlywheelDashboard';

/* ─── CONVERSATION STATES (same data as before) ─── */
type ConvoState = 'surface' | 'exploration' | 'depth' | 'resistance' | 'confusion' | 'decision';

interface StateData {
  key: ConvoState;
  labelDe: string;
  labelEn: string;
  icon: React.ComponentType<any>;
  color: string;
  whatDe: string;
  whatEn: string;
  objectiveDe: string;
  objectiveEn: string;
  avoidDe: string;
  avoidEn: string;
  nextDe: string;
  nextEn: string;
  questionsDe: string[];
  questionsEn: string[];
  mirrorDe: string;
  mirrorEn: string;
  avoidExDe: string;
  avoidExEn: string;
}

const STATES: StateData[] = [
  {
    key: 'surface', labelDe: 'Surface', labelEn: 'Surface', icon: Layers, color: 'hsl(220,9%,46%)',
    whatDe: 'Der Kunde gibt Standardantworten. Er zeigt dir seine soziale Maske, nicht sein echtes Problem.',
    whatEn: 'The customer gives standard answers. They\'re showing their social mask, not the real issue.',
    objectiveDe: 'Sicherheit aufbauen. Gespraechstiefe initiieren.',
    objectiveEn: 'Build safety. Initiate conversational depth.',
    avoidDe: 'Direkt ins Angebot gehen. Zu viel reden.',
    avoidEn: 'Jumping into the offer. Talking too much.',
    nextDe: 'Stelle eine offene Frage, die unter die Oberflaeche geht.',
    nextEn: 'Ask an open question that goes beneath the surface.',
    questionsDe: ['"Was genau hat dich dazu gebracht, dich heute hier anzumelden?"', '"Wenn du ehrlich bist \u2014 was hat sich in den letzten 6 Monaten wirklich veraendert?"'],
    questionsEn: ['"What exactly made you sign up today?"', '"If you\'re honest \u2014 what has really changed in the last 6 months?"'],
    mirrorDe: '"Es klingt, als waerst du schon laenger auf der Suche."',
    mirrorEn: '"It sounds like you\'ve been searching for a while."',
    avoidExDe: 'Dem Kunden das Angebot erklaeren, bevor du sein Problem verstanden hast.',
    avoidExEn: 'Explaining the offer before understanding their problem.',
  },
  {
    key: 'exploration', labelDe: 'Exploration', labelEn: 'Exploration', icon: Search, color: 'hsl(217,91%,60%)',
    whatDe: 'Der Kunde oeffnet sich. Er beginnt, ueber seine Situation nachzudenken. Noch keine Emotion \u2014 nur Logik.',
    whatEn: 'The customer is opening up. Thinking about their situation. No emotion yet \u2014 just logic.',
    objectiveDe: 'Tiefer graben. Vom Symptom zur Ursache.',
    objectiveEn: 'Dig deeper. From symptom to root cause.',
    avoidDe: 'Zu frueh eine Loesung anbieten.',
    avoidEn: 'Offering a solution too early.',
    nextDe: 'Halte die Fragen laufend. Lass den Kunden nachdenken.',
    nextEn: 'Keep the questions flowing. Let the customer think.',
    questionsDe: ['"Was haelt dich gerade wirklich davon ab, das zu erreichen?"', '"Was passiert, wenn sich in den naechsten 12 Monaten nichts aendert?"'],
    questionsEn: ['"What is really holding you back from achieving that right now?"', '"What happens if nothing changes in the next 12 months?"'],
    mirrorDe: '"Das klingt, als wuerde dich das mehr beschaeftigen, als du zugibst."',
    mirrorEn: '"It sounds like this weighs on you more than you admit."',
    avoidExDe: 'Mit Features oder Ergebnissen beeindrucken wollen.',
    avoidExEn: 'Trying to impress with features or results.',
  },
  {
    key: 'depth', labelDe: 'Emotionale Tiefe', labelEn: 'Emotional Depth', icon: Flame, color: 'hsl(12,76%,61%)',
    whatDe: 'Der Kunde spuert den echten Schmerz. Hier entsteht die Veraenderungsmotivation.',
    whatEn: 'The customer feels real pain. This is where change motivation is born.',
    objectiveDe: 'Halte den Raum. Lass die Emotion wirken. Nicht retten.',
    objectiveEn: 'Hold the space. Let the emotion work. Don\'t rescue.',
    avoidDe: 'Den Kunden troesten oder die Emotion entschaerfen.',
    avoidEn: 'Comforting the customer or defusing the emotion.',
    nextDe: 'Stille halten. Dann: \u201eUnd was bedeutet das fuer dich?\u201c',
    nextEn: 'Hold silence. Then: "And what does that mean for you?"',
    questionsDe: ['"Was bedeutet das fuer dein Leben, wenn das so weitergeht?"', '"Wie fuehlt sich das an, das laut auszusprechen?"'],
    questionsEn: ['"What does this mean for your life if it continues like this?"', '"How does it feel to say that out loud?"'],
    mirrorDe: '"Es klingt, als haettest du das noch nie jemandem gesagt."',
    mirrorEn: '"It sounds like you\'ve never told anyone that before."',
    avoidExDe: 'Ueber das Produkt reden. Den emotionalen Moment unterbrechen.',
    avoidExEn: 'Talking about the product. Interrupting the emotional moment.',
  },
  {
    key: 'resistance', labelDe: 'Widerstand', labelEn: 'Resistance', icon: ShieldAlert, color: 'hsl(39,41%,55%)',
    whatDe: 'Der Kunde schuetzt sich. Das ist KEIN Nein \u2014 es ist ein Zeichen, dass er nachdenkt.',
    whatEn: 'The customer is protecting themselves. This is NOT rejection \u2014 it\'s a sign they\'re thinking.',
    objectiveDe: 'Diagnostiziere die echte Sorge hinter dem Einwand.',
    objectiveEn: 'Diagnose the real concern behind the objection.',
    avoidDe: 'Verteidigen. Argumentieren. Druck aufbauen.',
    avoidEn: 'Defending. Arguing. Applying pressure.',
    nextDe: 'Frage nach, was genau sich unklar anfuehlt.',
    nextEn: 'Ask what exactly feels unclear.',
    questionsDe: ['"Was genau fuehlt sich gerade unklar an?"', '"Ist es wirklich der Preis \u2014 oder etwas anderes?"', '"Was mueesstest du wissen, um eine klare Entscheidung treffen zu koennen?"'],
    questionsEn: ['"What exactly feels unclear right now?"', '"Is it really the price \u2014 or something else?"', '"What would you need to know to make a clear decision?"'],
    mirrorDe: '"Es klingt, als waerst du dir noch nicht sicher."',
    mirrorEn: '"It sounds like you\'re not fully certain yet."',
    avoidExDe: 'Das Angebot nochmal erklaeren. Den Wert \u201ebeweisen\u201c.',
    avoidExEn: 'Explaining the offer again. "Proving" the value.',
  },
  {
    key: 'confusion', labelDe: 'Verwirrung', labelEn: 'Confusion', icon: HelpCircle, color: 'hsl(263,70%,50%)',
    whatDe: 'Der Kunde hat zu viele Optionen oder Informationen. Sein Gehirn blockiert.',
    whatEn: 'The customer has too many options or information. Their brain is blocking.',
    objectiveDe: 'Vereinfache. Reduziere. Gib eine klare Empfehlung.',
    objectiveEn: 'Simplify. Reduce. Give a clear recommendation.',
    avoidDe: 'Noch mehr erklaeren. Noch mehr Optionen geben.',
    avoidEn: 'Explaining even more. Giving even more options.',
    nextDe: 'Sage klar, was du empfiehlst \u2014 und warum.',
    nextEn: 'State clearly what you recommend \u2014 and why.',
    questionsDe: ['"Was ist gerade der eine Punkt, der sich am unklarsten anfuehlt?"', '"Wenn ich dir nur eine Sache empfehlen koennte \u2014 willst du hoeren, was es waere?"'],
    questionsEn: ['"What is the one point that feels most unclear right now?"', '"If I could recommend just one thing \u2014 would you like to hear what it would be?"'],
    mirrorDe: '"Es klingt, als waerst du gerade ein bisschen ueberladen."',
    mirrorEn: '"It sounds like you\'re a bit overloaded right now."',
    avoidExDe: 'Drei verschiedene Pakete durchgehen.',
    avoidExEn: 'Going through three different packages.',
  },
  {
    key: 'decision', labelDe: 'Entscheidung', labelEn: 'Decision', icon: CheckCircle, color: 'hsl(152,60%,40%)',
    whatDe: 'Der Kunde ist bereit. Er wartet auf Fuehrung. Nicht auf mehr Informationen \u2014 auf eine klare Einladung.',
    whatEn: 'The customer is ready. They\'re waiting for guidance. Not more information \u2014 a clear invitation.',
    objectiveDe: 'Klare, ruhige Einladung aussprechen. Kein Druck.',
    objectiveEn: 'Issue a clear, calm invitation. No pressure.',
    avoidDe: 'Weiter verkaufen, obwohl der Kunde bereit ist.',
    avoidEn: 'Keep selling when the customer is already ready.',
    nextDe: '"Basierend auf dem, was du mir erzaehlt hast, empfehle ich dir X. Wollen wir das zusammen starten?"',
    nextEn: '"Based on what you\'ve told me, I recommend X. Shall we start this together?"',
    questionsDe: ['"Gibt es noch etwas, das du wissen musst, bevor du eine Entscheidung triffst?"', '"Wollen wir das gemeinsam starten?"'],
    questionsEn: ['"Is there anything else you need to know before making a decision?"', '"Shall we start this together?"'],
    mirrorDe: '"Es klingt, als waerst du bereit."',
    mirrorEn: '"It sounds like you\'re ready."',
    avoidExDe: 'Den Kunden nochmal ueberzeugen wollen. Unsicherheit zeigen.',
    avoidExEn: 'Trying to convince the customer again. Showing uncertainty.',
  },
];

const MAIN_FLOW: ConvoState[] = ['surface', 'exploration', 'depth', 'decision'];
const INTERRUPT_STATES: ConvoState[] = ['resistance', 'confusion'];

/* ─── LEVEL SYSTEM ─── */
const LEVELS = [
  { level: 1, de: 'Structured Thinker', en: 'Structured Thinker', minScore: 0 },
  { level: 2, de: 'Conversational Operator', en: 'Conversational Operator', minScore: 25 },
  { level: 3, de: 'Depth Creator', en: 'Depth Creator', minScore: 45 },
  { level: 4, de: 'Objection Diagnostician', en: 'Objection Diagnostician', minScore: 60 },
  { level: 5, de: 'Decision Architect', en: 'Decision Architect', minScore: 75 },
  { level: 6, de: 'Ethical Top Closer', en: 'Ethical Top Closer', minScore: 90 },
];

/* ─── DAILY DRILLS ─── */
const DAILY_DRILLS_DE = [
  'Halte nach jeder tiefen Frage 3 Sekunden Stille.',
  'Diagnostiziere, bevor du antwortest.',
  'Spiegle jede dritte Aussage des Kunden.',
  'Stelle keine geschlossenen Fragen.',
  'Erklaere nichts \u2014 frage stattdessen.',
  'Nutze den Namen des Kunden mindestens 3x.',
  'Beende keinen Satz des Kunden.',
];
const DAILY_DRILLS_EN = [
  'Hold 3 seconds of silence after every deep question.',
  'Diagnose before you respond.',
  'Mirror every third customer statement.',
  'Ask no closed questions today.',
  'Explain nothing \u2014 ask instead.',
  'Use the customer\'s name at least 3 times.',
  'Never finish the customer\'s sentence.',
];

/* ─── COPILOT RESPONSE TYPE ─── */
interface CopilotResponse {
  state: ConvoState;
  cause: string;
  actions: string[];
  question: string;
  silence: boolean;
}

/* ─── STAGE INDEX HELPER ─── */
const STAGE_INDEX = [
  'prospect', 'opener', 'setter', 'senior_associate',
  'junior_manager', 'manager', 'senior_manager',
  'director', 'partner',
];

/* ─── MAIN COMPONENT ─── */
export default function ClosingOS() {
  const { lang } = useLanguage();
  const { profile, isAdmin } = useAuth();
  const de = lang === 'de';
  const [active, setActive] = useState<ConvoState>('surface');
  const [liveCallMode, setLiveCallMode] = useState(false);
  const [listeningCopilot, setListeningCopilot] = useState(false);
  const [flywheelView, setFlywheelView] = useState(false);
  const current = STATES.find(s => s.key === active)!;

  // Level gating: Listening Copilot & Flywheel require L4+ (junior_manager = index 4)
  const userStage = normalizeBusinessStage((profile as any)?.business_stage || 'opener');
  const stageIdx = STAGE_INDEX.indexOf(userStage);
  const hasL4 = isAdmin || stageIdx >= 4; // L4 = junior_manager

  // Gamification scores (local state for now — could be persisted)
  const [scores] = useState({ depth: 62, objection: 48, silence: 35, decision: 71 });
  const avgScore = Math.round((scores.depth + scores.objection + scores.silence + scores.decision) / 4);
  const currentLevel = [...LEVELS].reverse().find(l => avgScore >= l.minScore) || LEVELS[0];

  // Daily drill (deterministic by day)
  const dayIndex = new Date().getDate() % DAILY_DRILLS_DE.length;
  const dailyDrill = de ? DAILY_DRILLS_DE[dayIndex] : DAILY_DRILLS_EN[dayIndex];

  // Copilot state
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotResult, setCopilotResult] = useState<CopilotResponse | null>(null);

  const handleCopilot = async () => {
    if (!copilotInput.trim() || copilotLoading) return;
    setCopilotLoading(true);
    setCopilotResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('closing-copilot', {
        body: { situation: copilotInput, language: lang },
      });
      if (error) throw error;
      setCopilotResult(data as CopilotResponse);
      if (data?.state) setActive(data.state);
    } catch (e: any) {
      console.error('Copilot error:', e);
      toast({ title: de ? 'Copilot-Fehler' : 'Copilot Error', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setCopilotLoading(false);
    }
  };

  const STATE_LABELS: Record<ConvoState, { de: string; en: string }> = {
    surface: { de: 'Surface', en: 'Surface' },
    exploration: { de: 'Exploration', en: 'Exploration' },
    depth: { de: 'Emotionale Tiefe', en: 'Emotional Depth' },
    resistance: { de: 'Widerstand', en: 'Resistance' },
    confusion: { de: 'Verwirrung', en: 'Confusion' },
    decision: { de: 'Entscheidung', en: 'Decision' },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Closing OS</p>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">LIVE</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            {de ? 'Echtzeit-Entscheidungssystem' : 'Real-Time Decision System'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setListeningCopilot(false); setFlywheelView(false); setLiveCallMode(m => !m); }}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all',
              liveCallMode && !listeningCopilot && !flywheelView
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border/40 bg-card text-muted-foreground hover:text-foreground hover:border-foreground/10',
            )}
          >
            <Zap className="h-3.5 w-3.5" />
            {de ? 'Live Call' : 'Live Call'}
          </button>
          <button
            onClick={() => { if (!hasL4) return; setLiveCallMode(false); setFlywheelView(false); setListeningCopilot(l => !l); }}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all',
              !hasL4
                ? 'border-border/20 bg-card/50 text-muted-foreground/40 cursor-not-allowed'
                : listeningCopilot
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/40 bg-card text-muted-foreground hover:text-foreground hover:border-foreground/10',
            )}
            title={!hasL4 ? (de ? 'Verfügbar ab Level 4' : 'Available from Level 4') : undefined}
          >
            {!hasL4 ? <Lock className="h-3.5 w-3.5" /> : <Headphones className="h-3.5 w-3.5" />}
            {de ? 'Listening Copilot' : 'Listening Copilot'}
            {!hasL4 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-bold uppercase text-muted-foreground">L4+</span>}
          </button>
          <button
            onClick={() => { if (!hasL4) return; setLiveCallMode(false); setListeningCopilot(false); setFlywheelView(f => !f); }}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all',
              !hasL4
                ? 'border-border/20 bg-card/50 text-muted-foreground/40 cursor-not-allowed'
                : flywheelView
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/40 bg-card text-muted-foreground hover:text-foreground hover:border-foreground/10',
            )}
            title={!hasL4 ? (de ? 'Verfügbar ab Level 4' : 'Available from Level 4') : undefined}
          >
            {!hasL4 ? <Lock className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
            {de ? 'Flywheel' : 'Flywheel'}
            {!hasL4 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-bold uppercase text-muted-foreground">L4+</span>}
          </button>
        </div>
      </div>

      {/* ─── SKILL SCORES + LEVEL + DAILY DRILL (compact bar) ─── */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {/* Closer Score */}
        <div className="rounded-xl border border-border/40 bg-card p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">Closer Score</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'depth', labelDe: 'Tiefe', labelEn: 'Depth', val: scores.depth, icon: Flame },
              { key: 'objection', labelDe: 'Einwand', labelEn: 'Objection', val: scores.objection, icon: ShieldAlert },
              { key: 'silence', labelDe: 'Stille', labelEn: 'Silence', val: scores.silence, icon: Volume2 },
              { key: 'decision', labelDe: 'Entscheid.', labelEn: 'Decision', val: scores.decision, icon: Target },
            ].map(s => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground truncate">{de ? s.labelDe : s.labelEn}</span>
                      <span className="font-semibold text-foreground">{s.val}</span>
                    </div>
                    <div className="mt-0.5 h-1 rounded-full bg-muted/30">
                      <div className="h-full rounded-full bg-primary/50 transition-all" style={{ width: `${s.val}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Level */}
        <div className="rounded-xl border border-border/40 bg-card p-4 flex flex-col justify-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Level {currentLevel.level}</p>
          <p className="font-serif text-[15px] font-semibold text-foreground">{de ? currentLevel.de : currentLevel.en}</p>
          <div className="mt-2 h-1.5 rounded-full bg-muted/30">
            <div className="h-full rounded-full bg-primary/40 transition-all" style={{ width: `${avgScore}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{avgScore}/100</p>
        </div>

        {/* Daily Drill */}
        <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Brain className="h-3.5 w-3.5 text-primary/60" />
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary/60">{de ? 'Heutiger Fokus' : 'Today\'s Focus'}</p>
          </div>
          <p className="text-[13px] leading-relaxed text-foreground font-medium">{dailyDrill}</p>
        </div>
      </div>

      {/* ─── FLYWHEEL DASHBOARD ─── */}
      {flywheelView ? (
        <FlywheelDashboard />
      ) : listeningCopilot ? (
        <LiveListeningCopilot lang={lang} />
      ) : liveCallMode ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* LEFT: State + Prompts (compact) */}
          <div className="space-y-4">
            {/* State selector */}
            <div className="grid grid-cols-3 gap-1.5">
              {STATES.map(s => {
                const Icon = s.icon;
                const isActive = active === s.key;
                return (
                  <button key={s.key} onClick={() => setActive(s.key)} className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-all',
                    isActive ? 'border-foreground/20 bg-foreground/[0.05] text-foreground' : 'border-border/30 text-muted-foreground hover:text-foreground',
                    INTERRUPT_STATES.includes(s.key) && !isActive && 'border-dashed',
                  )}>
                    <Icon className="h-3.5 w-3.5" style={isActive ? { color: s.color } : undefined} />
                    {de ? s.labelDe : s.labelEn}
                  </button>
                );
              })}
            </div>

            {/* Quick response panel */}
            <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: current.color }} />
                <span className="text-[12px] font-semibold text-foreground">{de ? current.labelDe : current.labelEn}</span>
              </div>
              <div className="rounded-lg bg-primary/[0.03] border border-primary/15 p-3">
                <p className="text-[10px] uppercase tracking-wider text-primary/60 mb-1">{de ? 'Naechster Schritt' : 'Next move'}</p>
                <p className="text-[13px] text-foreground">{de ? current.nextDe : current.nextEn}</p>
              </div>
              <div className="space-y-1.5">
                {(de ? current.questionsDe : current.questionsEn).map((q, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[12px] text-foreground">
                    <ArrowRight className="mt-0.5 h-3 w-3 text-primary/50 shrink-0" />
                    <span className="italic">{q}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-destructive/[0.03] border border-destructive/15 p-2.5">
                <p className="text-[10px] text-destructive/60 font-semibold">{de ? 'NICHT:' : 'DON\'T:'} <span className="font-normal text-foreground">{de ? current.avoidDe : current.avoidEn}</span></p>
              </div>
            </div>
          </div>

          {/* RIGHT: AI Copilot */}
          <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <p className="text-[12px] font-bold uppercase tracking-wider text-primary">AI Copilot</p>
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <input
                value={copilotInput}
                onChange={e => setCopilotInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCopilot()}
                placeholder={de ? 'Situation kurz beschreiben...' : 'Describe situation briefly...'}
                className="flex-1 rounded-lg border border-border/30 bg-muted/10 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                onClick={handleCopilot}
                disabled={copilotLoading || !copilotInput.trim()}
                className="rounded-lg bg-primary/10 px-3 py-2 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
              >
                {copilotLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /> : <Send className="h-4 w-4" />}
              </button>
            </div>

            {/* Copilot Result */}
            {copilotResult && (
              <div className="space-y-3 animate-in fade-in duration-300">
                {/* Silence guidance */}
                {copilotResult.silence && (
                  <div className="flex items-center gap-3 rounded-xl bg-foreground/[0.04] border border-foreground/10 p-4">
                    <Pause className="h-6 w-6 text-foreground/60 shrink-0" />
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">{de ? 'Pause. Nicht sprechen.' : 'Pause. Do not speak.'}</p>
                      <p className="text-[11px] text-muted-foreground">{de ? 'Lass den Kunden verarbeiten.' : 'Let the customer process.'}</p>
                    </div>
                  </div>
                )}

                {/* State + cause */}
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {STATE_LABELS[copilotResult.state]?.[lang] || copilotResult.state}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{copilotResult.cause}</span>
                </div>

                {/* Actions */}
                <div className="space-y-1.5">
                  {copilotResult.actions.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-primary/[0.04] border border-primary/10 px-3 py-2">
                      <Zap className="mt-0.5 h-3.5 w-3.5 text-primary/60 shrink-0" />
                      <p className="text-[13px] text-foreground font-medium">{a}</p>
                    </div>
                  ))}
                </div>

                {/* Suggested question */}
                <div className="rounded-lg bg-muted/20 border border-border/20 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{de ? 'Frage' : 'Question'}</p>
                  <p className="text-[13px] text-foreground italic">"{copilotResult.question}"</p>
                </div>
              </div>
            )}

            {!copilotResult && !copilotLoading && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/20 mb-2" />
                <p className="text-[12px] text-muted-foreground/50">{de ? 'Beschreibe was der Kunde sagt' : 'Describe what the customer says'}</p>
                <p className="text-[10px] text-muted-foreground/30 mt-1">{de ? 'z.B. "Kunde sagt zu teuer"' : 'e.g. "customer says too expensive"'}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─── STANDARD MODE (original layout) ─── */
        <>
          {/* State Selector */}
          <div className="mb-6 grid grid-cols-3 sm:grid-cols-6 gap-2">
            {STATES.map(s => {
              const Icon = s.icon;
              const isActive = active === s.key;
              const isInterrupt = INTERRUPT_STATES.includes(s.key);
              return (
                <button key={s.key} onClick={() => setActive(s.key)} className={cn(
                  'group relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-all duration-200',
                  isActive ? 'border-foreground/20 bg-foreground/[0.04] shadow-sm' : 'border-border/40 bg-card hover:border-foreground/10 hover:bg-muted/30',
                  isInterrupt && !isActive && 'border-dashed',
                )}>
                  <Icon className="h-5 w-5 transition-colors" style={{ color: isActive ? s.color : undefined }} />
                  <span className={cn('text-[11px] font-semibold leading-tight text-center transition-colors', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                    {de ? s.labelDe : s.labelEn}
                  </span>
                  {isActive && <span className="absolute -bottom-px left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full" style={{ backgroundColor: s.color }} />}
                </button>
              );
            })}
          </div>

          {/* System Response Panel */}
          <div className="mb-6 rounded-2xl border border-border/40 bg-card p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: current.color }} />
              <h2 className="font-serif text-lg font-semibold text-foreground">{de ? current.labelDe : current.labelEn}</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{de ? 'Was passiert' : 'What is happening'}</p>
                <p className="text-[13px] leading-relaxed text-foreground">{de ? current.whatDe : current.whatEn}</p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{de ? 'Dein Ziel' : 'Your objective'}</p>
                <p className="text-[13px] leading-relaxed text-foreground">{de ? current.objectiveDe : current.objectiveEn}</p>
              </div>
              <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-destructive/70 mb-1.5">{de ? 'Vermeide' : 'Do NOT do'}</p>
                <p className="text-[13px] leading-relaxed text-foreground">{de ? current.avoidDe : current.avoidEn}</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary/70 mb-1.5">{de ? 'Naechster Schritt' : 'Next best action'}</p>
                <p className="text-[13px] leading-relaxed text-foreground">{de ? current.nextDe : current.nextEn}</p>
              </div>
            </div>
          </div>

          {/* Live Prompts */}
          <div className="mb-6 rounded-2xl border border-border/40 bg-card p-5 sm:p-6 space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Live Prompts</h3>
            <div className="space-y-2">
              {(de ? current.questionsDe : current.questionsEn).map((q, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/30 border border-border/20 px-3.5 py-2.5">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/60" />
                  <p className="text-[13px] leading-relaxed text-foreground italic">{q}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-foreground/[0.03] border border-border/20 px-3.5 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{de ? 'Spiegelung' : 'Mirror'}</p>
              <p className="text-[13px] text-foreground italic">{de ? current.mirrorDe : current.mirrorEn}</p>
            </div>
            <div className="rounded-lg bg-destructive/[0.03] border border-destructive/15 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3 w-3 text-destructive/50" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-destructive/60">{de ? 'Nicht sagen' : 'Avoid saying'}</p>
              </div>
              <p className="text-[13px] text-foreground">{de ? current.avoidExDe : current.avoidExEn}</p>
            </div>
          </div>

          {/* Flow Visualization */}
          <div className="rounded-2xl border border-border/40 bg-card p-5 sm:p-6">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4">{de ? 'Gespraechsfluss' : 'Conversation Flow'}</h3>
            <div className="flex items-center justify-between gap-1 mb-4">
              {MAIN_FLOW.map((key, i) => {
                const s = STATES.find(st => st.key === key)!;
                const Icon = s.icon;
                const isCurrent = active === key;
                return (
                  <div key={key} className="flex items-center gap-1 flex-1">
                    <button onClick={() => setActive(key)} className={cn(
                      'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all',
                      isCurrent ? 'bg-foreground/[0.06] text-foreground ring-1 ring-foreground/10' : 'text-muted-foreground hover:text-foreground',
                    )}>
                      <Icon className="h-3.5 w-3.5" style={isCurrent ? { color: s.color } : undefined} />
                      <span className="hidden sm:inline">{de ? s.labelDe : s.labelEn}</span>
                    </button>
                    {i < MAIN_FLOW.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-4 pt-3 border-t border-dashed border-border/30">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{de ? 'Interrupt-States' : 'Interrupt States'}</p>
              {INTERRUPT_STATES.map(key => {
                const s = STATES.find(st => st.key === key)!;
                const Icon = s.icon;
                const isCurrent = active === key;
                return (
                  <button key={key} onClick={() => setActive(key)} className={cn(
                    'flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-[11px] font-medium transition-all',
                    isCurrent ? 'border-foreground/20 bg-foreground/[0.04] text-foreground' : 'border-border/30 text-muted-foreground hover:text-foreground',
                  )}>
                    <Icon className="h-3.5 w-3.5" style={isCurrent ? { color: s.color } : undefined} />
                    <span>{de ? s.labelDe : s.labelEn}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
