import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, RotateCcw, ArrowRight, MessageCircle, AlertTriangle, Sparkles, Eye, Shield, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/i18n/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { ClosingModeProvider, useClosingMode } from '@/contexts/ClosingModeContext';
import ModeSwitch from '@/components/members/ModeSwitch';
import { Progress } from '@/components/ui/progress';

/* ─── Types ─── */
interface LeadProfile {
  name: string;
  situation: string;
  desire: string;
  hiddenFear: string;
  resistanceType: string;
  urgencyLevel: number;
}

interface SimState {
  awareness: number;
  resistance: number;
  decisionReadiness: number;
}

interface ChatMessage {
  role: 'user' | 'lead' | 'system';
  content: string;
  feedback?: {
    type: 'positive' | 'negative' | 'neutral';
    text: string;
  };
}

interface SessionSummary {
  awarenessCreated: number;
  resistanceManaged: string;
  decisionReadiness: number;
  pressureIncidents: number;
  ethicalSuccess: boolean;
}

/* ─── Lead Profiles ─── */
const LEAD_PROFILES: LeadProfile[] = [
  {
    name: 'Maria K.',
    situation: 'Selbstständige Beraterin, 42, stagniert seit einem Jahr bei 5k/Monat.',
    desire: 'Skalierung auf 15k/Monat, mehr Freiheit.',
    hiddenFear: 'Angst, dass Erfolg sie von ihrer Familie entfremdet.',
    resistanceType: 'fear_of_change',
    urgencyLevel: 6,
  },
  {
    name: 'Thomas R.',
    situation: 'Ex-Konzernmanager, 38, will Coaching-Business aufbauen.',
    desire: 'Unabhängigkeit, eigenes Business, sinnvolle Arbeit.',
    hiddenFear: 'Angst vor dem Scheitern nach der sicheren Karriere.',
    resistanceType: 'fear_of_loss',
    urgencyLevel: 7,
  },
  {
    name: 'Sarah L.',
    situation: 'Online-Shop-Betreiberin, 29, hat schon 3 Coaches gehabt, keiner hat geholfen.',
    desire: 'Endlich jemand, der wirklich liefert.',
    hiddenFear: 'Tiefes Misstrauen nach wiederholter Enttäuschung.',
    resistanceType: 'trust_issues',
    urgencyLevel: 5,
  },
  {
    name: 'Markus W.',
    situation: 'Agenturinhaber, 45, analysiert seit 6 Monaten alle Optionen.',
    desire: 'Die perfekte Lösung finden, bevor er handelt.',
    hiddenFear: 'Angst, die falsche Entscheidung zu treffen.',
    resistanceType: 'overthinking',
    urgencyLevel: 4,
  },
  {
    name: 'Lisa M.',
    situation: 'Freelancerin, 33, gibt ihrem Markt die Schuld für niedrige Umsätze.',
    desire: 'Mehr Kunden, höhere Preise.',
    hiddenFear: 'Will nicht sehen, dass sie selbst das Problem ist.',
    resistanceType: 'external_blame',
    urgencyLevel: 5,
  },
];

const RESISTANCE_LABELS: Record<string, string> = {
  fear_of_loss: 'Verlustangst',
  fear_of_change: 'Veränderungsangst',
  trust_issues: 'Vertrauensprobleme',
  overthinking: 'Überanalyse',
  external_blame: 'Externe Attribution',
};

/* ─── Simulator Inner ─── */
function SimulatorInner() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const { mode } = useClosingMode();
  const de = lang === 'de';

  const [lead, setLead] = useState<LeadProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [state, setState] = useState<SimState>({ awareness: 10, resistance: 50, decisionReadiness: 5 });
  const [pressureCount, setPressureCount] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startSession = useCallback((profile?: LeadProfile) => {
    const p = profile || LEAD_PROFILES[Math.floor(Math.random() * LEAD_PROFILES.length)];
    setLead(p);
    setMessages([
      {
        role: 'system',
        content: de
          ? `Neue Simulation gestartet. Du sprichst mit ${p.name}.\n${p.situation}\nWiderstandstyp: ${RESISTANCE_LABELS[p.resistanceType]}`
          : `New simulation started. You're speaking with ${p.name}.\n${p.situation}\nResistance type: ${p.resistanceType}`,
      },
      {
        role: 'lead',
        content: de
          ? `Hallo. Ich bin ${p.name}. Ich bin hier, weil ${p.situation.toLowerCase()} Ich weiß nicht genau, was ich erwarte, aber ich bin offen.`
          : `Hi. I'm ${p.name}. I'm here because ${p.situation.toLowerCase()} I'm not sure what I expect, but I'm open.`,
      },
    ]);
    setState({ awareness: 10, resistance: 50, decisionReadiness: 5 });
    setPressureCount(0);
    setSummary(null);
  }, [de]);

  const sendMessage = async () => {
    if (!input.trim() || !lead || sending) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setSending(true);

    try {
      const conversationHistory = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'lead' ? 'assistant' : 'user', content: m.content }));
      conversationHistory.push({ role: 'user', content: userMsg });

      const leadContext = JSON.stringify({
        name: lead.name,
        situation: lead.situation,
        desire: lead.desire,
        hiddenFear: lead.hiddenFear,
        resistanceType: lead.resistanceType,
        urgencyLevel: lead.urgencyLevel,
        currentMode: mode,
        currentState: state,
      });

      const { data, error } = await supabase.functions.invoke('simulator-chat', {
        body: {
          messages: conversationHistory,
          leadContext,
          simulatorType: 'ethical_closer',
          mode,
          currentState: state,
        },
      });

      if (error) throw error;

      const response = data as any;
      const leadResponse = response.leadResponse || response.lead_response || 'Hmm...';
      const feedback = response.feedback || {};
      const stateChanges = response.stateChanges || response.state_changes || {};

      // Update state based on AI response
      const newAwareness = Math.min(100, Math.max(0, state.awareness + (stateChanges.awareness_delta || 0)));
      const newResistance = Math.min(100, Math.max(0, state.resistance + (stateChanges.resistance_delta || 0)));
      const newDecision = Math.min(100, Math.max(0, state.decisionReadiness + (stateChanges.decision_delta || 0)));

      setState({ awareness: newAwareness, resistance: newResistance, decisionReadiness: newDecision });

      if (stateChanges.pressure_detected) {
        setPressureCount(prev => prev + 1);
      }

      // Determine micro-feedback
      let feedbackType: 'positive' | 'negative' | 'neutral' = 'neutral';
      let feedbackText = '';

      if (feedback.overall > 70 || stateChanges.awareness_delta > 10) {
        feedbackType = 'positive';
        feedbackText = de
          ? 'Du hast Awareness erhöht. Der Lead beginnt zu reflektieren.'
          : 'You increased awareness. The lead is starting to reflect.';
      } else if (feedback.overall < 40 || stateChanges.pressure_detected) {
        feedbackType = 'negative';
        feedbackText = de
          ? 'Du hast Druck erzeugt. Der Widerstand ist gestiegen.'
          : 'You created pressure. Resistance increased.';
      } else {
        feedbackText = de
          ? 'Neutral. Der Lead wartet auf mehr Tiefe.'
          : 'Neutral. The lead is waiting for more depth.';
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'lead',
          content: leadResponse,
          feedback: { type: feedbackType, text: feedbackText },
        },
      ]);

      // Check end conditions
      if (newDecision >= 80) {
        const sessionSummary: SessionSummary = {
          awarenessCreated: newAwareness,
          resistanceManaged: newResistance < 30 ? 'Well' : newResistance < 60 ? 'Medium' : 'Poorly',
          decisionReadiness: newDecision,
          pressureIncidents: pressureCount,
          ethicalSuccess: pressureCount <= 1 && newAwareness > 60,
        };
        setSummary(sessionSummary);

        // Store simulator KPIs in member_kpis
        if (user) {
          supabase.from('member_kpis').update({
            avg_awareness_created: newAwareness,
            resistance_spikes: pressureCount,
            decision_conversion_rate: newDecision,
            updated_at: new Date().toISOString(),
          }).eq('user_id', user.id).then(() => {});
        }
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Simulator error', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Auto-demo: show example responses for all 3 modes
  const [showDemo, setShowDemo] = useState(false);

  const DEMO_SCENARIO = {
    leadSays: '"Ich bin interessiert… aber ich bin mir nicht sicher, ob jetzt der richtige Zeitpunkt ist."',
    closing: {
      label: 'Closing',
      response: '"Verstehe ich. Aber wenn du jetzt nicht handelst, ändert sich nichts. Lass uns das jetzt abschließen, solange die Motivation da ist."',
      tone: 'Direkt, lösungsorientiert, etwas drängend. Ziel: Abschluss herbeiführen.',
    },
    top_closing: {
      label: 'Top Closing',
      response: '"Das höre ich oft. Was genau hält dich zurück — ist es der Zeitpunkt, oder steckt dahinter noch etwas anderes? Lass uns das kurz sortieren, damit du eine klare Entscheidung treffen kannst."',
      tone: 'Präziser, emotional kalibrierter, strategisch fragend. Ziel: tiefere Diagnose.',
    },
    ethical: {
      label: 'Ethical Top Closing',
      response: '"Was genau macht, dass sich jetzt nicht wie der richtige Zeitpunkt anfühlt? Ich will verstehen, was dich da innerlich beschäftigt — nicht um dich zu überzeugen, sondern damit du für dich Klarheit findest."',
      tone: 'Druckfrei, wahrheitsbasiert, empathisch. Ziel: Awareness, nicht Conversion.',
    },
  };

  // Selection screen
  if (!lead) {
    return (
      <div className="min-h-screen bg-background px-6 py-12">
        <div className="mx-auto max-w-3xl">
          {/* Mode switch */}
          <div className="mb-12">
            <ModeSwitch />
            {/* Mode descriptions */}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="text-[11px] font-semibold text-destructive mb-1">Closing</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">Standard-Verkauf. Direkt, funktional, abschlussorientiert.</p>
              </div>
              <div className="rounded-lg border border-border/40 bg-card p-3">
                <p className="text-[11px] font-semibold text-foreground mb-1">Top Closing</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">Elite-Performance. Tiefere Diagnose, strategische Sprache, stärkere Einwandbehandlung.</p>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-[11px] font-semibold text-primary mb-1">Ethical</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">Wahrheitsbasiert. Druckfrei. Fit-Validierung. Langfristiges Vertrauen statt Push.</p>
              </div>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground/50">
              Ethical Closer Simulator
            </p>
            <h1 className="font-serif text-3xl font-semibold text-foreground sm:text-4xl">
              {de ? 'Entscheidungssimulation' : 'Decision Simulation'}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground/60">
              {de
                ? 'Trainiere echte Gesprächsdynamik. Dein Verhalten beeinflusst den Ausgang.'
                : 'Train real conversation dynamics. Your behavior influences the outcome.'}
            </p>
          </motion.div>

          {/* Auto-Demo Button */}
          <div className="mb-8 text-center">
            <button
              onClick={() => setShowDemo(!showDemo)}
              className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              {de ? 'Beispielantworten anzeigen' : 'Show Example Responses'}
            </button>
          </div>

          {/* Demo Comparison */}
          <AnimatePresence>
            {showDemo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-10 overflow-hidden"
              >
                <div className="rounded-xl border border-border/40 bg-card p-5 mb-4">
                  <p className="text-xs text-muted-foreground mb-2">Lead sagt:</p>
                  <p className="text-sm font-medium text-foreground italic">{DEMO_SCENARIO.leadSays}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[DEMO_SCENARIO.closing, DEMO_SCENARIO.top_closing, DEMO_SCENARIO.ethical].map(demo => (
                    <div key={demo.label} className={`rounded-xl border p-4 ${
                      demo.label === 'Ethical Top Closing' ? 'border-primary/30 bg-primary/5' :
                      demo.label === 'Closing' ? 'border-destructive/20 bg-destructive/5' :
                      'border-border/40 bg-card'
                    }`}>
                      <p className={`text-[11px] font-semibold mb-2 ${
                        demo.label === 'Ethical Top Closing' ? 'text-primary' :
                        demo.label === 'Closing' ? 'text-destructive' : 'text-foreground'
                      }`}>{demo.label}</p>
                      <p className="text-[12px] text-foreground/80 italic leading-relaxed mb-3">{demo.response}</p>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{demo.tone}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-4 sm:grid-cols-2">
            {LEAD_PROFILES.map((p, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                onClick={() => startSession(p)}
                className="group rounded-xl border border-border/20 bg-card/50 p-5 text-left transition-all hover:border-primary/20 hover:bg-card/80"
              >
                <p className="mb-1 font-serif text-base font-semibold text-foreground">{p.name}</p>
                <p className="mb-2 text-xs text-muted-foreground/60 line-clamp-2">{p.situation}</p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {RESISTANCE_LABELS[p.resistanceType]}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">
                    Urgency: {p.urgencyLevel}/10
                  </span>
                </div>
              </motion.button>
            ))}
            <motion.button
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              onClick={() => startSession()}
              className="flex items-center justify-center rounded-xl border border-dashed border-border/30 bg-card/20 p-5 text-sm text-muted-foreground/50 transition-all hover:border-primary/30 hover:text-foreground/70"
            >
              {de ? 'Zufälligen Lead starten' : 'Start random lead'}
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  // Summary screen
  if (summary) {
    return (
      <div className="min-h-screen bg-background px-6 py-12">
        <div className="mx-auto max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <h2 className="mb-8 font-serif text-2xl font-semibold text-foreground">
              {de ? 'Gesprächsanalyse' : 'Conversation Analysis'}
            </h2>

            <div className="mb-8 space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">Awareness Created</span>
                <span className="font-mono text-lg font-semibold text-foreground">{summary.awarenessCreated}%</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">Resistance Managed</span>
                <span className="text-sm font-semibold text-foreground">{summary.resistanceManaged}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">Decision Readiness</span>
                <span className="font-mono text-lg font-semibold text-foreground">{summary.decisionReadiness}%</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/20 bg-card/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">Pressure Incidents</span>
                <span className="font-mono text-lg font-semibold text-foreground">{summary.pressureIncidents}</span>
              </div>
            </div>

            <div className="mb-8 rounded-xl border border-border/15 bg-card/30 p-6">
              {summary.ethicalSuccess ? (
                <div className="space-y-2">
                  <Sparkles className="mx-auto h-5 w-5 text-emerald-400" />
                  <p className="text-sm text-foreground/80">
                    {de
                      ? 'Du hast den Lead zu seiner eigenen Erkenntnis geführt. Das ist Ethical Closing.'
                      : 'You guided the lead to their own realization. This is Ethical Closing.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AlertTriangle className="mx-auto h-5 w-5 text-amber-400" />
                  <p className="text-sm text-foreground/80">
                    {de
                      ? 'Du hast versucht, die Entscheidung zu bewegen, bevor Awareness entstanden ist. Das hat Widerstand ausgelöst.'
                      : 'You tried to move the decision before awareness was created. This triggered resistance.'}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => { setLead(null); setSummary(null); }}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              <RotateCcw className="h-4 w-4" />
              {de ? 'Neue Simulation' : 'New Simulation'}
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // Active conversation
  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-background lg:flex-row">
      {/* Chat area */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/20 bg-card/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <ModeSwitch />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
            <span>{lead.name}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
              {RESISTANCE_LABELS[lead.resistanceType]}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'system' ? (
                <div className="mx-auto max-w-md rounded-lg bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground/50">
                  {msg.content}
                </div>
              ) : msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex justify-start">
                    <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-card border border-border/20 px-4 py-2.5 text-sm text-foreground/85">
                      {msg.content}
                    </div>
                  </div>
                  {msg.feedback && (
                    <AnimatePresence>
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`ml-2 text-[11px] font-medium ${
                          msg.feedback.type === 'positive'
                            ? 'text-emerald-400'
                            : msg.feedback.type === 'negative'
                            ? 'text-red-400'
                            : 'text-muted-foreground/50'
                        }`}
                      >
                        {msg.feedback.text}
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-card border border-border/20 px-4 py-3">
                <div className="flex gap-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/30" style={{ animationDelay: '0ms' }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/30" style={{ animationDelay: '150ms' }} />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/30" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border/20 bg-card/30 px-4 py-3">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="flex items-center gap-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={de ? 'Deine Antwort...' : 'Your response...'}
              disabled={sending}
              className="flex-1 rounded-xl border border-border/20 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/30 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Right sidebar: Live metrics */}
      <div className="w-full border-t border-border/20 bg-card/20 p-4 lg:w-72 lg:border-t-0 lg:border-l">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
          Live Metrics
        </p>

        <div className="space-y-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <Eye className="h-3.5 w-3.5" />
                <span>Awareness</span>
              </div>
              <span className="font-mono text-xs font-semibold text-foreground">{state.awareness}%</span>
            </div>
            <Progress value={state.awareness} className="h-2" />
            <p className="mt-1 text-[10px] text-muted-foreground/40">
              {de ? 'Wie viel die Person von sich selbst sieht' : 'How much the person sees themselves'}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <Shield className="h-3.5 w-3.5" />
                <span>Resistance</span>
              </div>
              <span className="font-mono text-xs font-semibold text-foreground">{state.resistance}%</span>
            </div>
            <Progress value={state.resistance} className="h-2" />
            <p className="mt-1 text-[10px] text-muted-foreground/40">
              {de ? 'Wie viel Schutz noch aktiv ist' : 'How much protection is active'}
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <Target className="h-3.5 w-3.5" />
                <span>Decision</span>
              </div>
              <span className="font-mono text-xs font-semibold text-foreground">{state.decisionReadiness}%</span>
            </div>
            <Progress value={state.decisionReadiness} className="h-2" />
            <p className="mt-1 text-[10px] text-muted-foreground/40">
              {de ? 'Bereitschaft zu handeln' : 'Readiness to act'}
            </p>
          </div>

          {pressureCount > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-red-400/70">Pressure Incidents</p>
              <p className="font-mono text-lg font-semibold text-red-400">{pressureCount}</p>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-border/10">
          <button
            onClick={() => { setLead(null); setSummary(null); }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground/70"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {de ? 'Neue Simulation' : 'New Simulation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EthicalSimulator() {
  return (
    <ClosingModeProvider>
      <SimulatorInner />
    </ClosingModeProvider>
  );
}
