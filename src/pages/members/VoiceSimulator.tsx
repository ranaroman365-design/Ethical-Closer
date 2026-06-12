import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Mic, ArrowLeft, ArrowRight, RotateCcw, Trophy, Target, Zap,
  ChevronRight, Loader2, Timer, Lock, TrendingUp, CheckCircle2
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserLevel } from '@/components/members/CareerPath';
import AudioRecorder from '@/components/audio/AudioRecorder';
import RealtimeLockedCard from '@/components/simulator/RealtimeLockedCard';

type ViewState = 'list' | 'simulation' | 'results';

interface Simulation {
  id: string;
  level: number;
  title: string;
  scenario_text: string;
  difficulty: string;
  objective: string;
  estimated_duration: number | null;
}

interface SimStep {
  id: string;
  step_order: number;
  ai_prompt: string;
  objection_type: string | null;
  expected_skill: string;
  time_limit_seconds: number | null;
}

interface StepResult {
  transcript: string;
  scores: {
    clarity: number;
    structure: number;
    emotional_control: number;
    objection_handling: number;
    closing_direction: number;
  };
  feedback: {
    strengths: string;
    weaknesses: string;
    improvement_actions: string[];
  };
  filler_words_detected: boolean;
  confidence_level: number;
  total_score: number;
}

interface LevelProgress {
  avg_score: number;
  best_score: number;
  total_attempts: number;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'border-primary/30 text-primary',
  medium: 'border-accent/30 text-accent',
  hard: 'border-destructive/30 text-destructive',
};
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Einfach', medium: 'Mittel', hard: 'Schwer',
};

const KPI_LABELS: Record<string, string> = {
  clarity: 'Klarheit',
  structure: 'Struktur',
  emotional_control: 'Emotionale Kontrolle',
  objection_handling: 'Einwandbehandlung',
  closing_direction: 'Closing-Richtung',
};

export default function VoiceSimulator() {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<ViewState>('list');
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<number, LevelProgress>>({});

  // Simulation state
  const [activeSim, setActiveSim] = useState<Simulation | null>(null);
  const [steps, setSteps] = useState<SimStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [stepResult, setStepResult] = useState<StepResult | null>(null);
  const [allResults, setAllResults] = useState<StepResult[]>([]);

  // Time pressure
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const userLevel = getUserLevel((profile as any)?.business_stage || 'opener');

  useEffect(() => {
    setSelectedLevel(Math.max(1, Math.min(6, userLevel)));
  }, [userLevel]);

  // Load progress for all levels
  useEffect(() => {
    if (!user) return;
    supabase
      .from('simulation_user_progress' as any)
      .select('level, avg_score, best_score, total_attempts')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const map: Record<number, LevelProgress> = {};
        (data as any[] || []).forEach((p: any) => {
          map[p.level] = { avg_score: p.avg_score, best_score: p.best_score, total_attempts: p.total_attempts };
        });
        setProgressMap(map);
      });
  }, [user, view]);

  // Load simulations
  useEffect(() => {
    setLoading(true);
    supabase
      .from('simulations' as any)
      .select('*')
      .eq('level', selectedLevel)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        setSimulations((data as any[]) || []);
        setLoading(false);
      });
  }, [selectedLevel]);

  const isLevelUnlocked = (level: number): boolean => {
    if (level <= 1) return true;
    const prev = progressMap[level - 1];
    return prev ? prev.avg_score >= 7.0 : false;
  };

  const startSimulation = useCallback(async (sim: Simulation) => {
    if (!user) return;

    const { data: stepsData } = await supabase
      .from('simulation_steps' as any)
      .select('*')
      .eq('simulation_id', sim.id)
      .order('step_order');

    if (!stepsData || stepsData.length === 0) {
      toast({ title: 'Fehler', description: 'Keine Schritte gefunden.', variant: 'destructive' });
      return;
    }

    const { data: attempt, error } = await supabase
      .from('simulation_attempts' as any)
      .insert({ user_id: user.id, simulation_id: sim.id } as any)
      .select()
      .single();

    if (error || !attempt) {
      toast({ title: 'Fehler', description: error?.message || 'Versuch konnte nicht erstellt werden.', variant: 'destructive' });
      return;
    }

    setActiveSim(sim);
    setSteps(stepsData as any[]);
    setCurrentStepIdx(0);
    setAttemptId((attempt as any).id);
    setStepResult(null);
    setAllResults([]);
    setView('simulation');
  }, [user, toast]);

  // Time pressure timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (view !== 'simulation' || stepResult || analyzing) {
      setTimeLeft(null);
      return;
    }
    const step = steps[currentStepIdx];
    if (!step?.time_limit_seconds) {
      setTimeLeft(null);
      return;
    }
    setTimeLeft(step.time_limit_seconds);
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [view, currentStepIdx, stepResult, analyzing, steps]);

  const handleAudioSent = useCallback(async (filePath: string, duration: number) => {
    if (!attemptId || !steps[currentStepIdx] || !activeSim) return;
    setAnalyzing(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const step = steps[currentStepIdx];
      const isLastStep = currentStepIdx === steps.length - 1;
      const { data, error } = await supabase.functions.invoke('analyze-simulation', {
        body: {
          audio_path: filePath,
          step_id: step.id,
          attempt_id: attemptId,
          ai_prompt: step.ai_prompt,
          expected_skill: step.expected_skill,
          is_last_step: isLastStep,
          simulation_level: activeSim.level,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const result: StepResult = {
        transcript: data.transcript,
        scores: data.scores,
        feedback: {
          strengths: data.feedback.strengths,
          weaknesses: data.feedback.weaknesses,
          improvement_actions: data.feedback.improvement_actions || [],
        },
        filler_words_detected: data.filler_words_detected,
        confidence_level: data.confidence_level,
        total_score: data.total_score,
      };
      setStepResult(result);
      setAllResults(prev => [...prev, result]);
    } catch (err: any) {
      toast({ title: 'Analyse fehlgeschlagen', description: err.message || 'Bitte versuche es erneut.', variant: 'destructive' });
    }
    setAnalyzing(false);
  }, [attemptId, steps, currentStepIdx, activeSim, toast]);

  const nextStep = useCallback(() => {
    if (currentStepIdx < steps.length - 1) {
      setCurrentStepIdx(prev => prev + 1);
      setStepResult(null);
    } else {
      setView('results');
    }
  }, [currentStepIdx, steps.length]);

  const retryStep = useCallback(() => {
    setStepResult(null);
  }, []);

  const exitSimulation = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setView('list');
    setActiveSim(null);
    setSteps([]);
    setAttemptId(null);
    setStepResult(null);
    setAllResults([]);
    setCurrentStepIdx(0);
    setTimeLeft(null);
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ============ LIST VIEW ============
  if (view === 'list') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
        <div className="mb-6">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Voice Closing Simulator™
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            KPI-gesteuertes Stimmtraining mit AI-Feedback. Wähle dein Level und starte.
          </p>
        </div>

        {/* Level Selector */}
        <div className="mb-6 rounded-xl border border-border/40 bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
            LEVEL WÄHLEN
          </p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6].map(l => {
              const unlocked = isLevelUnlocked(l);
              const prog = progressMap[l];
              return (
                <button
                  key={l}
                  onClick={() => unlocked && setSelectedLevel(l)}
                  disabled={!unlocked}
                  className={`rounded-lg border px-3 py-2 text-[12px] font-medium transition-all ${
                    !unlocked
                      ? 'border-border/20 text-muted-foreground/40 cursor-not-allowed'
                      : selectedLevel === l
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-border/40 text-muted-foreground hover:border-border/70'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {!unlocked && <Lock className="h-3 w-3" />}
                    L{l}
                    {l === userLevel && <span className="text-[9px] opacity-60">(aktuell)</span>}
                    {prog && unlocked && (
                      <span className={`text-[9px] ml-0.5 ${prog.avg_score >= 7 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {prog.avg_score.toFixed(1)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Progress summary for selected level */}
          {progressMap[selectedLevel] && (
            <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground border-t border-border/20 pt-3">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Ø {progressMap[selectedLevel].avg_score.toFixed(1)}
              </span>
              <span className="flex items-center gap-1">
                <Trophy className="h-3 w-3" /> Best: {progressMap[selectedLevel].best_score.toFixed(1)}
              </span>
              <span>{progressMap[selectedLevel].total_attempts} Versuche</span>
            </div>
          )}
        </div>

        {/* Standard Mode Section Header */}
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Standard Mode</h2>
          <Badge className="text-[8px] bg-primary/10 text-primary border-0 font-semibold">AKTIV</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground/70 mb-4">
          Strukturiertes Step-by-Step Training mit AI-gesteuertem Feedback.
        </p>

        {/* Simulation Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : simulations.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
            <Target className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Keine Simulationen für Level {selectedLevel} verfügbar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {simulations.map(sim => (
              <button
                key={sim.id}
                onClick={() => startSimulation(sim)}
                className="w-full text-left rounded-xl border border-border/40 bg-card p-5 transition-all hover:border-border/70 hover:shadow-sm group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-[14px] font-semibold text-foreground">{sim.title}</h3>
                      <Badge variant="outline" className={`text-[9px] ${DIFFICULTY_COLORS[sim.difficulty] || ''}`}>
                        {DIFFICULTY_LABELS[sim.difficulty] || sim.difficulty}
                      </Badge>
                      {sim.estimated_duration && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                          <Timer className="h-2.5 w-2.5" /> ~{sim.estimated_duration} Min
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-muted-foreground line-clamp-2">{sim.scenario_text}</p>
                    <p className="mt-2 text-[11px] text-accent/80">
                      <Target className="inline h-3 w-3 mr-1" />
                      {sim.objective}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-accent transition-colors shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Real-Time Mode — Premium Locked Card */}
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Advanced Mode</h2>
          </div>
          <RealtimeLockedCard
            isEnabled={(profile as any)?.realtime_simulator_enabled === true}
            isAdmin={false}
            userId={user?.id}
            avgScore={Object.values(progressMap).reduce((a, p) => a + p.avg_score, 0) / Math.max(Object.keys(progressMap).length, 1)}
            totalAttempts={Object.values(progressMap).reduce((a, p) => a + p.total_attempts, 0)}
            userLevel={userLevel}
          />
        </div>
      </div>
    );
  }

  // ============ SIMULATION VIEW ============
  if (view === 'simulation' && activeSim && steps.length > 0) {
    const currentStep = steps[currentStepIdx];
    const isLastStep = currentStepIdx === steps.length - 1;
    const hasTimeLimit = currentStep.time_limit_seconds && timeLeft !== null;
    const timeExpired = timeLeft === 0;

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={exitSimulation} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Zurück
          </button>
          <div className="flex items-center gap-3">
            {hasTimeLimit && !stepResult && !analyzing && (
              <span className={`flex items-center gap-1 text-xs font-mono tabular-nums ${
                timeLeft! <= 10 ? 'text-destructive animate-pulse' : timeLeft! <= 20 ? 'text-accent' : 'text-muted-foreground'
              }`}>
                <Timer className="h-3 w-3" /> {formatTime(timeLeft!)}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              Schritt {currentStepIdx + 1} / {steps.length}
            </span>
          </div>
        </div>

        <Progress value={((currentStepIdx + (stepResult ? 1 : 0)) / steps.length) * 100} className="h-1 mb-6" />

        {/* Scenario (first step only) */}
        {currentStepIdx === 0 && !stepResult && (
          <div className="rounded-xl border border-border/40 bg-card p-5 mb-4">
            <h2 className="text-[15px] font-semibold text-foreground mb-2">{activeSim.title}</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{activeSim.scenario_text}</p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-accent/80">
              <Target className="h-3 w-3" />
              <span>{activeSim.objective}</span>
            </div>
          </div>
        )}

        {/* AI Buyer Message */}
        <div className="rounded-xl border border-accent/20 bg-accent/[0.03] p-5 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">AI</div>
            <span className="text-[11px] font-medium text-muted-foreground">Kunde</span>
            {currentStep.objection_type && (
              <Badge variant="outline" className="text-[9px] border-accent/30 text-accent">
                {currentStep.objection_type}
              </Badge>
            )}
          </div>
          <p className="text-[14px] text-foreground leading-relaxed italic">„{currentStep.ai_prompt}"</p>
        </div>

        {/* Recording / Analysis / Result */}
        {analyzing ? (
          <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-accent mb-3" />
            <p className="text-sm font-medium text-foreground">Analyse läuft…</p>
            <p className="text-[11px] text-muted-foreground mt-1">Transkription → AI-Bewertung → KPI-Score</p>
          </div>
        ) : stepResult ? (
          <div className="space-y-4">
            {/* Scores */}
            <div className="rounded-xl border border-border/40 bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-foreground">KPI Score</h3>
                  {stepResult.filler_words_detected && (
                    <Badge variant="outline" className="text-[8px] border-destructive/30 text-destructive">Füllwörter</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-accent" />
                  <span className="text-lg font-bold text-foreground">{stepResult.total_score.toFixed(1)}</span>
                  <span className="text-[11px] text-muted-foreground">/ 10</span>
                </div>
              </div>
              <div className="space-y-2.5">
                {Object.entries(stepResult.scores).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground w-32 shrink-0">{KPI_LABELS[key] || key}</span>
                    <div className="flex-1">
                      <Progress value={val * 10} className="h-1.5" />
                    </div>
                    <span className={`text-[12px] font-semibold tabular-nums w-6 text-right ${val >= 7 ? 'text-primary' : val >= 5 ? 'text-accent' : 'text-destructive'}`}>
                      {val}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>Confidence: <strong className="text-foreground">{stepResult.confidence_level}/10</strong></span>
              </div>
            </div>

            {/* Transcript */}
            <div className="rounded-xl border border-border/40 bg-card p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Transkript</p>
              <p className="text-[12px] text-foreground leading-relaxed">{stepResult.transcript}</p>
            </div>

            {/* Feedback */}
            <div className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Stärken</p>
                <p className="text-[12px] text-foreground">{stepResult.feedback.strengths}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-destructive mb-1">Schwächen</p>
                <p className="text-[12px] text-foreground">{stepResult.feedback.weaknesses}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-accent mb-1">Verbesserungsaktionen</p>
                <ul className="space-y-1.5">
                  {stepResult.feedback.improvement_actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={retryStep}>
                <RotateCcw className="mr-1.5 h-3 w-3" /> Wiederholen
              </Button>
              <Button size="sm" className="flex-1 text-xs" onClick={nextStep}>
                {isLastStep ? (
                  <><Trophy className="mr-1.5 h-3 w-3" /> Ergebnis anzeigen</>
                ) : (
                  <><ArrowRight className="mr-1.5 h-3 w-3" /> Nächster Schritt</>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Mic className="h-4 w-4 text-accent" />
              <h3 className="text-[13px] font-semibold text-foreground">Deine Antwort aufnehmen</h3>
              <span className="text-[10px] text-muted-foreground ml-auto">
                max. {currentStep.time_limit_seconds || 90} Sek.
              </span>
            </div>
            {timeExpired ? (
              <div className="text-center py-4">
                <Timer className="mx-auto h-6 w-6 text-destructive mb-2" />
                <p className="text-sm font-medium text-destructive">Zeit abgelaufen</p>
                <p className="text-[11px] text-muted-foreground mt-1">Starte eine neue Aufnahme oder überspringe diesen Schritt.</p>
                <div className="flex gap-2 mt-3 justify-center">
                  <Button variant="outline" size="sm" className="text-xs" onClick={retryStep}>
                    <RotateCcw className="mr-1.5 h-3 w-3" /> Nochmal
                  </Button>
                  <Button size="sm" className="text-xs" onClick={nextStep}>
                    <ArrowRight className="mr-1.5 h-3 w-3" /> Überspringen
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <AudioRecorder
                  onSent={handleAudioSent}
                  contextType="feedback"
                  contextId={activeSim.id}
                  targetUserId={undefined}
                />
                <p className="mt-3 text-[10px] text-muted-foreground">
                  Sprich deine Antwort als ob du wirklich mit dem Kunden sprichst.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ============ RESULTS VIEW ============
  if (view === 'results' && activeSim) {
    const avgScores = {
      clarity: 0, structure: 0, emotional_control: 0, objection_handling: 0, closing_direction: 0,
    };
    let avgConfidence = 0;
    let fillerCount = 0;
    if (allResults.length > 0) {
      allResults.forEach(r => {
        Object.keys(avgScores).forEach(k => {
          (avgScores as any)[k] += (r.scores as any)[k] || 0;
        });
        avgConfidence += r.confidence_level || 0;
        if (r.filler_words_detected) fillerCount++;
      });
      Object.keys(avgScores).forEach(k => {
        (avgScores as any)[k] = Math.round(((avgScores as any)[k] / allResults.length) * 10) / 10;
      });
      avgConfidence = Math.round((avgConfidence / allResults.length) * 10) / 10;
    }
    const totalAvg = Object.values(avgScores).reduce((a, b) => a + b, 0) / 5;

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-5 sm:py-8 lg:px-10">
        <div className="mb-6 text-center">
          <Trophy className="mx-auto h-10 w-10 text-accent mb-3" />
          <h1 className="font-serif text-2xl font-semibold text-foreground">Simulation abgeschlossen</h1>
          <p className="text-sm text-muted-foreground mt-1">{activeSim.title}</p>
        </div>

        {/* Total Score */}
        <div className="rounded-xl border border-accent/30 bg-accent/[0.03] p-6 text-center mb-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Gesamtbewertung</p>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-5xl font-bold text-foreground">{totalAvg.toFixed(1)}</span>
            <span className="text-lg text-muted-foreground">/ 10</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {totalAvg >= 8 ? 'Exzellent — du bist auf dem richtigen Weg.' :
             totalAvg >= 6 ? 'Solide Leistung — gezielte Verbesserung möglich.' :
             totalAvg >= 4 ? 'Grundlage vorhanden — Training erforderlich.' :
             'Deutlicher Verbesserungsbedarf — wiederhole die Simulation.'}
          </p>
          <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
            <span>Confidence: <strong className="text-foreground">{avgConfidence.toFixed(1)}</strong></span>
            {fillerCount > 0 && (
              <span className="text-destructive">Füllwörter in {fillerCount}/{allResults.length} Antworten</span>
            )}
          </div>
        </div>

        {/* KPI Breakdown */}
        <div className="rounded-xl border border-border/40 bg-card p-5 mb-6">
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground mb-4">KPI Breakdown</h3>
          <div className="space-y-3">
            {Object.entries(avgScores).map(([key, val]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground w-32 shrink-0">{KPI_LABELS[key] || key}</span>
                <div className="flex-1">
                  <Progress value={val * 10} className="h-2" />
                </div>
                <span className={`text-[13px] font-bold tabular-nums w-8 text-right ${val >= 7 ? 'text-primary' : val >= 5 ? 'text-accent' : 'text-destructive'}`}>
                  {val}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step-by-step results */}
        {allResults.length > 0 && (
          <div className="space-y-3 mb-6">
            <h3 className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground">Schritt-Feedback</h3>
            {allResults.map((r, i) => (
              <div key={i} className="rounded-xl border border-border/40 bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-muted-foreground">Schritt {i + 1}</span>
                  <span className={`text-[12px] font-bold ${r.total_score >= 7 ? 'text-primary' : r.total_score >= 5 ? 'text-accent' : 'text-destructive'}`}>
                    {r.total_score.toFixed(1)}/10
                  </span>
                </div>
                {r.feedback.improvement_actions.length > 0 && (
                  <ul className="space-y-1">
                    {r.feedback.improvement_actions.map((a, j) => (
                      <li key={j} className="flex items-start gap-1.5 text-[11px] text-foreground">
                        <Zap className="h-3 w-3 text-accent shrink-0 mt-0.5" />
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => startSimulation(activeSim)}>
            <RotateCcw className="mr-1.5 h-3 w-3" /> Erneut versuchen
          </Button>
          <Button size="sm" className="flex-1 text-xs" onClick={exitSimulation}>
            <ArrowLeft className="mr-1.5 h-3 w-3" /> Zurück zur Übersicht
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
