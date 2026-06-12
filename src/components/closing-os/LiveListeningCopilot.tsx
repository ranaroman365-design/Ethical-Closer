import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Mic, MicOff, Pause, Play, Square, Clock,
  Shield, Zap, ArrowRight, AlertTriangle, Brain,
  TrendingUp, TrendingDown, Minus, Volume2,
  ChevronRight, Radio, Eye, Target, Activity,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useSpeechRecognition, type ListeningStatus } from '@/hooks/useSpeechRecognition';

type ConvoState = 'surface' | 'exploration' | 'depth' | 'resistance' | 'confusion' | 'decision';

interface LiveAnalysis {
  state: ConvoState;
  confidence: string;
  previousState?: string;
  whatIsHappening: string;
  likelyIssue: string;
  objective: string;
  nextMove: string;
  suggestedSay: string;
  avoidDoing: string;
  holdSilence: boolean;
  silenceReason?: string;
  momentum: string;
  commitmentQuality: string;
  riskLevel: string;
  momentumDrivers?: string[];
  stateShiftAlert?: string;
  matchedSignals?: string[];
}

interface StateHistoryEntry {
  state: ConvoState;
  timestamp: number;
  confidence: string;
}

const STATE_META: Record<ConvoState, { icon: React.ComponentType<any>; color: string; labelDe: string; labelEn: string }> = {
  surface: { icon: Eye, color: 'hsl(220,9%,46%)', labelDe: 'Surface', labelEn: 'Surface' },
  exploration: { icon: Target, color: 'hsl(217,91%,60%)', labelDe: 'Exploration', labelEn: 'Exploration' },
  depth: { icon: Activity, color: 'hsl(12,76%,61%)', labelDe: 'Emotionale Tiefe', labelEn: 'Emotional Depth' },
  resistance: { icon: Shield, color: 'hsl(39,41%,55%)', labelDe: 'Widerstand', labelEn: 'Resistance' },
  confusion: { icon: Brain, color: 'hsl(263,70%,50%)', labelDe: 'Verwirrung', labelEn: 'Confusion' },
  decision: { icon: Zap, color: 'hsl(152,60%,40%)', labelDe: 'Entscheidung', labelEn: 'Decision' },
};

const ISSUE_LABELS: Record<string, { de: string; en: string }> = {
  value_gap: { de: 'Wert-Luecke', en: 'Value Gap' },
  self_doubt: { de: 'Selbstzweifel', en: 'Self-Doubt' },
  trust_gap: { de: 'Vertrauens-Luecke', en: 'Trust Gap' },
  real_constraint: { de: 'Echte Einschraenkung', en: 'Real Constraint' },
  overwhelm: { de: 'Ueberforderung', en: 'Overwhelm' },
  avoidance: { de: 'Vermeidung', en: 'Avoidance' },
  fragile_commitment: { de: 'Fragiles Commitment', en: 'Fragile Commitment' },
  emotional_processing: { de: 'Emotionale Verarbeitung', en: 'Emotional Processing' },
};

const QUICK_PATTERNS = [
  { key: 'too_expensive', de: 'Zu teuer', en: 'Too expensive' },
  { key: 'need_to_think', de: 'Muss nachdenken', en: 'Need to think' },
  { key: 'talk_to_partner', de: 'Partner fragen', en: 'Talk to partner' },
  { key: 'no_time', de: 'Keine Zeit', en: 'No time' },
  { key: 'silent_after_price', de: 'Still nach Preis', en: 'Silent after price' },
  { key: 'avoiding_question', de: 'Weicht aus', en: 'Avoiding question' },
  { key: 'rational_only', de: 'Nur rational', en: 'Rational only' },
  { key: 'says_yes_unclear', de: 'Sagt Ja, unklar', en: 'Says yes but unclear' },
];

interface Props {
  lang: string;
}

export default function LiveListeningCopilot({ lang }: Props) {
  const de = lang === 'de';
  const speech = useSpeechRecognition(lang);
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [stateHistory, setStateHistory] = useState<StateHistoryEntry[]>([]);
  const [inputMode, setInputMode] = useState<'passive' | 'tap'>('passive');
  const [sessionSummary, setSessionSummary] = useState<any>(null);
  const lastAnalyzedRef = useRef('');
  const analysisIntervalRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(null);
  const signalAccumRef = useRef<Record<string, { cluster: string; pattern: string; count: number; firstOffset: number; lastOffset: number }>>({});

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const getElapsedSeconds = () => Math.floor((Date.now() - sessionStartRef.current) / 1000);

  // Persist a state event to the flywheel
  const persistStateEvent = useCallback(async (result: LiveAnalysis, transcriptSnippet?: string) => {
    if (!sessionIdRef.current) return;
    try {
      await supabase.from('copilot_state_events').insert({
        session_id: sessionIdRef.current,
        offset_seconds: getElapsedSeconds(),
        state: result.state,
        confidence: result.confidence,
        momentum: result.momentum,
        commitment_quality: result.commitmentQuality,
        risk_level: result.riskLevel,
        likely_issue: result.likelyIssue,
        matched_signals: result.matchedSignals || [],
        state_shift_alert: result.stateShiftAlert || null,
        hold_silence: result.holdSilence,
        transcript_snippet: transcriptSnippet?.slice(-200) || null,
      });

      // Accumulate signals
      if (result.matchedSignals) {
        const offset = getElapsedSeconds();
        result.matchedSignals.forEach(sig => {
          const cluster = result.state;
          const key = `${cluster}::${sig}`;
          if (signalAccumRef.current[key]) {
            signalAccumRef.current[key].count++;
            signalAccumRef.current[key].lastOffset = offset;
          } else {
            signalAccumRef.current[key] = { cluster, pattern: sig, count: 1, firstOffset: offset, lastOffset: offset };
          }
        });
      }
    } catch (e) {
      console.error('Persist state event error:', e);
    }
  }, []);

  const analyzeTranscript = useCallback(async (text: string, bias?: string) => {
    if (!text.trim() || text.trim() === lastAnalyzedRef.current.trim()) return;
    lastAnalyzedRef.current = text;
    setAnalyzing(true);

    try {
      const transcriptToSend = bias ? `${text}\n[User indicates: ${bias}]` : text;
      const { data, error } = await supabase.functions.invoke('live-copilot-analyze', {
        body: {
          transcript: transcriptToSend,
          previousStates: stateHistory.slice(-5).map(h => h.state),
          language: lang,
        },
      });
      if (error) throw error;
      const result = data as LiveAnalysis;
      setAnalysis(result);

      if (result.state) {
        setStateHistory(prev => {
          const last = prev[prev.length - 1];
          if (last?.state === result.state) return prev;
          return [...prev, { state: result.state, timestamp: Date.now(), confidence: result.confidence }];
        });
        // Persist to flywheel
        persistStateEvent(result, text.slice(-200));
      }
    } catch (e: any) {
      console.error('Analysis error:', e);
    } finally {
      setAnalyzing(false);
    }
  }, [lang, stateHistory, persistStateEvent]);

  // Auto-analyze every 8 seconds in passive mode
  useEffect(() => {
    if (speech.status === 'live' && inputMode === 'passive') {
      analysisIntervalRef.current = window.setInterval(() => {
        const fullText = speech.transcript + (speech.interimTranscript ? ` ${speech.interimTranscript}` : '');
        if (fullText.trim().length > 10) {
          analyzeTranscript(fullText);
        }
      }, 8000);
    } else {
      if (analysisIntervalRef.current) {
        clearInterval(analysisIntervalRef.current);
        analysisIntervalRef.current = null;
      }
    }
    return () => {
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    };
  }, [speech.status, inputMode, speech.transcript, speech.interimTranscript, analyzeTranscript]);

  const handleStart = async () => {
    sessionStartRef.current = Date.now();
    setAnalysis(null);
    setStateHistory([]);
    setSessionSummary(null);
    signalAccumRef.current = {};
    speech.clearTranscript();

    // Create flywheel session
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { data: session } = await supabase.from('copilot_sessions').insert({
          user_id: userData.user.id,
          consent_given: true,
        }).select('id').single();
        if (session) sessionIdRef.current = session.id;
      }
    } catch (e) {
      console.error('Create session error:', e);
    }

    speech.startListening();
  };

  const handleStop = async () => {
    speech.stopListening();
    const duration = Math.floor((Date.now() - sessionStartRef.current) / 1000);

    // Generate session summary from state history
    if (stateHistory.length > 0) {
      const stateCounts: Record<string, number> = {};
      stateHistory.forEach(h => { stateCounts[h.state] = (stateCounts[h.state] || 0) + 1; });
      const dominantState = Object.entries(stateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'surface';
      setSessionSummary({
        duration,
        stateTimeline: stateHistory,
        dominantState,
        totalShifts: stateHistory.length - 1,
        lastAnalysis: analysis,
      });

      // Update flywheel session
      if (sessionIdRef.current) {
        try {
          await supabase.from('copilot_sessions').update({
            ended_at: new Date().toISOString(),
            duration_seconds: duration,
            total_state_shifts: stateHistory.length - 1,
            dominant_state: dominantState,
            final_momentum: analysis?.momentum || null,
            final_commitment: analysis?.commitmentQuality || null,
            final_risk: analysis?.riskLevel || null,
            summary_json: JSON.parse(JSON.stringify({ stateHistory, lastAnalysis: analysis })),
          }).eq('id', sessionIdRef.current);

          // Persist accumulated signals
          const signalRows = Object.values(signalAccumRef.current).map(s => ({
            session_id: sessionIdRef.current!,
            signal_cluster: s.cluster,
            signal_pattern: s.pattern,
            occurrence_count: s.count,
            first_seen_offset: s.firstOffset,
            last_seen_offset: s.lastOffset,
          }));
          if (signalRows.length > 0) {
            await supabase.from('copilot_signal_log').insert(signalRows);
          }
        } catch (e) {
          console.error('Update session error:', e);
        }
      }
    }
  };

  const handleTagOutcome = async (outcome: string) => {
    if (!sessionIdRef.current) return;
    try {
      await supabase.from('copilot_sessions').update({
        outcome,
        outcome_tagged_at: new Date().toISOString(),
      }).eq('id', sessionIdRef.current);
      toast({ title: de ? 'Outcome gespeichert' : 'Outcome saved', description: outcome });
      setSessionSummary((prev: any) => prev ? { ...prev, outcomeTagged: outcome } : prev);
    } catch (e) {
      console.error('Tag outcome error:', e);
    }
  };

  const handleQuickPattern = (key: string) => {
    const pattern = QUICK_PATTERNS.find(p => p.key === key);
    if (!pattern) return;
    const text = speech.transcript || (de ? pattern.de : pattern.en);
    analyzeTranscript(text, de ? pattern.de : pattern.en);
  };

  const handleTapForHelp = () => {
    const fullText = speech.transcript + (speech.interimTranscript ? ` ${speech.interimTranscript}` : '');
    if (fullText.trim().length > 5) {
      analyzeTranscript(fullText);
    } else {
      toast({ title: de ? 'Noch kein Transkript' : 'No transcript yet', description: de ? 'Warte auf Gespraechsinhalte...' : 'Waiting for conversation...' });
    }
  };

  const MomentumIcon = analysis?.momentum === 'high' ? TrendingUp : analysis?.momentum === 'low' ? TrendingDown : Minus;

  // Post-session summary view
  if (sessionSummary && speech.status === 'off') {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-foreground">{de ? 'Session Zusammenfassung' : 'Session Summary'}</h2>
          <button onClick={() => { setSessionSummary(null); setAnalysis(null); setStateHistory([]); speech.clearTranscript(); }}
            className="text-[11px] text-primary hover:underline">{de ? 'Neue Session' : 'New Session'}</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/40 bg-card p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">{de ? 'Dauer' : 'Duration'}</p>
            <p className="text-xl font-semibold text-foreground">{formatTime(sessionSummary.duration)}</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">{de ? 'State Shifts' : 'State Shifts'}</p>
            <p className="text-xl font-semibold text-foreground">{sessionSummary.totalShifts}</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">{de ? 'Dominanter State' : 'Dominant State'}</p>
            <p className="text-xl font-semibold text-foreground">{STATE_META[sessionSummary.dominantState as ConvoState]?.[de ? 'labelDe' : 'labelEn']}</p>
          </div>
        </div>

        {/* State Timeline */}
        <div className="rounded-xl border border-border/40 bg-card p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">{de ? 'State Timeline' : 'State Timeline'}</p>
          <div className="flex items-center gap-1 flex-wrap">
            {sessionSummary.stateTimeline.map((entry: StateHistoryEntry, i: number) => {
              const meta = STATE_META[entry.state];
              const Icon = meta.icon;
              return (
                <div key={i} className="flex items-center gap-1">
                  <div className="flex items-center gap-1 rounded-lg bg-muted/30 px-2 py-1">
                    <Icon className="h-3 w-3" style={{ color: meta.color }} />
                    <span className="text-[10px] font-medium text-foreground">{de ? meta.labelDe : meta.labelEn}</span>
                  </div>
                  {i < sessionSummary.stateTimeline.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/30" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Last analysis as summary */}
        {sessionSummary.lastAnalysis && (
          <div className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4 space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary/60 mb-2">{de ? 'Letzte Analyse' : 'Final Analysis'}</p>
            <p className="text-[12px] text-foreground"><strong>{de ? 'Momentum:' : 'Momentum:'}</strong> {sessionSummary.lastAnalysis.momentum}</p>
            <p className="text-[12px] text-foreground"><strong>{de ? 'Commitment:' : 'Commitment:'}</strong> {sessionSummary.lastAnalysis.commitmentQuality}</p>
            <p className="text-[12px] text-foreground"><strong>{de ? 'Risiko:' : 'Risk:'}</strong> {sessionSummary.lastAnalysis.riskLevel}</p>
          </div>
        )}

        {/* Outcome Tagging */}
        <div className="rounded-xl border border-border/40 bg-card p-4">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">{de ? 'Ergebnis taggen' : 'Tag Outcome'}</p>
          {sessionSummary.outcomeTagged ? (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-[12px] font-medium text-foreground">{sessionSummary.outcomeTagged}</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'won', label: de ? 'Abgeschlossen' : 'Closed Won', color: 'bg-green-500/10 text-green-600 border-green-500/20' },
                { key: 'lost', label: de ? 'Verloren' : 'Closed Lost', color: 'bg-destructive/10 text-destructive border-destructive/20' },
                { key: 'no_decision', label: de ? 'Keine Entscheidung' : 'No Decision', color: 'bg-muted/30 text-muted-foreground border-border/30' },
                { key: 'fragile_yes', label: de ? 'Fragiles Ja' : 'Fragile Yes', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
              ].map(o => (
                <button key={o.key} onClick={() => handleTagOutcome(o.key)}
                  className={cn('rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors hover:opacity-80', o.color)}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <p className="text-[9px] text-muted-foreground/50 mt-2 italic">{de ? 'Deine Daten verbessern den Copilot über Zeit.' : 'Your data improves the Copilot over time.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── TOP BAR ─── */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'h-2 w-2 rounded-full',
              speech.status === 'live' ? 'bg-green-500 animate-pulse' : speech.status === 'paused' ? 'bg-amber-500' : 'bg-muted-foreground/30',
            )} />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {speech.status === 'live' ? 'LIVE' : speech.status === 'paused' ? (de ? 'PAUSIERT' : 'PAUSED') : (de ? 'BEREIT' : 'READY')}
            </span>
          </div>

          {/* Timer */}
          {speech.status !== 'off' && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span className="font-mono">{formatTime(speech.elapsed)}</span>
            </div>
          )}

          {/* Mic indicator */}
          {speech.status === 'live' && (
            <div className="flex items-center gap-1">
              <Radio className="h-3 w-3 text-green-500 animate-pulse" />
              {speech.confidence > 0 && (
                <span className="text-[10px] text-muted-foreground">{speech.confidence}%</span>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Input mode toggle */}
          {speech.status !== 'off' && (
            <button onClick={() => setInputMode(m => m === 'passive' ? 'tap' : 'passive')}
              className="rounded-lg border border-border/30 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              {inputMode === 'passive' ? (de ? 'Passiv' : 'Passive') : (de ? 'Tap-Modus' : 'Tap Mode')}
            </button>
          )}

          {speech.status === 'off' ? (
            <button onClick={handleStart}
              className="flex items-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-colors">
              <Mic className="h-4 w-4" />
              {de ? 'Session starten' : 'Start Session'}
            </button>
          ) : (
            <>
              {speech.status === 'live' ? (
                <button onClick={() => speech.pauseListening()} className="rounded-lg bg-muted/30 p-2 text-muted-foreground hover:text-foreground transition-colors">
                  <Pause className="h-4 w-4" />
                </button>
              ) : (
                <button onClick={() => speech.resumeListening()} className="rounded-lg bg-primary/10 p-2 text-primary hover:bg-primary/20 transition-colors">
                  <Play className="h-4 w-4" />
                </button>
              )}
              <button onClick={handleStop} className="rounded-lg bg-destructive/10 p-2 text-destructive hover:bg-destructive/20 transition-colors">
                <Square className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {speech.error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.05] p-3 text-[12px] text-destructive">
          {speech.error}
        </div>
      )}

      {/* Not supported warning */}
      {!speech.isSupported && speech.status === 'off' && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 text-center">
          <p className="text-[13px] text-foreground font-medium">{de ? 'Spracherkennung nicht verfuegbar' : 'Speech recognition not available'}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{de ? 'Bitte Chrome oder Edge verwenden' : 'Please use Chrome or Edge'}</p>
        </div>
      )}

      {/* ─── MAIN 3-PANEL LAYOUT ─── */}
      {speech.status !== 'off' && (
        <div className="grid gap-3 lg:grid-cols-3">
          {/* LEFT: Live State Panel */}
          <div className="space-y-3">
            <div className="rounded-xl border border-border/40 bg-card p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">{de ? 'Erkannter State' : 'Detected State'}</p>

              {analysis ? (
                <div className="space-y-3">
                  {/* Current state */}
                  <div className="flex items-center gap-2">
                    {(() => { const Icon = STATE_META[analysis.state].icon; return <Icon className="h-5 w-5" style={{ color: STATE_META[analysis.state].color }} />; })()}
                    <span className="font-serif text-[16px] font-semibold text-foreground">
                      {de ? STATE_META[analysis.state].labelDe : STATE_META[analysis.state].labelEn}
                    </span>
                  </div>

                  {/* Confidence */}
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                      analysis.confidence === 'high' ? 'bg-green-500/10 text-green-600' :
                      analysis.confidence === 'medium' ? 'bg-amber-500/10 text-amber-600' :
                      'bg-muted/40 text-muted-foreground',
                    )}>
                      {analysis.confidence}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{de ? 'Konfidenz' : 'Confidence'}</span>
                  </div>

                  {/* What is happening */}
                  <div className="rounded-lg bg-muted/20 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{de ? 'Was passiert' : 'What is happening'}</p>
                    <p className="text-[12px] text-foreground leading-relaxed">{analysis.whatIsHappening}</p>
                  </div>

                  {/* Likely issue */}
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-amber-500/60" />
                    <span className="text-[11px] text-foreground">
                      {de ? 'Wahrscheinlich: ' : 'Most likely: '}
                      <strong>{ISSUE_LABELS[analysis.likelyIssue]?.[de ? 'de' : 'en'] || analysis.likelyIssue}</strong>
                    </span>
                  </div>

                  {/* Matched signals */}
                  {analysis.matchedSignals && analysis.matchedSignals.length > 0 && (
                    <div className="rounded-lg bg-muted/15 border border-border/20 p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">{de ? 'Erkannte Signale' : 'Matched Signals'}</p>
                      <div className="space-y-1">
                        {analysis.matchedSignals.map((sig, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <span className="mt-1.5 h-1 w-1 rounded-full bg-primary/40 shrink-0" />
                            <span className="text-[10px] text-foreground/70 leading-snug">{sig}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.stateShiftAlert && (
                    <div className="rounded-lg border border-primary/20 bg-primary/[0.05] p-2 flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-[11px] text-primary font-medium">{analysis.stateShiftAlert}</span>
                    </div>
                  )}

                  {/* Previous state */}
                  {stateHistory.length > 1 && (
                    <p className="text-[10px] text-muted-foreground">
                      {de ? 'Vorher: ' : 'Previous: '}
                      {de ? STATE_META[stateHistory[stateHistory.length - 2].state].labelDe : STATE_META[stateHistory[stateHistory.length - 2].state].labelEn}
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <Radio className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2 animate-pulse" />
                  <p className="text-[11px] text-muted-foreground/50">{analyzing ? (de ? 'Analysiere...' : 'Analyzing...') : (de ? 'Warte auf Gespraech...' : 'Waiting for conversation...')}</p>
                </div>
              )}
            </div>

            {/* Mini state history */}
            {stateHistory.length > 0 && (
              <div className="rounded-xl border border-border/40 bg-card p-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">Flow</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {stateHistory.slice(-6).map((entry, i) => {
                    const meta = STATE_META[entry.state];
                    const Icon = meta.icon;
                    return (
                      <div key={i} className="flex items-center gap-0.5">
                        <div className="rounded bg-muted/30 p-1">
                          <Icon className="h-3 w-3" style={{ color: meta.color }} />
                        </div>
                        {i < Math.min(stateHistory.length, 6) - 1 && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/20" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* CENTER: Tactical Guidance Panel */}
          <div className="space-y-3">
            {/* Silence Intelligence */}
            {analysis?.holdSilence && (
              <div className="rounded-xl border-2 border-foreground/15 bg-foreground/[0.03] p-5 text-center animate-in fade-in duration-300">
                <Pause className="h-8 w-8 text-foreground/40 mx-auto mb-2" />
                <p className="text-[16px] font-semibold text-foreground">{de ? 'Pause. Nicht sprechen.' : 'Pause. Do not speak.'}</p>
                <p className="text-[12px] text-muted-foreground mt-1">{analysis.silenceReason || (de ? 'Lass den Kunden verarbeiten.' : 'Let the customer process.')}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-2">{de ? 'Rette diesen Moment nicht.' : 'Do not rescue this moment.'}</p>
              </div>
            )}

            {analysis && (
              <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{de ? 'Taktische Anweisung' : 'Tactical Guidance'}</p>

                {/* Objective */}
                <div className="rounded-lg bg-primary/[0.04] border border-primary/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-primary/60 mb-1">{de ? 'Ziel' : 'Objective'}</p>
                  <p className="text-[13px] text-foreground font-medium">{analysis.objective}</p>
                </div>

                {/* Next move */}
                <div className="rounded-lg bg-foreground/[0.03] border border-foreground/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{de ? 'Naechster Move' : 'Next Move'}</p>
                  <p className="text-[13px] text-foreground font-semibold">{analysis.nextMove}</p>
                </div>

                {/* Suggested say */}
                <div className="rounded-lg bg-muted/20 border border-border/20 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{de ? 'Sage' : 'Say'}</p>
                  <p className="text-[13px] text-foreground italic">&ldquo;{analysis.suggestedSay}&rdquo;</p>
                </div>

                {/* Avoid */}
                <div className="rounded-lg bg-destructive/[0.04] border border-destructive/10 p-2.5">
                  <p className="text-[10px] text-destructive/60 font-semibold">{de ? 'VERMEIDE:' : 'AVOID:'}</p>
                  <p className="text-[12px] text-foreground mt-0.5">{analysis.avoidDoing}</p>
                </div>
              </div>
            )}

            {/* Tap for help (tap mode) */}
            {inputMode === 'tap' && speech.status === 'live' && (
              <button onClick={handleTapForHelp} disabled={analyzing}
                className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.03] p-4 text-center hover:bg-primary/[0.06] transition-colors disabled:opacity-40">
                <Zap className="h-5 w-5 text-primary/60 mx-auto mb-1" />
                <p className="text-[12px] font-semibold text-primary">{de ? 'Naechsten Move anfordern' : 'Request Next Move'}</p>
              </button>
            )}

            {/* Quick patterns */}
            <div className="rounded-xl border border-border/40 bg-card p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">{de ? 'Schnellauswahl' : 'Quick Patterns'}</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PATTERNS.map(p => (
                  <button key={p.key} onClick={() => handleQuickPattern(p.key)} disabled={analyzing}
                    className="rounded-lg border border-border/30 bg-muted/10 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40">
                    {de ? p.de : p.en}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: Call Momentum Panel */}
          <div className="space-y-3">
            <div className="rounded-xl border border-border/40 bg-card p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">{de ? 'Call Momentum' : 'Call Momentum'}</p>

              {analysis ? (
                <div className="space-y-3">
                  {/* Momentum */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Momentum</span>
                    <div className="flex items-center gap-1.5">
                      <MomentumIcon className={cn('h-4 w-4',
                        analysis.momentum === 'high' ? 'text-green-500' :
                        analysis.momentum === 'low' ? 'text-destructive' : 'text-amber-500',
                      )} />
                      <span className={cn('text-[12px] font-semibold uppercase',
                        analysis.momentum === 'high' ? 'text-green-600' :
                        analysis.momentum === 'low' ? 'text-destructive' : 'text-amber-600',
                      )}>{analysis.momentum}</span>
                    </div>
                  </div>

                  {/* Commitment */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{de ? 'Commitment' : 'Commitment'}</span>
                    <span className={cn('text-[12px] font-semibold uppercase',
                      analysis.commitmentQuality === 'strong' ? 'text-green-600' :
                      analysis.commitmentQuality === 'weak' ? 'text-destructive' : 'text-amber-600',
                    )}>{analysis.commitmentQuality}</span>
                  </div>

                  {/* Risk */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{de ? 'Risiko' : 'Risk'}</span>
                    <span className={cn('text-[12px] font-semibold uppercase',
                      analysis.riskLevel === 'low' ? 'text-green-600' :
                      analysis.riskLevel === 'high' ? 'text-destructive' : 'text-amber-600',
                    )}>{analysis.riskLevel}</span>
                  </div>

                  {/* Drivers */}
                  {analysis.momentumDrivers && analysis.momentumDrivers.length > 0 && (
                    <div className="border-t border-border/20 pt-3 space-y-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{de ? 'Treiber' : 'Drivers'}</p>
                      {analysis.momentumDrivers.map((d, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                          <p className="text-[11px] text-foreground leading-snug">{d}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <Activity className="h-5 w-5 text-muted-foreground/20 mx-auto mb-1" />
                  <p className="text-[10px] text-muted-foreground/40">{de ? 'Warte auf Daten...' : 'Waiting for data...'}</p>
                </div>
              )}
            </div>

            {/* Live transcript preview */}
            <div className="rounded-xl border border-border/40 bg-card p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-2">{de ? 'Transkript (Orientierung)' : 'Transcript (Guidance)'}</p>
              <div className="max-h-32 overflow-y-auto">
                {speech.transcript ? (
                  <p className="text-[11px] text-foreground/70 leading-relaxed">
                    {speech.transcript.slice(-300)}
                    {speech.interimTranscript && <span className="text-muted-foreground/40 italic"> {speech.interimTranscript}</span>}
                  </p>
                ) : (
                  <p className="text-[10px] text-muted-foreground/40 italic">{de ? 'Hoere zu...' : 'Listening...'}</p>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground/30 mt-2 italic">{de ? 'Hinweis: Transkript dient als Orientierung, nicht als exaktes Protokoll.' : 'Note: Transcript serves as guidance, not exact protocol.'}</p>
            </div>

            {/* Analyzing indicator */}
            {analyzing && (
              <div className="flex items-center justify-center gap-2 py-2">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                <span className="text-[10px] text-muted-foreground">{de ? 'Analysiere...' : 'Analyzing...'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Idle state */}
      {speech.status === 'off' && !sessionSummary && (
        <div className="rounded-2xl border border-border/40 bg-card p-8 text-center">
          <Mic className="h-10 w-10 text-muted-foreground/15 mx-auto mb-3" />
          <h3 className="font-serif text-lg font-semibold text-foreground mb-1">
            {de ? 'Live Listening Copilot' : 'Live Listening Copilot'}
          </h3>
          <p className="text-[13px] text-muted-foreground max-w-md mx-auto mb-4">
            {de ? 'Stiller taktischer Assistent fuer Live-Calls. Hoert mit, erkennt den Gespraechszustand und zeigt dir den naechsten Move.'
              : 'Silent tactical assistant for live calls. Listens in, detects conversation state, and shows your next move.'}
          </p>
          <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground/50">
            <span className="flex items-center gap-1"><Volume2 className="h-3 w-3" /> {de ? 'Kein Voice-Output' : 'No voice output'}</span>
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {de ? 'Nur visuell' : 'Visual only'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
