import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useXp } from '@/hooks/useXp';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  ArrowRight, RotateCcw, Trophy, AlertTriangle, Send,
  Phone, MessageCircle, Linkedin, Instagram, Target, Shield,
  Calendar, Zap, ChevronLeft, Filter, Clock, Users,
  CheckCircle2, XCircle, TrendingUp,
} from 'lucide-react';
import { SCENARIOS, MODULE_META, DIFFICULTY_LABELS, type SimScenario } from '@/components/simulator/OpenerScenarioData';
import { ChatBubble } from '@/components/simulator/ChatBubble';
import { SimulatorFeedback, type FeedbackData, type MicroSkills } from '@/components/simulator/SimulatorFeedback';

/* ─── Types ─── */
interface ChatMessage {
  role: 'user' | 'lead' | 'system';
  content: string;
  feedback?: FeedbackData;
  microSkills?: MicroSkills;
  behaviorFlags?: string[];
  leadEngagement?: number;
  decisionPoint?: { type: string; context: string } | null;
}

interface BehaviorMemory {
  totalMessages: number;
  avgScore: number;
  weakSkills: string[];
  behaviorPatterns: Record<string, number>;
  scenariosCompleted: number;
}

const CHANNEL_ICON = { whatsapp: MessageCircle, instagram: Instagram, linkedin: Linkedin, phone: Phone };
const MAX_MESSAGES = 10;
const CERT_THRESHOLD = 75;

/* ─── Component ─── */
export default function OpenerSimulator() {
  const { profile } = useAuth();
  const { awardXp } = useXp();
  const { lang } = useLanguage();
  const de = lang === 'de';

  const [view, setView] = useState<'hub' | 'chat' | 'result' | 'pressure'>('hub');
  const [activeScenario, setActiveScenario] = useState<SimScenario | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [avgScore, setAvgScore] = useState(0);
  const [allFeedback, setAllFeedback] = useState<FeedbackData[]>([]);
  const [allMicroSkills, setAllMicroSkills] = useState<MicroSkills[]>([]);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | null>(null);
  const [completedScenarios, setCompletedScenarios] = useState<Set<string>>(new Set());
  const [showFeedback, setShowFeedback] = useState<number | null>(null);
  const [leadEngagement, setLeadEngagement] = useState(50);
  const [behaviorMemory, setBehaviorMemory] = useState<BehaviorMemory>({
    totalMessages: 0, avgScore: 0, weakSkills: [], behaviorPatterns: {}, scenariosCompleted: 0,
  });
  const [pendingDecision, setPendingDecision] = useState<{ type: string; context: string } | null>(null);

  // Pressure mode
  const [pressureTimer, setPressureTimer] = useState(0);
  const [pressureActive, setPressureActive] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  // Pressure timer
  useEffect(() => {
    if (!pressureActive) return;
    const interval = setInterval(() => setPressureTimer(p => p + 1), 1000);
    return () => clearInterval(interval);
  }, [pressureActive]);

  const startScenario = useCallback((sc: SimScenario, pressure = false) => {
    setActiveScenario(sc);
    const initialMsg = sc.module === 'response'
      ? sc.description.includes('positiv') ? 'Klingt interessant, erzähl mir mehr!' : sc.description.includes('Neutral') ? 'Okay.' : 'Ist das wieder so ein MLM-Ding?'
      : sc.channel === 'phone' ? 'Hallo?' : '…';
    setMessages([
      { role: 'system', content: `${sc.channel.toUpperCase()} • ${de ? sc.title : sc.titleEn} • Level ${sc.difficulty}` },
      { role: 'lead', content: initialMsg },
    ]);
    setMessageCount(0); setAvgScore(0); setAllFeedback([]); setAllMicroSkills([]);
    setShowFeedback(null); setLeadEngagement(50); setPendingDecision(null);
    setPressureActive(pressure); setPressureTimer(0);
    setView('chat');
    setTimeout(() => inputRef.current?.focus(), 200);
  }, [de]);

  const handleSend = async () => {
    if (!input.trim() || !activeScenario || isLoading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true); setIsTyping(true);

    const aiMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'lead' ? 'assistant' as const : 'user' as const, content: m.content,
    }));
    aiMessages.push({ role: 'user', content: userMsg });

    const behaviorHistoryStr = behaviorMemory.weakSkills.length > 0
      ? `Schwache Skills: ${behaviorMemory.weakSkills.join(', ')}. Häufige Fehler: ${Object.entries(behaviorMemory.behaviorPatterns).filter(([,v]) => v > 1).map(([k,v]) => `${k}(${v}x)`).join(', ')}`
      : undefined;

    try {
      const { data, error } = await supabase.functions.invoke('simulator-chat', {
        body: {
          messages: aiMessages,
          leadContext: activeScenario.systemPrompt,
          channel: activeScenario.channel,
          difficulty: activeScenario.difficulty,
          simulatorType: 'opener',
          behaviorHistory: behaviorHistoryStr,
        },
      });
      if (error) throw error;

      await new Promise(r => setTimeout(r, 700 + Math.random() * 1000));
      setIsTyping(false);

      const feedback: FeedbackData = data.feedback || { clarity: 50, overall: 50, suggestion: '', explanation: '' };
      const micro: MicroSkills = data.microSkills || {};
      const flags: string[] = data.behaviorFlags || [];
      const engagement: number = data.leadEngagement ?? leadEngagement;
      const decision = data.decisionPoint || null;

      setLeadEngagement(engagement);
      const newCount = messageCount + 1;
      setMessageCount(newCount);
      setAllFeedback(prev => [...prev, feedback]);
      setAllMicroSkills(prev => [...prev, micro]);
      setAvgScore(Math.round(allFeedback.concat(feedback).reduce((s, f) => s + f.overall, 0) / (allFeedback.length + 1)));

      // Update behavior memory
      setBehaviorMemory(prev => {
        const newPatterns = { ...prev.behaviorPatterns };
        flags.forEach(f => { newPatterns[f] = (newPatterns[f] || 0) + 1; });
        const allMicro = [...allMicroSkills, micro];
        const skillAvgs: Record<string, number> = {};
        allMicro.forEach(m => Object.entries(m).forEach(([k, v]) => {
          if (!skillAvgs[k]) skillAvgs[k] = 0;
          skillAvgs[k] = (skillAvgs[k] * (allMicro.indexOf(m)) + v) / (allMicro.indexOf(m) + 1);
        }));
        const weak = Object.entries(skillAvgs).filter(([, v]) => v < 50).map(([k]) => k);
        return { ...prev, totalMessages: prev.totalMessages + 1, behaviorPatterns: newPatterns, weakSkills: weak };
      });

      if (decision) setPendingDecision(decision);

      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], feedback, microSkills: micro, behaviorFlags: flags, leadEngagement: engagement, decisionPoint: decision };
        updated.push({ role: 'lead', content: data.leadResponse || '…' });
        return updated;
      });

      if (newCount >= MAX_MESSAGES || engagement < 10) {
        setTimeout(() => finishScenario(), 1500);
      }
    } catch (err: any) {
      setIsTyping(false);
      console.error('Simulator error:', err);
      toast.error(de ? 'AI-Fehler. Versuche es erneut.' : 'AI error. Try again.');
      setMessages(prev => [...prev, { role: 'lead', content: de ? 'Hmm, kannst du das nochmal sagen?' : 'Can you repeat that?' }]);
    } finally { setIsLoading(false); }
  };

  const handleDecision = (decision: 'qualify' | 'drop' | 'continue') => {
    setPendingDecision(null);
    setMessages(prev => [...prev, { role: 'system', content: `📋 ${de ? 'Entscheidung' : 'Decision'}: ${decision === 'qualify' ? (de ? 'Qualifiziert → Setter' : 'Qualified → Setter') : decision === 'drop' ? (de ? 'Nicht qualifiziert' : 'Not qualified') : (de ? 'Weiter qualifizieren' : 'Continue qualifying')}` }]);
    if (decision === 'qualify' || decision === 'drop') {
      setTimeout(() => finishScenario(), 1000);
    }
  };

  const finishScenario = () => {
    setPressureActive(false);
    const finalAvg = allFeedback.length > 0 ? Math.round(allFeedback.reduce((s, f) => s + f.overall, 0) / allFeedback.length) : avgScore;
    setAvgScore(finalAvg);
    if (finalAvg >= 60 && activeScenario) {
      setCompletedScenarios(prev => new Set([...prev, activeScenario.id]));
      awardXp('opener_simulator_pass', { scenario: activeScenario.id, score: finalAvg });
      setBehaviorMemory(prev => ({ ...prev, scenariosCompleted: prev.scenariosCompleted + 1 }));
    }
    setView('result');
  };

  const filteredScenarios = SCENARIOS.filter(sc => {
    if (selectedModule && sc.module !== selectedModule) return false;
    if (selectedDifficulty && sc.difficulty !== selectedDifficulty) return false;
    return true;
  });

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const certReady = behaviorMemory.scenariosCompleted >= 10 && behaviorMemory.avgScore >= CERT_THRESHOLD;

  // ═══ RESULTS ═══
  if (view === 'result' && activeScenario) {
    const passed = avgScore >= 60;
    const avgMicro: Record<string, number> = {};
    allMicroSkills.forEach(m => Object.entries(m).forEach(([k, v]) => {
      if (!avgMicro[k]) avgMicro[k] = 0;
      avgMicro[k] += v;
    }));
    Object.keys(avgMicro).forEach(k => { avgMicro[k] = Math.round(avgMicro[k] / allMicroSkills.length); });

    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-border/40 bg-card p-6 space-y-6">
          <div className="text-center">
            <div className={cn('mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full', passed ? 'bg-primary/10' : 'bg-destructive/10')}>
              {passed ? <Trophy className="h-7 w-7 text-primary" /> : <AlertTriangle className="h-7 w-7 text-destructive" />}
            </div>
            <h2 className="font-serif text-lg font-semibold text-foreground">{passed ? (de ? 'Szenario abgeschlossen!' : 'Scenario Complete!') : (de ? 'Noch nicht bestanden' : 'Not Passed Yet')}</h2>
            <p className="text-3xl font-bold text-foreground mt-1">{avgScore}<span className="text-base text-muted-foreground">/100</span></p>
            {pressureTimer > 0 && <p className="text-[10px] text-muted-foreground mt-1">⏱ {Math.floor(pressureTimer / 60)}:{String(pressureTimer % 60).padStart(2, '0')}</p>}
          </div>

          {/* Conversion DNA avg */}
          {allFeedback.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conversion DNA</p>
              {['clarity', 'relevance', 'energy', 'timing', 'direction'].map(key => {
                const vals = allFeedback.map(f => (f as any)[key]).filter(Boolean);
                const avg = vals.length > 0 ? Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length) : 0;
                return avg > 0 ? (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-16 capitalize">{key}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div className={cn('h-full rounded-full', avg >= 70 ? 'bg-emerald-500' : avg >= 40 ? 'bg-amber-500' : 'bg-destructive')} style={{ width: `${avg}%` }} />
                    </div>
                    <span className="text-[10px] font-semibold w-6 text-right">{avg}</span>
                  </div>
                ) : null;
              })}
            </div>
          )}

          {/* Micro-Skills avg */}
          {Object.keys(avgMicro).length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Micro-Skills</p>
              {Object.entries(avgMicro).sort(([, a], [, b]) => a - b).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground w-32 truncate">{key.replace(/_/g, ' ')}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div className={cn('h-full rounded-full', value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-destructive')} style={{ width: `${value}%` }} />
                  </div>
                  <span className="text-[10px] font-semibold w-6 text-right">{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Behavior patterns */}
          {Object.keys(behaviorMemory.behaviorPatterns).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{de ? 'Erkannte Muster' : 'Detected Patterns'}</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(behaviorMemory.behaviorPatterns).map(([k, v]) => (
                  <span key={k} className="text-[9px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">{k.replace(/_/g, ' ')} ({v}x)</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setView('hub'); setActiveScenario(null); }}>
              <ChevronLeft className="mr-1 h-3.5 w-3.5" /> {de ? 'Übersicht' : 'Overview'}
            </Button>
            <Button size="sm" onClick={() => startScenario(activeScenario)}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> {de ? 'Nochmal' : 'Retry'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ═══ CHAT ═══
  if (view === 'chat' && activeScenario) {
    const ChannelIcon = CHANNEL_ICON[activeScenario.channel];
    const progress = Math.round((messageCount / MAX_MESSAGES) * 100);

    return (
      <div className="mx-auto flex h-[calc(100vh-120px)] max-w-2xl flex-col px-4 py-3">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setView('hub'); setActiveScenario(null); setPressureActive(false); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/40">
              <ChannelIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">{activeScenario.leadName}</p>
              <p className="text-[9px] text-muted-foreground">{activeScenario.channel.toUpperCase()} • L{activeScenario.difficulty}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {pressureActive && (
              <span className="text-[10px] font-mono text-destructive flex items-center gap-1">
                <Clock className="h-3 w-3" /> {Math.floor(pressureTimer / 60)}:{String(pressureTimer % 60).padStart(2, '0')}
              </span>
            )}
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground">{de ? 'Engagement' : 'Engagement'}</span>
                <span className={cn('text-[10px] font-semibold', leadEngagement >= 60 ? 'text-emerald-500' : leadEngagement >= 30 ? 'text-amber-500' : 'text-destructive')}>{leadEngagement}%</span>
              </div>
              <Progress value={progress} className="mt-0.5 h-1 w-16" />
            </div>
          </div>
        </div>

        {/* Live score bar */}
        {messageCount > 0 && (
          <div className="mb-2 flex items-center justify-center gap-4 rounded-lg bg-muted/15 py-1">
            <span className="text-[9px] text-muted-foreground">{de ? 'Score' : 'Score'}: <strong className={cn(avgScore >= 70 ? 'text-emerald-500' : avgScore >= 40 ? 'text-amber-500' : 'text-destructive')}>{avgScore}</strong></span>
            <span className="text-[9px] text-muted-foreground">{messageCount}/{MAX_MESSAGES}</span>
          </div>
        )}

        {/* Chat */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl border border-border/30 bg-background/50 p-3">
          {messages.map((msg, i) => (
            <div key={i}>
              <ChatBubble role={msg.role} content={msg.content} leadName={activeScenario.leadName} channel={activeScenario.channel} />
              {msg.feedback && (
                <div className="mb-2 flex justify-end">
                  <button onClick={() => setShowFeedback(showFeedback === i ? null : i)} className="text-[9px] text-primary/60 hover:text-primary transition-colors">
                    {showFeedback === i ? '▲' : '▼'} <span className={cn('font-semibold', msg.feedback.overall >= 70 ? 'text-emerald-500' : msg.feedback.overall >= 40 ? 'text-amber-500' : 'text-destructive')}>{msg.feedback.overall}</span>
                  </button>
                </div>
              )}
              {showFeedback === i && msg.feedback && (
                <div className="mb-3 ml-9">
                  <SimulatorFeedback feedback={msg.feedback} microSkills={msg.microSkills} behaviorFlags={msg.behaviorFlags} leadEngagement={msg.leadEngagement} lang={lang} compact />
                </div>
              )}
            </div>
          ))}
          {isTyping && <ChatBubble role="lead" content="" leadName={activeScenario.leadName} channel={activeScenario.channel} isTyping />}
        </div>

        {/* Decision Point */}
        {pendingDecision && (
          <div className="mt-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
            <p className="text-[10px] font-semibold text-accent mb-2">📋 {de ? 'Entscheidungspunkt' : 'Decision Point'}: {pendingDecision.context}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => handleDecision('qualify')}>
                <CheckCircle2 className="mr-1 h-3 w-3" /> {de ? 'Qualifiziert' : 'Qualify'}
              </Button>
              <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={() => handleDecision('continue')}>
                <ArrowRight className="mr-1 h-3 w-3" /> {de ? 'Weiter' : 'Continue'}
              </Button>
              <Button size="sm" variant="outline" className="text-[10px] h-7 text-destructive" onClick={() => handleDecision('drop')}>
                <XCircle className="mr-1 h-3 w-3" /> {de ? 'Ablehnen' : 'Drop'}
              </Button>
            </div>
          </div>
        )}

        {/* Input */}
        {messageCount < MAX_MESSAGES && leadEngagement >= 10 ? (
          <div className="mt-2 flex gap-2">
            <Textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={de ? 'Deine Nachricht...' : 'Your message...'} className="min-h-[40px] max-h-[80px] resize-none text-sm" disabled={isLoading} />
            <Button size="icon" onClick={handleSend} disabled={isLoading || !input.trim()} className="h-[40px] w-[40px] shrink-0"><Send className="h-4 w-4" /></Button>
          </div>
        ) : (
          <div className="mt-2 text-center">
            <p className="text-[10px] text-muted-foreground mb-2">{leadEngagement < 10 ? (de ? 'Lead hat das Gespräch beendet.' : 'Lead ended the conversation.') : (de ? 'Max. Nachrichten erreicht.' : 'Max messages reached.')}</p>
            <Button size="sm" onClick={finishScenario}>{de ? 'Ergebnis' : 'Results'} <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
          </div>
        )}
      </div>
    );
  }

  // ═══ HUB ═══
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-5">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Opener Simulator</h1>
        <p className="mt-1 text-sm text-muted-foreground">{de ? 'KI-gestütztes Conversion Training mit Micro-Skill Analyse.' : 'AI-powered conversion training with micro-skill analysis.'}</p>
      </div>

      {/* Stats + Cert gate */}
      <div className="mb-5 grid grid-cols-4 gap-2">
        <div className="rounded-lg border border-border/30 bg-card p-2.5 text-center">
          <p className="text-base font-bold text-foreground">{completedScenarios.size}</p>
          <p className="text-[9px] text-muted-foreground">{de ? 'Abgeschlossen' : 'Done'}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card p-2.5 text-center">
          <p className="text-base font-bold text-foreground">{SCENARIOS.length}</p>
          <p className="text-[9px] text-muted-foreground">{de ? 'Szenarien' : 'Scenarios'}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card p-2.5 text-center">
          <p className="text-base font-bold text-foreground">{behaviorMemory.totalMessages}</p>
          <p className="text-[9px] text-muted-foreground">{de ? 'Nachrichten' : 'Messages'}</p>
        </div>
        <div className="rounded-lg border border-border/30 bg-card p-2.5 text-center">
          <p className={cn('text-base font-bold', certReady ? 'text-primary' : 'text-muted-foreground')}>{certReady ? '✓' : '—'}</p>
          <p className="text-[9px] text-muted-foreground">{de ? 'Zertifizierung' : 'Certification'}</p>
        </div>
      </div>

      {/* Weak skills warning */}
      {behaviorMemory.weakSkills.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
          <TrendingUp className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold text-foreground">{de ? 'Fokus-Bereiche' : 'Focus Areas'}</p>
            <p className="text-[10px] text-muted-foreground">{behaviorMemory.weakSkills.map(s => s.replace(/_/g, ' ')).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Module filter */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button onClick={() => setSelectedModule(null)} className={cn('rounded-full px-2.5 py-1 text-[10px] font-medium border transition-colors', !selectedModule ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border/40 hover:text-foreground')}>{de ? 'Alle' : 'All'}</button>
        {Object.entries(MODULE_META).map(([key, meta]) => (
          <button key={key} onClick={() => setSelectedModule(selectedModule === key ? null : key)} className={cn('rounded-full px-2.5 py-1 text-[10px] font-medium border transition-colors', selectedModule === key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border/40 hover:text-foreground')}>{de ? meta.label : meta.labelEn}</button>
        ))}
      </div>

      {/* Difficulty filter */}
      <div className="mb-5 flex flex-wrap gap-1.5 items-center">
        <Filter className="h-3 w-3 text-muted-foreground" />
        {DIFFICULTY_LABELS.map(d => (
          <button key={d.level} onClick={() => setSelectedDifficulty(selectedDifficulty === d.level ? null : d.level)} className={cn('rounded-full px-2 py-0.5 text-[9px] font-medium border transition-colors', selectedDifficulty === d.level ? 'bg-accent text-accent-foreground border-accent' : 'bg-card text-muted-foreground border-border/40 hover:text-foreground')}>L{d.level}</button>
        ))}
        <span className="text-border">|</span>
        <button onClick={() => { const sc = filteredScenarios[Math.floor(Math.random() * filteredScenarios.length)]; if (sc) startScenario(sc, true); }} className="rounded-full px-2.5 py-0.5 text-[9px] font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1">
          <Clock className="h-3 w-3" /> Pressure Mode
        </button>
      </div>

      {/* Scenario grid */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {filteredScenarios.map(sc => {
          const done = completedScenarios.has(sc.id);
          const meta = MODULE_META[sc.module];
          const ChannelIcon = CHANNEL_ICON[sc.channel];
          return (
            <button key={sc.id} onClick={() => startScenario(sc)} className={cn('flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all hover:shadow-sm', done ? 'border-primary/20 bg-primary/5' : 'border-border/30 bg-card hover:bg-muted/10')}>
              <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', done ? 'bg-primary/10' : 'bg-muted/30')}>
                <ChannelIcon className={cn('h-3.5 w-3.5', done ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-[12px] font-semibold text-foreground truncate">{de ? sc.title : sc.titleEn}</p>
                  {done && <Badge variant="outline" className="text-[7px] text-primary border-primary/30 shrink-0">✓</Badge>}
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-1">{de ? sc.description : sc.descriptionEn}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[8px] py-0">{de ? meta.label : meta.labelEn}</Badge>
                  <span className="text-[8px] text-muted-foreground">L{sc.difficulty}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
