import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import {
  Brain, Zap, Eye, Target, Activity, Shield, MessageSquare,
  ChevronRight, ChevronLeft, Phone, PhoneOff, Send, Loader2,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2,
  FileText, Star, Volume2, Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

/* ─── Types ─── */
type ConvoState = 'rapport' | 'discovery' | 'qualification' | 'objection' | 'closing' | 'follow_up';
type WorkspaceRole = 'setter' | 'closer';

interface CopilotAnalysis {
  state: ConvoState;
  confidence: string;
  whatIsHappening: string;
  suggestedSay: string;
  nextMove: string;
  avoidDoing: string;
  holdSilence: boolean;
  silenceReason?: string;
  momentum: 'rising' | 'stable' | 'dropping';
  commitmentQuality: string;
  riskLevel: string;
  likelyIssue: string;
  matchedSignals?: string[];
  stateShiftAlert?: string;
  // Computed
  closingProbability: number;
  isObjection: boolean;
  qualifyRecommendation?: 'qualify' | 'reject' | 'follow_up';
  buyingSignalDetected?: boolean;
}

interface CallSummary {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  scores: { clarity: number; control: number; closing: number };
}

/* ─── State Metadata ─── */
const STATE_META: Record<ConvoState, { icon: React.ComponentType<any>; color: string; label: string }> = {
  rapport: { icon: Eye, color: 'hsl(220,9%,46%)', label: 'Rapport' },
  discovery: { icon: Target, color: 'hsl(217,91%,60%)', label: 'Discovery' },
  qualification: { icon: Shield, color: 'hsl(39,41%,55%)', label: 'Qualification' },
  objection: { icon: AlertTriangle, color: 'hsl(12,76%,61%)', label: 'Einwand' },
  closing: { icon: Zap, color: 'hsl(152,60%,40%)', label: 'Closing' },
  follow_up: { icon: Activity, color: 'hsl(263,70%,50%)', label: 'Follow-Up' },
};

const MOMENTUM_ICON = { rising: TrendingUp, stable: Minus, dropping: TrendingDown };
const MOMENTUM_COLOR = { rising: 'text-primary', stable: 'text-muted-foreground', dropping: 'text-destructive' };

interface Props {
  role: WorkspaceRole;
  leadId?: string;
  leadName?: string;
}

export default function WorkspaceCopilotPanel({ role, leadId, leadName }: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CopilotAnalysis | null>(null);
  const [callNotes, setCallNotes] = useState<string[]>([]);
  const [previousStates, setPreviousStates] = useState<string[]>([]);
  const [callSummary, setCallSummary] = useState<CallSummary | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [suggestionUsed, setSuggestionUsed] = useState(false);
  const callStartRef = useRef<number>(0);

  /* ─── Compute Closing Probability ─── */
  const computeClosingProbability = (data: any): number => {
    let prob = 30; // base
    const state = data?.state;
    const momentum = data?.momentum;
    const commitment = data?.commitmentQuality;
    const risk = data?.riskLevel;

    // State influence
    if (state === 'decision') prob += 30;
    else if (state === 'depth') prob += 15;
    else if (state === 'exploration') prob += 5;
    else if (state === 'resistance') prob -= 15;
    else if (state === 'confusion') prob -= 10;

    // Momentum
    if (momentum === 'high' || momentum === 'rising') prob += 15;
    else if (momentum === 'low' || momentum === 'dropping') prob -= 10;

    // Commitment
    if (commitment === 'strong') prob += 20;
    else if (commitment === 'emerging') prob += 10;
    else if (commitment === 'weak') prob -= 10;

    // Risk
    if (risk === 'high') prob -= 15;
    else if (risk === 'low') prob += 5;

    return Math.max(5, Math.min(95, prob));
  };

  /* ─── Analyze Note ─── */
  const analyzeNote = useCallback(async () => {
    if (!noteInput.trim()) return;
    const note = noteInput.trim();
    setCallNotes(prev => [...prev, note]);
    setNoteInput('');
    setAnalyzing(true);
    setSuggestionUsed(false);

    try {
      const context = callNotes.join('\n') + '\n' + note;
      const { data, error } = await supabase.functions.invoke('live-copilot-analyze', {
        body: {
          transcript: context,
          previousStates,
          context: `Role: ${role}. Lead: ${leadName || 'Unknown'}.`,
        },
      });

      if (error) throw error;

      const mappedState = mapState(data?.state);
      const mappedMomentum = mapMomentum(data?.momentum);
      const isObjection = mappedState === 'objection' || data?.likelyIssue === 'value_gap' || data?.likelyIssue === 'trust_gap';
      const closingProb = computeClosingProbability(data);

      const mapped: CopilotAnalysis = {
        state: mappedState,
        confidence: data?.confidence || 'medium',
        whatIsHappening: data?.whatIsHappening || '',
        suggestedSay: data?.suggestedSay || '',
        nextMove: data?.nextMove || '',
        avoidDoing: data?.avoidDoing || '',
        holdSilence: data?.holdSilence || false,
        silenceReason: data?.silenceReason,
        momentum: mappedMomentum,
        commitmentQuality: data?.commitmentQuality || 'weak',
        riskLevel: data?.riskLevel || 'medium',
        likelyIssue: data?.likelyIssue || '',
        matchedSignals: data?.matchedSignals,
        stateShiftAlert: data?.stateShiftAlert,
        closingProbability: closingProb,
        isObjection,
        ...(role === 'setter' && {
          qualifyRecommendation: detectSetterRecommendation(data),
        }),
        ...(role === 'closer' && {
          buyingSignalDetected: data?.state === 'decision' || data?.commitmentQuality === 'strong',
        }),
      };

      setAnalysis(mapped);
      setPreviousStates(prev => [...prev, data?.state || 'surface']);

      // Track objection detection
      if (isObjection && user?.id) {
        supabase.from('lead_events').insert({
          lead_id: leadId || null,
          event_type: 'objection_detected',
          actor_user_id: user.id,
          notes: `Objection detected: ${data?.likelyIssue || 'unknown'} | Phase: ${mappedState}`,
          metadata: { issue: data?.likelyIssue, state: mappedState, confidence: data?.confidence },
        } as any).then(() => {});
      }
    } catch (e) {
      console.error('Copilot analysis error:', e);
      toast({ title: 'Copilot-Fehler', description: 'Analyse fehlgeschlagen.', variant: 'destructive' });
    } finally {
      setAnalyzing(false);
    }
  }, [noteInput, callNotes, previousStates, role, leadName, leadId, user]);

  /* ─── Copy suggestion ─── */
  const copySuggestion = useCallback(() => {
    if (!analysis?.suggestedSay) return;
    navigator.clipboard.writeText(analysis.suggestedSay);
    setSuggestionUsed(true);

    // Track suggestion used
    if (user?.id) {
      supabase.from('lead_events').insert({
        lead_id: leadId || null,
        event_type: 'suggestion_used',
        actor_user_id: user.id,
        notes: `Suggestion copied: "${analysis.suggestedSay.slice(0, 80)}"`,
        metadata: { state: analysis.state, closing_probability: analysis.closingProbability },
      } as any).then(() => {});
    }

    toast({ title: 'Kopiert ✓', description: 'Vorschlag in Zwischenablage.' });
  }, [analysis, user, leadId]);

  /* ─── Start / End Call ─── */
  const startCall = () => {
    setCallActive(true);
    setAnalysis(null);
    setCallNotes([]);
    setPreviousStates([]);
    setCallSummary(null);
    callStartRef.current = Date.now();

    // Track live_call_started
    if (user?.id) {
      supabase.from('lead_events').insert({
        lead_id: leadId || null,
        event_type: 'live_call_started',
        actor_user_id: user.id,
        notes: `Live call started | Role: ${role} | Lead: ${leadName || 'Unknown'}`,
      } as any).then(() => {});
    }
  };

  const endCall = async () => {
    setCallActive(false);
    if (callNotes.length === 0) return;

    setGeneratingSummary(true);
    try {
      const duration = Math.round((Date.now() - callStartRef.current) / 1000);
      const { data, error } = await supabase.functions.invoke('live-copilot-analyze', {
        body: {
          transcript: callNotes.join('\n'),
          context: `POST-CALL SUMMARY REQUEST. Role: ${role}. Duration: ${duration}s. Generate a structured call summary with strengths, weaknesses, and scores for clarity (1-10), control (1-10), and closing attempt (1-10). Respond with JSON: { summary, strengths[], weaknesses[], scores: { clarity, control, closing } }`,
        },
      });

      if (error) throw error;

      if (data?.summary || typeof data === 'object') {
        setCallSummary({
          summary: data.summary || data.whatIsHappening || 'Call abgeschlossen.',
          strengths: data.strengths || [data.nextMove || 'Gute Gesprächsführung'].filter(Boolean),
          weaknesses: data.weaknesses || [data.avoidDoing || 'Verbesserungspotenzial'].filter(Boolean),
          scores: data.scores || { clarity: 7, control: 6, closing: 5 },
        });
      }

      if (leadId && user?.id) {
        await supabase.from('lead_events' as any).insert({
          lead_id: leadId,
          event_type: `${role}_copilot_call_completed`,
          actor_user_id: user.id,
          notes: `Call ended | Duration: ${duration}s | Notes: ${callNotes.length}`,
          metadata: { notes_count: callNotes.length, duration },
        });
      }
    } catch (e) {
      console.error('Summary generation error:', e);
    } finally {
      setGeneratingSummary(false);
    }
  };

  /* ─── Collapsed State ─── */
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={cn(
          'fixed right-0 top-1/2 -translate-y-1/2 z-40',
          'bg-card border border-border rounded-l-lg p-2 shadow-lg',
          'hover:bg-accent transition-colors',
          callActive && 'border-primary bg-primary/5 animate-pulse'
        )}
      >
        <Brain className="h-5 w-5 text-primary" />
        <ChevronLeft className="h-3 w-3 text-muted-foreground mt-1" />
        <span className="sr-only">AI Copilot</span>
      </button>
    );
  }

  const StateIcon = analysis ? STATE_META[analysis.state].icon : Brain;
  const MomIcon = analysis ? MOMENTUM_ICON[analysis.momentum] : Minus;
  const probColor = (p: number) => p >= 60 ? 'text-primary' : p >= 35 ? 'text-amber-500' : 'text-destructive';

  return (
    <div className="fixed right-0 top-16 bottom-0 w-80 z-40 bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Live Copilot</span>
        </div>
        <button onClick={() => setExpanded(false)} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Call Control */}
      <div className="px-4 py-3 border-b border-border">
        {!callActive ? (
          <Button onClick={startCall} className="w-full gap-2" size="sm">
            <Phone className="h-4 w-4" /> Call starten
          </Button>
        ) : (
          <Button onClick={endCall} variant="destructive" className="w-full gap-2" size="sm">
            <PhoneOff className="h-4 w-4" /> Call beenden
          </Button>
        )}
        {leadName && (
          <p className="text-[11px] text-muted-foreground mt-1.5 text-center">{leadName}</p>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {callActive && (
          <>
            {/* Note Input */}
            <div className="flex gap-1.5">
              <Textarea
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="Was sagt der Prospect?"
                className="min-h-[50px] text-sm resize-none flex-1"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); analyzeNote(); } }}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={analyzeNote}
                disabled={analyzing || !noteInput.trim()}
                className="self-end"
              >
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

            {/* ═══ CORE DISPLAY: Phase + Probability + Next Best Sentence ═══ */}
            {analysis && (
              <div className="space-y-2.5">
                {/* Phase + Closing Probability */}
                <div className="rounded-lg border border-border p-3 bg-muted/20">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <StateIcon className="h-4 w-4" style={{ color: STATE_META[analysis.state].color }} />
                      <span className="text-xs font-semibold" style={{ color: STATE_META[analysis.state].color }}>
                        {STATE_META[analysis.state].label}
                      </span>
                      <MomIcon className={cn('h-3 w-3', MOMENTUM_COLOR[analysis.momentum])} />
                    </div>
                    <div className="text-right">
                      <span className={cn('text-lg font-bold tabular-nums', probColor(analysis.closingProbability))}>
                        {analysis.closingProbability}%
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{analysis.whatIsHappening}</p>
                </div>

                {/* Silence Alert */}
                {analysis.holdSilence && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-[11px] font-semibold text-amber-700">Stille halten</p>
                      {analysis.silenceReason && (
                        <p className="text-[10px] text-amber-600">{analysis.silenceReason}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══ NEXT BEST SENTENCE — Single Recommendation ═══ */}
                {!analysis.holdSilence && analysis.suggestedSay && (
                  <div className="rounded-lg border border-primary/20 p-3 bg-primary/5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                        Nächster Satz
                      </p>
                      <button
                        onClick={copySuggestion}
                        className={cn(
                          'text-[10px] flex items-center gap-1 transition-colors',
                          suggestionUsed ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {suggestionUsed ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {suggestionUsed ? 'Kopiert' : 'Kopieren'}
                      </button>
                    </div>
                    <p className="text-[12px] text-foreground leading-relaxed italic">
                      „{analysis.suggestedSay}"
                    </p>
                  </div>
                )}

                {/* ═══ OBJECTION HANDLING ═══ */}
                {analysis.isObjection && (
                  <div className="rounded-lg border border-destructive/20 p-3 bg-destructive/5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <p className="text-[10px] font-semibold text-destructive uppercase tracking-wider">
                        Einwand erkannt
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-1.5">
                      {analysis.likelyIssue === 'value_gap' ? 'Wert nicht erkannt' :
                       analysis.likelyIssue === 'trust_gap' ? 'Vertrauen fehlt' :
                       analysis.likelyIssue === 'self_doubt' ? 'Selbstzweifel' :
                       analysis.likelyIssue === 'real_constraint' ? 'Echte Einschränkung' :
                       analysis.likelyIssue === 'avoidance' ? 'Vermeidung' :
                       analysis.likelyIssue || 'Unbekannt'}
                    </p>
                    {analysis.nextMove && (
                      <div className="mt-1.5 pt-1.5 border-t border-destructive/10">
                        <p className="text-[10px] text-muted-foreground uppercase mb-0.5">Reframe</p>
                        <p className="text-[11px] text-foreground">{analysis.nextMove}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Avoid Doing — Subtle warning */}
                {analysis.avoidDoing && !analysis.isObjection && (
                  <p className="text-[10px] text-muted-foreground/70 px-1">
                    ⚠ Vermeide: {analysis.avoidDoing}
                  </p>
                )}

                {/* Role-specific signals */}
                {role === 'setter' && analysis.qualifyRecommendation && (
                  <div className="flex items-center gap-2 px-1">
                    <Badge variant={
                      analysis.qualifyRecommendation === 'qualify' ? 'default' :
                      analysis.qualifyRecommendation === 'reject' ? 'destructive' : 'secondary'
                    } className="text-[10px]">
                      {analysis.qualifyRecommendation === 'qualify' ? '✓ Qualifizieren' :
                       analysis.qualifyRecommendation === 'reject' ? '✗ Ablehnen' : '↻ Follow-Up'}
                    </Badge>
                  </div>
                )}

                {role === 'closer' && analysis.buyingSignalDetected && (
                  <div className="rounded-lg border border-primary/30 p-2.5 bg-primary/10 flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[11px] font-medium text-primary">Kaufsignal erkannt — Closing-Fenster!</span>
                  </div>
                )}

                {/* State shift alert */}
                {analysis.stateShiftAlert && (
                  <p className="text-[10px] text-accent italic px-1">
                    ↗ Shift: {analysis.stateShiftAlert}
                  </p>
                )}
              </div>
            )}

            {/* Notes Log — Minimal */}
            {callNotes.length > 0 && (
              <details className="text-[10px]">
                <summary className="cursor-pointer text-muted-foreground font-medium uppercase tracking-wider">
                  Notizen ({callNotes.length})
                </summary>
                <div className="mt-1.5 space-y-1 max-h-24 overflow-y-auto">
                  {callNotes.map((n, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1">{n}</p>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {/* Post-Call Summary */}
        {!callActive && generatingSummary && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Call wird analysiert…</p>
          </div>
        )}

        {!callActive && callSummary && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Call-Analyse</span>
            </div>

            <p className="text-[12px] text-muted-foreground leading-relaxed">{callSummary.summary}</p>

            <div className="grid grid-cols-3 gap-2">
              {(['clarity', 'control', 'closing'] as const).map(k => (
                <div key={k} className="text-center rounded-lg border border-border p-2 bg-muted/20">
                  <p className="text-[10px] text-muted-foreground">{k === 'clarity' ? 'Klarheit' : k === 'control' ? 'Kontrolle' : 'Closing'}</p>
                  <p className={cn(
                    'text-lg font-bold',
                    callSummary.scores[k] >= 7 ? 'text-primary' :
                    callSummary.scores[k] >= 5 ? 'text-amber-500' : 'text-destructive'
                  )}>
                    {callSummary.scores[k]}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-primary/20 p-3">
              <p className="text-[10px] font-semibold text-primary uppercase mb-1.5">Stärken</p>
              {callSummary.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 mb-1">
                  <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <p className="text-[12px] text-foreground">{s}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-destructive/20 p-3">
              <p className="text-[10px] font-semibold text-destructive uppercase mb-1.5">Verbesserung</p>
              {callSummary.weaknesses.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 mb-1">
                  <AlertTriangle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                  <p className="text-[12px] text-foreground">{w}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Idle State */}
        {!callActive && !callSummary && !generatingSummary && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Brain className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              Starte einen Call für Echtzeit-Unterstützung.
            </p>
            <p className="text-[11px] text-muted-foreground/60">
              Phase · Closing % · Nächster Satz · Einwandbehandlung
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border bg-muted/30">
        <p className="text-[9px] text-muted-foreground/50 text-center">
          Live Copilot · 1 Empfehlung · &lt;3s Reaktion
        </p>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */
function mapState(raw?: string): ConvoState {
  const m: Record<string, ConvoState> = {
    surface: 'rapport', exploration: 'discovery', depth: 'qualification',
    resistance: 'objection', confusion: 'objection', decision: 'closing',
  };
  return m[raw || ''] || 'rapport';
}

function mapMomentum(raw?: string): 'rising' | 'stable' | 'dropping' {
  if (raw === 'rising' || raw === 'accelerating' || raw === 'high') return 'rising';
  if (raw === 'dropping' || raw === 'stalling' || raw === 'low') return 'dropping';
  return 'stable';
}

function detectSetterRecommendation(data: any): 'qualify' | 'reject' | 'follow_up' {
  if (data?.state === 'decision' && data?.commitmentQuality === 'strong') return 'qualify';
  if (data?.riskLevel === 'high' && data?.momentum === 'low') return 'reject';
  if (data?.state === 'decision' && data?.commitmentQuality === 'emerging') return 'qualify';
  return 'follow_up';
}
